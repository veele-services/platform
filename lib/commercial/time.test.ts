import {describe,it,expect} from 'vitest';
import {commercialDecisionInstant,commercialDecisionLocalTime} from './time';
describe('commercial acceptance time retains publication precision and native DST authority',()=>{
 it.each(['2026-10-15T09:52:37.843Z','2026-12-15T23:59:59.001Z','2026-07-15T23:59:00.000Z'])('round-trips %s exactly through the tenant-local field',instant=>{expect(commercialDecisionInstant(commercialDecisionLocalTime(instant,'Europe/Amsterdam'),'Europe/Amsterdam')).toBe(instant)});
 it('retains manually selected minute values and validates seconds rather than rolling them over',()=>{expect(commercialDecisionInstant('2026-10-15T11:52','Europe/Amsterdam')).toBe('2026-10-15T09:52:00.000Z');for(const value of['2026-10-15T11:52:61','2026-10-15T11:52:10.1234','invalid'])expect(()=>commercialDecisionInstant(value,'Europe/Amsterdam')).toThrow()});
 it('retains the planning rejection of missing and ambiguous local times',()=>{expect(()=>commercialDecisionInstant('2026-03-29T02:30:15.123','Europe/Amsterdam')).toThrow('Dit tijdstip bestaat niet');expect(()=>commercialDecisionInstant('2026-10-25T02:30:15.123','Europe/Amsterdam')).toThrow('Dit tijdstip komt tweemaal voor')});
});
