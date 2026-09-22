# WP1 isolated-copy host sandbox

## Why this exists

The WP1 collecting diagnostic must restore staging data and rehearse deletion on
a disposable PostgreSQL copy without giving that copy egress. The Veele
self-hosted runner currently rejects unprivileged user namespaces, so
`unshare --user --map-current-user` cannot be the only isolation path.

Do **not** globally enable unprivileged user namespaces just for WP1. Instead,
install the reviewed root-owned helper below. Root is used only to create a new
network/PID/mount namespace and enable loopback. Before any repository Node code
runs, the helper drops to `github-runner:veele-deploy`, clears supplementary
groups, sets `no_new_privs`, strips the environment and gives the worker only
the private operation directory plus the pinned PostgreSQL 17 runtime.

The worker still verifies it is non-root, PID 1 in its namespace, on a different
network namespace from the host, with only loopback visible and with no
database/provider/GitHub credentials in its environment.

## Install once on the staging runner

Use a root-capable shell on the Veele staging host **after the PR containing
these files is merged and main exact-head validation is green**. Work from that
exact reviewed main checkout.

```bash
set -euo pipefail

cd /home/github-runner/actions-runner/_work/platform/platform

sudo install -o root -g root -m 0755 \
  ops/bin/fieldgrid-wp1-copy-sandbox \
  /usr/local/sbin/fieldgrid-wp1-copy-sandbox

sudo visudo -cf ops/sudoers/veele-staging-wp1-copy-sandbox

sudo install -o root -g root -m 0440 \
  ops/sudoers/veele-staging-wp1-copy-sandbox \
  /etc/sudoers.d/veele-staging-wp1-copy-sandbox

sudo visudo -cf /etc/sudoers.d/veele-staging-wp1-copy-sandbox

sudo -u github-runner -H sudo -n \
  /usr/local/sbin/fieldgrid-wp1-copy-sandbox probe
```

The last command must exit 0 and print only the numeric uid of
`github-runner`. It proves the host can create the network/PID/mount sandbox,
bring up loopback and drop privileges before the worker starts.

## Verify the installed files

```bash
sudo stat -c '%U %G %a %n' \
  /usr/local/sbin/fieldgrid-wp1-copy-sandbox \
  /etc/sudoers.d/veele-staging-wp1-copy-sandbox

sudo -u github-runner -H sudo -n -l \
  /usr/local/sbin/fieldgrid-wp1-copy-sandbox probe
```

Expected ownership/mode:

- helper: `root root 755`;
- sudoers: `root root 440`.

Do not grant `github-runner` generic `unshare`, shell, install, mount,
setpriv, Docker or unrestricted sudo rights. The sudoers entry intentionally
authorizes only the fixed root-owned helper path and does not use command-
argument wildcards; the helper performs strict fail-closed argument validation
for `probe` and `run`. Always validate the reviewed sudoers source with
`visudo -cf` before installing it.

## Rollback

If the helper must be removed:

```bash
sudo rm -f /etc/sudoers.d/veele-staging-wp1-copy-sandbox
sudo rm -f /usr/local/sbin/fieldgrid-wp1-copy-sandbox
```

This does not modify Fieldgrid staging data. It only removes the optional
isolated-copy execution path.
