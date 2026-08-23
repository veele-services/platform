import sanitizeHtml from "sanitize-html";

const DEFAULT_EMPTY_HTML = "<p>Geen inhoud beschikbaar.</p>";

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "iframe",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "video",
] as const;

const MEDIA_PATH_PATTERN =
  /^\/(?:platform\/knowledgebase|platform\/releases|help|releases)\/media\/([a-f0-9-]+)$/iu;

function normalizeMediaBasePath(mediaBasePath?: string): string | null {
  const normalized = mediaBasePath?.trim().replace(/\/+$/u, "");
  return normalized || null;
}

function rewriteKnowledgebaseMediaUrl(
  value: string | undefined,
  mediaBasePath?: string,
): string | undefined {
  if (!value) return value;
  const basePath = normalizeMediaBasePath(mediaBasePath);
  if (!basePath) return value;
  const match = MEDIA_PATH_PATTERN.exec(value.trim());
  return match ? `${basePath}/${match[1]}` : value;
}

/**
 * Returns a canonical URL only for explicitly supported knowledgebase embeds.
 * Arbitrary HTTPS iframes are intentionally not part of the content model.
 */
export function sanitizeKnowledgebaseEmbedUrl(
  rawValue: string | null | undefined,
): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443")
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    const isYoutube =
      (hostname === "www.youtube.com" || hostname === "www.youtube-nocookie.com") &&
      /^\/embed\/[A-Za-z0-9_-]+$/u.test(url.pathname);
    const isVimeo =
      hostname === "player.vimeo.com" && /^\/video\/[0-9]+$/u.test(url.pathname);

    if (!isYoutube && !isVimeo) return null;

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export type SanitizeKnowledgebaseHtmlOptions = {
  emptyFallback?: boolean;
  mediaBasePath?: string;
};

/**
 * Canonical parser-based trust boundary for persisted Fieldgrid knowledgebase
 * and release HTML. The same contract is used before storage and immediately
 * before every raw HTML render so historical rows are covered as well.
 */
export function sanitizeKnowledgebaseHtml(
  rawHtml: string | null | undefined,
  options: SanitizeKnowledgebaseHtmlOptions = {},
): string {
  const source = rawHtml?.trim() || (options.emptyFallback ? DEFAULT_EMPTY_HTML : "");

  return sanitizeHtml(source, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      div: [
        { name: "data-type", values: ["callout"] },
        { name: "data-tone", values: ["tip", "warning", "example"] },
      ],
      figure: [
        { name: "data-type", values: ["kb-media", "kb-video-embed"] },
        "data-kb-media-id",
        { name: "data-media-type", values: ["image", "video", "attachment"] },
      ],
      iframe: [
        "src",
        "title",
        "loading",
        "allowfullscreen",
        "referrerpolicy",
        "sandbox",
      ],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding", "data-kb-media-id"],
      source: ["src", "type"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      video: ["src", "title", "controls", "preload", "poster"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      iframe: ["https"],
      img: ["http", "https"],
      source: ["http", "https"],
      video: ["http", "https"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src", "poster"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [
      "applet",
      "base",
      "embed",
      "form",
      "iframe",
      "input",
      "link",
      "math",
      "meta",
      "noscript",
      "object",
      "option",
      "script",
      "style",
      "svg",
      "textarea",
      "xmp",
    ],
    transformTags: {
      a: (_tagName, attributes) => {
        const nextAttributes = { ...attributes };
        if (nextAttributes.target === "_blank") {
          nextAttributes.rel = "noopener noreferrer";
        } else {
          delete nextAttributes.target;
          delete nextAttributes.rel;
        }
        const href = rewriteKnowledgebaseMediaUrl(
          nextAttributes.href,
          options.mediaBasePath,
        );
        if (href) nextAttributes.href = href;
        else delete nextAttributes.href;
        return { tagName: "a", attribs: nextAttributes };
      },
      iframe: (_tagName, attributes) => {
        const src = sanitizeKnowledgebaseEmbedUrl(attributes.src);
        const attribs: Record<string, string> = {};
        if (src) {
          attribs.src = src;
          attribs.title = attributes.title?.trim().slice(0, 180) || "Knowledgebase video";
          attribs.loading = "lazy";
          attribs.allowfullscreen = "true";
          attribs.referrerpolicy = "strict-origin-when-cross-origin";
          attribs.sandbox = "allow-scripts allow-same-origin allow-presentation";
        }
        return {
          tagName: "iframe",
          attribs,
        };
      },
      img: (_tagName, attributes) => {
        const attribs: Record<string, string> = {
          ...attributes,
          loading: "lazy",
          decoding: "async",
        };
        const src = rewriteKnowledgebaseMediaUrl(attributes.src, options.mediaBasePath);
        if (src) attribs.src = src;
        else delete attribs.src;
        return { tagName: "img", attribs };
      },
      source: (_tagName, attributes) => {
        const attribs: Record<string, string> = { ...attributes };
        const src = rewriteKnowledgebaseMediaUrl(attributes.src, options.mediaBasePath);
        if (src) attribs.src = src;
        else delete attribs.src;
        return { tagName: "source", attribs };
      },
      video: (_tagName, attributes) => {
        const attribs: Record<string, string> = {
          ...attributes,
          controls: "controls",
          preload: "metadata",
        };
        const src = rewriteKnowledgebaseMediaUrl(attributes.src, options.mediaBasePath);
        if (src) attribs.src = src;
        else delete attribs.src;
        return { tagName: "video", attribs };
      },
    },
    exclusiveFilter(frame) {
      return frame.tag === "iframe" && !frame.attribs.src;
    },
  }).trim();
}
