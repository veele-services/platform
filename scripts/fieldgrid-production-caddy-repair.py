#!/usr/bin/env python3
"""One reviewed, root-only, persistent Caddy repair; never print private config."""
import collections
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import urllib.request

EXPECTED_SHA = "32144f10850a8bd60a13b4d722fd7e596d3e019c65e6547af1b11b766611c111"
CONFIG = "/etc/caddy/Caddyfile"
BACKUPS = "/var/backups/fieldgrid-production-caddy-repair"
LOCK = "/run/lock/fieldgrid-production-caddy-repair.lock"
COUNTS = {
    "admin.fieldgrid.nl": collections.Counter({"127.0.0.1:3304": 1, "127.0.0.1:3301": 1}),
    "*.fieldgrid.nl": collections.Counter({"127.0.0.1:3302": 1, "127.0.0.1:3301": 2,
                                           "127.0.0.1:3303": 1, "127.0.0.1:3304": 1}),
}
DIALS = {"127.0.0.1:3301": "127.0.0.1:3300", "127.0.0.1:3302": "127.0.0.1:3402",
         "127.0.0.1:3303": "127.0.0.1:3403", "127.0.0.1:3304": "127.0.0.1:3404"}

spec = importlib.util.spec_from_file_location("fieldgrid_proxy_inventory", Path(__file__).with_name("fieldgrid-production-proxy-inventory.py"))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class RepairError(Exception):
    pass


def digest(value):
    return hashlib.sha256(value).hexdigest()


def config_digest(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def tokens(text):
    """Retain source spans; comments, quoted values and placeholders are opaque."""
    result = []
    index = 0
    while index < len(text):
        start = index
        char = text[index]
        if char == "\n":
            result.append(("newline", "", index, index + 1)); index += 1
        elif char.isspace():
            index += 1
        elif char == "#":
            newline = text.find("\n", index)
            index = len(text) if newline < 0 else newline
        elif char in "{}" and (index + 1 == len(text) or text[index + 1].isspace()):
            result.append((char, char, index, index + 1)); index += 1
        elif char in ('"', '`'):
            quote = char
            index += 1
            while index < len(text) and text[index] != quote:
                if quote == '"' and text[index] == "\\":
                    index += 1
                index += 1
            if index >= len(text):
                raise RepairError("unsupported_quoted_token")
            index += 1
            # Quoted arguments are preserved, but never interpreted as directives/dials.
            result.append(("quoted", text[start:index], start, index))
        else:
            while index < len(text) and not text[index].isspace():
                index += 1
            value = text[start:index]
            if value.startswith("<<") or "\\" in value:
                raise RepairError("unsupported_token")
            result.append(("word", value, start, index))
    return result


def plan_repair(content, expected_sha=EXPECTED_SHA):
    if len(content) > inventory.FILE_LIMIT or digest(content) != expected_sha:
        raise RepairError("source_hash_mismatch")
    try:
        text = content.decode("utf-8")
    except UnicodeError:
        raise RepairError("unsupported_encoding") from None
    stack, line, patches = [], [], []
    sites = collections.Counter()
    observed = {host: collections.Counter() for host in COUNTS}

    def directive():
        if not stack or stack[-1] not in COUNTS or not line or line[0][1] != "reverse_proxy":
            return
        # Support the normal single upstream, optionally preceded by a matcher.
        arguments = line[1:]
        if len(arguments) == 2 and arguments[0][0] == "word" and arguments[0][1].startswith(("@", "/")):
            arguments = arguments[1:]
        if len(arguments) != 1 or arguments[0][0] != "word" or arguments[0][1] not in DIALS:
            raise RepairError("production_proxy_shape_mismatch")
        _, value, start, end = arguments[0]
        observed[stack[-1]][value] += 1
        patches.append((start, end, DIALS[value]))

    for token in tokens(text):
        kind, value, _, _ = token
        if kind == "{":
            if not stack:
                hosts = [item[1].rstrip(",") for item in line]
                selected = set(hosts).intersection(COUNTS)
                if selected and (len(hosts) != 1 or len(selected) != 1):
                    raise RepairError("production_site_shape_mismatch")
                host = next(iter(selected)) if selected else None
                if host:
                    sites[host] += 1
                stack.append(host)
            else:
                directive()
                stack.append(stack[-1])
            line = []
        elif kind == "}":
            if not stack:
                raise RepairError("unbalanced_config")
            directive(); stack.pop(); line = []
        elif kind == "newline":
            directive(); line = []
        else:
            line.append(token)
    if stack or any(sites[host] != 1 or observed[host] != required for host, required in COUNTS.items()) or len(patches) != 7:
        raise RepairError("production_route_count_mismatch")
    candidate = text
    for start, end, replacement in reversed(patches):
        candidate = candidate[:start] + replacement + candidate[end:]
    return candidate.encode("utf-8")


def repaired_live_config(config):
    candidate = copy.deepcopy(config)
    observed = {host: collections.Counter() for host in COUNTS}
    budget = [20000]

    def visit(value, host=None, depth=0):
        budget[0] -= 1
        if budget[0] < 0 or depth > 64:
            raise RepairError("live_config_limit")
        if isinstance(value, list):
            for child in value:
                visit(child, host, depth + 1)
        elif isinstance(value, dict):
            matches = value.get("match", [])
            if not isinstance(matches, list):
                raise RepairError("live_config_shape_mismatch")
            host_matches = [matcher["host"] for matcher in matches if isinstance(matcher, dict) and "host" in matcher]
            if host_matches:
                if any(not isinstance(items, list) or any(not isinstance(item, str) for item in items) for items in host_matches):
                    raise RepairError("live_config_shape_mismatch")
                hosts = [item for items in host_matches for item in items]
                selected = set(hosts).intersection(COUNTS)
                if selected and (len(matches) != 1 or len(hosts) != 1):
                    raise RepairError("live_production_host_shape_mismatch")
                host = next(iter(selected)) if selected else None
            if value.get("handler") == "reverse_proxy" and host in COUNTS:
                upstreams = value.get("upstreams")
                if not isinstance(upstreams, list) or len(upstreams) != 1 or not isinstance(upstreams[0], dict):
                    raise RepairError("live_production_proxy_shape_mismatch")
                dial = upstreams[0].get("dial")
                if dial not in DIALS:
                    raise RepairError("live_production_dial_mismatch")
                observed[host][dial] += 1
                upstreams[0]["dial"] = DIALS[dial]
            for key in ("routes", "handle", "route"):
                if key in value:
                    visit(value[key], host, depth + 1)

    try:
        servers = candidate["apps"]["http"]["servers"]
        if not isinstance(servers, dict):
            raise RepairError("live_config_shape_mismatch")
        for server in servers.values():
            visit(server)
    except (KeyError, TypeError):
        raise RepairError("live_config_shape_mismatch") from None
    if observed != COUNTS:
        raise RepairError("live_production_route_count_mismatch")
    return candidate


def read_root_config():
    descriptor = inventory.open_without_symlinks(CONFIG, os.O_RDONLY | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_gid != 0 or stat.S_IMODE(before.st_mode) != 0o644 or before.st_nlink != 1 or before.st_size > inventory.FILE_LIMIT:
            raise RepairError("config_metadata_mismatch")
        content = os.read(descriptor, inventory.FILE_LIMIT + 1)
        after = os.fstat(descriptor)
        if len(content) != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise RepairError("config_changed_during_read")
        return content
    finally:
        os.close(descriptor)


def verify_service():
    raw = inventory.bounded_command(["/usr/bin/systemctl", "show", "caddy", "--no-pager", "--property=ExecStart,ExecReload,User,Group"])
    service = inventory.service_metadata(raw)
    for key, action in (("start", "run"), ("reload", "reload")):
        command = service.get(key, {})
        if not command.get("recognized") or command.get("action") != action or command.get("resume") or command.get("configPath") != CONFIG:
            raise RepairError("persistent_service_contract_mismatch")
    if service.get("user") != "caddy" or service.get("group") != "caddy":
        raise RepairError("service_identity_mismatch")


def live_config():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), inventory.NoRedirect())
    try:
        with opener.open("http://127.0.0.1:2019/config/", timeout=5) as response:
            content = response.read(inventory.FILE_LIMIT + 1)
        if len(content) > inventory.FILE_LIMIT:
            raise RepairError("live_config_limit")
        value = json.loads(content)
        if not isinstance(value, dict):
            raise RepairError("live_config_shape_mismatch")
        return value
    except RepairError:
        raise
    except Exception:
        raise RepairError("live_config_unavailable") from None


def control(action):
    commands = {"validate": ["start", "fieldgrid-caddy-validate.service"], "reload": ["reload", "caddy"]}
    try:
        subprocess.run(["/usr/bin/systemctl", *commands[action]], stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=True,
                       env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"})
    except Exception:
        raise RepairError("caddy_control_failed") from None


def atomic_config(content, previous):
    if read_root_config() != previous:
        raise RepairError("config_changed_before_replace")
    parent = inventory.open_without_symlinks("/etc/caddy", os.O_RDONLY | os.O_DIRECTORY)
    temporary = None
    try:
        info = os.fstat(parent)
        if info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o755:
            raise RepairError("config_directory_metadata_mismatch")
        descriptor, temporary = tempfile.mkstemp(prefix=".fieldgrid-production-repair-", dir="/etc/caddy")
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content); stream.flush()
            os.fchown(stream.fileno(), 0, 0); os.fchmod(stream.fileno(), 0o644); os.fsync(stream.fileno())
        if read_root_config() != previous:
            raise RepairError("config_changed_before_replace")
        os.replace(temporary, "Caddyfile", dst_dir_fd=parent)
        temporary = None
        os.fsync(parent)
    finally:
        if temporary is not None:
            os.unlink(temporary)
        os.close(parent)


def private_backup(content):
    if not os.path.exists(BACKUPS):
        os.mkdir(BACKUPS, 0o700)
        parent = inventory.open_without_symlinks(str(Path(BACKUPS).parent), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    directory = inventory.open_without_symlinks(BACKUPS, os.O_RDONLY | os.O_DIRECTORY)
    try:
        info = os.fstat(directory)
        if info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
            raise RepairError("backup_directory_metadata_mismatch")
        backup = tempfile.mkdtemp(prefix="repair-", dir=BACKUPS)
        file = os.open(backup + "/Caddyfile.before", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(file, "wb") as stream:
            stream.write(content); stream.flush(); os.fsync(stream.fileno())
        child = inventory.open_without_symlinks(backup, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(child)
        finally:
            os.close(child)
        os.fsync(directory)
        return backup
    finally:
        os.close(directory)


def verify_state(content, expected_live):
    if read_root_config() != content or live_config() != expected_live:
        raise RepairError("persistent_readback_mismatch")


def apply_repair(original, candidate):
    report = {"version": 1, "operation": "apply", "status": "fail", "phase": "preflight",
              "beforeSha256": digest(original), "candidateSha256": digest(candidate),
              "plannedProductionDials": 7, "changedProductionDials": 0,
              "reloadsVerified": 0, "rollback": "not-needed"}
    changed = False
    backup = None
    before_live = None
    try:
        verify_service()
        before_live = live_config()
        expected_live = repaired_live_config(before_live)
        control("validate")
        backup = private_backup(original)
        report["backupId"] = Path(backup).name
        report["phase"] = "replace"
        changed = True
        atomic_config(candidate, original)
        report["changedProductionDials"] = 7
        report["phase"] = "validate"
        control("validate")
        for attempt in (1, 2):
            report["phase"] = "reload"
            control("reload")
            report["phase"] = "readback"
            verify_service()
            verify_state(candidate, expected_live)
            report["reloadsVerified"] = attempt
        report.update(status="pass", phase="complete", unchangedNonproductionConfig=True,
                      liveConfigSha256=config_digest(expected_live))
    except BaseException:
        if changed:
            report["rollback"] = "failed"
            report["changedProductionDials"] = None
            try:
                current = read_root_config()
                if current not in (original, candidate):
                    raise RepairError("rollback_source_changed")
                if current != original:
                    atomic_config(original, candidate)
                control("validate"); control("reload")
                verify_state(original, before_live)
                report["rollback"] = "pass"
                report["changedProductionDials"] = 0
            except BaseException:
                pass
    if backup:
        # Retain the root-only backup after both success and failure.
        try:
            descriptor = os.open(backup + "/report.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                json.dump(report, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
        except Exception:
            report["evidenceStored"] = False
    return report


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("--preview", "--apply"):
        raise RepairError("use_preview_or_apply")
    if os.geteuid() != 0:
        raise RepairError("root_required")
    original = read_root_config()
    candidate = plan_repair(original)
    if sys.argv[1] == "--preview":
        return {"version": 1, "operation": "preview", "status": "ready", "beforeSha256": digest(original),
                "candidateSha256": digest(candidate), "plannedProductionDials": 7, "mutated": False}
    descriptor = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
            raise RepairError("lock_metadata_mismatch")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if read_root_config() != original:
            raise RepairError("source_changed_before_lock")
        return apply_repair(original, candidate)
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    def interrupted(_signal, _frame):
        raise RepairError("interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        result = main()
    except BaseException:
        # An interruption can occur even after apply returned. Never assert that
        # no mutation happened when the transaction report is unavailable.
        result = {"version": 1, "status": "fail", "phase": "unknown"}
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["status"] in ("pass", "ready") else 1)
