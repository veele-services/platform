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
  assert.match(
    sudoers,
    /github-runner ALL=\(root\) NOPASSWD: FIELDGRID_WP1_RESET_CONTROL/u,
  );

  for (const unit of units) {
    assert.match(
      sudoers,
      new RegExp(
        String.raw`/usr/bin/systemctl stop ${unit.replaceAll(".", String.raw"\.")}`,
        "u",
      ),
    );
    assert.match(
      sudoers,
      new RegExp(
        String.raw`/usr/bin/systemctl start ${unit.replaceAll(".", String.raw"\.")}`,
        "u",
      ),
    );
  }

  for (const forbidden of [
    /\*/u,
    /production/u,
    /\brestart\b/u,
    /\breload\b/u,
    /daemon-reload/u,
    /\/bin\/(?:sh|bash)/u,
    /\b(?:cp|mv|rm|install|tee|chmod|chown)\b/u,
  ]) {
    assert.doesNotMatch(sudoers, forbidden);
  }
});
