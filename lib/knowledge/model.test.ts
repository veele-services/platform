import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { knowledgeContentSchema, knowledgeSaveSchema, safeKnowledgeHref, headingAnchor } from "./model";
import { KnowledgeBody } from "@/components/fieldgrid/knowledge/article";
import { TicketMessageBody } from "@/components/fieldgrid/knowledge/ticket-message";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const content={title:"Een bruikbaar artikel",summary:"Een uitgebreide samenvatting met concrete uitleg over de functie.",body:"Een uitgebreide handleiding met voldoende inhoud. ".repeat(10),category:"Aan de slag",tags:["uitleg"],audiences:["staff"],related:[]};
describe("knowledge boundaries and safe article rendering",()=>{
  it("requires a real nonempty audience and rejects forged content fields",()=>{
    expect(knowledgeContentSchema.safeParse(content).success).toBe(true);
    for(const extra of [{audiences:[]},{audiences:["staff","staff"]},{audiences:["owner"]},{tenantId:"forged"},{body:"kort"}])expect(knowledgeContentSchema.safeParse({...content,...extra}).success).toBe(false);
  });
  it("requires bounded stable slugs and nonnegative concurrency revisions",()=>{
    for(const slug of ["../private","A slug","article?draft=true","<script>","a".repeat(121)])expect(knowledgeSaveSchema.safeParse({slug,revision:0,content}).success).toBe(false);
    expect(knowledgeSaveSchema.safeParse({slug:"werkbon-vrijgeven",revision:0,content}).success).toBe(true);
  });
  it.each(["javascript:alert(1)","data:text/html,secret","//evil.test","/app/werkbonnen","https://user:password@evil.test","http://evil.test"])("refuses unsafe article href %s",value=>expect(safeKnowledgeHref(value)).toBeNull());
  it("permits ordinary HTTPS, a bounded article and a section anchor",()=>{
    for(const value of ["https://example.com/help","/staff/kennisbank/personeelsapp-installeren","#2-stappen"])expect(safeKnowledgeHref(value)).toBe(value);
  });
  it("escapes raw HTML and executable Markdown links",()=>{
    const html=renderToStaticMarkup(createElement(KnowledgeBody,{body:'## Uitleg\n\n<script>alert(1)</script>\n\n[klik](javascript:alert)\n\n**Veilig**'}));
    expect(html).toContain("&lt;script&gt;");expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript');expect(html).toContain('<strong>Veilig</strong>');
  });
  it("renders shared article links in both ticket UIs without parsing arbitrary HTML",()=>{
    const html=renderToStaticMarkup(createElement(TicketMessageBody,{body:'Bekijk /staff/kennisbank/personeelsapp-installeren\n<script>bad</script>\nhttps://staging.fieldgrid.nl/app/kennisbank/test'}));
    expect(html).toContain('href="/staff/kennisbank/personeelsapp-installeren"');expect(html).toContain('rel="noopener noreferrer"');expect(html).not.toContain('<script>');
  });
  it("gives repeated headings distinct safe anchors",()=>expect(headingAnchor("Stáp 1: aan de slag",3)).toBe("3-stap-1-aan-de-slag"));
  it("seeds only missing slugs, preserves published edits and records first versions",()=>{
    const seed=readFileSync(resolve("supabase/migrations/20261010100100_knowledge_base_articles.sql"),"utf8");
    expect(seed).toContain("on conflict(slug) do nothing");expect(seed).toContain("from added");expect(seed).not.toContain("do update");
  });
});
