"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback,useRef } from "react";
import type { ComponentProps } from "react";

type IntentLinkProps=Omit<ComponentProps<typeof Link>,"href"|"prefetch">&{href:string};

export function IntentLink({href,onMouseEnter,onFocus,onTouchStart,...props}:IntentLinkProps){
  const router=useRouter();
  const prefetched=useRef(false);
  const warm=useCallback(()=>{
    if(prefetched.current)return;
    prefetched.current=true;
    router.prefetch(href);
  },[href,router]);
  return <Link {...props} href={href} prefetch={false}
    onMouseEnter={event=>{warm();onMouseEnter?.(event)}}
    onFocus={event=>{warm();onFocus?.(event)}}
    onTouchStart={event=>{warm();onTouchStart?.(event)}}/>;
}
