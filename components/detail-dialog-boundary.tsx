"use client";

import { type ReactNode, useEffect, useRef } from "react";

const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusableElements(dialog:HTMLElement){
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element=>
    !element.hasAttribute("hidden")&&element.getAttribute("aria-hidden")!=="true"&&element.getClientRects().length>0
  );
}

export function DetailDialogBoundary({children}:{children:ReactNode}){
  const boundaryRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const boundary=boundaryRef.current;
    if(!boundary)return;

    let activeDialog:HTMLElement|null=null;
    let previousFocus:HTMLElement|null=null;
    let frame=0;
    const root=document.documentElement;
    const body=document.body;
    const previousRootOverflow=root.style.overflow;
    const previousBodyOverflow=body.style.overflow;

    const focusDialog=(dialog:HTMLElement,preferLast=false)=>{
      const focusables=focusableElements(dialog);
      const target=preferLast?focusables.at(-1):focusables[0];
      if(target){target.focus();return;}
      if(!dialog.hasAttribute("tabindex")){dialog.tabIndex=-1;dialog.dataset.boundaryTabindex="true";}
      dialog.focus();
    };

    const deactivate=()=>{
      const dialog=activeDialog;
      activeDialog=null;
      root.style.overflow=previousRootOverflow;
      body.style.overflow=previousBodyOverflow;
      if(dialog?.dataset.boundaryTabindex==="true"){
        dialog.removeAttribute("tabindex");
        delete dialog.dataset.boundaryTabindex;
      }
      const restore=previousFocus;
      previousFocus=null;
      if(restore?.isConnected){
        cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>restore.focus());
      }
    };

    const activate=(dialog:HTMLElement)=>{
      if(activeDialog===dialog)return;
      if(activeDialog)deactivate();
      previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      activeDialog=dialog;
      root.style.overflow="hidden";
      body.style.overflow="hidden";
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{if(activeDialog===dialog)focusDialog(dialog);});
    };

    const refresh=()=>{
      const dialogs=Array.from(boundary.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      const next=dialogs.at(-1)||null;
      if(next)activate(next);else if(activeDialog)deactivate();
    };

    const onKeyDown=(event:KeyboardEvent)=>{
      const dialog=activeDialog;
      if(!dialog)return;
      if(event.key==="Escape"){
        const close=dialog.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]:not(:disabled)');
        if(close){event.preventDefault();close.click();}
        return;
      }
      if(event.key!=="Tab")return;
      const focusables=focusableElements(dialog);
      if(!focusables.length){event.preventDefault();focusDialog(dialog);return;}
      const first=focusables[0];
      const last=focusables[focusables.length-1];
      const current=document.activeElement;
      if(event.shiftKey&&(current===first||!(current instanceof Node)||!dialog.contains(current))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(current===last||!(current instanceof Node)||!dialog.contains(current))){event.preventDefault();first.focus();}
    };

    const onFocusIn=(event:FocusEvent)=>{
      const dialog=activeDialog;
      if(!dialog)return;
      const target=event.target;
      if(target instanceof Node&&!dialog.contains(target))focusDialog(dialog);
    };

    const observer=new MutationObserver(refresh);
    observer.observe(boundary,{childList:true,subtree:true});
    document.addEventListener("keydown",onKeyDown);
    document.addEventListener("focusin",onFocusIn);
    refresh();

    return()=>{
      observer.disconnect();
      document.removeEventListener("keydown",onKeyDown);
      document.removeEventListener("focusin",onFocusIn);
      cancelAnimationFrame(frame);
      root.style.overflow=previousRootOverflow;
      body.style.overflow=previousBodyOverflow;
    };
  },[]);

  return <div ref={boundaryRef} className="detail-dialog-boundary">{children}</div>;
}
