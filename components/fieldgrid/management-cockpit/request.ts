export async function managementRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const form=body instanceof FormData,response=await fetch(path,{method:body?'POST':'GET',headers:body&&!form?{'content-type':'application/json'}:undefined,body:body?form?body:JSON.stringify(body):undefined,signal,cache:'no-store'});
 const result=await response.json();if(!response.ok||result.ok===false)throw Object.assign(new Error(result.error||'De opdracht kon nog niet worden bevestigd.'),{status:response.status,committed:result.committed});return result;
}
