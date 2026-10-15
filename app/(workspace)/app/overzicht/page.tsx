import {redirect} from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const q=new URLSearchParams();for(const[k,v]of Object.entries(await searchParams))for(const value of typeof v==='string'?[v]:v||[])q.append(k,value);redirect('/app'+(q.size?'?'+q:''))}
