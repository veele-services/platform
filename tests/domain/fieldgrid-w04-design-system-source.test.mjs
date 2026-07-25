import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("canonical interaction primitives are present", () => {
  for (const path of [
    "artifacts/backoffice/src/components/ui/context-menu.tsx",
    "artifacts/backoffice/src/components/ui/hover-card.tsx",
    "artifacts/backoffice/src/components/ui/radio-group.tsx",
    "artifacts/backoffice/src/components/ui/toggle.tsx",
    "artifacts/backoffice/src/components/ui/toggle-group.tsx",
  ]) {
    assert.match(read(path), /@radix-ui\/react-/u);
  }
});

test("canonical overlays share semantic layer and reduced-motion contracts", () => {
  for (const path of [
    "artifacts/backoffice/src/components/ui/alert-dialog.tsx",
    "artifacts/backoffice/src/components/ui/dialog.tsx",
    "artifacts/backoffice/src/components/ui/drawer.tsx",
    "artifacts/backoffice/src/components/ui/sheet.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /--z-modal/u);
    assert.match(source, /motion-reduce/u);
  }
});

test("default form and action controls provide touch-sized targets", () => {
  assert.match(
    read("artifacts/backoffice/src/components/ui/button.tsx"),
    /default: "min-h-11/u,
  );
  assert.match(
    read("artifacts/backoffice/src/components/ui/input.tsx"),
    /min-h-11/u,
  );
  assert.match(
    read("artifacts/backoffice/src/components/ui/select.tsx"),
    /min-h-11/u,
  );
});
