import type {CrmSettings} from '../src/crm-types';
export const DEFAULT_CRM_SETTINGS:CrmSettings = {weekdays:[1,2,3,4,5],startTime:'09:00',endTime:'17:00',durationMinutes:30,bufferMinutes:15,leadTimeHours:4,horizonDays:60,blockedDates:[],emailEnabled:true,timezone:'Europe/Amsterdam'};
export function validDate(value:string):boolean {if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;}
export function validTime(value:string):boolean {return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function minutes(value:string){return Number(value.slice(0,2))*60+Number(value.slice(3));}
export function timeString(value:number){return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;}
export function amsterdamParts(value:Date){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);const get=(key:string)=>p.find(x=>x.type===key)?.value||'';return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};}
// Round-trip conversion handles CET/CEST and refuses nonexistent local times.
export function localToUtc(date:string,time:string):Date|null {if(!validDate(date)||!validTime(time))return null;const wall=Date.parse(`${date}T${time}:00Z`);for(const offset of [2,1]){const d=new Date(wall-offset*3600000);const p=amsterdamParts(d);if(p.date===date&&p.time===time)return d;}return null;}
export function reservationSlots(date:string,time:string,settings:CrmSettings):string[]{const start=localToUtc(date,time);if(!start)return[];return Array.from({length:(settings.durationMinutes+settings.bufferMinutes)/15},(_,i)=>new Date(start.valueOf()+i*900000).toISOString());}
export function availableSlots(date:string,settings:CrmSettings,occupied:Iterable<string>,now=new Date()):string[]{
 if(!validDate(date))return[];
 const today=amsterdamParts(now).date; const dayDistance=(Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;
 if(dayDistance<0||dayDistance>settings.horizonDays||settings.blockedDates.includes(date)||!settings.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()))return[];
 const taken=new Set(occupied),out:string[]=[];
 for(let m=minutes(settings.startTime);m+settings.durationMinutes<=minutes(settings.endTime);m+=settings.durationMinutes+settings.bufferMinutes){
  const time=timeString(m),utc=localToUtc(date,time);if(!utc||utc.valueOf()<now.valueOf()+settings.leadTimeHours*3600000)continue;
  if(reservationSlots(date,time,settings).every(s=>!taken.has(s)))out.push(time);
 }
 return out;
}
