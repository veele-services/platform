'use client';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Plus, Minus } from 'lucide-react';
import { useState, useId, type ReactNode } from 'react';
export function Reveal({children,className='',delay=0}:{children:ReactNode;className?:string;delay?:number}){
 const reduced=useReducedMotion();
 return <motion.div className={className} initial={false} whileInView={reduced?undefined:{opacity:[0.35,1],y:[18,0]}} viewport={{once:true,amount:0.12}} transition={{duration:0.6,delay,ease:[0.22,1,0.36,1]}}>{children}</motion.div>;
}
export function ButtonLink({href,children,variant='primary'}:{href:string;children:ReactNode;variant?:'primary'|'outline'|'light'}){return <a href={href} className={`button button-${variant}`}>{children}<ArrowUpRight size={18} aria-hidden="true"/></a>}
export function SectionHeading({eyebrow,title,text,light=false}:{eyebrow:string;title:string;text?:string;light?:boolean}){return <div className={`section-heading ${light?'light':''}`}><span className="eyebrow"><span/>{eyebrow}</span><h2>{title}</h2>{text&&<p>{text}</p>}</div>}
export function FAQ({items}:{items:{q:string;a:string}[]}){const[open,setOpen]=useState<number|null>(0);const uid=useId();return <div className="faq-list">{items.map((x,i)=><div className={`faq-item ${open===i?'open':''}`} key={x.q}><h3><button aria-expanded={open===i} aria-controls={`${uid}-faq-answer-${i}`} onClick={()=>setOpen(open===i?null:i)}>{x.q}{open===i?<Minus size={19}/>:<Plus size={19}/>}</button></h3><div id={`${uid}-faq-answer-${i}`} hidden={open!==i}><p>{x.a}</p></div></div>)}</div>}
