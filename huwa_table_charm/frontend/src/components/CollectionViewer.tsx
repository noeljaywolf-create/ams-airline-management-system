import { useEffect, useRef } from 'react';
export type CharmObject = 'collection' | 'pitcher' | 'cup' | 'bowl' | 'plate';
export type CharmFinish = 'kiln' | 'chalk' | 'basalt' | 'sage';
export default function CollectionViewer({ object = 'collection', finish = 'kiln' }: { object?: CharmObject; finish?: CharmFinish }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sync = () => frame.current?.contentWindow?.postMessage({ type: 'huwa-model', object, finish }, window.location.origin);
  useEffect(sync, [object, finish]);
  return <iframe ref={frame} onLoad={sync} title="Interactive Petal and Pearl porcelain collection. Drag to rotate." src="/petal-pearl/studio.html" className="pp-viewer" />;
}
