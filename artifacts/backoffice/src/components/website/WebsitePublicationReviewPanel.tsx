"use client";

import type { WebsitePublicationReview } from "@workspace/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateWebsitePublicationAction,
  createWebsitePreviewAction,
  includeWebsitePageInPublicationAction,
  prepareWebsitePublicationAction,
} from "@/app/actions/website";
import { Button } from "@/components/ui/button";

type PublicationCandidate = NonNullable<
  WebsitePublicationReview["readyPublication"]
>;

export function WebsitePublicationReviewPanel({
  initialReview,
  canPublish,
}: {
  initialReview: WebsitePublicationReview;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [siteRevision, setSiteRevision] = useState(
    initialReview.authoringRevision,
  );
  const [candidate, setCandidate] = useState<PublicationCandidate | null>(
    initialReview.readyPublication,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftPages = initialReview.pages.filter(
    (page) => page.status === "draft",
  );
  const candidateIsCurrent =
    candidate?.sourceRevision === siteRevision &&
    candidate.targetDeliveryRevision === initialReview.deliveryRevision + 1;

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  function openPreview() {
    resetFeedback();
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    startTransition(async () => {
      const result = await createWebsitePreviewAction({
        siteId: initialReview.siteId,
        expectedAuthoringRevision: siteRevision,
      });
      if (!result.success) {
        previewWindow?.close();
        setError(result.message);
        return;
      }
      if (!result.data) {
        previewWindow?.close();
        setError("De preview gaf geen resultaat terug.");
        return;
      }
      if (previewWindow) {
        previewWindow.location.replace(result.data.url);
      } else {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      }
      setMessage(
        `Preview voor revisie ${result.data.sourceRevision} is tien minuten geldig.`,
      );
    });
  }

  function includePage(page: WebsitePublicationReview["pages"][number]) {
    resetFeedback();
    startTransition(async () => {
      const result = await includeWebsitePageInPublicationAction({
        siteId: initialReview.siteId,
        pageId: page.id,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: page.authoringRevision,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) {
        setError("De pagina-update gaf geen resultaat terug.");
        return;
      }
      setSiteRevision(result.data.siteAuthoringRevision);
      setCandidate(null);
      setMessage(
        `${page.title} wordt opgenomen in de volgende immutable publicatie.`,
      );
      router.refresh();
    });
  }

  function preparePublication() {
    resetFeedback();
    startTransition(async () => {
      const result = await prepareWebsitePublicationAction({
        siteId: initialReview.siteId,
        expectedAuthoringRevision: siteRevision,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) {
        setError("De publicatiereview gaf geen kandidaat terug.");
        return;
      }
      setCandidate({
        id: result.data.publicationId,
        sequence: result.data.sequence,
        sourceRevision: result.data.sourceRevision,
        targetDeliveryRevision: result.data.targetDeliveryRevision,
        contentHash: result.data.contentHash,
      });
      setMessage(
        `Immutable publicatiekandidaat #${result.data.sequence} is voorbereid. Er is nog niets live gezet.`,
      );
      router.refresh();
    });
  }

  function activatePublication() {
    if (!candidate || !candidateIsCurrent) return;
    if (
      !window.confirm(
        `Publicatie #${candidate.sequence} nu activeren? Dit vervangt uitsluitend de actieve managed publicatie en wijzigt geen custom delivery.`,
      )
    ) {
      return;
    }
    resetFeedback();
    startTransition(async () => {
      const result = await activateWebsitePublicationAction({
        siteId: initialReview.siteId,
        publicationId: candidate.id,
        expectedAuthoringRevision: siteRevision,
        expectedDeliveryRevision: initialReview.deliveryRevision,
        confirmation: "PUBLICEREN",
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) {
        setError("De publicatie-activatie gaf geen resultaat terug.");
        return;
      }
      setMessage(
        `Publicatie #${candidate.sequence} is actief op delivery-revisie ${result.data.deliveryRevision}.`,
      );
      setCandidate(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {initialReview.deliveryMode === "custom_nextjs" && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Custom Next.js blijft live</h2>
          <p className="mt-1 leading-6">
            Preview en een managed publicatiekandidaat zijn toegestaan, maar
            tenantpublicatie mag de actieve deliverymodus niet omschakelen.
          </p>
        </section>
      )}

      <section className="veele-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Exacte reviewbasis
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Authoring-revisie {siteRevision} · delivery-revisie{" "}
              {initialReview.deliveryRevision}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={openPreview}
            disabled={isPending || !initialReview.previewAvailable}
          >
            Concept previewen
          </Button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <ReviewValue
            label="Primair domein"
            value={initialReview.canonicalHostname ?? "Ontbreekt"}
          />
          <ReviewValue
            label="Actieve publicatie"
            value={
              initialReview.activePublication
                ? `#${initialReview.activePublication.sequence}`
                : "Geen"
            }
          />
          <ReviewValue
            label="Klaarstaande kandidaat"
            value={candidate ? `#${candidate.sequence}` : "Geen"}
          />
        </dl>
      </section>

      <section className="veele-card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Draftdiagnostiek
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Blokkerende fouten komen uit dezelfde compiler als de immutable
            publicatie. Waarschuwingen maken uitgesloten concepten zichtbaar.
          </p>
        </div>
        {initialReview.diagnostics.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Geen blokkerende fouten of waarschuwingen.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialReview.diagnostics.map((diagnostic, index) => (
              <li
                key={`${diagnostic.code}-${diagnostic.path}-${index}`}
                className={
                  diagnostic.severity === "error"
                    ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                    : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                }
              >
                <strong>
                  {diagnostic.severity === "error"
                    ? "Blokkerend"
                    : "Waarschuwing"}
                  :{" "}
                </strong>
                {diagnostic.message}
                <code className="mt-1 block break-all text-xs opacity-70">
                  {diagnostic.path}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      {draftPages.length > 0 && (
        <section className="veele-card space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Conceptpagina&apos;s
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Expliciet opnemen maakt de pagina kandidaat voor een volgende
              publicatie; de huidige live snapshot verandert nog niet.
            </p>
          </div>
          <ul className="divide-y divide-slate-200">
            {draftPages.map((page) => (
              <li
                key={page.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-slate-950">{page.title}</p>
                  <p className="text-sm text-slate-500">{page.path}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canPublish || isPending}
                  onClick={() => includePage(page)}
                >
                  Opnemen in volgende publicatie
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="veele-card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Wijzigingen ten opzichte van live
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Instellingen:{" "}
            {initialReview.changes.settings ? "gewijzigd" : "gelijk"} ·
            navigatie:{" "}
            {initialReview.changes.navigation ? "gewijzigd" : "gelijk"} ·
            redirects:{" "}
            {initialReview.changes.redirects ? "gewijzigd" : "gelijk"}
          </p>
        </div>
        {initialReview.changes.pages.length === 0 ? (
          <p className="text-sm text-slate-600">
            Geen publiceerbare paginawijzigingen gevonden.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {initialReview.changes.pages.map((page) => (
              <li
                key={`${page.kind}-${page.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span>
                  {page.title}{" "}
                  <span className="text-slate-500">{page.path}</span>
                </span>
                <strong className="text-xs uppercase tracking-wide text-slate-600">
                  {page.kind === "added"
                    ? "Nieuw"
                    : page.kind === "removed"
                      ? "Verwijderd"
                      : "Gewijzigd"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {candidate && (
        <section className="veele-card space-y-3">
          <h2 className="text-base font-semibold text-slate-950">
            Immutable kandidaat #{candidate.sequence}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <ReviewValue
              label="Bronrevisie"
              value={String(candidate.sourceRevision)}
            />
            <ReviewValue
              label="Doelrevisie"
              value={String(candidate.targetDeliveryRevision)}
            />
            <ReviewValue
              label="Contenthash"
              value={candidate.contentHash.slice(0, 16)}
            />
          </dl>
        </section>
      )}

      <section className="sticky bottom-4 z-10 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div aria-live="polite" className="mb-3 min-h-5 text-sm">
          {error && <p className="text-red-700">{error}</p>}
          {message && <p className="text-emerald-700">{message}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={
              !canPublish ||
              isPending ||
              !initialReview.canPreparePublication ||
              siteRevision !== initialReview.authoringRevision
            }
            onClick={preparePublication}
          >
            Immutable kandidaat voorbereiden
          </Button>
          <Button
            type="button"
            disabled={
              !canPublish ||
              isPending ||
              initialReview.deliveryMode !== "managed_cms" ||
              !candidateIsCurrent
            }
            onClick={activatePublication}
          >
            Gereviewde publicatie activeren
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-all font-medium text-slate-900">{value}</dd>
    </div>
  );
}
