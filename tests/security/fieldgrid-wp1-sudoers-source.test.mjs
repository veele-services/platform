import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sudoers = readFileSync(
  "ops/sudoers/veele-staging-wp1-reset",
  "utf8",
);

const units = [
  "veele-staging.service",
  "veele-staging-personeel.service",
  "veele-staging-klant.service",
  "veele-staging-api.service",
];

test("WP1 sudoers grants only exact staging writer start/stop commands", () => {
  assert.ok(
    sudoers.includes(
      "github-runner ALL=(root) NOPASSWD: FIELDGRID_WP1_RESET_CONTROL",
    ),
  );

  for (const unit of units) {
    assert.ok(sudoers.includes(`/usr/bin/systemctl stop ${unit}`));
    assert.ok(sudoers.includes(`/usr/bin/systemctl start ${unit}`));
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
      sudoers.includes(forbidden),
      false,
      `forbidden sudoers capability marker: ${forbidden}`,
    );
  }
});
