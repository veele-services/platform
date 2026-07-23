"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { WebsiteRichTextDocument } from "@workspace/db";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  Unlink,
} from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: TipTapDocument;
  onChange: (value: TipTapDocument) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

type TipTapDocument = Extract<WebsiteRichTextDocument, { schemaVersion: 2 }>;

function editorDocument(editor: Editor): TipTapDocument {
  return {
    ...(editor.getJSON() as Record<string, unknown>),
    type: "doc",
    schemaVersion: 2,
  } as TipTapDocument;
}

function isSafeLink(value: string): boolean {
  if (/^\/(?!\/)[a-z0-9/_-]*$/u.test(value)) return true;
  if (/^#[a-z][a-z0-9_-]*$/iu.test(value)) return true;
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/iu.test(value)) return true;
  if (/^tel:\+[1-9][0-9]{7,14}$/u.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function setLink(editor: Editor | null) {
  if (!editor) return;
  const previous = editor.getAttributes("link").href as string | undefined;
  const rawValue = window.prompt(
    "Link (intern pad, https://, mailto: of tel:)",
    previous ?? "https://",
  );
  if (rawValue === null) return;
  const href = rawValue.trim();
  if (!href) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  if (!isSafeLink(href)) {
    window.alert("Gebruik een intern pad, HTTPS-, e-mail- of telefoonlink.");
    return;
  }
  editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href, target: href.startsWith("https://") ? "_blank" : null })
    .run();
}

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-40",
        active && "bg-cyan-50 text-cyan-800",
      )}
    >
      {children}
    </button>
  );
}

export function WebsiteRichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Begin met schrijven…",
  ariaLabel = "Tekstinhoud",
}: Props) {
  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => onChange(editorDocument(editor)),
    [onChange],
  );
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: value,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class:
          "min-h-40 px-1 py-3 text-[15px] leading-7 text-slate-800 outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-cyan-300 [&_blockquote]:pl-4 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:ml-6 [&_ul]:list-disc",
      },
    },
    onUpdate: handleUpdate,
  });
  const inactive = disabled || !editor;

  return (
    <div className="rounded-xl bg-white transition focus-within:ring-2 focus-within:ring-cyan-100">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 pb-2">
        <ToolButton
          title="Kop 2"
          disabled={inactive}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Kop 3"
          disabled={inactive}
          active={editor?.isActive("heading", { level: 3 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Vet"
          disabled={inactive}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Cursief"
          disabled={inactive}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Opsomming"
          disabled={inactive}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Genummerde lijst"
          disabled={inactive}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Citaat"
          disabled={inactive}
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <ToolButton
          title="Link toevoegen"
          disabled={inactive}
          active={editor?.isActive("link")}
          onClick={() => setLink(editor)}
        >
          <Link2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Link verwijderen"
          disabled={inactive || !editor?.isActive("link")}
          onClick={() => editor?.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <ToolButton
          title="Ongedaan maken"
          disabled={inactive || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Opnieuw"
          disabled={inactive || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
