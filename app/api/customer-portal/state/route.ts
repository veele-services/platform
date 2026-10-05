import { z } from "zod";
import { getCustomerPortalCoreSnapshot } from "@/lib/customer-portal/data";
import { CustomerSnapshotError } from "@/lib/customer-portal/snapshot-model";

const querySchema=z.object({account:z.uuid()}).strict();
const headers={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 const query=new URL(request.url).searchParams,parsed=querySchema.safeParse(Object.fromEntries(query));
 if(!parsed.success||query.getAll("account").length!==1)return Response.json({error:"Ongeldige klantselectie."},{status:400,headers});
 try{return Response.json(await getCustomerPortalCoreSnapshot(parsed.data.account),{headers});}
 catch(error){const status=error instanceof CustomerSnapshotError?error.status:503;
  return Response.json({error:status===403?"Je klanttoegang is gewijzigd.":"Je gegevens konden niet opnieuw worden gecontroleerd."},{status,headers});}
}
