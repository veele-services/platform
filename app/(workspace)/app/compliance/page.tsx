import {GovernancePage} from '@/components/fieldgrid/management-cockpit/governance-page';
export const metadata={title:'Documenten & compliance',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <GovernancePage module="compliance" searchParams={searchParams}/>}
