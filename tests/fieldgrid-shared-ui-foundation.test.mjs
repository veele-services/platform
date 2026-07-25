import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/shared-ui/src/index.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../lib/shared-ui/src/radix-adapters/modal.tsx', import.meta.url), 'utf8');
const status = readFileSync(new URL('../lib/shared-ui/src/status.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../lib/shared-ui/src/styles.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/phase-2/shared-ui-foundation.md', import.meta.url), 'utf8');

test('shared UI exports required primitives', () => {
  for (const name of ['SkipLink','PageContainer','PageHeader','SectionHeader','FilterBar','StatusBadge','MetricCard','DataTableShell','MobileCardList','EmptyState','ErrorState','LoadingSkeleton','FormField','Timeline','TimelineItem','MetadataRow','InlineFeedback','ToastRegion','IconOnlyButton']) {
    assert.match(source, new RegExp(`export function ${name}\\b`), `${name} must be exported`);
  }
  for (const name of ['Dialog','DialogContent','DialogDescription','DialogTitle','AlertDialog','AlertDialogContent','AlertDialogDescription','AlertDialogTitle']) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `${name} must be exported`);
  }
});

test('semantic status usage is centralized', () => {
  assert.match(status, /export const statusTones = \{/);
  assert.match(source, /data-status-tone=\{tone\}/);
  assert.doesNotMatch(source, /const\s+\w*Status\w*Colors\s*=\s*\{/i, 'no duplicated raw status-color maps in components');
  assert.match(docs, /Maak geen feature-specifieke raw kleurmaps voor statussen/);
});

test('accessibility attributes and states are present', () => {
  assert.match(modal, /@radix-ui\/react-alert-dialog/);
  assert.match(modal, /@radix-ui\/react-dialog/);
  assert.match(modal, /AlertDialogPrimitive\.Content/);
  assert.match(modal, /DialogPrimitive\.Content/);
  assert.match(modal, /AlertDialogPrimitive\.Title/);
  assert.match(modal, /AlertDialogPrimitive\.Description/);
  assert.match(source, /role="status"/);
  assert.match(source, /role=\{tone === "danger" \? "alert" : "status"\}/);
  assert.match(source, /aria-describedby/);
  assert.match(source, /aria-invalid/);
});

test('responsive variants cover mobile, tablet, laptop and wide desktop', () => {
  for (const token of ['px-4','sm:px-6','lg:px-8','max-w-7xl','md:hidden']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${token} must be represented`);
  }
  assert.match(modal, /bottom-0/);
  assert.match(modal, /sm:top-1\/2/);
  assert.match(modal, /sm:rounded-2xl/);
});

test('icon-only controls require accessible labels', () => {
  assert.match(source, /IconOnlyButton\([^)]*label: string/s);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /title=\{label\}/);
});

test('keyboard focus, touch target and reduced-motion foundations are present', () => {
  assert.match(source, /Direct naar hoofdinhoud/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test('Dutch migration guide exists', () => {
  assert.match(docs, /Deze basis introduceert herbruikbare primitives/);
  assert.match(docs, /Migratie-afspraken/);
});
