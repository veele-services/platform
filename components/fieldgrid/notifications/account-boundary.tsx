"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cleanAccountBrowserState } from "@/lib/auth/browser-state";
import { isProtectedPage } from "@/lib/auth/session-signal";
import { SessionLoading, type SessionLoadingBrand } from "@/components/fieldgrid/session-loading";

/** Local notification chrome is cleared immediately. The signout route also
 * revokes server device bindings before ending the authenticated session. */
export function NotificationAccountBoundary({renderedSessionKey,brand}:{renderedSessionKey:string|null;brand?:SessionLoadingBrand|null}) {
  const pathname=usePathname();
  const invalidating=useRef<{sessionKey:string|null}|null>(null);
  const [unavailable,setUnavailable]=useState(false);
  useEffect(() => {
    const protectedPage=()=>isProtectedPage(location.pathname);
    const pulse="fieldgrid:account-event";
    let epoch=0,closed=false,submittingLogout=false,request:AbortController|undefined;
    const clean=(resetTransient=true)=>{try{cleanAccountBrowserState(localStorage,sessionStorage,resetTransient);}catch{/* Restricted storage must not prevent logout. */}};
    const hide=()=>{if(protectedPage())document.documentElement.dataset.accountBlocked="true";};
    const notices=()=>{
      navigator.serviceWorker?.controller?.postMessage({type:"CLEAR_ACCOUNT_NOTIFICATIONS"});
      window.dispatchEvent(new Event("notifications-account-cleared"));
    };
    const signal=(phase:"invalidate"|"changed")=>{
      try{localStorage.setItem(pulse,JSON.stringify({phase,nonce:crypto.randomUUID()}));localStorage.removeItem(pulse);}catch{/* Server guards still enforce access. */}
    };
    const invalidate=()=>{invalidating.current={sessionKey:renderedSessionKey};epoch++;request?.abort();clean();notices();hide();};
    const reload=()=>{invalidate();if(protectedPage())location.reload();};
    const check=async(cover=false)=>{
      if(!protectedPage()||closed)return;
      if(cover)hide();
      // Focus and visibility often arrive together. Share the in-flight live
      // check instead of cancelling it and starting the same request again.
      if(request&&!request.signal.aborted)return;
      const active=new AbortController();request=active;const sequence=++epoch;
      const timeout=setTimeout(()=>active.abort(),15000);
      try{
        const response=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:active.signal});
        if(!response.ok)throw new Error("Session unavailable");
        const data=await response.json();
        if(closed||sequence!==epoch)return;
        if(data.sessionKey!==null&&(typeof data.sessionKey!=="string"||!/^[a-f0-9]{64}$/.test(data.sessionKey)))throw new Error("Invalid session signal");
        setUnavailable(false);
        if(data.sessionKey===null||renderedSessionKey!==data.sessionKey){
          invalidate();signal("changed");location.replace(data.sessionKey===null?"/login":location.href);return;
        }
        // Navigation under the same identity cannot undo a pending logout.
        // A later server-rendered, independently verified identity can replace
        // it; otherwise a late login-tab pulse could fence the next user forever.
        if(invalidating.current?.sessionKey===renderedSessionKey)return;
        invalidating.current=null;
        delete document.documentElement.dataset.accountBlocked;
      }catch{if(!closed&&sequence===epoch){hide();setUnavailable(true);}}
      finally{clearTimeout(timeout);if(request===active)request=undefined;}
    };
    clean(false);
    if(pathname==="/login"){invalidating.current=null;clean();notices();signal("changed");delete document.documentElement.dataset.accountBlocked;}
    else if(protectedPage())void check(true);
    else delete document.documentElement.dataset.accountBlocked;
    const clear = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form=event.target;
      const action = new URL(form.action, window.location.href);
      if (action.origin !== window.location.origin || action.pathname !== "/auth/signout") return;
      event.preventDefault();
      submittingLogout=true;
      invalidate();signal("invalidate");
      // React/Next can enhance a form submission and consume the route's 303
      // without committing a document navigation. Complete the server logout
      // first, then make the identity transition explicit. If fetch itself is
      // unavailable, native submit remains a no-JavaScript-compatible fallback.
      void fetch(action.href,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"follow"})
        .then(response=>{
          if(!response.ok){HTMLFormElement.prototype.submit.call(form);return;}
          location.replace("/login");
        },()=>HTMLFormElement.prototype.submit.call(form));
    };
    const changed=(event:StorageEvent)=>{
      if(event.key!==pulse||!event.newValue)return;
      try{
        const value=JSON.parse(event.newValue);
        if(value.phase==="invalidate")invalidate();
        else if(value.phase==="changed"&&!submittingLogout){invalidate();if(protectedPage())location.replace("/login");}
      }catch{}
    };
    const restored=(event:PageTransitionEvent)=>{if(event.persisted&&protectedPage())reload();};
    const focus=()=>{if(document.visibilityState==="visible")void check(true);};
    const leaving=()=>hide();
    const retry=()=>{setUnavailable(false);void check(true);};
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void check();},30000);
    document.addEventListener("submit",clear,true);window.addEventListener("storage",changed);
    window.addEventListener("pagehide",leaving);window.addEventListener("pageshow",restored);window.addEventListener("focus",focus);
    window.addEventListener("fieldgrid-session-retry",retry);document.addEventListener("visibilitychange",focus);
    return () => {closed=true;epoch++;request?.abort();clearInterval(timer);document.removeEventListener("submit",clear,true);window.removeEventListener("storage",changed);window.removeEventListener("pagehide",leaving);window.removeEventListener("pageshow",restored);window.removeEventListener("focus",focus);window.removeEventListener("fieldgrid-session-retry",retry);document.removeEventListener("visibilitychange",focus);};
  }, [pathname,renderedSessionKey]);
  return <div data-account-fence><SessionLoading brand={brand} unavailable={unavailable} onRetry={()=>window.dispatchEvent(new Event("fieldgrid-session-retry"))}/></div>;
}
