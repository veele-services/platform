import type {Metadata} from 'next';
import SignatureHome from '@/components/fieldgrid/marketing/homes/Signature';
import {headers} from 'next/headers';
import {notFound,permanentRedirect} from 'next/navigation';
import {sectors,products} from '@/lib/marketing/fieldgrid/content';
import {SiteChrome} from '@/components/fieldgrid/marketing/site-chrome';
import {SectorPage,ProductPage} from '@/components/fieldgrid/marketing/detail-pages';
import {BranchesPage,PlatformPage,WorkflowPage,AboutPage,DemoPage,PrivacyPage} from '@/components/fieldgrid/marketing/standard-pages';
import {TrialPage,AppointmentPage} from '@/components/fieldgrid/marketing/conversion-pages';
import {makeMetadata,pageMeta,pageSchema,schemaText} from '@/lib/marketing/fieldgrid/seo';
type Props={params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
const legacy=['signature','horizon','atlas','flow','people'];
const pages={branches:BranchesPage,platform:PlatformPage,werkwijze:WorkflowPage,over:AboutPage,demo:DemoPage,privacy:PrivacyPage};
function resolve(path:string[]){const key=path.join('/');if(path.length===0)return pageMeta[''];if(path.length===2&&path[0]==='branches'){const sector=sectors.find(s=>s.slug===path[1]);if(sector)return{title:sector.metaTitle,description:sector.metaDescription,image:sector.image,sector}}if(path.length===2&&path[0]==='platform'){const product=products.find(p=>p.slug===path[1]);if(product)return{title:product.metaTitle??`${product.name} | Fieldgrid`,description:product.metaDescription??product.intro.slice(0,160),image:product.slug==='onboarding'?'/fieldgrid-site-assets/images/onboarding.webp':'/fieldgrid-site-assets/images/kantoor-planning.webp',product}}if(path.length===1&&pageMeta[key])return pageMeta[key];return null}
export async function generateMetadata({params}:Props):Promise<Metadata>{let{path=[]}=await params;if(legacy.includes(path[0]))path=path.slice(1);const m=resolve(path);return m?{...makeMetadata('/'+path.join('/'),m.title,m.description,m.image),robots:{index:process.env.DEPLOY_TARGET==='production',follow:process.env.DEPLOY_TARGET==='production'}}:{title:'Pagina niet gevonden | Fieldgrid',robots:{index:false,follow:false}}}
export default async function Page({params,searchParams}:Props){const{path=[]}=await params;if(legacy.includes(path[0])){const query=new URLSearchParams();for(const[key,value]of Object.entries(await searchParams))for(const item of typeof value==='string'?[value]:value||[])query.append(key,item);permanentRedirect('/'+path.slice(1).join('/')+(query.size?'?'+query:''))}const m=resolve(path);if(!m)notFound();const nonce=(await headers()).get('x-nonce')??undefined;let content:React.ReactNode;let category:{name:string;path:string}|undefined;
 if(path.length===0)content=<SignatureHome concept="signature"/>;
 else if('sector'in m&&m.sector){content=<SectorPage sector={m.sector} concept="signature"/>;category={name:'Branches',path:'/branches'}}
 else if('product'in m&&m.product){content=<ProductPage product={m.product} concept="signature"/>;category={name:'Het platform',path:'/platform'}}
 else if(path[0]==='proberen')content=<TrialPage/>;
 else if(path[0]==='afspraak')content=<AppointmentPage initialKind={(await searchParams).type==='demo'?'demo':'appointment'}/>;
 else{const Content=pages[path[0] as keyof typeof pages];if(!Content)notFound();content=<Content concept="signature"/>}
 return <SiteChrome><script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{__html:schemaText(pageSchema('/'+path.join('/'),m.title,m.description,category))}}/>{content}</SiteChrome>
}
