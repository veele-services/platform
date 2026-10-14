import React from 'react';
import assert from 'node:assert/strict';
import {renderToString} from 'react-dom/server';
import {seed} from '../src/data';
import {Overview,ControlCenter} from '../src/Management';
import {SLAView,FinanceView,IndexationView} from '../src/FinanceSLA';
import {DecisionsView,ComplianceView,ReportsView} from '../src/Governance';
import {OperationalOverview,ExistingTenantPage,PlatformDashboard} from '../src/ExistingDashboards';
import {StaffPortal,CustomerPortalDemo} from '../src/Portals';
import {totals,visibleActions,canDecision,canFinance} from '../src/types';
Object.assign(globalThis,{window:{location:{hash:'#/app/overzicht'},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})},location:{hash:'#/app/overzicht'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
let checked=0;const props={state:structuredClone(seed),setState(){},navigate(){},openSource(){}};
for(const [name,C] of Object.entries({Overview,ControlCenter,SLAView,FinanceView,IndexationView,DecisionsView,ComplianceView,ReportsView,OperationalOverview,StaffPortal,CustomerPortalDemo})){let html=renderToString(<C {...props}/>);assert(html.length>100,`${name} empty`);assert(!html.includes('NaN'),`${name} NaN`);console.log(`${name}: rendered (${html.length} characters)`);checked++}
for(const view of ['planning','werkbonnen','taken','klanten','objecten','personeel','rapporten','facturen','aanvragen','nieuws']){const html=renderToString(<ExistingTenantPage {...props} view={view}/>);assert(html.length>100,view);checked++}
for(const view of ['overview','tenants','onboarding','support','templates']){const html=renderToString(<PlatformDashboard {...props} view={view}/>);assert(html.length>100,view);checked++}
for(const role of ['Planner','Financieel beheer','Kwaliteitsbeheer'] as const){const s={...structuredClone(seed),role};if(!canFinance(role)){assert.equal(visibleActions(s).some(a=>a.type==='Financieel'),false);assert(!renderToString(<FinanceView {...props} state={s}/>).includes('€'))}assert.equal(canDecision(role,'Personeel'),false);renderToString(<Overview {...props} state={s}/>);checked++}
const start=totals(seed);assert.equal(start.confirmed,2100);assert.equal(start.review,735);assert.equal(start.unpaid,5580);const done=structuredClone(seed);done.actions[0].status='done';assert.equal(totals(done).open,start.open-1);const excluded=structuredClone(seed);excluded.revenue.find(r=>r.id==='FIN-04')!.excluded=true;assert.equal(totals(excluded).review,285);assert.equal(excluded.revenue.find(r=>r.id==='FIN-04')!.amount,450);const snoozed=structuredClone(seed);snoozed.actions[0].status='snoozed';snoozed.actions[0].snoozedUntil='2026-10-16';assert.equal(totals(snoozed).open,start.open-1);assert.equal(snoozed.actions[0].originalDue,seed.actions[0].originalDue);console.log(`PASS ${checked} rendered views/roles and shared financial/action invariants`);
