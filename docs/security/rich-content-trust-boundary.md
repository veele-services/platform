# Rich-content trust boundary

## Knowledgebase and release HTML

Fieldgrid treats persisted knowledgebase and release HTML as untrusted, including
historical rows. The canonical boundary is
`@workspace/shared-ui/knowledgebase-html` and is applied twice:

1. the knowledgebase write path sanitizes before storage;
2. every platform, tenant, customer and personnel raw-HTML renderer sanitizes
   again immediately before `dangerouslySetInnerHTML`.

Media-path rewriting is part of the parser transformation and is never the
security boundary.

## Allowlist

The content model permits structural text, headings, lists, code, tables,
callouts, figures, links, images, uploaded video and explicitly supported video
embeds. Attributes are allowlisted per element. Inline styles, event handlers,
forms and form controls, scripts, stylesheets, objects, embeds, SVG, MathML,
metadata and active data URLs are discarded.

Links allow `http`, `https`, `mailto`, `tel`, fragments and relative paths.
Image and video sources allow only `http`, `https` and relative paths. Protocol-
relative URLs and `data`, `javascript` and `vbscript` schemes are rejected.
Links opened in a new tab receive `noopener noreferrer`.

Arbitrary iframe HTML is not supported. The structured video-embed node accepts
only exact HTTPS embed paths on `www.youtube.com`,
`www.youtube-nocookie.com` and `player.vimeo.com`. Rendered frames receive fixed
lazy-loading, referrer-policy and sandbox attributes; `srcdoc`, unknown origins,
credentials and non-default ports are rejected.

## Dependency decision

The repository previously had no HTML parser or sanitizer. Regex replacements
cannot model browser parsing and are vulnerable to malformed markup and foreign-
content parser differentials. Fieldgrid therefore uses the pinned
`sanitize-html` 2.17.7 production dependency in the shared UI package. It is the
smallest existing-library solution that works in the server write path and in
the client-side TipTap preview; building a custom parser or pulling in a DOM plus
server DOM emulation would add more code and a larger trust surface.
Its broad PostCSS dependency range is narrowed through a workspace override to
8.5.26 so the sanitizer path does not retain known source-map disclosure or
Nanoid unbounded-loop advisories.

Any future tag, attribute, URL scheme or iframe provider requires an explicit
security review and executable payload tests before it enters the allowlist.
