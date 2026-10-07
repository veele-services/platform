import test from 'node:test';
import assert from 'node:assert/strict';
import{mapInquiry,NotesCapacityError}from './map-inquiry.mjs';
const source=()=>({envelopeVersion:'1.0.0',inquiry:{schemaVersion:'1.0.0',mode:'submission',inquiryId:'test-only',createdAt:'2026-10-07T08:00:00Z',source:'veele-website',locale:'nl-NL',services:['cleaning','security'],contact:{name:'Testpersoon',email:'test@example.com'},tasks:{cleaning:{requestedTasks:['office','glass'],areaM2:125.5,notes:'Regel één\nRegel twee'}},message:'Vrije opmerkingen behouden.'},wizardAnswers:{planningFlexible:false,frequencyLabel:'Meerdere keren per week'}});
const path='/inquiry/contact/name';
test('zonder geverifieerde mappings blijven alle antwoorden leesbaar en blijft false behouden',()=>{
 const s=source(),before=structuredClone(s),r=mapInquiry(s);
 assert.equal(r.nativeAssignments.length,0);assert.equal(r.coverage.totalAnswers,r.coverage.extraAnswers);
 assert.match(r.extraNotes,/Nee \(niet aangevinkt\)/);assert.match(r.extraNotes,/Regel één\nRegel twee/);assert.match(r.extraNotes,/125.5/);
 assert.match(r.extraNotes,/Vrije opmerkingen behouden/);assert.equal(r.metadata.inquiryId,'test-only');assert.deepEqual(s,before);
});
test('volledig ondersteund native veld wordt gekoppeld; rest blijft extra opmerkingen',()=>{
 const r=mapInquiry(source(),{rules:[{verified:true,sources:[path],target:'TEST_ONLY_CONTACT_FIELD',convert:values=>({accepted:true,value:values[path]})}]});
 assert.equal(r.nativeAssignments[0].value,'Testpersoon');assert.equal(r.extraEntries.some(e=>e.path===path),false);
 assert.equal(r.coverage.nativeAnswers+r.coverage.extraAnswers,r.coverage.totalAnswers);
});
test('gedeeltelijk ondersteunde lijst valt volledig terug; geen geselecteerde taak verdwijnt',()=>{
 const p='/inquiry/tasks/cleaning/requestedTasks';
 const r=mapInquiry(source(),{rules:[{verified:true,sources:[p],target:'TEST_ONLY_TASK_FIELD',convert:()=>({accepted:false})}]});
 assert.deepEqual(r.extraEntries.find(e=>e.path===p).value,['office','glass']);assert.equal(r.nativeAssignments.length,0);
});
test('fout in omzetting bewaart het originele antwoord en bestaande opmerkingen',()=>{
 const r=mapInquiry(source(),{existingNotes:'Bestaand\nNiet overschrijven.',rules:[{verified:true,sources:[path],target:'TEST_ONLY_NAME',convert:()=>{throw Error('unknown enum');}}]});
 assert.ok(r.extraNotes.startsWith('Bestaand\nNiet overschrijven.\n\n'));assert.match(r.extraNotes,/Testpersoon/);assert.equal(r.mappingFallbacks[0].reason,'conversion_failed');
});
test('geen stille afkapping bij doelcapaciteit',()=>assert.throws(()=>mapInquiry(source(),{maxNotesCharacters:30}),NotesCapacityError));
test('overlappende doelvelden worden niet overschreven en ongeverifieerde regels afgewezen',()=>{
 const rule={verified:true,sources:[path],target:'TEST_ONLY_NAME',convert:v=>({accepted:true,value:v[path]})};
 assert.throws(()=>mapInquiry(source(),{rules:[{...rule,verified:false}]}));
 assert.throws(()=>mapInquiry(source(),{rules:[rule,rule]}));
});
test('samengestelde mapping bewaart straat en huisnummertoevoeging en consumeert beide',()=>{
 const s=source();s.inquiry.location={street:'Voorbeeldstraat',houseNumber:'12 A'};
 const a='/inquiry/location/street',b='/inquiry/location/houseNumber';
 const r=mapInquiry(s,{rules:[{verified:true,sources:[a,b],target:'TEST_ONLY_FULL_ADDRESS',convert:v=>({accepted:true,value:v[a]+' '+v[b]})}]});
 assert.equal(r.nativeAssignments[0].value,'Voorbeeldstraat 12 A');assert.equal(r.coverage.nativeAnswers,2);
});
test('algemene vraag kan niet door een native regel worden overschreven',()=>assert.throws(()=>mapInquiry(source(),{rules:[{verified:true,sources:['/inquiry/message'],target:'TEST_ONLY_NOTES',convert:()=>({accepted:true,value:'vervangende tekst'})}]})));
