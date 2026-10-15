import { Link } from 'react-router-dom';
import CollectionViewer from './CollectionViewer';
import '../petal-pearl.css';
export default function PetalHero() {
  return <section className="pp pp-hero"><div className="pp-intro"><span className="pp-eyebrow">The Petal &amp; Pearl collection</span><h1>A little beauty.<br /><em>Every day.</em></h1><p>Petal contours, soft porcelain glazes and champagne details. Four pieces for moments worth making lovely.</p><Link className="pp-primary" to="/collection/petal-pearl">Explore the collection</Link><small>Original collection concepts for design review.</small></div><CollectionViewer /></section>;
}
