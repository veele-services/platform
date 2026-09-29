import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-root" style={styles.page}>
      <section style={styles.card}>
        <span style={styles.logo}>Fieldgrid</span>
        <p style={styles.eyebrow}>404 · Pagina niet gevonden</p>
        <h1 style={styles.title}>Deze pagina bestaat niet.</h1>
        <p style={styles.copy}>
          De link is mogelijk verlopen of het adres is gewijzigd. Ga terug naar Fieldgrid om verder te werken.
        </p>
        <Link className="primary-button" href="/">
          Naar Fieldgrid
        </Link>
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
    width: "min(100%, 540px)",
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
    fontSize: "clamp(28px, 6vw, 40px)",
    lineHeight: 1.15,
  },
  copy: {
    maxWidth: "440px",
    marginBottom: "28px",
    color: "#627587",
    fontSize: "15px",
    lineHeight: 1.65,
  },
};
