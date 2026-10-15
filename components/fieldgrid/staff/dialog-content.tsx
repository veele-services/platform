"use client";

import {Children,isValidElement,type ComponentProps} from "react";
import {DialogClose,DialogContent,DialogHeader,DialogFooter} from "@/components/ui/dialog";
import {X} from "lucide-react";
import {useSourcePortal} from "../portals/context";
import { useStaffDialogFocus } from "@/lib/staff/use-dialog-focus";

export function StaffDialogContent({sourceFrame=true,nativeFrame=false,...props}: ComponentProps<typeof DialogContent>&{sourceFrame?:boolean;nativeFrame?:boolean}) {
  const focus = useStaffDialogFocus();
  const source=useSourcePortal();
  if(source&&!nativeFrame){
    const children=Children.toArray(props.children),header=children.filter(child=>isValidElement(child)&&child.type===DialogHeader),footer=children.filter(child=>isValidElement(child)&&child.type===DialogFooter),body=children.filter(child=>!isValidElement(child)||![DialogHeader,DialogFooter].includes(child.type as typeof DialogHeader));
    // PWA/onboarding own their native device-specific frame and controls.
    if(sourceFrame&&!header.length)return <DialogContent {...props} aria-modal="true" {...focus}/>;
    return <DialogContent {...props} className={`personnel-app mc-dialog sites-staff-native-dialog ${props.className??''}`} aria-modal="true" {...focus}>{sourceFrame?<div className="mc-dialog-frame"><header><div>{header}</div><DialogClose asChild><button className="fg-action-icon" aria-label="Sluiten"><X size={20}/></button></DialogClose></header><div className="mc-dialog-body sites-native-editor">{body}</div>{footer.length>0&&<footer>{footer}</footer>}</div>:props.children}</DialogContent>;
  }
  return <DialogContent {...props} aria-modal="true" {...focus}/>;
}
