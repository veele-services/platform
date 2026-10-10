import Link from "next/link";
import { Fragment } from "react";
import { headingAnchor, safeKnowledgeHref } from "@/lib/knowledge/model";

function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2,-2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1,-1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part), href = link && safeKnowledgeHref(link[2]);
    if (link && href) return href.startsWith("https:") ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a> : <Link key={index} href={href}>{link[1]}</Link>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
export function knowledgeHeadings(body: string) { return body.split("\n").flatMap((line, index) => /^## /.test(line) ? [{ title: line.slice(3), anchor: headingAnchor(line.slice(3),index) }] : []); }
/** Deliberately constrained Markdown: React text nodes, never executable HTML. */
export function KnowledgeBody({ body }: { body: string }) {
  const lines = body.split("\n"), blocks = [];
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) { const Tag = heading[1].length===2 ? "h2" : "h3"; blocks.push(<Tag key={i} id={headingAnchor(heading[2],i)}><Inline text={heading[2]}/></Tag>); continue; }
    if (/^(?:\d+\. |- )/.test(line)) {
      const ordered=/^\d+\. /.test(line), start=i, items=[];
      while(i<lines.length && (ordered ? /^\d+\. / : /^- /).test(lines[i])) { items.push(<li key={i}><Inline text={lines[i].replace(ordered ? /^\d+\. / : /^- /,"")}/></li>); i++; }
      i--; blocks.push(ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>); continue;
    }
    const start=i, paragraph=[line];
    while(i+1<lines.length && lines[i+1].trim() && !/^(?:#{2,3} |\d+\. |- )/.test(lines[i+1])) paragraph.push(lines[++i]);
    blocks.push(<p key={start}><Inline text={paragraph.join(" ")}/></p>);
  }
  return <div className="kb-prose">{blocks}</div>;
}
