"use client";

import { useCallback, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Type,
  Undo2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EditorJson = Record<string, unknown>;

type TipTapNewsEditorProps = {
  initialHtml: string;
  initialJson: EditorJson | null;
  disabled?: boolean;
  onChange: (html: string, json: EditorJson) => void;
};

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-[#00B7B3] bg-[#E0FAFB] text-[#081D3A]"
          : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#94A3B8]",
      )}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor | null) {
  if (!editor) return;
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", previous ?? "https://");
  if (url === null) return;
  if (url.trim() === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
}

export function TipTapNewsEditor({
  initialHtml,
  initialJson,
  disabled = false,
  onChange,
}: TipTapNewsEditorProps) {
  const handleUpdate = useCallback(({ editor }: { editor: Editor }) => {
    onChange(editor.getHTML(), editor.getJSON() as EditorJson);
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: initialJson ?? (initialHtml || "<p></p>"),
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Schrijf hier het nieuwsbericht...",
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      }),
    ],
    editorProps: {
      attributes: {
        class: "news-editor-content",
      },
    },
    onUpdate: handleUpdate,
  });

  const inactive = disabled || !editor;

  return (
    <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F8FAFC] p-2">
        <ToolbarButton
          title="Kop"
          disabled={inactive}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Type className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Vet"
          disabled={inactive}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Cursief"
          disabled={inactive}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Bulletlijst"
          disabled={inactive}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Genummerde lijst"
          disabled={inactive}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          disabled={inactive}
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[#E2E8F0]" />
        <ToolbarButton
          title="Link toevoegen"
          disabled={inactive}
          active={editor?.isActive("link")}
          onClick={() => setLink(editor)}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Link verwijderen"
          disabled={inactive || !editor?.isActive("link")}
          onClick={() => editor?.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[#E2E8F0]" />
        <ToolbarButton
          title="Ongedaan maken"
          disabled={inactive}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Opnieuw"
          disabled={inactive}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} className="news-editor" />
    </div>
  );
}
