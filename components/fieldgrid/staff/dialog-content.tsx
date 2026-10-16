"use client";

import {Children,cloneElement,isValidElement,useId,type ComponentProps,type ReactElement,type ReactNode} from "react";
import {DialogClose,DialogContent,DialogHeader,DialogFooter} from "@/components/ui/dialog";
import {X} from "lucide-react";
import {useSourcePortal} from "../portals/context";
import { useStaffDialogFocus } from "@/lib/staff/use-dialog-focus";

export function StaffDialogContent({sourceFrame=true,nativeFrame=false,...props}: ComponentProps<typeof DialogContent>&{sourceFrame?:boolean;nativeFrame?:boolean}) {
  const focus = useStaffDialogFocus();
  const source=useSourcePortal();
  const formPrefix=useId();
  if(source&&!nativeFrame){
    const children=Children.toArray(props.children),header=children.filter(child=>isValidElement(child)&&child.type===DialogHeader),footer:ReactNode[]=children.filter(child=>isValidElement(child)&&child.type===DialogFooter);
    const body=children.filter(child=>!isValidElement(child)||![DialogHeader,DialogFooter].includes(child.type as typeof DialogHeader)).map((child,index)=>{
      if(!isValidElement<{id?:string;children?:ReactNode}>(child)||child.type!=='form')return child;
      const fields=Children.toArray(child.props.children),actions=fields.filter(field=>isValidElement(field)&&field.type===DialogFooter);
      if(!actions.length)return child;
      const id=child.props.id||`${formPrefix}-form-${index}`;
      // Keep the real form and submit handler. Native form association lets
      // the source frame hold its actions while long fields scroll separately.
      for(const action of actions){
        const element=action as ReactElement<{children?:ReactNode}>;
        footer.push(cloneElement(element,{key:`${id}-actions`},Children.map(element.props.children,button=>isValidElement<{type?:string;form?:string}>(button)&&button.type==='button'&&button.props.type!=='button'?cloneElement(button,{form:button.props.form||id}):button)));
      }
      return cloneElement(child,{id},fields.filter(field=>!isValidElement(field)||field.type!==DialogFooter));
    });
    const actions=footer.flatMap(node=>isValidElement<{children?:ReactNode}>(node)&&node.type===DialogFooter?Children.toArray(node.props.children):[node]);
    // PWA/onboarding own their native device-specific frame and controls.
    if(sourceFrame&&!header.length)return <DialogContent {...props} aria-modal="true" {...focus}/>;
    return <DialogContent {...props} className={`personnel-app mc-dialog sites-staff-native-dialog ${props.className??''}`} aria-modal="true" {...focus}>{sourceFrame?<div className="mc-dialog-frame"><header><div>{header}</div><DialogClose asChild><button className="fg-action-icon" aria-label="Sluiten"><X size={20}/></button></DialogClose></header><div className="mc-dialog-body sites-native-editor">{body}</div>{actions.length>0&&<footer>{actions}</footer>}</div>:props.children}</DialogContent>;
  }
  return <DialogContent {...props} aria-modal="true" {...focus}/>;
}
