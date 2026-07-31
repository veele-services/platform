const APPS = [
  { id: "backoffice", label: "Backoffice",  href: "/admin" },
  { id: "personeel",  label: "Personeel",   href: "/personeel/" },
  { id: "klant",      label: "Klant",       href: "/klant/" },
] as const;

type AppId = (typeof APPS)[number]["id"];

export function DevNav({ current }: { current: AppId }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      data-fieldgrid-dev-nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "0 12px",
        height: "28px",
        fontFamily: "ui-monospace, monospace",
        fontSize: "11px",
      }}
    >
      <span style={{ color: "#CBD5E1", marginRight: "6px", letterSpacing: "0.05em" }}>
        🔧 dev
      </span>
      {APPS.map((app) => {
        const active = current === app.id;
        return (
          <a
            key={app.id}
            href={app.href}
            style={{
              color:          active ? "#5EEAD4" : "#CBD5E1",
              textDecoration: "none",
              padding:        "2px 10px",
              borderRadius:   "4px",
              background:     active ? "rgba(0,183,179,0.12)" : "transparent",
              border:         active ? "1px solid rgba(0,183,179,0.35)" : "1px solid transparent",
              fontWeight:     active ? "700" : "400",
              lineHeight:     "20px",
            }}
          >
            {app.label}
          </a>
        );
      })}
    </div>
  );
}
