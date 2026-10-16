import type {Metadata,Viewport} from "next";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {HOST_KIND_HEADER} from "@/lib/tenancy/hostname";
export const metadata:Metadata={title:{default:"Fieldgrid",template:"%s"},description:"Je mensen. Je locaties. Alles verbonden.",robots:{index:false,follow:false}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#092848"};
export default async function Layout({children}:{children:React.ReactNode}){
 if((await headers()).get(HOST_KIND_HEADER)!=="marketing")notFound();
 return <html lang="nl" data-scroll-behavior="smooth"><body className="fieldgrid-marketing">{children}</body></html>;
}
