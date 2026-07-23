import type {
  WebsiteAction,
  WebsitePublicationSnapshot,
  WebsiteRichTextDocument,
  WebsiteSection,
} from "@workspace/website-core";
import type { CSSProperties, ReactNode } from "react";
import React from "react";

type PublicationPage = WebsitePublicationSnapshot["pages"][number];
type PublicationBlogPost = WebsitePublicationSnapshot["blog"]["posts"][number];
type RenderLinkContext = {
  snapshot: WebsitePublicationSnapshot;
  internalPathPrefix: string;
};

const FONT_STACKS = {
  inter: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
  manrope: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif",
  source_sans_3: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
} as const;

const RADIUS = {
  none: "0",
  small: "0.35rem",
  medium: "0.8rem",
  large: "1.4rem",
} as const;
const SPACING = { compact: "0.85", comfortable: "1", spacious: "1.2" } as const;

function actionHref(
  action: WebsiteAction,
  context: RenderLinkContext,
): string | null {
  const prefixPath = (path: string) =>
    `${context.internalPathPrefix}${path === "/" ? "" : path}` || "/";
  switch (action.kind) {
    case "page": {
      const path =
        context.snapshot.pages.find((page) => page.id === action.pageId)
          ?.path ?? null;
      return path ? prefixPath(path) : null;
    }
    case "path":
      return prefixPath(action.path);
    case "external":
      return action.href;
    case "phone":
      return `tel:${action.phone}`;
    case "email":
      return `mailto:${action.email}`;
  }
}

function ActionLink({
  action,
  context,
  secondary = false,
}: {
  action: WebsiteAction;
  context: RenderLinkContext;
  secondary?: boolean;
}) {
  const href = actionHref(action, context);
  if (!href) return null;
  const external = action.kind === "external";
  return (
    <a
      className={secondary ? "button button-secondary" : "button"}
      href={href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {action.label}
    </a>
  );
}

type RichTextNode = Extract<
  WebsiteRichTextDocument,
  { schemaVersion: 2 }
>["content"][number];

function renderRichTextNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") {
    let value: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === "italic") value = <em>{value}</em>;
      if (mark.type === "bold") value = <strong>{value}</strong>;
      if (mark.type === "link") {
        const external = mark.attrs.href.startsWith("https://");
        value = (
          <a
            href={mark.attrs.href}
            rel={external ? "noopener noreferrer" : undefined}
            target={external ? "_blank" : undefined}
          >
            {value}
          </a>
        );
      }
    }
    return <React.Fragment key={key}>{value}</React.Fragment>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;

  const children = node.content.map((child, index) =>
    renderRichTextNode(child, `${key}-${index}`),
  );
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return node.attrs.level === 2 ? (
        <h2 key={key}>{children}</h2>
      ) : (
        <h3 key={key}>{children}</h3>
      );
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
  }
}

function RichText({ document }: { document: WebsiteRichTextDocument }) {
  if (document.schemaVersion === 1) {
    return document.content.map((paragraph, paragraphIndex) => (
      <p key={`legacy-rich-text-${paragraphIndex}`}>
        {paragraph.content.map((node, nodeIndex) => {
          let value: ReactNode = node.text;
          if (node.marks?.includes("italic")) value = <em>{value}</em>;
          if (node.marks?.includes("bold")) value = <strong>{value}</strong>;
          return <React.Fragment key={nodeIndex}>{value}</React.Fragment>;
        })}
      </p>
    ));
  }
  return document.content.map((node, index) =>
    renderRichTextNode(node, `rich-text-${index}`),
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function renderSection(
  section: WebsiteSection,
  context: RenderLinkContext,
  firstHero: boolean,
): ReactNode {
  const snapshot = context.snapshot;
  switch (section.type) {
    case "hero": {
      const Heading = firstHero ? "h1" : "h2";
      return (
        <section className={`section hero hero-${section.variant}`}>
          <div className="container hero-inner">
            <div className="hero-copy">
              {section.content.eyebrow ? (
                <p className="eyebrow">{section.content.eyebrow}</p>
              ) : null}
              <Heading>{section.content.title}</Heading>
              {section.content.subtitle ? (
                <p className="lead">{section.content.subtitle}</p>
              ) : null}
              <div className="actions">
                {section.content.primaryAction ? (
                  <ActionLink
                    action={section.content.primaryAction}
                    context={context}
                  />
                ) : null}
                {section.content.secondaryAction ? (
                  <ActionLink
                    action={section.content.secondaryAction}
                    context={context}
                    secondary
                  />
                ) : null}
              </div>
              {section.content.badges.length ? (
                <ul className="inline-list" aria-label="Kenmerken">
                  {section.content.badges.map((badge) => (
                    <li key={badge}>{badge}</li>
                  ))}
                </ul>
              ) : null}
              {section.content.trustText ? (
                <p className="muted">{section.content.trustText}</p>
              ) : null}
            </div>
            {section.content.imageId ? (
              <div className="visual-placeholder" aria-hidden="true" />
            ) : null}
          </div>
        </section>
      );
    }
    case "trust_bar":
      return (
        <section
          className={`section section-accent trust trust-${section.variant}`}
        >
          <div className="container">
            {section.content.title ? <h2>{section.content.title}</h2> : null}
            {section.content.reviewScore !== undefined ? (
              <p className="review-score">
                <strong>{section.content.reviewScore.toFixed(1)} / 5</strong>
                {section.content.reviewCount !== undefined
                  ? ` uit ${section.content.reviewCount} beoordelingen`
                  : null}
              </p>
            ) : null}
            <ul className="trust-list">
              {section.content.items.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <strong>{item.name}</strong>
                  {item.description ? <span>{item.description}</span> : null}
                </li>
              ))}
              {section.content.shortClaims.map((claim) => (
                <li key={claim}>
                  <strong>{claim}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    case "services_grid":
      return (
        <section className={`section services services-${section.variant}`}>
          <div className="container">
            <SectionHeading
              title={section.content.title}
              subtitle={section.content.subtitle}
            />
            <div className="card-grid">
              {section.content.services.map((service, index) => (
                <article className="card" key={`${service.title}-${index}`}>
                  {service.icon ? (
                    <span className="icon" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  {service.action ? (
                    <ActionLink
                      action={service.action}
                      context={context}
                      secondary
                    />
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      );
    case "feature_grid":
      return (
        <section
          className={`section section-accent features features-${section.variant}`}
        >
          <div className="container">
            <SectionHeading
              title={section.content.title}
              subtitle={section.content.subtitle}
            />
            <div className="card-grid">
              {section.content.features.map((feature, index) => (
                <article className="feature" key={`${feature.title}-${index}`}>
                  <span className="icon" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      );
    case "process_steps":
      return (
        <section className={`section process process-${section.variant}`}>
          <div className="container">
            <SectionHeading
              title={section.content.title}
              subtitle={section.content.subtitle}
            />
            <ol className="steps">
              {section.content.steps.map((step, index) => (
                <li key={`${step.title}-${index}`}>
                  <span className="step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );
    case "testimonials":
      return (
        <section
          className={`section section-accent testimonials testimonials-${section.variant}`}
        >
          <div className="container">
            <SectionHeading
              title={section.content.title}
              subtitle={section.content.subtitle}
            />
            <div className="card-grid">
              {section.content.testimonials.map((testimonial, index) => (
                <figure className="card" key={`${testimonial.name}-${index}`}>
                  <blockquote>“{testimonial.quote}”</blockquote>
                  <figcaption>
                    <strong>{testimonial.name}</strong>
                    {testimonial.companyOrLocation ? (
                      <span>{testimonial.companyOrLocation}</span>
                    ) : null}
                    {testimonial.rating ? (
                      <span aria-label={`${testimonial.rating} van 5 sterren`}>
                        {"★".repeat(testimonial.rating)}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      );
    case "faq":
      return (
        <section className={`section faq faq-${section.variant}`}>
          <div className="container narrow">
            <SectionHeading
              title={section.content.title}
              subtitle={section.content.subtitle}
            />
            <div className="faq-list">
              {section.content.items.map((item, index) => (
                <details key={`${item.question}-${index}`}>
                  <summary>{item.question}</summary>
                  <div className="faq-answer">
                    {typeof item.answer === "string" ? (
                      <p>{item.answer}</p>
                    ) : (
                      <RichText document={item.answer} />
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    case "cta_banner":
      return (
        <section className={`section cta cta-${section.variant}`}>
          <div className="container cta-inner">
            <div>
              <h2>{section.content.title}</h2>
              {section.content.subtitle ? (
                <p>{section.content.subtitle}</p>
              ) : null}
            </div>
            <div className="actions">
              <ActionLink
                action={section.content.primaryAction}
                context={context}
              />
              {section.content.secondaryAction ? (
                <ActionLink
                  action={section.content.secondaryAction}
                  context={context}
                  secondary
                />
              ) : null}
            </div>
          </div>
        </section>
      );
    case "contact_form": {
      const contact = snapshot.contact;
      return (
        <section className={`section contact contact-${section.variant}`}>
          <div className="container contact-grid">
            <div>
              <SectionHeading
                title={section.content.title}
                subtitle={section.content.subtitle}
              />
              {section.content.showContactDetails ? (
                <ContactDetails snapshot={snapshot} />
              ) : null}
              {section.content.showOpeningHours &&
              contact.openingHours.length ? (
                <ul>
                  {contact.openingHours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <form
              className="contact-form"
              aria-describedby={`form-status-${section.id}`}
            >
              <label>
                Naam
                <input name="name" autoComplete="name" disabled />
              </label>
              <label>
                E-mailadres
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  disabled
                />
              </label>
              <label>
                Bericht
                <textarea name="message" rows={5} disabled />
              </label>
              <button type="button" disabled>
                Versturen
              </button>
              <p id={`form-status-${section.id}`} className="muted">
                Het online formulier wordt beschikbaar zodra veilige
                formulierverwerking is geactiveerd.
              </p>
            </form>
          </div>
        </section>
      );
    }
    case "rich_text":
      return (
        <section className={`section rich-text rich-text-${section.variant}`}>
          <div
            className={
              section.variant === "narrow" ? "container narrow" : "container"
            }
          >
            {section.content.title ? <h2>{section.content.title}</h2> : null}
            <div className="rich-text-content">
              <RichText document={section.content.body} />
            </div>
          </div>
        </section>
      );
  }
}

function ContactDetails({
  snapshot,
}: {
  snapshot: WebsitePublicationSnapshot;
}) {
  const contact = snapshot.contact;
  return (
    <address className="contact-details">
      <strong>{contact.companyName}</strong>
      {contact.street ? <span>{contact.street}</span> : null}
      {contact.postalCode || contact.city ? (
        <span>
          {[contact.postalCode, contact.city].filter(Boolean).join(" ")}
        </span>
      ) : null}
      {contact.phone ? (
        <a href={`tel:${contact.phone}`}>{contact.phone}</a>
      ) : null}
      {contact.email ? (
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
      ) : null}
    </address>
  );
}

function Navigation({
  context,
  location,
}: {
  context: RenderLinkContext;
  location: "header" | "footer_primary" | "footer_legal";
}) {
  const snapshot = context.snapshot;
  const items = snapshot.navigation.filter(
    (item) => item.location === location,
  );
  const children = (parentId: string) =>
    items.filter((item) => item.parentId === parentId);
  const link = (item: (typeof items)[number]) => {
    if (!item.href) return <span>{item.label}</span>;
    const external = item.linkType === "external";
    const href =
      external || !item.href.startsWith("/")
        ? item.href
        : `${context.internalPathPrefix}${item.href === "/" ? "" : item.href}` ||
          "/";
    return (
      <a
        href={href}
        target={item.target === "blank" ? "_blank" : undefined}
        rel={
          external || item.target === "blank"
            ? "noopener noreferrer"
            : undefined
        }
      >
        {item.label}
      </a>
    );
  };
  return (
    <ul>
      {items
        .filter((item) => !item.parentId)
        .map((item) => {
          const nested = children(item.id);
          return (
            <li key={item.id}>
              {link(item)}
              {nested.length ? (
                <ul>
                  {nested.map((child) => (
                    <li key={child.id}>{link(child)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
    </ul>
  );
}

function prefixedPath(path: string, internalPathPrefix: string): string {
  if (path === "/") {
    return internalPathPrefix ? `${internalPathPrefix}/` : "/";
  }
  return `${internalPathPrefix}${path}`;
}

function visibleBlogPosts(
  snapshot: WebsitePublicationSnapshot,
  locale: string,
  includePreview: boolean,
): PublicationBlogPost[] {
  return snapshot.blog.posts.filter(
    (post) =>
      post.locale === locale &&
      (post.visibility === "published" || includePreview),
  );
}

function BlogCards({
  snapshot,
  posts,
  internalPathPrefix,
}: {
  snapshot: WebsitePublicationSnapshot;
  posts: PublicationBlogPost[];
  internalPathPrefix: string;
}) {
  const categoryById = new Map(
    snapshot.blog.categories.map((category) => [category.id, category]),
  );
  return posts.length ? (
    <div className="blog-grid">
      {posts.map((post) => {
        const category = post.categoryId
          ? categoryById.get(post.categoryId)
          : undefined;
        return (
          <article className="blog-card" key={post.id}>
            {category ? (
              <a
                className="eyebrow"
                href={prefixedPath(category.path, internalPathPrefix)}
              >
                {category.name}
              </a>
            ) : null}
            <h2>
              <a href={prefixedPath(post.path, internalPathPrefix)}>
                {post.title}
              </a>
            </h2>
            <p>{post.excerpt}</p>
            {post.publishedAt ? (
              <time dateTime={post.publishedAt}>
                {new Intl.DateTimeFormat(post.locale, {
                  dateStyle: "long",
                }).format(new Date(post.publishedAt))}
              </time>
            ) : (
              <span className="preview-label">Conceptpreview</span>
            )}
          </article>
        );
      })}
    </div>
  ) : (
    <p className="muted">Er zijn nog geen gepubliceerde blogberichten.</p>
  );
}

function WebsiteShell({
  snapshot,
  deliveryRevision,
  internalPathPrefix,
  children,
}: {
  snapshot: WebsitePublicationSnapshot;
  deliveryRevision: number;
  internalPathPrefix: string;
  children: ReactNode;
}) {
  const context = { snapshot, internalPathPrefix };
  const style = {
    "--background": snapshot.theme.colors.background,
    "--foreground": snapshot.theme.colors.foreground,
    "--primary": snapshot.theme.colors.primary,
    "--primary-foreground": snapshot.theme.colors.primaryForeground,
    "--accent": snapshot.theme.colors.accent,
    "--accent-foreground": snapshot.theme.colors.accentForeground,
    "--heading-font": FONT_STACKS[snapshot.theme.headingFont],
    "--body-font": FONT_STACKS[snapshot.theme.bodyFont],
    "--radius": RADIUS[snapshot.theme.radius],
    "--spacing-factor": SPACING[snapshot.theme.spacing],
  } as CSSProperties;
  return (
    <div
      className="website-shell"
      data-delivery-revision={deliveryRevision}
      style={style}
    >
      <style>{PUBLIC_STYLES}</style>
      <a className="skip-link" href="#inhoud">
        Ga naar de inhoud
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href={prefixedPath("/", internalPathPrefix)}>
            {snapshot.contact.companyName}
          </a>
          <nav aria-label="Hoofdnavigatie">
            <Navigation context={context} location="header" />
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="container footer-grid">
          <ContactDetails snapshot={snapshot} />
          <nav aria-label="Voettekst">
            <Navigation context={context} location="footer_primary" />
          </nav>
          <nav aria-label="Juridische links">
            <Navigation context={context} location="footer_legal" />
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function ManagedWebsiteView({
  snapshot,
  page,
  deliveryRevision,
  internalPathPrefix = "",
  includePreviewBlogPosts = false,
}: {
  snapshot: WebsitePublicationSnapshot;
  page: PublicationPage;
  deliveryRevision: number;
  internalPathPrefix?: string;
  includePreviewBlogPosts?: boolean;
}) {
  const context = { snapshot, internalPathPrefix };
  const hasHero = page.sections.some((section) => section.type === "hero");
  let heroRendered = false;

  return (
    <WebsiteShell
      snapshot={snapshot}
      deliveryRevision={deliveryRevision}
      internalPathPrefix={internalPathPrefix}
    >
      <main id="inhoud">
        {!hasHero ? (
          <div className="container page-title">
            <h1>{page.title}</h1>
          </div>
        ) : null}
        {page.sections.map((section) => {
          const firstHero = section.type === "hero" && !heroRendered;
          if (section.type === "hero") heroRendered = true;
          return (
            <React.Fragment key={section.id}>
              {renderSection(section, context, firstHero)}
            </React.Fragment>
          );
        })}
        {page.pageType === "blog_index" ? (
          <section className="section blog-archive">
            <div className="container">
              <BlogCards
                snapshot={snapshot}
                posts={visibleBlogPosts(
                  snapshot,
                  page.locale,
                  includePreviewBlogPosts,
                )}
                internalPathPrefix={internalPathPrefix}
              />
            </div>
          </section>
        ) : null}
      </main>
    </WebsiteShell>
  );
}

export function ManagedWebsiteBlogPostView({
  snapshot,
  post,
  deliveryRevision,
  internalPathPrefix = "",
}: {
  snapshot: WebsitePublicationSnapshot;
  post: PublicationBlogPost;
  deliveryRevision: number;
  internalPathPrefix?: string;
}) {
  const category = post.categoryId
    ? snapshot.blog.categories.find((item) => item.id === post.categoryId)
    : undefined;
  const tags = snapshot.blog.tags.filter((tag) => post.tagIds.includes(tag.id));
  return (
    <WebsiteShell
      snapshot={snapshot}
      deliveryRevision={deliveryRevision}
      internalPathPrefix={internalPathPrefix}
    >
      <main id="inhoud">
        <article className="section blog-post">
          <div className="container narrow">
            {category ? (
              <a
                className="eyebrow"
                href={prefixedPath(category.path, internalPathPrefix)}
              >
                {category.name}
              </a>
            ) : null}
            <h1>{post.title}</h1>
            <p className="lead">{post.excerpt}</p>
            {post.publishedAt ? (
              <time dateTime={post.publishedAt}>
                {new Intl.DateTimeFormat(post.locale, {
                  dateStyle: "long",
                }).format(new Date(post.publishedAt))}
              </time>
            ) : (
              <span className="preview-label">Conceptpreview</span>
            )}
            <div className="rich-text-content blog-body">
              <RichText document={post.body} />
            </div>
            {tags.length ? (
              <ul className="blog-tags" aria-label="Tags">
                {tags.map((tag) => (
                  <li key={tag.id}>
                    <a href={prefixedPath(tag.path, internalPathPrefix)}>
                      {tag.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </article>
      </main>
    </WebsiteShell>
  );
}

export function ManagedWebsiteBlogArchiveView({
  snapshot,
  title,
  description,
  posts,
  deliveryRevision,
  internalPathPrefix = "",
}: {
  snapshot: WebsitePublicationSnapshot;
  title: string;
  description?: string | null;
  posts: PublicationBlogPost[];
  deliveryRevision: number;
  internalPathPrefix?: string;
}) {
  return (
    <WebsiteShell
      snapshot={snapshot}
      deliveryRevision={deliveryRevision}
      internalPathPrefix={internalPathPrefix}
    >
      <main id="inhoud">
        <section className="section blog-archive">
          <div className="container">
            <div className="section-heading">
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
            <BlogCards
              snapshot={snapshot}
              posts={posts}
              internalPathPrefix={internalPathPrefix}
            />
          </div>
        </section>
      </main>
    </WebsiteShell>
  );
}

const PUBLIC_STYLES = `
.website-shell{min-height:100vh;background:var(--background);color:var(--foreground);font-family:var(--body-font);font-size:1rem;line-height:1.65}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--body-font);font-size:1rem;line-height:1.65}a{color:inherit;text-underline-offset:.18em}h1,h2,h3{font-family:var(--heading-font);line-height:1.12;margin:0 0 .6em}h1{font-size:clamp(2.3rem,7vw,4.8rem);max-width:18ch}h2{font-size:clamp(1.8rem,4vw,3rem)}h3{font-size:1.25rem}p{margin:.35rem 0 1rem}.container{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.narrow{max-width:780px}.section{padding:calc(4.5rem * var(--spacing-factor)) 0}.section-accent{background:var(--accent);color:var(--accent-foreground)}.section-heading{max-width:720px;margin-bottom:2rem}.section-heading>p,.lead{font-size:1.15rem;max-width:62ch}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-weight:750;color:var(--primary)}.muted{opacity:.72}.skip-link{position:absolute;left:-9999px;top:.5rem;background:var(--foreground);color:var(--background);padding:.7rem 1rem;z-index:10}.skip-link:focus{left:.5rem}.site-header{border-bottom:1px solid color-mix(in srgb,var(--foreground) 15%,transparent);position:relative;background:var(--background)}.header-inner{min-height:4.7rem;display:flex;align-items:center;justify-content:space-between;gap:2rem}.brand{font-family:var(--heading-font);font-weight:800;text-decoration:none;font-size:1.15rem}.site-header nav>ul,.site-footer nav>ul{display:flex;list-style:none;gap:1.2rem;padding:0;margin:0;flex-wrap:wrap}.site-header nav li{position:relative}.site-header nav li ul{display:none;position:absolute;top:100%;left:0;min-width:13rem;padding:.7rem;list-style:none;background:var(--background);border:1px solid currentColor;border-radius:var(--radius)}.site-header nav li:focus-within ul,.site-header nav li:hover ul{display:grid;gap:.5rem}.hero{padding:calc(6rem * var(--spacing-factor)) 0}.hero-inner{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:3rem;align-items:center}.hero-centered .hero-inner,.hero-minimal .hero-inner{display:block;text-align:center}.hero-centered h1,.hero-centered h2,.hero-minimal h1,.hero-minimal h2{margin-inline:auto}.hero-centered .lead,.hero-minimal .lead{margin-inline:auto}.actions{display:flex;gap:.8rem;flex-wrap:wrap;margin:1.5rem 0}.button{display:inline-flex;align-items:center;justify-content:center;background:var(--primary);color:var(--primary-foreground);border:2px solid var(--primary);border-radius:var(--radius);padding:.75rem 1.1rem;text-decoration:none;font-weight:750}.button-secondary{background:transparent;color:var(--foreground)}.inline-list,.trust-list{display:flex;gap:.75rem 1.5rem;list-style:none;padding:0;flex-wrap:wrap}.inline-list li:before{content:'✓ ';color:var(--primary);font-weight:800}.visual-placeholder{min-height:320px;border-radius:var(--radius);background:linear-gradient(135deg,var(--accent),var(--primary));opacity:.85}.trust-list{justify-content:space-between}.trust-list li{display:grid;min-width:10rem}.trust-list span{font-size:.92rem}.card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.1rem}.card{margin:0;padding:1.5rem;border:1px solid color-mix(in srgb,var(--foreground) 16%,transparent);border-radius:var(--radius);background:var(--background);color:var(--foreground)}.card figcaption{display:grid;gap:.2rem;margin-top:1rem}.icon{display:inline-grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--primary);color:var(--primary-foreground);font-weight:800}.feature{display:flex;align-items:flex-start;gap:1rem}.steps{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5rem}.steps li{display:flex;gap:1rem}.step-number{flex:0 0 auto;display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:50%;background:var(--primary);color:var(--primary-foreground);font-weight:800}.faq-list{display:grid;gap:.75rem}.faq-list details{border:1px solid color-mix(in srgb,var(--foreground) 18%,transparent);border-radius:var(--radius);padding:1rem 1.2rem}.faq-list summary{cursor:pointer;font-weight:750}.faq-answer{padding-top:.7rem}.rich-text-content{max-width:76ch}.rich-text-content blockquote{margin:1.5rem 0;border-left:.25rem solid var(--primary);padding-left:1.25rem}.rich-text-content hr{border:0;border-top:1px solid color-mix(in srgb,var(--foreground) 20%,transparent);margin:2rem 0}.cta{background:var(--primary);color:var(--primary-foreground)}.cta-inner{display:flex;align-items:center;justify-content:space-between;gap:2rem}.cta .button{background:var(--primary-foreground);color:var(--primary);border-color:var(--primary-foreground)}.cta .button-secondary{background:transparent;color:var(--primary-foreground)}.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3rem}.contact-details{display:grid;font-style:normal;gap:.25rem}.contact-form{display:grid;gap:1rem}.contact-form label{display:grid;gap:.35rem;font-weight:650}.contact-form input,.contact-form textarea{width:100%;border:1px solid color-mix(in srgb,var(--foreground) 30%,transparent);border-radius:var(--radius);padding:.7rem;background:var(--background);color:var(--foreground)}.contact-form button{padding:.8rem;border:0;border-radius:var(--radius);background:var(--primary);color:var(--primary-foreground);font-weight:750}.contact-form :disabled{cursor:not-allowed;opacity:.62}.page-title{padding:3rem 0 0}.blog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem}.blog-card{padding:1.5rem;border:1px solid color-mix(in srgb,var(--foreground) 16%,transparent);border-radius:var(--radius)}.blog-card h2{font-size:1.45rem;margin-top:.6rem}.blog-card h2 a{text-decoration:none}.blog-card time,.preview-label{font-size:.9rem;opacity:.72}.blog-body{margin-top:2.5rem}.blog-tags{display:flex;flex-wrap:wrap;gap:.6rem;list-style:none;padding:2rem 0 0}.blog-tags a{display:block;border:1px solid currentColor;border-radius:999px;padding:.3rem .75rem;text-decoration:none}.site-footer{padding:3rem 0;background:var(--foreground);color:var(--background)}.footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:2rem}.site-footer nav>ul{display:grid}.site-footer nav ul{list-style:none;padding:0;margin:0}.site-footer nav li ul{padding-left:1rem}@media(max-width:800px){.header-inner{align-items:flex-start;flex-direction:column;padding-block:1rem}.hero-inner,.contact-grid,.footer-grid{grid-template-columns:1fr}.card-grid,.steps,.blog-grid{grid-template-columns:1fr}.cta-inner{align-items:flex-start;flex-direction:column}.section{padding:calc(3.2rem * var(--spacing-factor)) 0}.site-header nav li ul{position:static;display:grid;border:0;padding:.4rem 0 .4rem 1rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
