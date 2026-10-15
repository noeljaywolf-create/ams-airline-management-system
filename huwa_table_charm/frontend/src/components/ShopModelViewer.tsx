import {useEffect,useRef,useState} from 'react';
import {ProductImage} from './ProductCard';
import type {ProductDetail,Variant} from '../lib/types';
export default function ShopModelViewer({product,variant}:{product:ProductDetail;variant:Variant|null}){
 const [view,setView]=useState<'model'|'photo'>('photo');const frame=useRef<HTMLIFrameElement>(null);
 const sync=()=>frame.current?.contentWindow?.postMessage({type:'huwa-shop-model',slug:product.slug,options:variant?.options||{},title:product.title},window.location.origin);
 useEffect(sync,[product.slug,variant?.id,view]);
 return <div className="h-full flex flex-col bg-[#f6f3ed]">
 <div className="flex gap-2 p-3" role="group" aria-label="Product view">{(['model','photo'] as const).map(v=><button key={v} onClick={()=>setView(v)} aria-pressed={view===v} className={`rounded-full px-4 py-2 text-sm ${view===v?'bg-stone-800 text-white':'bg-white text-stone-700'}`}>{v==='model'?'Explore in 3D':'Product photo'}</button>)}</div>
 <div className="flex-1 min-h-0">{view==='model'?<iframe ref={frame} onLoad={sync} src="/shop-models/index.html" title={`Interactive 3D model of ${product.title}`} className="h-full w-full border-0"/>:<ProductImage key={product.slug} src={variant?.image||product.images[0]} alt={product.title} className="h-full w-full"/>}</div>
 <p className="px-4 py-2 text-[11px] text-stone-500">3D preview based on catalog specifications. Shape and proportions are approximate.</p>
 </div>
}