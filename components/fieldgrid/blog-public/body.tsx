import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { BlogDocument } from '@/lib/blog/types';
import { safeBlogUrl } from './seo';
import styles from './blog.module.css';

function nodeText(node: BlogDocument): string {
  return node.text ?? node.content?.map(nodeText).join('') ?? '';
}

export function articleText(content: BlogDocument): string {
  return content.text ?? content.content?.map(articleText).join(' ') ?? '';
}

export function readingTime(content: BlogDocument) {
  const words = articleText(content).trim().split(/\s+/);
  return Math.max(1, Math.ceil(words.length / 220));
}

function headingId(node: BlogDocument, index: number) {
  const label = nodeText(node).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
  return `onderwerp-${index + 1}${label ? '-' + label : ''}`;
}

export function articleHeadings(document: BlogDocument) {
  return (document.content ?? []).flatMap((node, index) => {
    if (node.type !== 'heading' || Number(node.attrs?.level ?? 2) !== 2) return [];
    const label = nodeText(node);
    return label ? [{ id: headingId(node, index), label }] : [];
  });
}

function formatMarks(node: BlogDocument) {
  let content: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold': content = <strong>{content}</strong>; break;
      case 'italic': content = <em>{content}</em>; break;
      case 'underline': content = <u>{content}</u>; break;
      case 'strike': content = <s>{content}</s>; break;
      case 'code': content = <code>{content}</code>; break;
      case 'highlight': content = <mark>{content}</mark>; break;
      case 'link': {
        const href = safeBlogUrl(mark.attrs?.href);
        if (href) content = <a href={href}>{content}</a>;
        break;
      }
    }
  }
  return content;
}

function dimension(value: unknown, maximum: number, minimum = 1) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= minimum && amount <= maximum ? amount : undefined;
}

function renderNode(node: BlogDocument, index: number, topLevel = false): ReactNode {
  const { attrs } = node;
  const children = node.content?.map((child, i) => <Fragment key={i}>{renderNode(child, i)}</Fragment>);
  const textAlign = attrs?.textAlign;
  const alignment: CSSProperties | undefined = textAlign === 'left' || textAlign === 'right' || textAlign === 'center' || textAlign === 'justify'
    ? { textAlign } : undefined;

  switch (node.type) {
    case 'text': return formatMarks(node);
    case 'heading': {
      const level = Number(attrs?.level ?? 2);
      const Tag = level === 3 ? 'h3' : level === 4 ? 'h4' : 'h2';
      return <Tag style={alignment} id={topLevel ? headingId(node, index) : undefined}>{children}</Tag>;
    }
    case 'paragraph': return <p style={alignment}>{children}</p>;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'bulletList': return <ul>{children}</ul>;
    case 'orderedList': return <ol start={dimension(attrs?.start, 10000)}>{children}</ol>;
    case 'listItem': return <li>{children}</li>;
    case 'taskList': return <ul className={styles.taskList}>{children}</ul>;
    case 'taskItem': {
      const checked = attrs?.checked === true;
      return <li><input type="checkbox" checked={checked} disabled aria-label={checked ? 'Afgevinkt' : 'Open'} /><div>{children}</div></li>;
    }
    case 'codeBlock': return <pre><code>{nodeText(node)}</code></pre>;
    case 'hardBreak': return <br />;
    case 'horizontalRule': return <hr />;
    case 'image': {
      const src = safeBlogUrl(attrs?.src);
      if (!src || src.startsWith('#')) return null;
      const alt = typeof attrs?.alt === 'string' ? attrs.alt : '';
      const title = typeof attrs?.title === 'string' ? attrs.title : undefined;
      return <figure className={styles.inlineImage}>
        <img src={src} alt={alt} title={title} width={dimension(attrs?.width, 8192)}
          height={dimension(attrs?.height, 8192)} loading="lazy" decoding="async" />
      </figure>;
    }
    case 'table': return <div className={styles.tableScroller} role="region" aria-label="Artikeltabel" tabIndex={0}><table><tbody>{children}</tbody></table></div>;
    case 'tableRow': return <tr>{children}</tr>;
    case 'tableHeader': return <th colSpan={dimension(attrs?.colspan, 16, 2)} rowSpan={dimension(attrs?.rowspan, 30, 2)}>{children}</th>;
    case 'tableCell': return <td colSpan={dimension(attrs?.colspan, 16, 2)} rowSpan={dimension(attrs?.rowspan, 30, 2)}>{children}</td>;
    default: return children;
  }
}

export function ArticleBody({ document }: { document: BlogDocument }) {
  return <div className={styles.prose}>{(document.content ?? []).map((node, index) => (
    <Fragment key={index}>{renderNode(node, index, true)}</Fragment>
  ))}</div>;
}
