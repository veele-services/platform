export type PublicationDiagnostic = {
  code: string;
  path: string;
  message?: string;
  severity: "error" | "warning";
};

export type PublicationPage = {
  id: string;
  title: string;
};

export type PublicationDiagnosticPresentation = {
  title: string;
  explanation: string;
  actionLabel: string | null;
  href: string | null;
};

export type PublicationDiagnosticAccess = {
  settings: boolean;
  navigation: boolean;
  forms: boolean;
};

export function canOpenPublicationDiagnostic(
  href: string,
  access: PublicationDiagnosticAccess,
): boolean {
  if (href.startsWith("/website/settings")) return access.settings;
  if (
    href.startsWith("/website/navigation") ||
    href.startsWith("/website/redirects")
  ) {
    return access.navigation;
  }
  if (href.startsWith("/website/forms")) return access.forms;
  return true;
}

function segmentAfter(path: string, segment: string): string | null {
  const parts = path.split(".");
  const index = parts.indexOf(segment);
  return index >= 0 && parts[index + 1] ? parts[index + 1]! : null;
}

function pageContext(
  diagnostic: PublicationDiagnostic,
  pages: readonly PublicationPage[],
) {
  const pageId = segmentAfter(diagnostic.path, "pages");
  const page = pages.find((candidate) => candidate.id === pageId);
  const sectionId = segmentAfter(diagnostic.path, "sections");
  const href = pageId
    ? `/website/pages/${encodeURIComponent(pageId)}${
        sectionId ? `#sectie-${encodeURIComponent(sectionId)}` : ""
      }`
    : "/website/pages";

  return {
    pageTitle: page?.title ?? "de betreffende pagina",
    href,
    actionLabel: sectionId ? "Naar deze sectie" : "Naar deze pagina",
  };
}

function subjectBefore(
  message: string | undefined,
  marker: string,
): string | null {
  if (!message) return null;
  const markerIndex = message.indexOf(marker);
  const subject = markerIndex > 0 ? message.slice(0, markerIndex).trim() : "";
  return subject && subject.length <= 160 ? subject : null;
}

function fallbackPresentation(
  diagnostic: PublicationDiagnostic,
  pages: readonly PublicationPage[],
): PublicationDiagnosticPresentation {
  if (diagnostic.path.startsWith("pages")) {
    const context = pageContext(diagnostic, pages);
    return {
      title: `Controleer ${context.pageTitle}`,
      explanation:
        "Een veld is niet goed ingevuld of ontbreekt. Open het onderdeel, controleer de invoer en sla opnieuw op.",
      actionLabel: context.actionLabel,
      href: context.href,
    };
  }
  if (diagnostic.path.startsWith("navigation")) {
    return {
      title: "Controleer de navigatie",
      explanation:
        "Een menu-item is niet goed ingesteld. Controleer de bestemming en de plaats in het menu.",
      actionLabel: "Naar navigatie",
      href: "/website/navigation",
    };
  }
  if (diagnostic.path.startsWith("redirects")) {
    return {
      title: "Controleer de doorverwijzingen",
      explanation:
        "Een doorverwijzing is niet goed ingesteld. Controleer het oude en het nieuwe adres.",
      actionLabel: "Naar doorverwijzingen",
      href: "/website/redirects",
    };
  }
  if (diagnostic.path.startsWith("blog")) {
    const postId = segmentAfter(diagnostic.path, "posts");
    return {
      title: "Controleer het blogbericht",
      explanation:
        "Het blogbericht is nog niet klaar om mee te publiceren. Controleer de inhoud en publicatie-instellingen.",
      actionLabel: "Naar het blogbericht",
      href: postId
        ? `/website/blog/${encodeURIComponent(postId)}`
        : "/website/blog",
    };
  }
  if (diagnostic.path.startsWith("forms")) {
    return {
      title: "Controleer het formulier",
      explanation:
        "Het formulier is nog niet klaar om mee te publiceren. Controleer de velden en publicatie-instellingen.",
      actionLabel: "Naar formulieren",
      href: "/website/forms",
    };
  }

  return {
    title: "Controleer de website-instellingen",
    explanation:
      "Een instelling is nog niet klaar voor publicatie. Controleer de website-instellingen en sla opnieuw op.",
    actionLabel: "Naar instellingen",
    href: "/website/settings",
  };
}

export function presentPublicationDiagnostic(
  diagnostic: PublicationDiagnostic,
  pages: readonly PublicationPage[],
): PublicationDiagnosticPresentation {
  const context = pageContext(diagnostic, pages);

  switch (diagnostic.code) {
    case "template_content_requires_review":
      return {
        title: `Keur een sectie op ‘${context.pageTitle}’ goed`,
        explanation:
          "Open de sectie, controleer de inhoud, zet ‘Inhoud gecontroleerd’ aan en sla de sectie op.",
        actionLabel: "Naar deze sectie",
        href: context.href,
      };
    case "team_consent_required":
      return {
        title: `Leg toestemming vast op ‘${context.pageTitle}’`,
        explanation:
          "Controleer bij ieder zichtbaar teamlid of er toestemming is om de gegevens te publiceren en sla de sectie op.",
        actionLabel: "Naar de teamsectie",
        href: context.href,
      };
    case "primary_domain_missing":
      return {
        title: "Kies het primaire websitedomein",
        explanation:
          "De website heeft een actief primair domein nodig. Alleen een platformbeheerder kan dit domein koppelen; vraag die beheerder om hulp.",
        actionLabel: null,
        href: null,
      };
    case "default_homepage":
      return {
        title: "Kies één startpagina",
        explanation:
          "Er moet precies één gepubliceerde startpagina zijn voor de standaardtaal.",
        actionLabel: "Naar pagina's",
        href: "/website/pages",
      };
    case "homepage_path":
      return {
        title: `Pas het adres van ‘${context.pageTitle}’ aan`,
        explanation: "De startpagina moet het adres / gebruiken.",
        actionLabel: context.actionLabel,
        href: context.href,
      };
    case "draft_page_excluded":
      return {
        title: `‘${context.pageTitle}’ staat nog als concept`,
        explanation:
          "Neem de pagina hieronder op in de volgende publicatie als deze live mag.",
        actionLabel: "Naar conceptpagina's",
        href: "#conceptpaginas",
      };
    case "draft_blog_post_excluded": {
      const postId = segmentAfter(diagnostic.path, "posts");
      const postTitle = subjectBefore(
        diagnostic.message,
        " staat nog op concept",
      );
      return {
        title: postTitle
          ? `‘${postTitle}’ staat nog als concept`
          : "Een blogbericht staat nog als concept",
        explanation:
          "Publiceer het blogbericht als het zichtbaar mag worden op de website.",
        actionLabel: "Naar het blogbericht",
        href: postId
          ? `/website/blog/${encodeURIComponent(postId)}`
          : "/website/blog",
      };
    }
    case "draft_form_excluded": {
      const formName = subjectBefore(
        diagnostic.message,
        " staat nog op concept",
      );
      return {
        title: formName
          ? `‘${formName}’ staat nog als concept`
          : "Een formulier staat nog als concept",
        explanation:
          "Publiceer het formulier als het gebruikt mag worden op de website.",
        actionLabel: "Naar formulieren",
        href: "/website/forms",
      };
    }
    case "section_media_resolution_pending":
    case "page_media_resolution_pending":
      return {
        title: `De afbeeldingen op ‘${context.pageTitle}’ zijn nog niet beschikbaar`,
        explanation:
          "Deze afbeeldingen kunnen nog niet in de publieke website worden verwerkt en worden als tijdelijke aanduiding getoond.",
        actionLabel: null,
        href: null,
      };
    case "site_media_resolution_pending":
      return {
        title: "Het logo of de deelafbeelding is nog niet beschikbaar",
        explanation:
          "Deze afbeeldingen kunnen nog niet in de publieke website worden verwerkt en worden als tijdelijke aanduiding getoond.",
        actionLabel: null,
        href: null,
      };
    case "blog_media_resolution_pending": {
      const postTitle = subjectBefore(diagnostic.message, " bevat social media");
      return {
        title: postTitle
          ? `De afbeelding van ‘${postTitle}’ is nog niet beschikbaar`
          : "De afbeelding van het blogbericht is nog niet beschikbaar",
        explanation:
          "Deze afbeelding kan nog niet in de publieke website worden verwerkt en wordt als tijdelijke aanduiding getoond.",
        actionLabel: null,
        href: null,
      };
    }
    case "blog_index_missing":
      return {
        title: "Maak een blogoverzichtspagina",
        explanation:
          "Gepubliceerde blogberichten hebben in dezelfde taal een pagina met het adres /blog nodig.",
        actionLabel: "Naar pagina's",
        href: "/website/pages",
      };
    case "missing_published_form":
      return {
        title: `Publiceer het formulier voor ‘${context.pageTitle}’`,
        explanation:
          "De contactsectie verwijst niet naar een gepubliceerd formulier in dezelfde taal. Controleer en publiceer het formulier.",
        actionLabel: "Naar formulieren",
        href: "/website/forms",
      };
    default:
      return fallbackPresentation(diagnostic, pages);
  }
}
