"use client";
import {saveTaskCatalogue} from './actions';
/** Keep the same mutation id and editable fields when the response is lost.
 * The native command remains the only authority and deduplicates retries. */
export async function saveCatalogue(input:Parameters<typeof saveTaskCatalogue>[0]):Promise<Awaited<ReturnType<typeof saveTaskCatalogue>>>{
 try{return await saveTaskCatalogue(input)}catch{return{ok:false,error:'Opslaan kon niet worden bevestigd. Je invoer blijft bewaard; controleer de actuele taak voor je opnieuw probeert.'}}
}
