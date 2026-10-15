/** Preserve the explicit account selector on customer content navigation.
 * This is presentation context only; every server read still authorizes it. */
export function customerContentHref(path:string,account:string|null|undefined){
 if(!account||!/^\/klant\/(?:kennisbank|updates)(?:[/?#]|$)/.test(path))return path;
 const url=new URL(path,'https://fieldgrid-content.invalid');
 url.searchParams.set('account',account);
 return url.pathname+url.search+url.hash;
}
