import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

function read(path) {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function collectSourceFiles(directory) {
  const files = [];
  const directoryPath = join(ROOT_PATH, directory);

  for (const entry of readdirSync(directoryPath)) {
    const absolutePath = join(directoryPath, entry);
    const relativePath = `${directory}/${entry}`.replaceAll("\\", "/");
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(relativePath));
    } else if (/\.(tsx?|jsx?)$/u.test(entry)) {
      files.push(relativePath);
    }
  }

  return files;
}

test("phase 2 removes raw browser dialogs from customer and personnel production source", () => {
  const files = [
    ...collectSourceFiles("artifacts/klant-pwa/src"),
    ...collectSourceFiles("artifacts/personeel-pwa/src"),
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\bconfirm\s*\(/u, `${file} must not use raw confirm()`);
    assert.doesNotMatch(source, /window\.confirm\s*\(/u, `${file} must not use window.confirm()`);
    assert.doesNotMatch(source, /window\.alert\s*\(/u, `${file} must not use window.alert()`);
    assert.doesNotMatch(source, /\balert\s*\(/u, `${file} must not use raw alert()`);
  }
});

test("phase 2 provides an accessible personnel confirm dialog pattern", () => {
  const dialog = read("artifacts/personeel-pwa/src/components/PersonnelConfirmDialog.tsx");

  assert.match(dialog, /from "@workspace\/shared-ui"/u);
  assert.match(dialog, /<AlertDialog/u);
  assert.match(dialog, /<AlertDialogContent/u);
  assert.match(dialog, /<AlertDialogTitle/u);
  assert.match(dialog, /<AlertDialogDescription/u);
  assert.match(dialog, /<AlertDialogCancel/u);
  assert.match(dialog, /<AlertDialogAction/u);
  assert.match(dialog, /onOpenChange=/u);
  assert.doesNotMatch(dialog, /role="dialog"|aria-modal=/u);
});

test("phase 2 replaces risky personnel actions with app confirm dialogs", () => {
  const applyButton = read("artifacts/personeel-pwa/src/app/(app)/openstaand/ApplyButton.tsx");
  const statusProgress = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx");

  assert.match(applyButton, /ResponseBottomSheet/u);
  assert.match(applyButton, /sheetAction/u);
  assert.match(applyButton, /Interesse tonen\?/u);
  assert.match(applyButton, /Niet beschikbaar doorgeven\?/u);

  assert.match(statusProgress, /PersonnelConfirmDialog/u);
  assert.match(statusProgress, /Werkzaamheden starten\?/u);
  assert.match(statusProgress, /confirmStart/u);
});

test("phase 2 replaces payment alert with inline customer feedback", () => {
  const paymentButton = read("artifacts/klant-pwa/src/components/PaymentActionButton.tsx");

  assert.match(paymentButton, /useState<string \| null>/u);
  assert.match(paymentButton, /setError\(result\.message\)/u);
  assert.match(paymentButton, /role="alert"/u);
  assert.match(paymentButton, /AlertCircle/u);
});
