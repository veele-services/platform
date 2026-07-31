"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BellRing,
  CheckCheck,
  Circle,
  MailOpen,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  clearAllNotifications,
  deleteNotifications,
  markAllNotificationsRead,
  markAllNotificationsUnread,
  markNotificationRead,
  markNotificationUnread,
  type PersonnelNotificationItem,
} from "@/actions/notifications";
import { PersonnelConfirmDialog } from "@/components/PersonnelConfirmDialog";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function categoryLabel(category: string) {
  if (category === "planning") return "Planning";
  if (category === "news") return "Nieuws";
  if (category === "hours") return "Uren";
  if (category === "message") return "Berichten";
  return "Systeem";
}

export function NotificationsInbox({
  notifications,
}: {
  notifications: PersonnelNotificationItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "all" } | { kind: "selection"; ids: string[] } | { kind: "one"; id: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const unreadCount = items.filter((item) => !item.readAt).length;
  const selectedItems = useMemo(
    () => items.filter((item) => selected.includes(item.id)),
    [items, selected],
  );

  function run(action: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success === false
      ) {
        setError(
          "error" in result && typeof result.error === "string"
            ? result.error
            : "De actie is mislukt. Probeer het opnieuw.",
        );
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const action =
      target.kind === "all"
        ? clearAllNotifications
        : () =>
            deleteNotifications(
              target.kind === "selection" ? target.ids : [target.id],
            );
    run(action, () => {
      if (target.kind === "all") {
        setItems([]);
        setSelected([]);
      } else {
        const deletedIds =
          target.kind === "selection" ? target.ids : [target.id];
        setItems((current) =>
          current.filter((item) => !deletedIds.includes(item.id)),
        );
        setSelected((current) =>
          current.filter((id) => !deletedIds.includes(id)),
        );
      }
      setDeleteTarget(null);
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function selectAll() {
    setSelected(items.map((item) => item.id));
  }

  function clearSelection() {
    setSelected([]);
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
          <BellRing size={21} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">
            Inbox meldingen
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {unreadCount} ongelezen van {items.length} meldingen
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ActionButton
          label="Alles gelezen"
          Icon={CheckCheck}
          disabled={isPending || items.length === 0}
          onClick={() =>
            run(markAllNotificationsRead, () =>
              setItems((current) =>
                current.map((item) => ({
                  ...item,
                  readAt: item.readAt ?? new Date().toISOString(),
                })),
              ),
            )
          }
        />
        <ActionButton
          label="Alles ongelezen"
          Icon={RotateCcw}
          disabled={isPending || items.length === 0}
          onClick={() =>
            run(markAllNotificationsUnread, () =>
              setItems((current) =>
                current.map((item) => ({ ...item, readAt: null })),
              ),
            )
          }
        />
        <ActionButton
          label="Selecteer alles"
          Icon={Circle}
          disabled={isPending || items.length === 0}
          onClick={selected.length === items.length ? clearSelection : selectAll}
        />
        <ActionButton
          label="Alles wissen"
          Icon={Trash2}
          danger
          disabled={isPending || items.length === 0}
          onClick={() => setDeleteTarget({ kind: "all" })}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      ) : null}

      {selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#D8E8F3] bg-[#F8FBFE] px-3 py-2.5">
          <p className="mr-auto text-xs font-semibold text-[var(--color-primary)]">
            {selected.length} geselecteerd
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  Promise.all(
                    selectedItems.map((item) =>
                      item.readAt
                        ? markNotificationUnread(item.id)
                        : markNotificationRead(item.id),
                    ),
                  ),
                () =>
                  setItems((current) =>
                    current.map((item) =>
                      selected.includes(item.id)
                        ? {
                            ...item,
                            readAt: item.readAt
                              ? null
                              : new Date().toISOString(),
                          }
                        : item,
                    ),
                  ),
              )
            }
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] shadow-sm disabled:opacity-50"
          >
            Wissel gelezen
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              setDeleteTarget({ kind: "selection", ids: [...selected] })
            }
            className="min-h-11 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
          >
            Selectie wissen
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item) => {
            const isSelected = selected.includes(item.id);
            const isUnread = !item.readAt;
            return (
              <article
                key={item.id}
                className="rounded-[20px] border bg-white p-3 shadow-sm"
                style={{
                  borderColor: isSelected
                    ? "var(--color-accent)"
                    : isUnread
                      ? "#BDEDEA"
                      : "var(--color-border)",
                  backgroundColor: isUnread ? "#FCFFFF" : "#FFFFFF",
                }}
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor: isSelected
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                      backgroundColor: isSelected
                        ? "var(--color-accent)"
                        : "white",
                      color: "white",
                    }}
                    aria-label="Melding selecteren"
                  >
                    {isSelected ? <CheckCheck size={14} strokeWidth={2.6} /> : null}
                  </button>
                  <Link href={item.href ?? "/meldingen"} className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-[var(--color-primary)]">
                          {item.title}
                        </p>
                        {item.body ? (
                          <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-500">
                            {item.body}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase"
                        style={{
                          backgroundColor: isUnread ? "#E8FBFA" : "#F1F5F9",
                          color: isUnread ? "#087C79" : "#64748B",
                        }}
                      >
                        {isUnread ? "Nieuw" : "Gelezen"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      <span>{item.sourceLabel ?? categoryLabel(item.category)}</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </Link>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          item.readAt
                            ? markNotificationUnread(item.id)
                            : markNotificationRead(item.id),
                        () =>
                          setItems((current) =>
                            current.map((currentItem) =>
                              currentItem.id === item.id
                                ? {
                                    ...currentItem,
                                    readAt: currentItem.readAt
                                      ? null
                                      : new Date().toISOString(),
                                  }
                                : currentItem,
                            ),
                          ),
                      )
                    }
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
                  >
                    {item.readAt ? "Ongelezen" : "Gelezen"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      setDeleteTarget({ kind: "one", id: item.id })
                    }
                    className="min-h-11 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                  >
                    Wissen
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-[20px] border border-[#D8E8F3] bg-[#F8FBFE] px-4 py-10 text-center">
            <MailOpen className="mx-auto text-slate-400" size={30} />
            <p className="mt-3 text-sm font-semibold text-[var(--color-primary)]">
              Geen meldingen
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Planning, nieuws en systeemmeldingen verschijnen hier.
            </p>
          </div>
        )}
      </div>
      <PersonnelConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === "all"
            ? "Alle meldingen wissen?"
            : deleteTarget?.kind === "selection"
              ? `${deleteTarget.ids.length} meldingen wissen?`
              : "Melding wissen?"
        }
        description="Deze meldingen verdwijnen uit je inbox. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Wissen"
        tone="danger"
        pending={isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function ActionButton({
  label,
  Icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  Icon: typeof CheckCheck;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border bg-white px-2 py-2 text-xs font-semibold shadow-sm disabled:opacity-50"
      style={{
        borderColor: danger ? "#FECACA" : "var(--color-border)",
        color: danger ? "#DC2626" : "var(--color-primary)",
      }}
    >
      <Icon size={15} strokeWidth={2.4} />
      {label}
    </button>
  );
}
