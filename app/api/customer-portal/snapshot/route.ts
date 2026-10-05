import { z } from "zod";
import { getCustomerPortalBaseSnapshot } from "@/lib/customer-portal/data";

const querySchema=z.object({account:z.uuid()}).strict();
const headers={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 const query=new URL(request.url).searchParams;
 const parsed=querySchema.safeParse(Object.fromEntries(query));
 if(!parsed.success||query.getAll("account").length!==1)return Response.json({error:"Ongeldige klantselectie."},{status:400,headers});
 try{return Response.json(await getCustomerPortalBaseSnapshot(parsed.data.account),{headers});}
 catch{return Response.json({error:"Je klantgegevens zijn niet beschikbaar. Controleer je actuele toegang."},{status:403,headers});}
}
