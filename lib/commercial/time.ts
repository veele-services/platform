import {localDateTime,localToInstant} from '@/lib/planning/time';
/** Consent may follow publication within the same minute. Keep the original
 * planning minute/DST contract intact; preserve precision in this one form. */
export function commercialDecisionLocalTime(instant:string,timeZone:string){
 const d=new Date(instant),second=new Intl.DateTimeFormat('en-GB',{timeZone,second:'2-digit'}).format(d).padStart(2,'0');
 return localDateTime(instant,timeZone)+':'+second+'.'+String(d.getUTCMilliseconds()).padStart(3,'0');
}
export function commercialDecisionInstant(value:string,timeZone:string){
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
 if(!match)throw new Error('Vul een volledige datum en tijd in.');
 const base=localToInstant(match[1],timeZone);
 return new Date(Date.parse(base)+Number(match[2]||0)*1000+Number((match[3]||'').padEnd(3,'0'))).toISOString();
}
