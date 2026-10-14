import type {Metadata} from 'next';
import {siteOrigin} from '@/lib/concepts';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL(siteOrigin),title:{default:'Fieldgrid | Je mensen. Je locaties. Alles verbonden.',template:'%s'},description:'Fieldgrid brengt planning, digitale werkbonnen, objecten en klantcontact samen. Het platform voor dienstverlening op locatie. Probeer nu 30 dagen gratis.',robots:{index:false,follow:false},icons:{icon:'/branding/icon.svg',shortcut:'/branding/icon.svg'},openGraph:{type:'website',locale:'nl_NL',siteName:'Fieldgrid',images:[{url:'/images/horizon.webp',width:1672,height:941,alt:'Fieldgrid verbindt kantoor, medewerkers en klantlocaties'}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="nl"><body>{children}</body></html>}
