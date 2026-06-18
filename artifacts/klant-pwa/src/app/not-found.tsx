import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <p className="text-6xl font-bold" style={{ color: "var(--color-muted-fg)" }}>
        404
      </p>
      <p className="mt-4 text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
        Pagina niet gevonden
      </p>
      <Link
        href="/klant"
        className="mt-6 rounded-xl px-5 py-2.5 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        Terug naar dashboard
      </Link>
    </div>
  );
}
