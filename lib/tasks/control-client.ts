"use client";
import {saveTaskControl as saveControl} from "./control-actions";
import {saveTaskVisit as saveVisit} from "./visit-actions";
import {decideTaskNorm as decideNorm,saveTaskNormPolicy as savePolicy} from "./norm-actions";
const lost={ok:false as const,error:"Opslaan kon niet worden bevestigd. Je invoer blijft behouden; controleer de actuele gegevens en probeer opnieuw met dezelfde herhaalsleutel."};
export async function saveTaskControl(input:Parameters<typeof saveControl>[0]){try{return await saveControl(input);}catch{return lost;}}
export async function saveTaskVisit(input:Parameters<typeof saveVisit>[0]){try{return await saveVisit(input);}catch{return lost;}}
export async function decideTaskNorm(input:Parameters<typeof decideNorm>[0]){try{return await decideNorm(input);}catch{return lost;}}
export async function saveTaskNormPolicy(input:Parameters<typeof import("./norm-actions").saveTaskNormPolicy>[0]){try{return await savePolicy(input);}catch{return lost;}}
