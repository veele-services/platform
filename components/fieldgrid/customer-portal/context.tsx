"use client";
import NextLink from 'next/link';
import {createContext,useContext,type ComponentProps} from 'react';
import {customerContentHref} from '@/lib/customer-portal/content-href';
export const CustomerAccountContext=createContext<string|null>(null);
export const useCustomerAccount=()=>useContext(CustomerAccountContext);
export function CustomerContentLink(props:ComponentProps<typeof NextLink>){
 const account=useContext(CustomerAccountContext);
 return <NextLink {...props} href={typeof props.href==='string'?customerContentHref(props.href,account):props.href}/>;
}
