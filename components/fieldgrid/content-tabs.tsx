"use client";

import { useId, useState, type ReactNode } from "react";
import "./content-tabs.css";

/** Keep panels mounted so changing tabs preserves unsaved form inputs. */
export function ContentTabs({ label, tabs }: { label: string; tabs: Array<{ id: string; title: string; content: ReactNode }> }) {
  const prefix = useId();
  const [selected, setSelected] = useState(tabs[0]?.id);
  const current = tabs.some(tab => tab.id === selected) ? selected : tabs[0]?.id;
  return <div className="content-tabs">
    <div className="content-tab-list" role="tablist" aria-label={label}>{tabs.map((tab, index) => <button type="button" role="tab" key={tab.id} id={`${prefix}-${tab.id}-tab`} aria-controls={`${prefix}-${tab.id}-panel`} aria-selected={current === tab.id} tabIndex={current === tab.id ? 0 : -1} onClick={() => setSelected(tab.id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setSelected(tabs[next].id);
      document.getElementById(`${prefix}-${tabs[next].id}-tab`)?.focus();
    }}>{tab.title}</button>)}</div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${prefix}-${tab.id}-panel`} aria-labelledby={`${prefix}-${tab.id}-tab`} hidden={current !== tab.id} className="content-tab-panel">{tab.content}</div>)}
  </div>;
}
