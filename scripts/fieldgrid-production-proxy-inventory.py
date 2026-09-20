#!/usr/bin/env python3
"""Read-only Caddy capabilities. Never emit configuration, command lines or errors."""

import fnmatch
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import selectors
import shlex
import stat
import subprocess
import time
import urllib.request


FILE_LIMIT = 2 * 1024 * 1024
COMMAND_LIMIT = 64 * 1024
FILE_COUNT_LIMIT = 32
AUTOSAVE = "/var/lib/caddy/.config/caddy/autosave.json"
FIXED_PATHS = (
    "/etc/caddy", "/etc/caddy/Caddyfile", "/etc/caddy/fieldgrid.d",
    "/etc/caddy/fieldgrid-cloudflare.env", AUTOSAVE,
    "/etc/systemd/system/caddy.service",
    "/etc/systemd/system/caddy.service.d",
    "/etc/systemd/system/caddy.service.d/fieldgrid-cloudflare-dns.conf",
    "/etc/systemd/system/fieldgrid-caddy-validate.service",
    "/lib/systemd/system/caddy.service", "/usr/lib/systemd/system/caddy.service",
)
HOST = re.compile(r"^(?:fieldgrid\.nl|(?:\*|[a-z0-9-]+)(?:\.[a-z0-9-]+)*\.fieldgrid\.nl)$")
ROUTE_PATH = re.compile(r"^/[A-Za-z0-9_./*%-]{0,255}$")
LOCAL_UPSTREAM = re.compile(r"^(?:127\.0\.0\.1|localhost):[0-9]{2,5}$")


def approved_path(value, allow_glob=False):
    if not isinstance(value, str) or len(value) > 256 or not value.startswith("/"):
        return False
    if any(part in (".", "..") for part in value.split("/")) or "//" in value:
        return False
    if value == AUTOSAVE:
        return True
    if not value.startswith("/etc/caddy/"):
        return False
    relative = value[len("/etc/caddy/"):]
    pattern = r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*"
    if allow_glob and relative.endswith("/*.caddy"):
        return bool(re.fullmatch(pattern, relative[:-8]))
    return bool(re.fullmatch(pattern, relative)) and (
        relative.endswith((".caddy", ".json")) or relative.split("/")[-1] == "Caddyfile"
    )


def open_without_symlinks(path, flags):
    """Reject symlinks in every component, including imported directories."""
    parts = PurePosixPath(path).parts
    if not parts or parts[0] != "/" or ".." in parts:
        raise ValueError("unsupported path")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in parts[1:-1]:
            following = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=directory)
            os.close(directory)
            directory = following
        return os.open(parts[-1], flags | os.O_NOFOLLOW, dir_fd=directory)
    finally:
        os.close(directory)


def bounded_read_file(path):
    descriptor = open_without_symlinks(path, os.O_RDONLY | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size > FILE_LIMIT:
            raise ValueError("unsupported file")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            content = stream.read(FILE_LIMIT + 1)
        if len(content) > FILE_LIMIT:
            raise ValueError("oversized file")
        return content
    finally:
        os.close(descriptor)


def path_metadata(path):
    record = {"path": path, "status": "unavailable"}
    try:
        descriptor = open_without_symlinks(path, os.O_PATH)
        try:
            info = os.fstat(descriptor)
        finally:
            os.close(descriptor)
        kind = "file" if stat.S_ISREG(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "symlink" if stat.S_ISLNK(info.st_mode) else "other"
        record.update(status="available", kind=kind, uid=info.st_uid, gid=info.st_gid,
                      mode=f"{stat.S_IMODE(info.st_mode):04o}")
        # Access is useful only if every component can be inspected without following links.
        if kind in ("file", "directory"):
            record["effectiveAccess"] = {
                name: os.access(path, flag, effective_ids=True, follow_symlinks=False)
                for name, flag in (("read", os.R_OK), ("write", os.W_OK), ("execute", os.X_OK))
            }
    except FileNotFoundError:
        record["status"] = "missing"
    except (OSError, ValueError, NotImplementedError):
        pass
    return record


def bounded_command(arguments):
    """No shell, stderr discarded, and stdout bounded while the command runs."""
    process = None
    try:
        process = subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        output = bytearray()
        deadline = time.monotonic() + 10
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                for key, _ in selector.select(min(remaining, 0.25)):
                    chunk = os.read(key.fd, min(8192, COMMAND_LIMIT + 1 - len(output)))
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        output.extend(chunk)
                        if len(output) > COMMAND_LIMIT:
                            return None
            if process.wait(timeout=max(0.01, deadline - time.monotonic())) != 0:
                return None
        return bytes(output).decode("utf-8", errors="strict")
    except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
        return None
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
            if process.stdout is not None:
                process.stdout.close()


def command_metadata(value):
    result = {"present": bool(value), "recognized": False, "resume": False,
              "configPath": None, "configPathApproved": False, "adapter": None}
    if not value or len(value) > COMMAND_LIMIT:
        return result
    # systemctl's structured value is only parsed; never include it in the report.
    match = re.search(r"argv\[\]=(.*?)(?: ; [a-z_]+=|\s*\}$)", value)
    if not match:
        return result
    try:
        words = shlex.split(match.group(1))
    except ValueError:
        return result
    if len(words) < 2 or words[0] not in ("/usr/bin/caddy", "/usr/local/bin/caddy") or words[1] not in ("run", "reload"):
        return result
    executable = re.search(r"(?:\{\s*| ; )path=([^;]+?)\s*;", value)
    if executable is not None and executable.group(1).strip() != words[0]:
        return result
    # More than one configured systemd command cannot be summarized as one safe reload.
    if len(re.findall(r"argv\[\]=", value)) != 1:
        return result
    result.update(recognized=True, executable=words[0], action=words[1])
    seen = set()
    index = 2
    while index < len(words):
        word = words[index]
        key, separator, inline = word.partition("=")
        if key in seen:
            result["recognized"] = False
        seen.add(key)
        if key == "--resume" and not separator:
            result["resume"] = True
        elif key in ("--environ", "--watch", "--force") and not separator:
            pass
        elif key in ("--config", "--adapter"):
            index += 0 if separator else 1
            value = inline if separator else words[index] if index < len(words) else ""
            if key == "--config":
                result["configPathApproved"] = approved_path(value)
                result["configPath"] = value if approved_path(value) else None
            else:
                result["adapter"] = value if value in ("caddyfile", "json") else None
                if result["adapter"] is None:
                    result["recognized"] = False
        else:
            # Unknown options and their possible secret operands are never emitted.
            result["recognized"] = False
        index += 1
    return result


def service_metadata(raw):
    if not isinstance(raw, str) or len(raw) > COMMAND_LIMIT:
        return {"status": "unavailable"}
    values = {}
    for line in raw.splitlines():
        key, separator, value = line.partition("=")
        if separator and key in ("ExecStart", "ExecReload", "User", "Group", "FragmentPath", "DropInPaths", "MainPID"):
            values[key] = value
    start = command_metadata(values.get("ExecStart", ""))
    reload = command_metadata(values.get("ExecReload", ""))
    result = {"status": "available", "start": start, "reload": reload,
              "user": values.get("User") if values.get("User") in ("caddy", "root", "github-runner", "veele") else None,
              "group": values.get("Group") if values.get("Group") in ("caddy", "root", "github-runner", "veele", "veele-deploy") else None,
              "mainPid": int(values["MainPID"]) if re.fullmatch(r"[0-9]{1,10}", values.get("MainPID", "")) else None,
              "unitPaths": [value for value in [values.get("FragmentPath", "")] + values.get("DropInPaths", "").split()
                            if value in FIXED_PATHS],
              "startPersistence": "unknown", "reloadPersistence": "unknown"}
    if start["recognized"]:
        result["startPersistence"] = "autosave" if start["resume"] else "file" if start["configPathApproved"] else "unknown"
    if reload["recognized"]:
        result["reloadPersistence"] = "autosave" if reload["configPath"] == AUTOSAVE else "file" if reload["configPathApproved"] else "unknown"
    return result


def import_paths(content, source_path):
    imports = set()
    rejected = False
    for line in content.decode("utf-8", errors="strict").splitlines():
        if not re.match(r"\s*import\s", line):
            continue
        try:
            words = shlex.split(line, comments=True)
        except ValueError:
            rejected = True
            continue
        if len(words) != 2:
            rejected = True
            continue
        value = words[1]
        if not value.startswith("/"):
            value = str(PurePosixPath(source_path).parent / value)
        if not approved_path(value, allow_glob=True):
            rejected = True
            continue
        imports.add(value)
        if len(imports) > FILE_COUNT_LIMIT:
            return sorted(imports)[:FILE_COUNT_LIMIT], True
    return sorted(imports), rejected


def expand_import(path):
    if "*" not in path:
        return [path]
    parent = str(PurePosixPath(path).parent)
    descriptor = open_without_symlinks(parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        entries = []
        with os.scandir(descriptor) as directory:
            for index, entry in enumerate(directory):
                if index >= 128:
                    raise ValueError("too many entries")
                candidate = str(PurePosixPath(parent) / entry.name)
                if fnmatch.fnmatchcase(entry.name, "*.caddy") and approved_path(candidate):
                    entries.append(candidate)
        if len(entries) > FILE_COUNT_LIMIT:
            raise ValueError("too many imports")
        return sorted(entries)
    finally:
        os.close(descriptor)


def config_file_metadata(paths):
    pending = sorted(set(path for path in paths if approved_path(path)))
    reports = []
    visited = set()
    truncated = False
    while pending and len(visited) < FILE_COUNT_LIMIT:
        path = pending.pop(0)
        if path in visited:
            continue
        visited.add(path)
        record = {"path": path, "status": "unavailable", "imports": []}
        try:
            content = bounded_read_file(path)
            record.update(status="available", sha256=hashlib.sha256(content).hexdigest())
            if path.endswith(".json"):
                # Autosave and JSON content can contain credentials; only hash them.
                reports.append(record)
                continue
            imports, rejected = import_paths(content, path)
            record["imports"] = imports
            record["unsupportedImports"] = rejected
            for imported in imports:
                try:
                    pending.extend(expand_import(imported))
                except (OSError, ValueError, UnicodeError):
                    # The parent was read successfully; only this import could
                    # not be inspected completely. Keep other imports eligible.
                    record["unsupportedImports"] = True
                    truncated = True
        except (OSError, ValueError, UnicodeError):
            record["status"] = "unavailable"
        reports.append(record)
    return {"files": reports, "truncated": truncated or bool(pending)}


def proxy_metadata(config):
    if not isinstance(config, dict):
        return {"status": "unavailable"}
    routes = []
    remaining = [2000]
    truncated = [False]

    def inspect(value, hosts=(), paths=(), depth=0):
        remaining[0] -= 1
        if remaining[0] < 0 or depth > 32 or len(routes) >= 100:
            truncated[0] = True
            return
        if isinstance(value, list):
            truncated[0] |= len(value) > 100
            for child in value[:100]:
                inspect(child, hosts, paths, depth + 1)
        elif isinstance(value, dict):
            hosts, paths = list(hosts), list(paths)
            matches = value.get("match", [])
            if isinstance(matches, list):
                truncated[0] |= len(matches) > 100
            for matcher in matches[:100] if isinstance(matches, list) else []:
                if not isinstance(matcher, dict):
                    continue
                for key, pattern, destination in (("host", HOST, hosts), ("path", ROUTE_PATH, paths)):
                    items = matcher.get(key, [])
                    if isinstance(items, list):
                        truncated[0] |= len(items) > 100
                        destination.extend(item for item in items[:100] if isinstance(item, str)
                                           and len(item) <= 256 and pattern.fullmatch(item))
            truncated[0] |= len(hosts) > 100 or len(paths) > 100
            hosts, paths = hosts[:100], paths[:100]
            if value.get("handler") == "reverse_proxy":
                upstreams = value.get("upstreams", [])
                if isinstance(upstreams, list):
                    truncated[0] |= len(upstreams) > 20
                    upstreams = [item.get("dial") for item in upstreams[:20] if isinstance(item, dict)
                                 and isinstance(item.get("dial"), str) and LOCAL_UPSTREAM.fullmatch(item["dial"])]
                    if hosts and upstreams:
                        routes.append({"hosts": sorted(set(hosts)), "paths": sorted(set(paths)), "upstreams": upstreams})
            for key in ("routes", "handle", "route"):
                if key in value:
                    inspect(value[key], hosts, paths, depth + 1)

    try:
        servers = config.get("apps", {}).get("http", {}).get("servers", {})
        if isinstance(servers, dict):
            truncated[0] |= len(servers) > 20
            for server in list(servers.values())[:20]:
                inspect(server)
        persist = config.get("admin", {}).get("config", {}).get("persist", True)
    except (AttributeError, TypeError):
        return {"status": "unavailable"}
    return {"status": "available", "configPersist": persist if isinstance(persist, bool) else None,
            "routes": routes, "truncated": truncated[0]}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_proxy_metadata():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open("http://127.0.0.1:2019/config/", timeout=5) as response:
            raw = response.read(FILE_LIMIT + 1)
        if len(raw) > FILE_LIMIT:
            return {"status": "unavailable"}
        return proxy_metadata(json.loads(raw))
    except Exception:
        return {"status": "unavailable"}


def main():
    raw = bounded_command(["systemctl", "show", "caddy", "--no-pager",
                           "--property=ExecStart,ExecReload,User,Group,FragmentPath,DropInPaths,MainPID"])
    service = service_metadata(raw)
    config_paths = {"/etc/caddy/Caddyfile", AUTOSAVE}
    for key in ("start", "reload"):
        value = service.get(key, {}).get("configPath")
        if value:
            config_paths.add(value)
    files = config_file_metadata(config_paths)
    metadata_paths = set(FIXED_PATHS)
    for item in files["files"]:
        metadata_paths.add(item["path"])
        metadata_paths.add(str(PurePosixPath(item["path"]).parent))
        for imported in item["imports"]:
            metadata_paths.add(str(PurePosixPath(imported).parent))
    # File write and parent-directory write are separate: only the latter permits atomic replacement.
    for path in tuple(metadata_paths):
        metadata_paths.add(str(PurePosixPath(path).parent))
    sha = os.environ.get("GITHUB_SHA", "")
    report = {"version": 1, "sourceSha": sha if re.fullmatch(r"[a-f0-9]{40}", sha) else None,
              "runner": {"uid": os.geteuid(), "gid": os.getegid(), "groups": sorted(os.getgroups())},
              "service": service, "paths": [path_metadata(path) for path in sorted(metadata_paths)],
              "configurationFiles": files, "proxy": read_proxy_metadata()}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
