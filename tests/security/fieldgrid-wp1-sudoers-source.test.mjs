import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sudoers = readFileSync(
  "ops/sudoers/veele-staging-wp1-reset",
  "utf8",
);

const effective = sudoers
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

const units = [
  "veele-staging.service",
  "veele-staging-personeel.service",
  "veele-staging-klant.service",
  "veele-staging-api.service",
];

test("WP1 sudoers grants only exact staging writer start/stop commands", () => {
  assert.ok(
    effective.includes(
      "github-runner ALL=(root) NOPASSWD: FIELDGRID_WP1_RESET_CONTROL",
    ),
  );

  for (const unit of units) {
    assert.ok(effective.includes(`/usr/bin/systemctl stop ${unit}`));
    assert.ok(effective.includes(`/usr/bin/systemctl start ${unit}`));
  }

  for (const forbidden of [
    "*",
    "production",
    " restart ",
    " reload ",
    "daemon-reload",
    "/bin/sh",
    "/bin/bash",
    " /usr/bin/install ",
    " /usr/bin/tee ",
    " /usr/bin/chmod ",
    " /usr/bin/chown ",
  ]) {
    assert.equal(
      effective.includes(forbidden),
      false,
      `forbidden sudoers capability marker: ${forbidden}`,
    );
  }
});
