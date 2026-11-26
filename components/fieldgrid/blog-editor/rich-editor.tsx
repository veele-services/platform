'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { markdownDocument } from '@/lib/blog/validation';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, CheckSquare, Code2, Highlighter,
  ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough,
  Table2, Underline, Undo2, FileInput,
} from 'lucide-react';
import type { BlogDocument, BlogImage } from '@/lib/blog/types';

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, defaultProtocol: 'https' },
  }),
  Image.configure({ allowBase64: false }),
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Typography,
  Placeholder.configure({ placeholder: 'Schrijf je artikel of plak tekst uit je document…' }),
];

type RichEditorProps = {
  initial: BlogDocument;
  editable: boolean;
  onChange: (value: BlogDocument) => void;
  upload: (file: File) => Promise<BlogImage>;
};

function Tool({ label, active = false, disabled = false, onClick, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

export function RichEditor({ initial, editable, onChange, upload }: RichEditorProps) {
  const [dialog, setDialog] = useState<'link' | 'image' | 'markdown' | null>(null);
  const [href, setHref] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRange = useRef<{ from: number; to: number } | null>(null);
  const slashChoice = useRef(0);
  const [image, setImage] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contentError, setContentError] = useState(false);
  const selection = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    enableContentCheck: true,
    extensions,
    editorProps: {
      attributes: { class: 'fg-rich-content', 'aria-label': 'Artikelinhoud', role: 'textbox', 'aria-multiline': 'true' },
      handleKeyDown: (_view, event) => {
        if (!slashRange.current) return false;
        if (event.key === 'Escape') { slashRange.current = null; setSlashOpen(false); return true; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          slashChoice.current = (slashChoice.current + (event.key === 'ArrowDown' ? 1 : 5)) % 6;
          setSlashIndex(slashChoice.current); return true;
        }
        if (event.key === 'Enter') { insertBlock(slashChoice.current); return true; }
        return false;
      },
    },
    content: initial,
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON() as BlogDocument);
      const { $from, empty } = current.state.selection;
      const open = empty && $from.parent.type.name === 'paragraph' && $from.parent.textContent === '/';
      slashRange.current = open ? { from: $from.start(), to: $from.pos } : null;
      setSlashOpen(open); slashChoice.current = 0; setSlashIndex(0);
    },
    onContentError: ({ editor: current }) => {
      setContentError(true);
      current.setEditable(false, false);
    },
  });

  useEffect(() => { editor?.setEditable(editable && !contentError, false); }, [editor, editable, contentError]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: [2, 3, 4].find((level) => current?.isActive('heading', { level })) ?? 0,
      marks: ['bold', 'italic', 'underline', 'strike', 'highlight', 'link', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'table']
        .filter((name) => current?.isActive(name)),
      alignment: ['left', 'center', 'right'].find((value) => current?.isActive({ textAlign: value })) ?? 'left',
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  });

  if (contentError) return <p className="fg-editor-error" role="alert">Deze opmaak kan niet worden geladen. Open het privévoorbeeld om de opgeslagen inhoud te bekijken.</p>;
  if (!editor) return <div className="fg-rich-loading" role="status">Editor laden…</div>;
  const active = (name: string) => state?.marks.includes(name) ?? false;
  const chain = () => editor.chain().focus();

  function openPanel(panel: 'link' | 'image' | 'markdown') {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    selection.current = { from, to };
    setError('');
    setHref(panel === 'link' ? (editor.getAttributes('link').href ?? '') : '');
    setImage(null);
    setAlt('');
    setDialog(panel);
  }

  function insertBlock(index: number) {
    if (!editor || !slashRange.current) return;
    const command = editor.chain().focus().deleteRange(slashRange.current);
    if (index === 0) command.setHeading({ level: 2 }).run();
    if (index === 1) command.setHeading({ level: 3 }).run();
    if (index === 2) command.toggleBulletList().run();
    if (index === 3) command.toggleOrderedList().run();
    if (index === 4) command.toggleBlockquote().run();
    if (index === 5) command.setHorizontalRule().run();
    slashRange.current = null; setSlashOpen(false);
  }

  function importMarkdown() {
    try {
      editor?.commands.setContent(markdownDocument(markdown));
      setDialog(null); setMarkdown(''); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'De Markdown kon niet worden geïmporteerd.'); }
  }

  function saveLink(remove = false) {
    const value = href.trim();
    if (!remove) {
      try {
        if (!/^[/#](?!\/)/.test(value)) {
          const parsed = new URL(value);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
        }
        if (/[\\\s]/.test(value)) throw new Error();
      } catch {
        setError('Gebruik een intern pad, bijvoorbeeld /platform, of een volledige https-link.');
        return;
      }
    }
    const command = selection.current ? chain().setTextSelection(selection.current) : chain();
    if (remove) command.extendMarkRange('link').unsetLink().run();
    else if (selection.current?.from === selection.current?.to && !active('link')) {
      command.insertContent([{ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] }]).run();
    } else command.extendMarkRange('link').setLink({ href: value }).run();
    setDialog(null);
  }

  async function addImage() {
    if (!image || !alt.trim()) return;
    setBusy(true);
    setError('');
    try {
      const media = await upload(image);
      const command = selection.current ? chain().setTextSelection(selection.current) : chain();
      command.setImage({ src: media.src, alt: alt.trim() }).run();
      setDialog(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Afbeelding uploaden is niet gelukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fg-rich">
      <div className="fg-rich-toolbar" aria-label="Tekstopmaak">
        <select aria-label="Tekststijl" value={state?.heading ?? 0} onChange={(event) => {
          const level = Number(event.target.value) as 0 | 2 | 3 | 4;
          if (level) chain().setHeading({ level }).run();
          else chain().setParagraph().run();
        }}>
          <option value={0}>Alinea</option><option value={2}>Kop 2</option><option value={3}>Kop 3</option><option value={4}>Kop 4</option>
        </select>
        <div className="fg-rich-group">
          <Tool label="Vet" active={active('bold')} onClick={() => chain().toggleBold().run()}><Bold size={17} /></Tool>
          <Tool label="Cursief" active={active('italic')} onClick={() => chain().toggleItalic().run()}><Italic size={17} /></Tool>
          <Tool label="Onderstrepen" active={active('underline')} onClick={() => chain().toggleUnderline().run()}><Underline size={17} /></Tool>
          <Tool label="Doorhalen" active={active('strike')} onClick={() => chain().toggleStrike().run()}><Strikethrough size={17} /></Tool>
          <Tool label="Markeren" active={active('highlight')} onClick={() => chain().toggleHighlight().run()}><Highlighter size={17} /></Tool>
          <Tool label="Link toevoegen of wijzigen" active={active('link')} onClick={() => openPanel('link')}><Link2 size={17} /></Tool>
        </div>
        <div className="fg-rich-group">
          <Tool label="Links uitlijnen" active={state?.alignment === 'left'} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={17} /></Tool>
          <Tool label="Centreren" active={state?.alignment === 'center'} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={17} /></Tool>
          <Tool label="Rechts uitlijnen" active={state?.alignment === 'right'} onClick={() => chain().setTextAlign('right').run()}><AlignRight size={17} /></Tool>
        </div>
        <div className="fg-rich-group">
          <Tool label="Opsomming" active={active('bulletList')} onClick={() => chain().toggleBulletList().run()}><List size={17} /></Tool>
          <Tool label="Genummerde lijst" active={active('orderedList')} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={17} /></Tool>
          <Tool label="Checklist" active={active('taskList')} onClick={() => chain().toggleTaskList().run()}><CheckSquare size={17} /></Tool>
          <Tool label="Citaat" active={active('blockquote')} onClick={() => chain().toggleBlockquote().run()}><Quote size={17} /></Tool>
          <Tool label="Codeblok" active={active('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}><Code2 size={17} /></Tool>
          <Tool label="Scheidingslijn" onClick={() => chain().setHorizontalRule().run()}><Minus size={17} /></Tool>
        </div>
        <div className="fg-rich-group">
          <Tool label="Afbeelding uploaden" onClick={() => openPanel('image')}><ImagePlus size={17} /></Tool>
          <Tool label="Markdown importeren" onClick={() => openPanel('markdown')}><FileInput size={17} /></Tool>
          <Tool label="Tabel invoegen" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /></Tool>
        </div>
        <div className="fg-rich-group">
          <Tool label="Ongedaan maken" disabled={!state?.undo} onClick={() => chain().undo().run()}><Undo2 size={17} /></Tool>
          <Tool label="Opnieuw uitvoeren" disabled={!state?.redo} onClick={() => chain().redo().run()}><Redo2 size={17} /></Tool>
        </div>
      </div>
      {active('table') && <div className="fg-rich-table-actions" aria-label="Tabel bewerken">
        <button type="button" onClick={() => chain().addRowAfter().run()}>Rij toevoegen</button>
        <button type="button" onClick={() => chain().addColumnAfter().run()}>Kolom toevoegen</button>
        <button type="button" onClick={() => chain().deleteRow().run()}>Rij verwijderen</button>
        <button type="button" onClick={() => chain().deleteColumn().run()}>Kolom verwijderen</button>
        <button type="button" onClick={() => chain().toggleHeaderRow().run()}>Koprij wisselen</button>
        <button type="button" onClick={() => chain().deleteTable().run()}>Tabel verwijderen</button>
      </div>}
      {dialog && <div className="fg-rich-panel" aria-label={dialog === 'link' ? 'Link bewerken' : dialog === 'markdown' ? 'Markdown importeren' : 'Afbeelding invoegen'}>
        {dialog === 'link' ? <>
          <label>Linkadres<input autoFocus value={href} onChange={(event) => setHref(event.target.value)} placeholder="https:// of /platform" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveLink(); } }} /></label>
          <div className="fg-editor-actions">
            <button type="button" className="fg-editor-btn primary" onClick={() => saveLink()}>Link toepassen</button>
            {active('link') && <button type="button" className="fg-editor-btn" onClick={() => saveLink(true)}>Link verwijderen</button>}
          </div>
        </> : dialog === 'markdown' ? <>
          <label>Markdown<textarea value={markdown} maxLength={120000} rows={8} onChange={event => setMarkdown(event.target.value)} placeholder="## Een duidelijke tussenkop" /></label>
          <p>De geïmporteerde tekst vervangt de huidige inhoud. Koppen, lijsten en veilige links worden overgenomen. HTML blijft gewone tekst; afbeeldingen moeten al naar Fieldgrid zijn geüpload.</p>
          <button type="button" className="fg-editor-btn primary" disabled={!markdown.trim()} onClick={importMarkdown}>Inhoud importeren</button>
        </> : <>
          <label>Afbeelding<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
          <label>Alt-tekst<input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Beschrijf wat op de afbeelding te zien is" /></label>
          <button type="button" className="fg-editor-btn primary" disabled={busy || !editable || !image || !alt.trim()} onClick={addImage}>{busy ? 'Uploaden…' : 'Afbeelding invoegen'}</button>
        </>}
        <button type="button" className="fg-editor-btn" onClick={() => setDialog(null)}>Sluiten</button>
        {error && <p role="alert" className="fg-editor-error">{error}</p>}
      </div>}
      <BubbleMenu editor={editor} options={{ placement: 'top' }}>
        <div className="fg-rich-floating" aria-label="Selectie opmaken">
          <Tool label="Vet" active={active('bold')} onClick={() => chain().toggleBold().run()}><Bold size={16} /></Tool>
          <Tool label="Cursief" active={active('italic')} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></Tool>
          <Tool label="Onderstrepen" active={active('underline')} onClick={() => chain().toggleUnderline().run()}><Underline size={16} /></Tool>
          <Tool label="Link" active={active('link')} onClick={() => openPanel('link')}><Link2 size={16} /></Tool>
        </div>
      </BubbleMenu>
      {slashOpen && <div className="fg-rich-slash" role="listbox" aria-label="Blok invoegen">
        {['Kop 2', 'Kop 3', 'Opsomming', 'Genummerde lijst', 'Citaat', 'Scheidingslijn'].map((label, index) => <button key={label} type="button" role="option" aria-selected={slashIndex === index} onMouseDown={event => event.preventDefault()} onClick={() => insertBlock(index)}>{label}</button>)}
      </div>}
      <EditorContent editor={editor} />
      <p className="fg-rich-help">Typ / op een lege regel voor blokken. Gebruik Ctrl/Cmd+B voor vet, Ctrl/Cmd+I voor cursief en Ctrl/Cmd+Z om terug te gaan.</p>
    </div>
  );
}
