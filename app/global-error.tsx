"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: "Inter, Arial, sans-serif" }}>
        <main style={styles.page}>
          <section style={styles.card}>
            <span style={styles.logo}>Fieldgrid</span>
            <p style={styles.eyebrow}>Er ging iets mis</p>
            <h1 style={styles.title}>Fieldgrid kan niet worden geladen.</h1>
            <p style={styles.copy}>Probeer het opnieuw. Je opgeslagen gegevens blijven behouden.</p>
            <div style={styles.actions}>
              <button onClick={reset} style={styles.primary} type="button">
                Opnieuw proberen
              </button>
              <Link href="/" style={styles.secondary}>
                Naar Fieldgrid
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    boxSizing: "border-box" as const,
    background: "#edf2f5",
  },
  card: {
    width: "min(100%, 560px)",
    padding: "clamp(28px, 6vw, 50px)",
    boxSizing: "border-box" as const,
    border: "1px solid #dce7ed",
    borderRadius: "24px",
    background: "#fff",
    boxShadow: "0 20px 60px rgba(11, 29, 58, .08)",
  },
  logo: {
    display: "inline-flex",
    marginBottom: "32px",
    color: "#0b1d3a",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: ".16em",
  },
  eyebrow: {
    margin: "0 0 10px",
    color: "#078d8b",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: ".12em",
    textTransform: "uppercase" as const,
  },
  title: {
    margin: "0 0 12px",
    color: "#0b1d3a",
    fontSize: "clamp(27px, 6vw, 38px)",
    lineHeight: 1.15,
  },
  copy: {
    margin: "0 0 28px",
    color: "#627587",
    fontSize: "15px",
    lineHeight: 1.65,
  },
  actions: { display: "flex", flexWrap: "wrap" as const, gap: "10px" },
  primary: {
    minHeight: "44px",
    padding: "11px 17px",
    border: 0,
    borderRadius: "9px",
    background: "#00a7a5",
    color: "#fff",
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondary: {
    minHeight: "44px",
    display: "inline-flex",
    alignItems: "center",
    padding: "11px 17px",
    boxSizing: "border-box" as const,
    border: "1px solid #d8e2e8",
    borderRadius: "9px",
    background: "#fff",
    color: "#173658",
    fontWeight: 800,
    textDecoration: "none",
  },
};
