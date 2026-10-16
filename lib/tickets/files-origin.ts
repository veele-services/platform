/** Uploads stay same-origin. Only local development permits HTTP loopback,
 * including the single tenant label required by hostname-bound workspaces. */
export function ticketUploadOrigin(request: Request) {
  const origin=request.headers.get('origin'),host=request.headers.get('host');
  if(!origin||!host)throw new Error('Ongeldige uploadomgeving');
  const parsed=new URL(origin);
  const loopback=(process.env.DEPLOY_TARGET??'local')==='local'&&(
    ['localhost','127.0.0.1'].includes(parsed.hostname)||/^[a-z0-9]+(?:-[a-z0-9]+)*\.localhost$/.test(parsed.hostname)
  );
  if(parsed.host!==host||parsed.username||parsed.password||parsed.origin!==origin||(!loopback&&parsed.protocol!=='https:'))throw new Error('Ongeldige uploadomgeving');
}
