import {describe,expect,it} from 'vitest';
import {appointmentIcs} from './ics';
import type {CrmAppointment,CrmLead} from './types';

const appointment:CrmAppointment={id:'8b05cb80-e088-4868-8e5c-f0d50a434124',leadId:'8b05cb80-e088-4868-8e5c-f0d50a434125',requestId:null,revision:3,date:'2026-10-25',time:'02:30',endTime:'03:00',startsAt:'2026-10-25T01:30:00Z',endsAt:'2026-10-25T02:00:00Z',status:'confirmed',location:'telephone',isDemo:false,createdAt:'2026-10-15T08:00:00Z'};
const lead:CrmLead={id:appointment.leadId,revision:1,name:'Fictief contact',company:'Fictief bedrijf',email:'test@crm-fixture.invalid',phone:'0612345678',sector:'',team:'',stage:'scheduled',owner:'',nextActionAt:null,value:0,source:'website',isDemo:false,createdAt:'2026-10-15T08:00:00Z',updatedAt:'2026-10-15T08:00:00Z'};
describe('calendar export',()=>{
 it('uses the stored UTC instant during the ambiguous Amsterdam autumn hour',()=>{
  const ics=appointmentIcs(appointment,lead,new Date('2026-10-15T08:00:00Z'));
  expect(ics).toContain('DTSTART:20261025T013000Z\r\nDTEND:20261025T020000Z');
  expect(ics).toContain(`UID:${appointment.id}@fieldgrid.nl`);expect(ics).toContain('LOCATION:Telefonisch');expect(ics).toContain('STATUS:CONFIRMED');
  expect(appointmentIcs({...appointment,status:'cancelled'},lead)).toContain('STATUS:CANCELLED');
  expect(appointmentIcs({...appointment,status:'requested'},lead)).toContain('STATUS:TENTATIVE');
 });
 it('escapes content and folds multibyte lines without allowing injected calendar properties',()=>{
  const ics=appointmentIcs(appointment,{...lead,company:'Fictief, bedrijf; \\ '+ 'é'.repeat(130),name:'Fictief\rATTENDEE:intruder\r\nBEGIN:VEVENT\nEND:VEVENT'});
  expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  expect(ics).not.toMatch(/^ATTENDEE:/m);expect(ics).toContain('Fictief\\, bedrijf\\; \\\\');
  for(const line of ics.split('\r\n'))expect(Buffer.byteLength(line,'utf8')).toBeLessThanOrEqual(75);
  expect(ics).not.toContain('�');expect(ics.endsWith('\r\n')).toBe(true);
 });
});
