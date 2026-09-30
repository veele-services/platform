"use client";
import Link from "next/link";
import { useState } from "react";
import { executionStatuses } from "@/lib/planning/model";
import { localDateTime } from "@/lib/planning/time";
import type { WorkspaceData } from "@/lib/data/workspace";

/** These are the existing work orders, not a dossier-specific appointment copy. */
export function ExecutionHistory({
  orders,
  timezone,
}: {
  orders: WorkspaceData["workOrders"];
  timezone: string;
}) {
  const [status, setStatus] = useState("");
  const rows = orders.filter((w) => !status || w.status === status);
  return (
    <section className="customer-executions">
      <div className="customer-section-heading">
        <h3>Uitvoeringen</h3>
        <p>Dezelfde werkbonnen en actuele tijden als op het planbord.</p>
      </div>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle statussen</option>
          {Object.entries(executionStatuses).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table className="resource-table">
          <thead>
            <tr>
              <th>Werkbon</th>
              <th>Geplande uitvoering</th>
              <th>Status</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link href={`/app/werkbonnen/${w.id}`}>
                    {w.work_order_number}
                  </Link>
                  {w.day_instructions && <small>{w.day_instructions}</small>}
                </td>
                <td>
                  {w.projected_start_at
                    ? localDateTime(w.projected_start_at, timezone).replace(
                        "T",
                        " ",
                      )
                    : "Nog geen datum"}
                  <small>
                    {w.projected_end_at
                      ? localDateTime(w.projected_end_at, timezone).replace(
                          "T",
                          " ",
                        )
                      : ""}
                  </small>
                </td>
                <td>{executionStatuses[w.status]}</td>
                <td>
                  <Link
                    className="resource-action"
                    href={`/app/planning?${new URLSearchParams({ order: w.id, ...(w.projected_start_at ? { day: localDateTime(w.projected_start_at, timezone).slice(0, 10) } : {}) })}`}
                  >
                    Planbord
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="customer-dossier-empty">
          Geen uitvoeringen in deze selectie.
        </p>
      )}
    </section>
  );
}
