import {describe,it,expect} from "vitest";
import {staffEntriesForDay} from "./task-time";
const minutes=(rows:Array<{starts_at:string;ends_at:string|null}>)=>rows.reduce((n,e)=>n+(Date.parse(e.ends_at!)-Date.parse(e.starts_at))/60000,0);
describe("source hours per tenant day",()=>{
 it("keeps midnight contributions exactly once across two days",()=>{const rows=[{id:"source",starts_at:"2026-10-19T21:30:00Z",ends_at:"2026-10-19T23:30:00Z"}];const first=staffEntriesForDay(rows,"2026-10-19","Europe/Amsterdam"),second=staffEntriesForDay(rows,"2026-10-20","Europe/Amsterdam");expect(minutes(first)).toBe(30);expect(minutes(second)).toBe(90);expect(first[0].id).toBe(second[0].id);});
 it("uses 23 and 25 physical hours for the two Amsterdam clock-change days",()=>{expect(minutes(staffEntriesForDay([{starts_at:"2026-03-28T23:00:00Z",ends_at:"2026-03-29T22:00:00Z"}],"2026-03-29","Europe/Amsterdam"))).toBe(1380);expect(minutes(staffEntriesForDay([{starts_at:"2026-10-24T22:00:00Z",ends_at:"2026-10-25T23:00:00Z"}],"2026-10-25","Europe/Amsterdam"))).toBe(1500);});
 it("keeps two simultaneous people's labour separate from elapsed visit time",()=>{const rows=[{person:"A",starts_at:"2026-10-20T08:00:00Z",ends_at:"2026-10-20T08:30:00Z"},{person:"B",starts_at:"2026-10-20T08:00:00Z",ends_at:"2026-10-20T08:30:00Z"}];expect(minutes(staffEntriesForDay(rows,"2026-10-20","Europe/Amsterdam"))).toBe(60);});
});
