import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { hash, requireThat, fail } from "./contract.mjs";

const run = promisify(execFile);
const REQUIRED = [
  "veele-staging.service",
  "veele-staging-personeel.service",
  "veele-staging-klant.service",
  "veele-staging-api.service",
];
const OPTIONAL_WRITERS = [
  "veele-staging-notifications.service",
  "veele-staging-notification-worker.service",
  "veele-staging-scheduler.service",
  "veele-staging-scheduler.timer",
];
const KNOWN_NON_WRITERS = new Set([
  "veele-staging-website.service",
  "veele-staging-marketing.service",
]);
const ALLOWED = new Set([
  ...REQUIRED,
  ...OPTIONAL_WRITERS,
  ...KNOWN_NON_WRITERS,
]);

export function parseWriterUnits(value) {
  requireThat(typeof value === "string", "WRITER_CONFIGURATION");
  const units = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((unit) => (/\.(service|timer)$/.test(unit) ? unit : `${unit}.service`));
  requireThat(
    units.length === new Set(units).size &&
      units.every((unit) => ALLOWED.has(unit) && !KNOWN_NON_WRITERS.has(unit)) &&
      REQUIRED.every((unit) => units.includes(unit)),
    "WRITER_SCOPE",
  );
  return units.sort();
}

export function parseUnitState(text) {
  const values = Object.fromEntries(
    String(text)
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  requireThat(
    values.LoadState === "loaded" &&
      ["active", "inactive"].includes(values.ActiveState) &&
      /^\d+$/.test(values.MainPID),
    "UNIT_STATE",
  );
  requireThat(
    typeof values.Id === "string" && ALLOWED.has(values.Id),
    "UNIT_ID",
  );
  return {
    unit: values.Id,
    active: values.ActiveState === "active",
    pid: Number(values.MainPID),
    substate: values.SubState,
    fragment: values.FragmentPath,
  };
}

export function createServiceControl(units, { command = run } = {}) {
  let prior = null;

  async function state(unit) {
    try {
      const output = await command(
        "/usr/bin/systemctl",
        [
          "show",
          unit,
          "--property=Id,LoadState,ActiveState,SubState,MainPID,FragmentPath",
        ],
        { timeout: 15000, maxBuffer: 32768 },
      );
      return parseUnitState(output.stdout);
    } catch {
      fail("WRITER_STATE_UNAVAILABLE");
    }
  }

  async function inventory() {
    const listed = await command(
      "/usr/bin/systemctl",
      [
        "list-units",
        "--all",
        "--plain",
        "--no-legend",
        "--no-pager",
        "veele-staging-*",
      ],
      { timeout: 15000, maxBuffer: 65536 },
    ).catch(() => fail("WRITER_INVENTORY"));

    for (const line of listed.stdout.split("\n").filter(Boolean)) {
      const name = line.trim().replace(/^●\s*/, "").split(/\s+/)[0];
      if (!name.endsWith(".service") && !name.endsWith(".timer")) continue;
      if (KNOWN_NON_WRITERS.has(name)) continue;
      requireThat(units.includes(name), "UNDECLARED_STAGING_WRITER");
    }

    const states = [];
    for (const unit of units) states.push(await state(unit));

    for (const item of states.filter((entry) => entry.active)) {
      for (const operation of ["stop", "start"]) {
        await command(
          "/usr/bin/sudo",
          ["-n", "-l", "/usr/bin/systemctl", operation, item.unit],
          { timeout: 10000, maxBuffer: 16384 },
        ).catch(() => fail("WRITER_PERMISSION_REQUIRED"));
      }
    }
    return states;
  }

  async function quiesce(expected, save) {
    const current = await inventory();
    requireThat(
      hash(current.map(({ pid: _pid, ...entry }) => entry)) ===
        hash(expected.map(({ pid: _pid, ...entry }) => entry)),
      "WRITER_STATE_DRIFT",
    );
    prior = current;
    await save({ phase: "QUIESCING", units: prior });
    try {
      const ordered = [...current].sort(
        (left, right) =>
          Number(right.unit.endsWith(".timer")) -
          Number(left.unit.endsWith(".timer")),
      );
      for (const item of ordered.filter((entry) => entry.active)) {
        await command(
          "/usr/bin/sudo",
          ["-n", "/usr/bin/systemctl", "stop", item.unit],
          { timeout: 30000, maxBuffer: 16384 },
        );
      }
      await assertStopped();
      await save({ phase: "QUIESCED", units: prior });
    } catch {
      try {
        await resume(prior);
      } catch {
        fail("RECOVERY_REQUIRED", "quiesce");
      }
      fail("QUIESCE_FAILED");
    }
    return prior;
  }

  async function assertStopped() {
    for (const unit of units) {
      const actual = await state(unit);
      requireThat(
        !actual.active && actual.pid === 0,
        "WRITERS_NOT_QUIESCED",
      );
    }
  }

  async function resume(saved = prior) {
    requireThat(
      Array.isArray(saved) &&
        saved.length === units.length &&
        saved.every(
          (item) =>
            units.includes(item.unit) && typeof item.active === "boolean",
        ),
      "WRITER_RECEIPT",
    );
    for (const item of saved.filter((entry) => entry.active)) {
      await command(
        "/usr/bin/sudo",
        ["-n", "/usr/bin/systemctl", "start", item.unit],
        { timeout: 30000, maxBuffer: 16384 },
      ).catch(() => fail("RECOVERY_REQUIRED", "resume"));
    }
    for (const item of saved) {
      requireThat(
        (await state(item.unit)).active === item.active,
        "RECOVERY_REQUIRED",
      );
    }
  }

  return { inventory, quiesce, assertStopped, resume };
}
