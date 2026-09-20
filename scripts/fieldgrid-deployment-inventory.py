#!/usr/bin/env python3
"""Read bounded infrastructure metadata; never read service environment files."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def command(arguments):
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=15)
        return {"exitCode": result.returncode, "output": result.stdout[:12000].strip()}
    except (OSError, subprocess.TimeoutExpired):
        return {"exitCode": -1, "output": "unavailable"}


def release(environment):
    base = Path("/var/www/veele") / environment
    current = base / "current"
    resolved = current.resolve()
    within_releases = resolved.is_relative_to(base / "releases")
    marker = resolved / ".fieldgrid-release-sha"
    sha = None
    if (current.is_symlink() and within_releases and marker.is_file()
            and not marker.is_symlink() and 40 <= marker.stat().st_size <= 41):
        value = marker.read_text().strip()
        if re.fullmatch(r"[a-f0-9]{40}", value):
            sha = value
    services = {}
    for suffix in ["", "-personeel", "-klant", "-api", "-website", "-marketing"]:
        name = "veele-" + environment + suffix
        services[name] = command([
            "systemctl", "show", name, "--no-pager",
            "--property=LoadState,ActiveState,SubState,User,Group,WorkingDirectory,FragmentPath",
        ])
    return {"currentIsSymlink": current.is_symlink(), "withinReleaseRoot": within_releases,
            "release": str(resolved) if within_releases else None, "sha": sha, "services": services}


def main():
    disk = shutil.disk_usage("/var/www" if Path("/var/www").exists() else "/")
    modules = command(["caddy", "list-modules"])
    report = {
        "version": 1,
        "sourceSha": os.environ.get("GITHUB_SHA"),
        "environments": {name: release(name) for name in ["staging", "production"]},
        "diskFreeBytes": disk.free,
        "node": command(["node", "--version"]),
        "pnpm": command(["pnpm", "--version"]),
        "caddy": command(["caddy", "version"]),
        "cloudflareDnsModule": "dns.providers.cloudflare" in modules["output"].splitlines(),
        "sudoPermissions": command(["sudo", "-n", "-l"]),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
