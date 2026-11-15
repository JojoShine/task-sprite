import { useEffect, useRef, type ReactNode } from 'react';
export function BottomSheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const panel=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=panel.current;const controls=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea,input,select,[tabindex="0"]')||[]);(dialog?.querySelector<HTMLElement>('textarea')||controls()[0])?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}if(event.key==='Tab'){const items=controls();const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};dialog?.addEventListener('keydown',key);return()=>{dialog?.removeEventListener('keydown',key);previous?.focus();}},[]);
  return <div className='bottom-sheet-mask' onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={panel} className='bottom-sheet' role='dialog' aria-modal='true' aria-label={title}><div className='sheet-handle'/>{children}</div></div>;
}
