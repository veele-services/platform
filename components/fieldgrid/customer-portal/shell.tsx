"use client";
import {CustomerContentLink as Link,CustomerAccountContext} from './context';
import {useRouter} from 'next/navigation';
import {useSyncExternalStore,type ReactNode} from 'react';
import {Bell,BookOpen,Building2,CalendarDays,Clock3,FileText,Info,MoreHorizontal,Newspaper,Sparkles,Ticket,UserRound,Wallet} from 'lucide-react';
import type {CustomerView,CustomerWorkspace} from '@/lib/customer-portal/model';
import {customerInitials} from '@/lib/customer-portal/presentation';
import {portalThemeStyle} from '@/lib/branding/palette';
import {GuideBanner} from '../guides/guide';
import {TenantThemeProvider} from '../tenant-theme';
import {FieldgridBrand} from '../brand';
import {AccountMenu} from '../account-menu';
import {SourcePortalFrame} from '../portals/source-frame';

export const customerNavigation=[
 ['dashboard',CalendarDays,'Cockpit'],['objects',Building2,'Mijn objecten'],['appointments',Clock3,'Mijn afspraken'],['reports',FileText,'Rapporten'],
 ['invoices',Wallet,'Facturen'],['requests',Sparkles,'Diensten & aanvragen'],['tickets',Ticket,'Tickets'],['news',Newspaper,'Nieuws'],['profile',UserRound,'Mijn gegevens'],
] as const;
export type CustomerShellView=CustomerView|'notifications'|'more'|'knowledge'|'updates';
const mobileNavigation=[['dashboard',CalendarDays,'Cockpit'],['objects',Building2,'Objecten'],['appointments',Clock3,'Afspraken'],['invoices',Wallet,'Facturen'],['more',MoreHorizontal,'Meer']] as const;
const onlineSubscribe=(notify:()=>void)=>{window.addEventListener('online',notify);window.addEventListener('offline',notify);return()=>{window.removeEventListener('online',notify);window.removeEventListener('offline',notify);};};
const onlineSnapshot=()=>navigator.onLine,onlineServer=()=>true;

/** One supplied customer shell for the main portal and independent content
 * routes. The selected native account is explicit; this component grants none. */
export function CustomerShell({workspace,tenantId,view,navigate,preferences,chooseAccount,notifications,activeTickets=0,stale=false,children,overlays}:{
 workspace:CustomerWorkspace;tenantId:string;view:CustomerShellView;navigate:(view:CustomerView|'notifications'|'more')=>void;preferences:()=>void;chooseAccount?:()=>void;
 notifications?:ReactNode;activeTickets?:number;stale?:boolean;children:ReactNode;overlays?:ReactNode;
}){
 const {tenant,profile}=workspace,online=useSyncExternalStore(onlineSubscribe,onlineSnapshot,onlineServer);
 const logo=tenant.hasLogo?`/api/branding/${tenantId}/email-logo`:null,brand=(mobile=false)=><span className={`wordmark ${mobile?'mobile-brand':''}`}><FieldgridBrand tenantName={tenant.name} logoUrl={logo}/></span>;
 const title=customerNavigation.find(([id])=>id===view)?.[2]??({more:'Meer',knowledge:'Kennisbank',updates:'Wat is er nieuw?',notifications:'Meldingen'} as Record<string,string>)[view];
 const nav=(items:typeof customerNavigation[number][])=>items.map(([id,Icon,label])=><button key={id} type="button" className={view===id?'active':''} title={label} aria-current={view===id?'page':undefined} onClick={()=>navigate(id)}><Icon aria-hidden="true"/><span>{label}</span>{id==='tickets'&&activeTickets>0&&<span className="nav-count">{activeTickets}</span>}</button>);
 return <CustomerAccountContext.Provider value={workspace.account.id}><TenantThemeProvider primary={tenant.primaryColor} accent={tenant.accentColor}><SourcePortalFrame><div className="customer-portal portal-demo" style={portalThemeStyle(tenant.primaryColor,tenant.accentColor)}><div className="customer-portal-root">
 <aside className="sidebar"><div className="brand-block">{brand()}<small>KLANTPORTAAL</small></div><nav className="nav-group" aria-label="Hoofdnavigatie"><Link href="/klant/kennisbank" className={view==='knowledge'?'active':''} aria-current={view==='knowledge'?'page':undefined}><BookOpen/><span>Kennisbank</span></Link><Link href="/klant/updates" className={view==='updates'?'active':''} aria-current={view==='updates'?'page':undefined}><Sparkles/><span>Wat is er nieuw?</span></Link>{nav(customerNavigation.slice(0,6))}</nav><div className="nav-label">Contact & organisatie</div><nav className="nav-group" aria-label="Contact en organisatie">{nav(customerNavigation.slice(6))}</nav>
 <div className="sidebar-bottom"><div className="tenant-caption">Mijn account</div><button type="button" className="person full" onClick={()=>navigate('profile')}><span className="avatar">{customerInitials(profile.fullName)}</span><div><strong>{profile.fullName}</strong><small>Klant · {profile.company}</small></div></button></div></aside>
 <div className="shell"><header className="topbar"><div className="header-left">{brand(true)}<span className={`connection-indicator ${!online||stale?'offline':''}`} role="status" aria-label={!online?'Offline':stale?'Gegevens opnieuw controleren':'Online'} title={!online?'Offline':stale?'Gegevens opnieuw controleren':'Online'}><i/></span><div className="breadcrumb">Mijn omgeving <span>/</span><b>{title}</b></div></div><div className="top-actions">{notifications??<button type="button" className="portal-demo-icon" aria-label="Meldingen" onClick={()=>navigate('notifications')}><Bell size={18}/></button>}<AccountMenu name={profile.fullName} email={profile.email} role="Klant" triggerLabel="Profielmenu openen" profileLabel="Mijn gegevens" preferencesLabel="Notificaties" onProfile={()=>navigate('profile')} onPreferences={preferences} additionalActions={chooseAccount?[{label:'Ander klantaccount kiezen',icon:<Building2/>,onSelect:chooseAccount}]:[]}/></div></header>
 <main className="page customer-page" id="customer-main-content"><GuideBanner guideKey={`customer.${view==='requests'?'services':view}`}/>{!online&&<div className="banner"><Info/><p>Je bent offline. Je invoer blijft in dit venster staan; opslaan en actuele gegevens vereisen verbinding.</p></div>}{children}</main><footer className="portal-footer"><span>{tenant.name} · Zorg voor jouw objecten</span>{!tenant.whiteLabel&&<span>Powered by Fieldgrid</span>}</footer></div>
 <nav className="bottomnav" aria-label="Mobiele navigatie">{mobileNavigation.map(([id,Icon,label])=><button type="button" key={id} className={view===id?'active':''} aria-current={view===id?'page':undefined} onClick={()=>navigate(id)}><Icon/><span>{label}</span></button>)}</nav>{overlays}</div></div></SourcePortalFrame></TenantThemeProvider></CustomerAccountContext.Provider>;
}

export function CustomerInformationShell({workspace,tenantId,active,children}:{workspace:CustomerWorkspace;tenantId:string;active:'knowledge'|'updates';children:ReactNode}){
 const router=useRouter(),navigate=(view:CustomerView|'notifications'|'more')=>router.push(`/klant?${new URLSearchParams({account:workspace.account.id,view})}`);
 return <CustomerShell workspace={workspace} tenantId={tenantId} view={active} navigate={navigate} preferences={()=>navigate('profile')}>{children}</CustomerShell>;
}
