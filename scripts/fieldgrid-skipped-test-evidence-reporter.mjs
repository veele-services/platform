import { relative } from "node:path";

const evidencePrefix = "FIELDGRID_SKIPPED_TEST_V1 ";

function relativeTestFile(file) {
  return file
    ? relative(process.cwd(), file).replaceAll("\\", "/")
    : "<unknown>";
}

function eventKey(file, testId) {
  return JSON.stringify([file, testId]);
}

export default async function* fieldgridSkippedTestEvidenceReporter(source) {
  const eventTypes = new Map();
  const suitesByFile = new Map();
  const testIdentities = new Map();
  const occurrenceCounts = new Map();

  for await (const event of source) {
    const file = relativeTestFile(event.data?.file);
    const key = eventKey(file, event.data?.testId);

    if (
      event.type === "test:enqueue" &&
      (event.data?.type === "suite" || event.data?.type === "test")
    ) {
      eventTypes.set(key, event.data.type);
      continue;
    }
    if (event.type === "test:dequeue") continue;

    if (event.type === "test:start") {
      const eventType = eventTypes.get(key);
      const nesting = event.data?.nesting;
      if (!Number.isInteger(nesting) || !eventType) {
        throw new Error("Test event is missing type or nesting evidence.");
      }
      const suiteStack = suitesByFile.get(file) ?? [];
      if (eventType === "suite") {
        suiteStack.length = nesting;
        suiteStack[nesting] = event.data.name;
        suitesByFile.set(file, suiteStack);
      } else {
        const suitePath = suiteStack.slice(0, nesting);
        const identityKey = JSON.stringify([file, suitePath, event.data.name]);
        const occurrence = (occurrenceCounts.get(identityKey) ?? 0) + 1;
        occurrenceCounts.set(identityKey, occurrence);
        testIdentities.set(key, {
          file,
          suitePath,
          name: event.data.name,
          occurrence,
        });
      }
      continue;
    }

    if (
      (event.type === "test:pass" || event.type === "test:fail") &&
      event.data?.details?.type === "suite"
    ) {
      const suiteStack = suitesByFile.get(file) ?? [];
      suiteStack.length = event.data.nesting;
      suitesByFile.set(file, suiteStack);
      eventTypes.delete(key);
      continue;
    }

    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    if (event.type === "test:pass" && event.data?.skip) {
      const identity = testIdentities.get(key);
      if (!identity) {
        throw new Error("Skipped test event is missing declaration evidence.");
      }
      yield `${evidencePrefix}${JSON.stringify(identity)}\n`;
    }
    testIdentities.delete(key);
    eventTypes.delete(key);
  }
}
