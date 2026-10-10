/** Knowledge links are inert text unless they use a bounded article path.
 * Ordinary user text is always rendered by React, never as HTML. */
export function TicketMessageBody({body}:{body:string}) {
  const pattern=/((?:(?:https:\/\/[^\s/]+|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)?)\/(?:platform|app|staff|klant)\/kennisbank\/[a-z0-9]+(?:-[a-z0-9]+)*)/g;
  return <>{body.split(pattern).map((part,index)=>{
    if(!part||!/^((?:https:\/\/[^\s/]+|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)?)\/(?:platform|app|staff|klant)\/kennisbank\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))return part;
    try { const url=new URL(part,"https://local.fieldgrid.invalid");if(url.username||url.password)return part; }catch{return part;}
    return <a key={index} className="text-link" href={part} target="_blank" rel="noopener noreferrer">Kennisbankartikel openen</a>;
  })}</>;
}
