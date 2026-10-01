import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderNotificationMailText, resolveMailTemplate } from "./mail-template";
describe("central commercial templates", () => {
  it("replaces only explicitly allowed source variables", () => {
    expect(renderNotificationMailText("{onderwerp}\n{bericht}",["onderwerp","bericht"],{onderwerp:"FICTITIOUS",bericht:"Vraag"})).toBe("FICTITIOUS\nVraag");
    expect(() => renderNotificationMailText("{alarmcode}",["bedrijfsnaam"],{alarmcode:"DO NOT EXPOSE"})).toThrow();
    expect(() => renderNotificationMailText("{bedrijfsnaam}",["bedrijfsnaam"],{})).toThrow();
  });
  it("takes the resolved template version, not the old local default", async () => {
    const data={title:"Nieuwe standaard",body:"Hallo {bedrijfsnaam}",cta_label:"Bekijken",revision:3,version_id:"00000000-0000-4000-8000-000000000001",variables:["bedrijfsnaam"]};
    const db={rpc:vi.fn().mockResolvedValue({data,error:null})} as unknown as Parameters<typeof resolveMailTemplate>[0];
    expect(await resolveMailTemplate(db,"tenant","quote.available","customer")).toEqual(data);
  });
});
