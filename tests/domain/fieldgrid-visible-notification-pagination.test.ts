import assert from "node:assert/strict";
import test from "node:test";

import {
  scanVisibleNotificationPages,
  type NotificationPageCursor,
} from "../../lib/db/src/visible-notification-pagination";

type Row = NotificationPageCursor & {
  visible: boolean;
  category: "message" | "system";
};

function row(
  sequence: number,
  visible = true,
  category: Row["category"] = "message",
): Row {
  return {
    id: sequence.toString().padStart(4, "0"),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)),
    visible,
    category,
  };
}

test("visible notification scan continues past a full inaccessible first page", async () => {
  const pages = [
    Array.from({ length: 80 }, (_, index) => row(200 - index, false)),
    [row(120), row(119), row(118)],
  ];
  const cursors: Array<NotificationPageCursor | null> = [];

  const result = await scanVisibleNotificationPages({
    pageSize: 80,
    itemLimit: 80,
    countAll: false,
    loadPage: async (cursor) => {
      cursors.push(cursor);
      return pages[cursors.length - 1] ?? [];
    },
    mapRow: (value) => value,
    isVisible: (value) => value.visible,
  });

  assert.deepEqual(
    result.items.map((item) => item.id),
    ["0120", "0119", "0118"],
  );
  assert.equal(cursors.length, 2);
  assert.equal(cursors[1]?.id, pages[0]?.at(-1)?.id);
});

test("summary counts every visible unread item but retains only the newest three", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, index) => row(360 - index, false)),
    Array.from({ length: 100 }, (_, index) => row(260 - index, true)),
    Array.from({ length: 25 }, (_, index) => row(160 - index, true)),
  ];
  let pageIndex = 0;

  const result = await scanVisibleNotificationPages({
    pageSize: 100,
    itemLimit: 3,
    countAll: true,
    loadPage: async () => pages[pageIndex++] ?? [],
    mapRow: (value) => value,
    isVisible: (value) => value.visible,
  });

  assert.equal(result.visibleCount, 125);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["0260", "0259", "0258"],
  );
});

test("customer summaries exclude system rows without truncating later messages", async () => {
  const values = [
    ...Array.from({ length: 100 }, (_, index) =>
      row(300 - index, true, "system"),
    ),
    row(200, true, "message"),
    row(199, true, "message"),
  ];
  let offset = 0;

  const result = await scanVisibleNotificationPages({
    pageSize: 100,
    itemLimit: 3,
    countAll: true,
    loadPage: async () => {
      const page = values.slice(offset, offset + 100);
      offset += 100;
      return page;
    },
    mapRow: (value) => value,
    isVisible: (value) => value.visible && value.category !== "system",
  });

  assert.equal(result.visibleCount, 2);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["0200", "0199"],
  );
});

test("cursor comes from the last raw row and equal timestamps retain id order", async () => {
  const createdAt = new Date("2026-01-01T12:00:00.000Z");
  const firstPage: Row[] = [
    { ...row(3, false), id: "c", createdAt },
    { ...row(2, true), id: "b", createdAt },
  ];
  const secondPage: Row[] = [{ ...row(1, true), id: "a", createdAt }];
  const cursors: Array<NotificationPageCursor | null> = [];

  const result = await scanVisibleNotificationPages({
    pageSize: 2,
    itemLimit: 5,
    countAll: true,
    loadPage: async (cursor) => {
      cursors.push(cursor);
      return cursors.length === 1 ? firstPage : secondPage;
    },
    mapRow: (value) => value,
    isVisible: (value) => value.visible,
  });

  assert.equal(cursors[1]?.id, "b");
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["b", "a"],
  );
});
