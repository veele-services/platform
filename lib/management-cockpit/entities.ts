import {z} from 'zod';
import type {FollowupSource} from './followup';
import type {CustomerList} from '@/lib/customers/model';
import type {Json} from '@/lib/database.types';
export type CustomerCards=Omit<CustomerList,'rows'>&{rows:Array<CustomerList['rows'][number]&{email:string|null;phone:string|null;address:Json}>};
export const entityKind=z.enum(['customer','object','personnel']);
export type EntityKind=z.infer<typeof entityKind>;
export const entityQuerySchema=z.object({kind:entityKind,id:z.uuid()}).strict();
const text=z.string().nullish().transform(v=>v||'');
export const entityWireSchema=z.object({
 profile:z.object({id:z.uuid(),kind:entityKind,number:z.string(),name:z.string(),status:z.string(),contact:text,email:text,phone:text,address:z.record(z.string(),z.json()),customer:text,function:text,note:text,version:z.number().int(),editing:z.record(z.string(),z.unknown()).nullable()}),
 access:z.object({today:z.iso.date(),work:z.boolean(),source:z.boolean(),documents:z.boolean(),followup:z.boolean(),edit:z.boolean()}),
 documents:z.array(z.object({id:z.uuid(),title:z.string(),file:text,version:z.number().int(),date:z.iso.datetime({offset:true})})).max(21),
 orders:z.array(z.object({id:z.uuid(),number:z.string(),title:z.string(),date:z.iso.datetime({offset:true}).nullable(),status:z.string()})).max(21),
 followup:z.unknown().nullable(),asOf:z.iso.datetime({offset:true}),
});
export type EntityDetail=Omit<z.infer<typeof entityWireSchema>,'followup'> & {followup:FollowupSource|null};
export const entityMeta:Record<EntityKind,{title:string;eyebrow:string;path:string;singular:string}>={customer:{title:'Klanten',eyebrow:'RELATIES',path:'/app/klanten',singular:'klant'},object:{title:'Objecten',eyebrow:'LOCATIES',path:'/app/objecten',singular:'object'},personnel:{title:'Personeel',eyebrow:'TEAM',path:'/app/personeel',singular:'medewerker'}};
