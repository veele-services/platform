import { browserSessionKey } from "@/lib/auth/browser-session";

const privateHeaders={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};

/** Browser invalidation only, never authorization. Data operations still enforce
 * the current live session, tenant and resource in the database. */
export async function GET() {
  try {
    return Response.json({sessionKey:await browserSessionKey()},{headers:privateHeaders});
  } catch {return Response.json({error:"Sessiecontrole tijdelijk niet beschikbaar"},{status:503,headers:privateHeaders});}
}
