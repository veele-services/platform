import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-bold" style={{ color: "var(--color-accent)" }}>
        404
      </p>
      <p className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
        Pagina niet gevonden
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg px-6 py-3 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        Terug naar home
      </Link>
    </div>
  );
}
