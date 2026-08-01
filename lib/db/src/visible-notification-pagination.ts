export type NotificationPageCursor = {
  id: string;
  createdAt: Date;
};

type VisibleNotificationPageOptions<
  TRow extends NotificationPageCursor,
  TItem,
> = {
  pageSize: number;
  itemLimit: number;
  countAll: boolean;
  loadPage: (cursor: NotificationPageCursor | null) => Promise<readonly TRow[]>;
  mapRow: (row: TRow) => TItem;
  isVisible: (item: TItem) => boolean;
};

export async function scanVisibleNotificationPages<
  TRow extends NotificationPageCursor,
  TItem,
>({
  pageSize,
  itemLimit,
  countAll,
  loadPage,
  mapRow,
  isVisible,
}: VisibleNotificationPageOptions<TRow, TItem>): Promise<{
  items: TItem[];
  visibleCount: number;
}> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be a positive integer");
  }
  if (!Number.isInteger(itemLimit) || itemLimit < 0) {
    throw new Error("itemLimit must be a non-negative integer");
  }

  const items: TItem[] = [];
  let cursor: NotificationPageCursor | null = null;
  let visibleCount = 0;

  while (true) {
    const rows = await loadPage(cursor);
    if (rows.length === 0) break;

    for (const row of rows) {
      const item = mapRow(row);
      if (!isVisible(item)) continue;
      visibleCount += 1;
      if (items.length < itemLimit) items.push(item);
    }

    if (!countAll && items.length >= itemLimit) break;
    if (rows.length < pageSize) break;

    const lastRow = rows.at(-1);
    if (!lastRow) break;
    const nextCursor = {
      id: lastRow.id,
      createdAt: lastRow.createdAt,
    };
    if (
      cursor &&
      cursor.id === nextCursor.id &&
      cursor.createdAt.getTime() === nextCursor.createdAt.getTime()
    ) {
      throw new Error("Notification pagination cursor did not advance");
    }
    cursor = nextCursor;
  }

  return { items, visibleCount };
}
