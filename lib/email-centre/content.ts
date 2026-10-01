import { z } from "zod";

const plain = (max: number) => z.string().trim().max(max).refine(value => !/<\/?[a-z][\s\S]*>/i.test(value), "Gebruik tekst, geen HTML.");
export const mailUrl = z.url().max(2000).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "Gebruik een veilige HTTPS-link.");
const leaf = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: plain(5000).min(1) }).strict(),
  z.object({ type: z.literal("heading"), text: plain(180).min(1) }).strict(),
  z.object({ type: z.literal("button"), text: plain(80).min(1), url: mailUrl }).strict(),
  z.object({ type: z.literal("image"), url: mailUrl, alt: plain(200).min(1) }).strict(),
  z.object({ type: z.literal("divider") }).strict(),
]);
export const mailBlockSchema = z.union([leaf, z.object({ type: z.literal("columns"), columns: z.tuple([z.array(leaf).min(1).max(8), z.array(leaf).min(1).max(8)]) }).strict()]);
export const mailContentSchema = z.object({
  subject: plain(180).min(3).refine(value => !/[\r\n]/.test(value)),
  preheader: plain(240).default(""),
  blocks: z.array(mailBlockSchema).min(1).max(40),
  closing: plain(2000).default(""),
}).strict();
export type MailContent = z.infer<typeof mailContentSchema>;
export type MailBlock = z.infer<typeof mailBlockSchema>;
export function escapeMail(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
export function renderMailBlocks(input: unknown) {
  const blocks = z.array(mailBlockSchema).max(40).parse(input);
  const render = (block: MailBlock): string => {
    switch (block.type) {
      case "text": return `<p style="margin:0 0 16px;font:15px/1.7 Arial,sans-serif;color:#40586b">${escapeMail(block.text).replace(/\n/g, "<br>")}</p>`;
      case "heading": return `<h2 style="margin:20px 0 12px;font:700 21px/1.4 Arial,sans-serif;color:#222c35">${escapeMail(block.text)}</h2>`;
      case "button": return `<p style="margin:20px 0"><a href="${escapeMail(block.url)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#222c35;color:#fff;font:700 14px Arial,sans-serif;text-decoration:none">${escapeMail(block.text)}</a></p>`;
      case "image": return `<p style="margin:16px 0"><img src="${escapeMail(block.url)}" alt="${escapeMail(block.alt)}" width="516" style="width:100%;max-width:516px;height:auto;border:0"></p>`;
      case "divider": return '<hr style="border:0;border-top:1px solid #e1e9ed;margin:20px 0">';
      case "columns": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${block.columns.map(column => `<td width="50%" valign="top" style="padding:0 8px">${column.map(render).join("")}</td>`).join("")}</tr></table>`;
    }
  };
  return blocks.map(render).join("");
}
export function mailPlainText(content: MailContent) {
  const text = (block: MailBlock): string => block.type === "columns" ? block.columns.map(column => column.map(text).join("\n\n")).join("\n\n") : block.type === "divider" ? "—" : block.type === "image" ? block.alt : block.type === "button" ? `${block.text}: ${block.url}` : block.text;
  return `${content.blocks.map(text).join("\n\n")}\n\n${content.closing}`.trim();
}
