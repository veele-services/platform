import {useEffect,useState} from 'react';
import {Eye} from 'lucide-react';
import {Badge} from './ui';
import type {CrmNotificationContext} from './crm-types';

export function PlatformAdminAccount({onOpen}:{onOpen:()=>void}){
  const [account,setAccount]=useState<CrmNotificationContext|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/crm',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error('Account niet beschikbaar');
        const result=await response.json() as {notificationContext?:CrmNotificationContext};
        if(!result.notificationContext)throw new Error('Account niet beschikbaar');
        setAccount(result.notificationContext);
      }).catch(()=>{if(!controller.signal.aborted)setFailed(true)});
    return()=>controller.abort();
  },[]);
  return <tr><td>{account?.recipientName||'Platformbeheerder'}</td><td>{account?.recipientEmail||(failed?'Account kon niet worden opgehaald':account?'Gekoppeld beheeraccount':'Account laden…')}</td><td>Platformbeheerder</td><td><Badge tone={account?.recipientEmail?'success':'neutral'}>{account?.recipientEmail?'Gekoppeld':'Bestaand account'}</Badge></td><td><button type="button" className="fg-action-icon" title="Accountdetails" aria-label="Accountdetails" onClick={onOpen}><Eye size={15}/></button></td></tr>;
}
