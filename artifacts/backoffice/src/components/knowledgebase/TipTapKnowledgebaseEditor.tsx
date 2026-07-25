"use client";

import { useCallback, useMemo, useState } from "react";
import { EditorContent, Node as TipTapNode, mergeAttributes, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  AlertTriangle,
  Bold,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Italic,
  Lightbulb,
  LinkIcon,
  List,
  ListOrdered,
  Pencil,
  Redo2,
  Table2,
  Undo2,
  Unlink,
  Video,
} from "lucide-react";
import { KnowledgebaseContentRenderer } from "@/components/knowledgebase/KnowledgebaseContentRenderer";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { cn } from "@/lib/utils";
import { backofficePath } from "@/lib/backoffice-paths";
import type { KnowledgebaseArticleMediaSummary } from "@workspace/db";

type TipTapKnowledgebaseEditorProps = {
  initialHtml?: string | null;
  media?: KnowledgebaseArticleMediaSummary[];
  mediaBasePath?: string;
  onChange: (html: string, json: Record<string, unknown>) => void;
  placeholder?: string;
};

type CalloutTone = "tip" | "warning" | "example";

const CALLOUT_LABELS: Record<CalloutTone, string> = {
  tip: "Tip",
  warning: "Let op",
  example: "Voorbeeld",
};

function isCalloutTone(value: unknown): value is CalloutTone {
  return value === "tip" || value === "warning" || value === "example";
}

function sanitizeEditorUrl(rawValue: string | null | undefined, allowRelative = true): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  if (allowRelative && (value.startsWith("/") || value.startsWith("#"))) {
    return value;
  }

  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

const CalloutNode = TipTapNode.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "tip",
        parseHTML: (element: HTMLElement) => {
          const tone = element.getAttribute("data-tone");
          return isCalloutTone(tone) ? tone : "tip";
        },
        renderHTML: (attributes: { tone?: unknown }) => ({
          "data-tone": isCalloutTone(attributes.tone) ? attributes.tone : "tip",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='callout']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: "kb-callout",
      }),
      0,
    ];
  },
});

const KnowledgebaseMediaNode = TipTapNode.create({
  name: "knowledgebaseMedia",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      mediaType: { default: "attachment" },
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-type='kb-media']",
        getAttrs: (element) => {
          const figure = element as HTMLElement;
          const image = figure.querySelector("img");
          const video = figure.querySelector("video");
          const link = figure.querySelector("a");
          const caption = figure.querySelector("figcaption")?.textContent?.trim() ?? "";

          return {
            mediaId: figure.getAttribute("data-kb-media-id") ?? image?.getAttribute("data-kb-media-id") ?? null,
            mediaType: figure.getAttribute("data-media-type") ?? (image ? "image" : video ? "video" : "attachment"),
            src: image?.getAttribute("src") ?? video?.getAttribute("src") ?? link?.getAttribute("href") ?? null,
            alt: image?.getAttribute("alt") ?? link?.textContent?.trim() ?? "",
            caption,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as {
      mediaId?: string | null;
      mediaType?: "image" | "video" | "attachment";
      src?: string | null;
      alt?: string | null;
      caption?: string | null;
    };
    const src = attrs.src ?? "";
    const mediaId = attrs.mediaId ?? "";
    const mediaType = attrs.mediaType ?? "attachment";
    const alt = attrs.alt ?? "";
    const caption = attrs.caption ?? "";
    const figureAttrs = mergeAttributes(HTMLAttributes, {
      "data-type": "kb-media",
      "data-kb-media-id": mediaId,
      "data-media-type": mediaType,
      class: "kb-media",
    });
    const children: unknown[] = [];

    if (mediaType === "image") {
      children.push(["img", { src, alt, "data-kb-media-id": mediaId }]);
    } else if (mediaType === "video") {
      children.push(["video", { src, controls: true, "data-kb-media-id": mediaId }]);
    } else {
      children.push([
        "a",
        {
          href: src,
          target: "_blank",
          rel: "noreferrer",
          "data-kb-media-id": mediaId,
        },
        caption || alt || "Bijlage openen",
      ]);
    }

    if (caption) {
      children.push(["figcaption", caption]);
    }

    return ["figure", figureAttrs, ...children];
  },
});

const VideoEmbedNode = TipTapNode.create({
  name: "videoEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: "Video" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-type='kb-video-embed']",
        getAttrs: (element) => {
          const figure = element as HTMLElement;
          const iframe = figure.querySelector("iframe");
          return {
            src: iframe?.getAttribute("src") ?? null,
            title: iframe?.getAttribute("title") ?? "Video",
            caption: figure.querySelector("figcaption")?.textContent?.trim() ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as { src?: string | null; title?: string | null; caption?: string | null };
    const caption = attrs.caption ?? "";
    const children: unknown[] = [
      [
        "iframe",
        {
          src: attrs.src ?? "",
          title: attrs.title ?? "Video",
          loading: "lazy",
          allowfullscreen: "true",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ];

    if (caption) {
      children.push(["figcaption", caption]);
    }

    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-type": "kb-video-embed",
        class: "kb-video-embed",
      }),
      ...children,
    ];
  },
});

const SimpleTableNode = TipTapNode.create({
  name: "simpleTable",
  group: "block",
  content: "simpleTableRow+",
  isolating: true,

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes, { class: "kb-table" }), ["tbody", 0]];
  },
});

const SimpleTableRowNode = TipTapNode.create({
  name: "simpleTableRow",
  content: "(simpleTableHeader|simpleTableCell)+",

  parseHTML() {
    return [{ tag: "tr" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["tr", HTMLAttributes, 0];
  },
});

const SimpleTableCellNode = TipTapNode.create({
  name: "simpleTableCell",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["td", HTMLAttributes, 0];
  },
});

const SimpleTableHeaderNode = TipTapNode.create({
  name: "simpleTableHeader",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["th", HTMLAttributes, 0];
  },
});

function buildTableContent() {
  return {
    type: "simpleTable",
    content: Array.from({ length: 3 }, (_, rowIndex) => ({
      type: "simpleTableRow",
      content: Array.from({ length: 3 }, (_, columnIndex) => ({
        type: rowIndex === 0 ? "simpleTableHeader" : "simpleTableCell",
        content: [
          {
            type: "paragraph",
            content:
              rowIndex === 0
                ? [{ type: "text", text: `Kolom ${columnIndex + 1}` }]
                : [],
          },
        ],
      })),
    })),
  };
}

function mediaUrl(mediaBasePath: string, mediaId: string): string {
  return `${backofficePath(mediaBasePath).replace(/\/+$/, "")}/${mediaId}`;
}

export function TipTapKnowledgebaseEditor({
  initialHtml,
  media = [],
  mediaBasePath = "/platform/knowledgebase/media",
  onChange,
  placeholder = "Schrijf de handleiding met duidelijke stappen, tips en waarschuwingen...",
}: TipTapKnowledgebaseEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        heading: { levels: [2, 3] },
      }),
      CalloutNode,
      KnowledgebaseMediaNode,
      VideoEmbedNode,
      SimpleTableNode,
      SimpleTableRowNode,
      SimpleTableHeaderNode,
      SimpleTableCellNode,
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        validate: (href) => Boolean(sanitizeEditorUrl(href)),
        HTMLAttributes: {
          rel: "noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: initialHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "news-editor-content min-h-[360px] focus:outline-none",
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getJSON() as Record<string, unknown>);
    },
  });

  const previewHtml = useMemo(() => editor?.getHTML() ?? initialHtml ?? "", [editor, initialHtml, mode]);

  const applyLink = useCallback((values: Readonly<Record<string, string>>) => {
    if (!editor) return;
    const url = values.href ?? "";
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const sanitizedUrl = sanitizeEditorUrl(url);
    if (!sanitizedUrl) return;

    editor.chain().focus().extendMarkRange("link").setLink({ href: sanitizedUrl }).run();
  }, [editor]);

  const insertCallout = useCallback((tone: CalloutTone) => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "callout",
        attrs: { tone },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${CALLOUT_LABELS[tone]}: schrijf hier de toelichting.` }],
          },
        ],
      })
      .run();
  }, [editor]);

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertContent(buildTableContent()).run();
  }, [editor]);

  const insertSelectedMedia = useCallback(() => {
    if (!editor || !selectedMediaId) return;
    const item = media.find((entry) => entry.id === selectedMediaId);
    if (!item) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "knowledgebaseMedia",
        attrs: {
          mediaId: item.id,
          mediaType: item.mediaType,
          src: mediaUrl(mediaBasePath, item.id),
          alt: item.altText || item.caption || item.storagePath,
          caption: item.caption || "",
        },
      })
      .run();
    setSelectedMediaId("");
  }, [editor, media, mediaBasePath, selectedMediaId]);

  const insertVideoEmbed = useCallback((values: Readonly<Record<string, string>>) => {
    if (!editor) return;
    const url = values.url ?? "";
    const sanitizedUrl = sanitizeEditorUrl(url, false);
    if (!sanitizedUrl || !sanitizedUrl.startsWith("https://")) return;
    const title = values.title?.trim() || "Knowledgebase video";
    const caption = values.caption?.trim() || "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "videoEmbed",
        attrs: {
          src: sanitizedUrl,
          title,
          caption,
        },
      })
      .run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-[360px] rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Editor laden...
      </div>
    );
  }

  const toolbar = [
    {
      label: "Kop",
      icon: Heading2,
      active: editor.isActive("heading", { level: 2 }),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Subkop",
      icon: Heading3,
      active: editor.isActive("heading", { level: 3 }),
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Vet",
      icon: Bold,
      active: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Cursief",
      icon: Italic,
      active: editor.isActive("italic"),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Opsomming",
      icon: List,
      active: editor.isActive("bulletList"),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Stappen",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];

  const calloutToolbar = [
    { tone: "tip" as const, label: "Tip", icon: Lightbulb },
    { tone: "warning" as const, label: "Let op", icon: AlertTriangle },
    { tone: "example" as const, label: "Voorbeeld", icon: Info },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">
        {toolbar.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant={item.active ? "default" : "ghost"}
            size="sm"
            onClick={item.action}
            className={cn("h-8 gap-1.5 px-2 text-xs", item.active && "bg-slate-900 text-white")}
            title={item.label}
          >
            <item.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Button>
        ))}
        <span className="mx-1 h-8 w-px bg-slate-200" />
        {calloutToolbar.map((item) => (
          <Button
            key={item.tone}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertCallout(item.tone)}
            className="h-8 gap-1.5 px-2 text-xs"
            title={`${item.label} callout invoegen`}
          >
            <item.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={insertTable} className="h-8 gap-1.5 px-2 text-xs" title="Tabel invoegen">
          <Table2 className="h-4 w-4" />
          <span className="hidden sm:inline">Tabel</span>
        </Button>
        <span className="mx-1 h-8 w-px bg-slate-200" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setLinkDialogOpen(true)} className="h-8 gap-1.5 px-2 text-xs" title="Link toevoegen">
          <LinkIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Link</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
          className="h-8 px-2"
          title="Link verwijderen"
        >
          <Unlink className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setVideoDialogOpen(true)} className="h-8 gap-1.5 px-2 text-xs" title="Video embed invoegen">
          <Video className="h-4 w-4" />
          <span className="hidden sm:inline">Video</span>
        </Button>
        <span className="mx-1 h-8 w-px bg-slate-200" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 px-2"
          title="Ongedaan maken"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 px-2"
          title="Opnieuw"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-8 w-px bg-slate-200" />
        <Button
          type="button"
          variant={mode === "preview" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode((value) => (value === "preview" ? "edit" : "preview"))}
          className={cn("h-8 gap-1.5 px-2 text-xs", mode === "preview" && "bg-slate-900 text-white")}
          title={mode === "preview" ? "Bewerken" : "Preview"}
        >
          {mode === "preview" ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="hidden sm:inline">{mode === "preview" ? "Bewerken" : "Preview"}</span>
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white p-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ImagePlus className="h-4 w-4 shrink-0 text-slate-500" />
          <select
            value={selectedMediaId}
            onChange={(event) => setSelectedMediaId(event.target.value)}
            disabled={media.length === 0}
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
            aria-label="Kies media om inline in te voegen"
          >
            <option value="">{media.length === 0 ? "Upload eerst media bij dit artikel" : "Kies media om inline in te voegen"}</option>
            {media.map((item) => (
              <option key={item.id} value={item.id}>
                {item.caption || item.altText || item.storagePath} ({item.mediaType})
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={insertSelectedMedia} disabled={!selectedMediaId} className="h-9 gap-1.5 text-xs">
          <ImagePlus className="h-4 w-4" />
          Invoegen
        </Button>
      </div>

      {mode === "preview" ? (
        <div className="min-h-[360px] bg-white px-4 py-3">
          <KnowledgebaseContentRenderer html={previewHtml} mediaBasePath={mediaBasePath} />
        </div>
      ) : (
        <div className="news-editor px-4 py-3">
          <EditorContent editor={editor} />
        </div>
      )}
      <PromptDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Link toevoegen"
        description="Gebruik een veilige web-, e-mail-, telefoon- of interne link. Laat leeg om de link te verwijderen."
        fields={[
          {
            name: "href",
            label: "Link",
            initialValue:
              (editor.getAttributes("link").href as string | undefined) ??
              "https://",
          },
        ]}
        confirmLabel="Link toepassen"
        validate={(values) => {
          const value = values.href ?? "";
          return !value.trim() || sanitizeEditorUrl(value)
            ? null
            : "Gebruik een veilige link: https, http, mailto, tel, /pad of #anker.";
        }}
        onConfirm={applyLink}
      />
      <PromptDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        title="Video invoegen"
        description="Gebruik uitsluitend een veilige HTTPS-embedlink."
        fields={[
          {
            name: "url",
            label: "Video embed URL",
            initialValue: "https://",
            required: true,
            type: "url",
          },
          {
            name: "title",
            label: "Videotitel",
            initialValue: "Knowledgebase video",
            required: true,
          },
          {
            name: "caption",
            label: "Bijschrift (optioneel)",
          },
        ]}
        confirmLabel="Video invoegen"
        validate={(values) => {
          const url = sanitizeEditorUrl(values.url, false);
          return url?.startsWith("https://")
            ? null
            : "Gebruik een veilige HTTPS video embed URL.";
        }}
        onConfirm={insertVideoEmbed}
      />
    </div>
  );
}
