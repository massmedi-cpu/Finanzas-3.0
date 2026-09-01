"use client";

import { usePathname,useRouter } from "next/navigation";
import { useEffect,useMemo,useRef,useState } from "react";
import { FinancialIcon,type FinancialIconName } from "@/components/financial-icons";
import { filterAppDestinations,movementSearchHref } from "@/lib/ui/app-destinations";

type SearchItem={id:string;label:string;description:string;group:string;href:string;icon:FinancialIconName};

export function GlobalSearch({open,onOpen,onClose}:{open:boolean;onOpen:()=>void;onClose:()=>void}){
  const pathname=usePathname();
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [activeIndex,setActiveIndex]=useState(0);
  const dialogRef=useRef<HTMLElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const restoreFocusRef=useRef<HTMLElement|null>(null);

  const items=useMemo<SearchItem[]>(()=>{
    const destinations=filterAppDestinations(query).map(item=>({id:`destination-${item.href.replace(/[^a-z0-9]/gi,"-")||"home"}`,label:item.label,description:item.description,group:item.group,href:item.href,icon:item.icon}));
    if(!query.trim())return destinations;
    return [...destinations,{id:"movement-search",label:`Buscar “${query.trim()}”`,description:"Concepto, comercio, importe, etiqueta u OCR",group:"Movimientos",href:movementSearchHref(query),icon:"search"}];
  },[query]);

  useEffect(()=>{
    const handleShortcut=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        open?onClose():onOpen();
      }
    };
    window.addEventListener("keydown",handleShortcut);
    return()=>window.removeEventListener("keydown",handleShortcut);
  },[onClose,onOpen,open]);

  useEffect(()=>{if(open)onClose()},[pathname]);

  useEffect(()=>{
    if(!open)return;
    restoreFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const root=document.documentElement;
    const previousOverflow=root.style.overflow;
    root.style.overflow="hidden";
    setQuery("");
    setActiveIndex(0);
    const frame=requestAnimationFrame(()=>inputRef.current?.focus());
    return()=>{
      cancelAnimationFrame(frame);
      root.style.overflow=previousOverflow;
      requestAnimationFrame(()=>restoreFocusRef.current?.focus());
    };
  },[open]);

  useEffect(()=>setActiveIndex(0),[query]);
  useEffect(()=>{if(activeIndex>=items.length)setActiveIndex(Math.max(0,items.length-1))},[activeIndex,items.length]);

  function choose(item:SearchItem|undefined){
    if(!item)return;
    onClose();
    router.push(item.href);
  }

  function handleDialogKeyDown(event:React.KeyboardEvent){
    if(event.key==="Escape"){event.preventDefault();onClose();return;}
    if(event.key==="ArrowDown"){event.preventDefault();setActiveIndex(index=>items.length?(index+1)%items.length:0);return;}
    if(event.key==="ArrowUp"){event.preventDefault();setActiveIndex(index=>items.length?(index-1+items.length)%items.length:0);return;}
    if(event.key==="Enter"){event.preventDefault();choose(items[activeIndex]);return;}
    if(event.key!=="Tab")return;
    const focusable=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[]);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  if(!open)return null;
  return <>
    <button className="global-search-backdrop" type="button" aria-label="Cerrar búsqueda global" onClick={onClose}/>
    <section ref={dialogRef} id="global-search-dialog" className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title" onKeyDown={handleDialogKeyDown}>
      <div className="global-search-heading">
        <div><p className="eyebrow">ACCESO RÁPIDO</p><h2 id="global-search-title">¿Dónde quieres ir?</h2></div>
        <button className="icon-button" type="button" aria-label="Cerrar búsqueda" onClick={onClose}><FinancialIcon name="close"/></button>
      </div>
      <label className="global-search-field" htmlFor="global-search-input">
        <FinancialIcon name="search"/>
        <input ref={inputRef} id="global-search-input" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Sección, función o movimiento…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="global-search-results" aria-expanded="true" aria-activedescendant={items[activeIndex]?.id}/>
        <kbd>Esc</kbd>
      </label>
      <div id="global-search-results" className="global-search-results" role="listbox" aria-label="Resultados">
        {items.map((item,index)=><button key={`${item.id}-${item.href}`} id={item.id} type="button" role="option" aria-selected={index===activeIndex} className={`global-search-result${index===activeIndex?" active":""}`} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>choose(item)}>
          <span className="global-search-result-icon"><FinancialIcon name={item.icon} active={index===activeIndex}/></span>
          <span className="global-search-result-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
          <span className="global-search-result-meta">{item.group}</span>
          <FinancialIcon className="global-search-result-arrow" name="chevron-right"/>
        </button>)}
      </div>
      <footer className="global-search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> mover</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span></footer>
    </section>
  </>;
}
