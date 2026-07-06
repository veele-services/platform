"use client";

import { useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TipTapKnowledgebaseEditorProps = {
  initialHtml?: string | null;
  onChange: (html: string, json: Record<string, unknown>) => void;
  placeholder?: string;
};

export function TipTapKnowledgebaseEditor({
  initialHtml,
  onChange,
  placeholder = "Schrijf de handleiding met duidelijke stappen, tips en waarschuwingen...",
}: TipTapKnowledgebaseEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
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

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
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
    {
      label: "Callout",
      icon: Quote,
      active: editor.isActive("blockquote"),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
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
        <Button type="button" variant="ghost" size="sm" onClick={setLink} className="h-8 gap-1.5 px-2 text-xs" title="Link toevoegen">
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
      </div>
      <div className="news-editor px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
