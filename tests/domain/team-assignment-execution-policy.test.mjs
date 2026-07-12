import assert from "node:assert/strict";
import { test } from "node:test";

const ACTIVE_STATUSES = new Set([
  "assigned",
  "acknowledged",
  "en_route",
  "started",
  "completed",
  "unable_to_complete",
]);

const TERMINAL_PARTICIPANT_STATUSES = new Set([
  "completed",
  "unable_to_complete",
  "withdrawn",
  "replaced",
]);

const STATUS_ORDER = {
  assigned: 0,
  acknowledged: 1,
  en_route: 2,
  started: 3,
  completed: 4,
  unable_to_complete: 4,
  withdrawn: 4,
  replaced: 4,
};

const EVENT_TO_STATUS = {
  acknowledge: "acknowledged",
  mark_en_route: "en_route",
  start: "started",
  complete: "completed",
  unable_to_complete: "unable_to_complete",
  withdraw: "withdrawn",
  replace: "replaced",
};

function at(minutes) {
  return new Date(Date.UTC(2026, 0, 1, 8, minutes, 0)).toISOString();
}

function participant(id, tenantId = "tenant-a", assignmentId = "assignment-1") {
  return {
    id,
    tenantId,
    assignmentId,
    personnelId: `personnel-${id}`,
    status: "assigned",
    required: true,
    version: 0,
    lastEventAt: null,
    acknowledgedAt: null,
    enRouteAt: null,
    startedAt: null,
    completedAt: null,
    unableToCompleteAt: null,
    withdrawnAt: null,
    replacedAt: null,
    actorUserId: null,
    completionReason: null,
    completionNotes: null,
    reportId: null,
    signatureId: null,
    replacedByParticipantId: null,
  };
}

function assignment(overrides = {}) {
  return {
    id: "assignment-1",
    tenantId: "tenant-a",
    status: "scheduled",
    requiredPersonnelCount: 2,
    participants: [participant("a"), participant("b")],
    processedEventIds: new Set(),
    audit: [],
    denials: [],
    ...overrides,
  };
}

function activeParticipants(model) {
  return model.participants.filter((item) => ACTIVE_STATUSES.has(item.status));
}

function requiredParticipants(model) {
  return activeParticipants(model).filter((item) => item.required);
}

function aggregateAssignment(model) {
  const required = requiredParticipants(model);
  const completed = required.filter((item) => item.status === "completed").length;
  const unable = required.filter((item) => item.status === "unable_to_complete").length;
  const target = model.requiredPersonnelCount;

  if (completed >= target) {
    return {
      status: "completed",
      completionReady: true,
      needsReplacement: false,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  if (required.length > 0 && unable === required.length) {
    return {
      status: "not_completed",
      completionReady: false,
      needsReplacement: true,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  if (required.some((item) => item.status === "started")) {
    return {
      status: "in_progress",
      completionReady: false,
      needsReplacement: unable > 0,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  if (completed > 0 || unable > 0) {
    return {
      status: "in_progress",
      completionReady: false,
      needsReplacement: unable > 0,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  if (required.some((item) => item.status === "en_route")) {
    return {
      status: "en_route",
      completionReady: false,
      needsReplacement: unable > 0,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  if (required.some((item) => item.status === "acknowledged")) {
    return {
      status: "seen",
      completionReady: false,
      needsReplacement: unable > 0,
      activeRequiredCount: required.length,
      completedRequiredCount: completed,
      unableRequiredCount: unable,
    };
  }

  return {
    status: "scheduled",
    completionReady: false,
    needsReplacement: unable > 0,
    activeRequiredCount: required.length,
    completedRequiredCount: completed,
    unableRequiredCount: unable,
  };
}

function setTimestamp(row, status, occurredAt) {
  if (status === "acknowledged") row.acknowledgedAt ??= occurredAt;
  if (status === "en_route") row.enRouteAt ??= occurredAt;
  if (status === "started") row.startedAt ??= occurredAt;
  if (status === "completed") row.completedAt ??= occurredAt;
  if (status === "unable_to_complete") row.unableToCompleteAt ??= occurredAt;
  if (status === "withdrawn") row.withdrawnAt ??= occurredAt;
  if (status === "replaced") row.replacedAt ??= occurredAt;
}

function deny(model, event, reason) {
  model.denials.push({
    eventId: event.eventId,
    assignmentId: event.assignmentId,
    participantId: event.participantId,
    actorTenantId: event.tenantId,
    reason,
  });
  return { ok: false, denied: true, reason, aggregate: aggregateAssignment(model) };
}

function applyParticipantEvent(model, event) {
  if (model.processedEventIds.has(event.eventId)) {
    return { ok: true, duplicate: true, aggregate: aggregateAssignment(model) };
  }

  if (event.tenantId !== model.tenantId || event.assignmentId !== model.id) {
    return deny(model, event, "tenant_or_assignment_mismatch");
  }

  const row = model.participants.find((item) => item.id === event.participantId);
  if (!row || row.tenantId !== event.tenantId || row.assignmentId !== event.assignmentId) {
    return deny(model, event, "participant_not_in_assignment_tenant");
  }

  const nextStatus = EVENT_TO_STATUS[event.type];
  if (!nextStatus) return deny(model, event, "unknown_event_type");
  if (TERMINAL_PARTICIPANT_STATUSES.has(row.status)) return deny(model, event, "participant_terminal");

  if (event.expectedVersion !== row.version) {
    return deny(model, event, "optimistic_concurrency_conflict");
  }

  if (row.lastEventAt && event.occurredAt < row.lastEventAt) {
    return deny(model, event, "stale_event_order");
  }

  if (STATUS_ORDER[nextStatus] < STATUS_ORDER[row.status]) {
    return deny(model, event, "illegal_regression");
  }

  row.status = nextStatus;
  row.version += 1;
  row.lastEventAt = event.occurredAt;
  row.actorUserId = event.actorUserId;
  row.completionReason = event.reason ?? row.completionReason;
  row.completionNotes = event.notes ?? row.completionNotes;
  row.reportId = event.reportId ?? row.reportId;
  row.signatureId = event.signatureId ?? row.signatureId;
  row.replacedByParticipantId = event.replacedByParticipantId ?? row.replacedByParticipantId;
  setTimestamp(row, nextStatus, event.occurredAt);

  model.processedEventIds.add(event.eventId);
  const aggregate = aggregateAssignment(model);
  model.status = aggregate.status;
  model.audit.push({
    eventId: event.eventId,
    assignmentId: model.id,
    participantId: row.id,
    actorUserId: event.actorUserId,
    fromStatus: event.fromStatus ?? null,
    toStatus: row.status,
    aggregateStatus: aggregate.status,
  });
  return { ok: true, aggregate };
}

function event(type, participantId, version, minutes, overrides = {}) {
  return {
    eventId: `${type}-${participantId}-${minutes}`,
    tenantId: "tenant-a",
    assignmentId: "assignment-1",
    participantId,
    actorUserId: `user-${participantId}`,
    type,
    expectedVersion: version,
    occurredAt: at(minutes),
    ...overrides,
  };
}

test("two workers can start concurrently without overwriting each other", () => {
  const model = assignment();

  assert.equal(applyParticipantEvent(model, event("start", "a", 0, 1)).ok, true);
  assert.equal(applyParticipantEvent(model, event("start", "b", 0, 1)).ok, true);

  assert.equal(model.status, "in_progress");
  assert.deepEqual(model.participants.map((item) => [item.id, item.status, item.version]), [
    ["a", "started", 1],
    ["b", "started", 1],
  ]);
  assert.equal(model.audit.length, 2);
});

test("one worker starting moves the aggregate to in_progress while another has not arrived", () => {
  const model = assignment();

  applyParticipantEvent(model, event("start", "a", 0, 2));
  const aggregate = aggregateAssignment(model);

  assert.equal(aggregate.status, "in_progress");
  assert.equal(aggregate.completedRequiredCount, 0);
  assert.equal(model.participants.find((item) => item.id === "b").status, "assigned");
});

test("one completed worker does not complete a two-person assignment while another remains active", () => {
  const model = assignment();

  applyParticipantEvent(model, event("start", "a", 0, 1));
  applyParticipantEvent(model, event("complete", "a", 1, 5, {
    reportId: "report-a",
    signatureId: "signature-a",
  }));

  const aggregate = aggregateAssignment(model);
  assert.equal(aggregate.status, "in_progress");
  assert.equal(aggregate.completionReady, false);
  assert.equal(aggregate.completedRequiredCount, 1);
  assert.equal(model.participants.find((item) => item.id === "a").reportId, "report-a");
});

test("unable-to-complete participants require replacement or a required count decision", () => {
  const model = assignment();

  applyParticipantEvent(model, event("start", "a", 0, 1));
  applyParticipantEvent(model, event("unable_to_complete", "a", 1, 2, {
    reason: "Materiaal ontbreekt",
    notes: "Planner moet herbeoordelen",
  }));

  let aggregate = aggregateAssignment(model);
  assert.equal(aggregate.status, "in_progress");
  assert.equal(aggregate.needsReplacement, true);
  assert.equal(model.participants.find((item) => item.id === "a").completionReason, "Materiaal ontbreekt");

  applyParticipantEvent(model, event("unable_to_complete", "b", 0, 3, {
    reason: "Geen toegang",
  }));
  aggregate = aggregateAssignment(model);
  assert.equal(aggregate.status, "not_completed");
  assert.equal(aggregate.needsReplacement, true);
});

test("removed and replacement workers are modeled without erasing prior execution state", () => {
  const model = assignment();

  applyParticipantEvent(model, event("start", "a", 0, 1));
  applyParticipantEvent(model, event("replace", "b", 0, 2, {
    replacedByParticipantId: "c",
  }));
  model.participants.push(participant("c"));

  assert.equal(model.participants.find((item) => item.id === "b").status, "replaced");
  assert.equal(model.participants.find((item) => item.id === "b").replacedByParticipantId, "c");
  assert.equal(aggregateAssignment(model).activeRequiredCount, 2);

  applyParticipantEvent(model, event("start", "c", 0, 3));
  applyParticipantEvent(model, event("complete", "a", 1, 4));
  applyParticipantEvent(model, event("complete", "c", 1, 5));

  assert.equal(model.status, "completed");
});

test("duplicate offline events are idempotent and stale events are denied", () => {
  const model = assignment();
  const start = event("start", "a", 0, 10, { eventId: "offline-start-a" });

  assert.equal(applyParticipantEvent(model, start).ok, true);
  const duplicate = applyParticipantEvent(model, start);
  assert.equal(duplicate.duplicate, true);
  assert.equal(model.participants.find((item) => item.id === "a").version, 1);
  assert.equal(model.audit.length, 1);

  const stale = applyParticipantEvent(model, event("mark_en_route", "a", 1, 5));
  assert.equal(stale.denied, true);
  assert.equal(stale.reason, "stale_event_order");
  assert.equal(model.denials.length, 1);
});

test("final aggregate completion waits for the required crew target", () => {
  const model = assignment();

  for (const id of ["a", "b"]) {
    applyParticipantEvent(model, event("start", id, 0, 1));
    applyParticipantEvent(model, event("complete", id, 1, 2));
  }

  const aggregate = aggregateAssignment(model);
  assert.equal(aggregate.status, "completed");
  assert.equal(aggregate.completedRequiredCount, 2);
  assert.equal(aggregate.completionReady, true);
});

test("requiredPersonnelCount changes intentionally support partial crew completion", () => {
  const model = assignment();

  applyParticipantEvent(model, event("start", "a", 0, 1));
  applyParticipantEvent(model, event("complete", "a", 1, 2));
  assert.equal(aggregateAssignment(model).status, "in_progress");

  model.requiredPersonnelCount = 1;
  const aggregate = aggregateAssignment(model);
  model.status = aggregate.status;

  assert.equal(aggregate.status, "completed");
  assert.equal(aggregate.completedRequiredCount, 1);
});

test("workers from another tenant are denied and leave parent and participant state unchanged", () => {
  const model = assignment();

  const result = applyParticipantEvent(model, event("start", "a", 0, 1, {
    eventId: "tenant-b-start",
    tenantId: "tenant-b",
    actorUserId: "tenant-b-user",
  }));

  assert.equal(result.denied, true);
  assert.equal(result.reason, "tenant_or_assignment_mismatch");
  assert.equal(model.status, "scheduled");
  assert.equal(model.participants.find((item) => item.id === "a").status, "assigned");
  assert.equal(model.audit.length, 0);
  assert.equal(model.denials.length, 1);
});
