import { z } from "zod";
import { getCustomerPortalVisit } from "@/lib/customer-portal/data";
import { CustomerSnapshotError } from "@/lib/customer-portal/snapshot-model";
const querySchema=z.object({account:z.uuid(),visit:z.uuid()}).strict();
const headers={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 const query=new URL(request.url).searchParams,parsed=querySchema.safeParse(Object.fromEntries(query));
 if(!parsed.success||query.getAll("account").length!==1||query.getAll("visit").length!==1)return Response.json({error:"Ongeldige klantafspraak."},{status:400,headers});
 try{return Response.json(await getCustomerPortalVisit(parsed.data.account,parsed.data.visit),{headers});}
 catch(error){const status=error instanceof CustomerSnapshotError?error.status:503;
  return Response.json({error:status===403?"Deze klantafspraak is niet meer toegankelijk.":"De afspraak kon niet worden gecontroleerd."},{status,headers});}
}
