import {localToInstant,validDay} from "@/lib/planning/time";
/** Project existing source hours onto a tenant day without creating hours or
 * samples. UTC differences preserve both occurrences of a clock-change hour. */
export function staffEntriesForDay<T extends {starts_at:string;ends_at:string|null}>(entries:T[],day:string,timeZone:string,now=Date.now()):T[]{
 if(!validDay(day))throw new Error("Ongeldige werkdag.");
 const next=new Date(Date.parse(`${day}T00:00:00Z`)+86400000).toISOString().slice(0,10);
 const start=Date.parse(localToInstant(`${day}T00:00`,timeZone)),end=Date.parse(localToInstant(`${next}T00:00`,timeZone));
 return entries.flatMap(entry=>{const from=Math.max(start,Date.parse(entry.starts_at)),through=Math.min(end,entry.ends_at?Date.parse(entry.ends_at):now);return through>from?[{...entry,starts_at:new Date(from).toISOString(),ends_at:entry.ends_at||through===end?new Date(through).toISOString():null}]:[];});
}
