"use client";

import Link from "next/link";
import { usePathname,useRouter } from "next/navigation";
import { useCallback,useEffect,useRef,useState } from "react";
import type { ComponentProps,MouseEvent } from "react";

type IntentLinkProps=Omit<ComponentProps<typeof Link>,"href"|"prefetch">&{href:string};

function plainPrimaryClick(event:MouseEvent<HTMLAnchorElement>){
  return event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey;
}

export function IntentLink({href,onClick,onMouseEnter,onFocus,onTouchStart,...props}:IntentLinkProps){
  const router=useRouter();
  const pathname=usePathname();
  const prefetched=useRef(false);
  const [pending,setPending]=useState(false);
  useEffect(()=>{prefetched.current=false;setPending(false)},[pathname,href]);
  const warm=useCallback(()=>{
    if(prefetched.current)return;
    prefetched.current=true;
    router.prefetch(href);
  },[href,router]);
  return <Link {...props} href={href} prefetch={false}
    aria-busy={pending||undefined}
    data-nav-pending={pending?"true":undefined}
    onClick={event=>{
      if(plainPrimaryClick(event)&&!event.defaultPrevented&&href!==pathname)setPending(true);
      onClick?.(event);
    }}
    onMouseEnter={event=>{warm();onMouseEnter?.(event)}}
    onFocus={event=>{warm();onFocus?.(event)}}
    onTouchStart={event=>{warm();onTouchStart?.(event)}}/>;
}
