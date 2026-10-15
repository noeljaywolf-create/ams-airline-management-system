import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const assets=path.join(root,'public/petal-pearl');
await fs.mkdir(assets,{recursive:true});
await fs.copyFile(path.join(root,'node_modules/three/build/three.min.js'),path.join(assets,'three.min.js'));
await fs.copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(assets,'THREE-LICENSE.txt'));
