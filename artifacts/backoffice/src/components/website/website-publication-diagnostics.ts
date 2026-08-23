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
  actionLabel: string;
  href: string;
};

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
          "De website heeft een actief primair domein nodig voordat u kunt publiceren.",
        actionLabel: "Naar instellingen",
        href: "/website/settings",
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
        title: `Controleer de afbeeldingen op ‘${context.pageTitle}’`,
        explanation:
          "Een of meer afbeeldingen worden nog als tijdelijke aanduiding getoond. Open het onderdeel om de afbeeldingen te controleren.",
        actionLabel: context.actionLabel,
        href: context.href,
      };
    case "site_media_resolution_pending":
      return {
        title: "Controleer het logo en de deelafbeelding",
        explanation:
          "Een of meer website-afbeeldingen worden nog als tijdelijke aanduiding getoond. Open de instellingen om ze te controleren.",
        actionLabel: "Naar instellingen",
        href: "/website/settings",
      };
    case "blog_media_resolution_pending": {
      const postId = segmentAfter(diagnostic.path, "posts");
      const postTitle = subjectBefore(diagnostic.message, " bevat social media");
      return {
        title: postTitle
          ? `Controleer de afbeelding van ‘${postTitle}’`
          : "Controleer de afbeelding van het blogbericht",
        explanation:
          "De afbeelding wordt nog als tijdelijke aanduiding getoond. Open het bericht om de afbeelding te controleren.",
        actionLabel: "Naar het blogbericht",
        href: postId
          ? `/website/blog/${encodeURIComponent(postId)}`
          : "/website/blog",
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
        title: `Koppel een gepubliceerd formulier op ‘${context.pageTitle}’`,
        explanation:
          "Kies in de contactsectie een gepubliceerd formulier in dezelfde taal en sla de sectie op.",
        actionLabel: "Naar de contactsectie",
        href: context.href,
      };
    default:
      return fallbackPresentation(diagnostic, pages);
  }
}
