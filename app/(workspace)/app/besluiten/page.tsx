import {GovernancePage} from '@/components/fieldgrid/management-cockpit/governance-page';
export const metadata={title:'Beslisnotities',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <GovernancePage module="decisions" searchParams={searchParams}/>}
