"use client";

import Link from "next/link";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <span style={styles.logo}>Fieldgrid</span>
        <p style={styles.eyebrow}>Er ging iets mis</p>
        <h1 style={styles.title}>Fieldgrid kon deze pagina niet laden.</h1>
        <p style={styles.copy}>Probeer het nogmaals. Blijft het probleem bestaan, ga dan terug naar het startscherm.</p>
        <div style={styles.actions}>
          <button className="primary-button" onClick={reset} type="button">
            Opnieuw proberen
          </button>
          <Link className="secondary-button" href="/">
            Naar Fieldgrid
          </Link>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#edf2f5",
  },
  card: {
    width: "min(100%, 560px)",
    padding: "clamp(28px, 6vw, 50px)",
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
    marginBottom: "10px",
    color: "#078d8b",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: ".12em",
    textTransform: "uppercase" as const,
  },
  title: {
    marginBottom: "12px",
    color: "#0b1d3a",
    fontSize: "clamp(27px, 6vw, 38px)",
    lineHeight: 1.15,
  },
  copy: {
    marginBottom: "28px",
    color: "#627587",
    fontSize: "15px",
    lineHeight: 1.65,
  },
  actions: { display: "flex", flexWrap: "wrap" as const, gap: "10px" },
};
