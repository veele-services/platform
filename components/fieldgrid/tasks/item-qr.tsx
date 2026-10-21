"use client";
import {useEffect,useRef,useState} from "react";
import QRCode from "qrcode";
export function ItemQr({id,number}:{id:string;number:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;if(canvas.current)void QRCode.toCanvas(canvas.current,id,{width:180,margin:3,errorCorrectionLevel:"M"}).catch(()=>{if(active)setError("QR kon niet worden getekend; gebruik het interne ID.");});return()=>{active=false;};},[id]);
 return <div className="task-qr"><canvas ref={canvas} role="img" aria-label={`QR voor ${number}`}/>{error&&<p role="status">{error}</p>}<button type="button" className="secondary-button" onClick={()=>{if(!canvas.current)return;const link=document.createElement("a");link.download=`${number}.png`;link.href=canvas.current.toDataURL("image/png");link.click();}}>QR downloaden</button><small>De QR bevat alleen het ondoorzichtige item-ID. Iedere scan vereist opnieuw toegang.</small></div>;
}
