import { planningViews, executionStatuses } from "@/lib/planning/model";

/** Only non-identifying UI preferences may survive the authenticated session. */
export function cosmeticPlanningPreferences(input: unknown): Record<string, unknown> {
  if(!input||typeof input!=="object"||Array.isArray(input))return {};
  const p=input as Record<string,unknown>,safe:Record<string,unknown>={};
  for(const key of ["from","to"])if(typeof p[key]==="string"&&/^\d{2}:\d{2}$/.test(p[key]))safe[key]=p[key];
  if(["overview","wide","precise"].includes(String(p.zoom)))safe.zoom=p.zoom;
  if(typeof p.height==="number"&&Number.isFinite(p.height))safe.height=Math.min(500,Math.max(148,p.height));
  if(typeof p.collapsed==="boolean")safe.collapsed=p.collapsed;
  if(typeof p.view==="string"&&Object.hasOwn(planningViews,p.view))safe.view=p.view;
  if(typeof p.status==="string"&&(p.status===""||Object.hasOwn(executionStatuses,p.status)))safe.status=p.status;
  return safe;
}

const scrollPositions=new Map<string,number>();
export const rememberCustomerScroll=(key:string,y:number)=>{if(Number.isFinite(y))scrollPositions.set(key,y);};
export const customerScroll=(key:string)=>scrollPositions.get(key);

export function cleanAccountBrowserState(local:Storage,session:Storage,resetTransient=true) {
  if(resetTransient)scrollPositions.clear();
  for(const storage of [local,session]){
    const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((key):key is string=>key!==null);
    for(const key of keys){
      if(key.startsWith("customer-scroll:")){storage.removeItem(key);continue;}
      if(key.startsWith("fieldgrid:planboard:")){
        try{storage.setItem(key,JSON.stringify(cosmeticPlanningPreferences(JSON.parse(storage.getItem(key)??"{}"))));}
        catch{storage.removeItem(key);}
      }
    }
  }
}
