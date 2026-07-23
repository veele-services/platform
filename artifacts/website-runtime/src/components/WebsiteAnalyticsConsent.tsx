"use client";

import type { WebsiteAnalytics } from "@workspace/website-core";
import { useEffect, useState } from "react";

const CONSENT_COOKIE = "fg_website_analytics_consent";
const PLAUSIBLE_SCRIPT_ID = "fieldgrid-plausible-analytics";
type Consent = "accepted" | "rejected";

function readConsent(): Consent | null {
  const match = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.slice(CONSENT_COOKIE.length + 1);
  return value === "accepted" || value === "rejected" ? value : null;
}

function persistConsent(value: Consent) {
  document.cookie = [
    `${CONSENT_COOKIE}=${value}`,
    "Max-Age=31536000",
    "Path=/",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

function loadPlausible(publicSiteId: string) {
  if (document.getElementById(PLAUSIBLE_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = PLAUSIBLE_SCRIPT_ID;
  script.defer = true;
  script.src = "https://plausible.io/js/script.js";
  script.dataset.domain = publicSiteId;
  document.head.append(script);
}

export function WebsiteAnalyticsConsent({
  analytics,
}: {
  analytics: WebsiteAnalytics;
}) {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
  }, []);

  useEffect(() => {
    if (analytics.provider === "plausible" && consent === "accepted") {
      loadPlausible(analytics.publicSiteId);
    }
  }, [analytics, consent]);

  if (analytics.provider === "none" || consent === undefined) return null;
  const choose = (value: Consent) => {
    persistConsent(value);
    setConsent(value);
    setSettingsOpen(false);
  };
  const showDialog = consent === null || settingsOpen;

  return (
    <>
      {showDialog ? (
        <aside
          aria-label="Analyticsvoorkeur"
          role="dialog"
          aria-modal="false"
          data-nosnippet
          style={{
            position: "fixed",
            zIndex: 1000,
            right: "1rem",
            bottom: "1rem",
            width: "min(30rem, calc(100vw - 2rem))",
            border: "1px solid #cbd5e1",
            borderRadius: "0.8rem",
            background: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 18px 45px rgb(15 23 42 / 0.18)",
            padding: "1rem",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.35rem" }}>
            Privacyvriendelijke analytics
          </strong>
          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.55 }}>
            Met uw toestemming meten we anoniem welke pagina&apos;s worden
            bezocht. Zonder toestemming laden we geen analytics.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "0.6rem",
              marginTop: "0.9rem",
            }}
          >
            <button
              type="button"
              onClick={() => choose("rejected")}
              style={{
                border: "1px solid #94a3b8",
                borderRadius: "0.5rem",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
                padding: "0.55rem 0.85rem",
              }}
            >
              Alleen noodzakelijk
            </button>
            <button
              type="button"
              onClick={() => choose("accepted")}
              style={{
                border: 0,
                borderRadius: "0.5rem",
                background: "#0f766e",
                color: "#ffffff",
                cursor: "pointer",
                padding: "0.55rem 0.85rem",
              }}
            >
              Analytics toestaan
            </button>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          data-nosnippet
          style={{
            position: "fixed",
            zIndex: 999,
            left: "0.75rem",
            bottom: "0.75rem",
            border: "1px solid #cbd5e1",
            borderRadius: "999px",
            background: "#ffffff",
            color: "#334155",
            cursor: "pointer",
            padding: "0.45rem 0.7rem",
            fontSize: "0.8rem",
          }}
        >
          Privacyinstellingen
        </button>
      )}
    </>
  );
}
