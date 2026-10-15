import type { Metadata } from "next";
import WorkspaceNotFound from "./(workspace)/not-found";
import "./global-not-found.css";

export const metadata: Metadata = { title: "Pagina niet gevonden · Fieldgrid", robots: { index: false, follow: false } };
export default function GlobalNotFound() {
  return <html lang="nl"><body className="global-not-found"><WorkspaceNotFound /></body></html>;
}
