import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { WRITER_UNITS, requireThat, fail } from "./contract.mjs";

const execute = promisify(execFile);
const ALLOWED = new Set(WRITER_UNITS);
const REQUIRED = new Set([
  "veele-staging.service",
  "veele-staging-personeel.service",
  "veele-staging-klant.service",
  "veele-staging-api.service",
  "veele-staging-website.service",
  "veele-staging-marketing.service",
]);

function listedNames(output) {
  return String(output)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().replace(/^●\s*/u, "").split(/\s+/u)[0])
    .filter((name) => /\.(service|timer)$/u.test(name));
}

export function parseState(stdout) {
  const values = Object.fromEntries(
    String(stdout)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  requireThat(
    ALLOWED.has(values.Id) &&
      values.LoadState === "loaded" &&
      ["active", "inactive", "failed", "activating", "deactivating"].includes(
        values.ActiveState,
      ) &&
      /^\d+$/u.test(values.MainPID ?? ""),
    "WRITER_STATE_INVALID",
  );
  return {
    unit: values.Id,
    active: values.ActiveState === "active",
    pid: Number(values.MainPID),
    substate: values.SubState,
  };
}

export function createServiceControl({ command = execute } = {}) {
  async function run(binary, args, code, timeout = 15000) {
    try {
      return await command(binary, args, { timeout, maxBuffer: 65536 });
    } catch {
      fail(code);
    }
  }

  async function discover() {
    const units = await run(
      "/usr/bin/systemctl",
      [
        "list-units",
        "--all",
        "--plain",
        "--no-legend",
        "--no-pager",
        "veele-staging-*",
      ],
      "WRITER_INVENTORY_FAILED",
    );
    const files = await run(
      "/usr/bin/systemctl",
      ["list-unit-files", "--no-legend", "--no-pager", "veele-staging-*"],
      "WRITER_INVENTORY_FAILED",
    );
    const names = [
      ...new Set([...listedNames(units.stdout), ...listedNames(files.stdout)]),
    ].sort();
    requireThat(
      names.every((name) => ALLOWED.has(name)),
      "UNKNOWN_STAGING_WRITER",
    );
    requireThat(
      [...REQUIRED].every((name) => names.includes(name)),
      "REQUIRED_STAGING_WRITER_MISSING",
    );
    return names;
  }

  async function state(unit) {
    const result = await run(
      "/usr/bin/systemctl",
      ["show", unit, "--property=Id,LoadState,ActiveState,SubState,MainPID"],
      "WRITER_STATE_FAILED",
    );
    return parseState(result.stdout);
  }

  async function inventory() {
    const names = await discover();
    const states = [];
    for (const name of names) states.push(await state(name));
    for (const item of states) {
      for (const operation of ["stop", "start"]) {
        await run(
          "/usr/bin/sudo",
          ["-n", "-l", "/usr/bin/systemctl", operation, item.unit],
          "WRITER_PERMISSION_REQUIRED",
          10000,
        );
      }
    }
    return states;
  }

  async function assertStopped(states) {
    for (const item of states) {
      const current = await state(item.unit);
      requireThat(
        current.active === false && current.pid === 0,
        "WRITERS_NOT_STOPPED",
      );
    }
  }

  async function stop(states) {
    const ordered = [...states].sort(
      (left, right) =>
        Number(right.unit.endsWith(".timer")) -
        Number(left.unit.endsWith(".timer")),
    );
    for (const item of ordered.filter(({ active }) => active)) {
      await run(
        "/usr/bin/sudo",
        ["-n", "/usr/bin/systemctl", "stop", item.unit],
        "WRITER_STOP_FAILED",
        30000,
      );
    }
    await assertStopped(states);
  }

  async function restore(states) {
    for (const item of states.filter(({ active }) => !active)) {
      const current = await state(item.unit);
      if (current.active) {
        await run(
          "/usr/bin/sudo",
          ["-n", "/usr/bin/systemctl", "stop", item.unit],
          "WRITER_RESTORE_FAILED",
          30000,
        );
      }
    }
    for (const item of states.filter(({ active }) => active)) {
      const current = await state(item.unit);
      if (!current.active) {
        await run(
          "/usr/bin/sudo",
          ["-n", "/usr/bin/systemctl", "start", item.unit],
          "WRITER_RESTORE_FAILED",
          30000,
        );
      }
    }
    for (const item of states)
      requireThat(
        (await state(item.unit)).active === item.active,
        "WRITER_RESTORE_FAILED",
      );
  }

  async function safeStop() {
    const states = await inventory();
    await stop(states.map((item) => ({ ...item, active: true })));
    return states.map(({ unit }) => ({ unit, active: false }));
  }

  return { assertStopped, inventory, restore, safeStop, stop };
}
