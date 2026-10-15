/* HUWA original catalog models. Meshes are approximate previews, not manufacturing CAD. */
(() => {
const T=THREE,stage=document.querySelector('#stage'),status=document.querySelector('#status');
let renderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{status.textContent='3D is unavailable on this device. Use Product photo.';return;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;stage.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.01,200);scene.background=new T.Color('#f6f3ed');
scene.add(new T.HemisphereLight(0xfff6e8,0x98887b,2.1));
const light=new T.DirectionalLight(0xffeed7,4);light.position.set(5,8,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-10;light.shadow.camera.right=10;light.shadow.camera.top=10;light.shadow.camera.bottom=-10;light.shadow.bias=-.0003;scene.add(light);
const fill=new T.DirectionalLight(0xe1efff,2);fill.position.set(-5,4,-4);scene.add(fill);
const env=new T.Scene();env.background=new T.Color('#c5b9a7');for(const [x,y,z,w,h] of [[0,5,0,8,8],[5,2,0,4,6],[-5,2,2,4,6]]){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);env.add(m)}
const pmrem=new T.PMREMGenerator(renderer);const environment=pmrem.fromScene(env,.1);scene.environment=environment.texture;pmrem.dispose();
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f6f3ed',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
let needsRender=true;let model=new T.Group();scene.add(model);let yaw=.5,pitch=.65,distance=10,baseDistance=10,spin=false,target=new T.Vector3(),currentSlug='',currentOptions={};
const material=(color,metalness=0,roughness=.25)=>new T.MeshStandardMaterial({color,metalness,roughness});
const ceramic=material('#f0eee3',.05,.2),steel=material('#c4c8c8',.85,.21),dark=material('#353737',.45,.33),gold=material('#c6a363',.75,.22),wood=material('#a66f39',0,.65),linen=material('#e5ddca',0,.95),glass=new T.MeshPhysicalMaterial({color:'#d2e5df',transparent:true,opacity:.38,roughness:.08,metalness:.1,side:T.DoubleSide,depthWrite:false});
function mesh(g,m,x=0,y=0,z=0,parent=model){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=!m.transparent;o.receiveShadow=true;parent.add(o);return o;}
function lathe(profile,m,x=0,y=0,z=0,parent=model){return mesh(new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),80),m,x,y,z,parent)}
function ring(r,t,m,x=0,y=0,z=0,parent=model){const o=mesh(new T.TorusGeometry(r,t,12,96),m,x,y,z,parent);o.rotation.x=Math.PI/2;return o;}
function box(w,h,d,m,x=0,y=0,z=0,parent=model){return mesh(new T.BoxGeometry(w,h,d,3,1,3),m,x,y,z,parent);}
function tube(points,r,m,parent=model){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),points.length===2?1:32,r,8,false),m,0,0,0,parent)}
function vessel(r,h,m,x=0,z=0,parent=model){return lathe([[0,0],[r*.82,0],[r*.9,.08],[r,h],[r-.06,h],[r*.84,.12],[0,.12]],m,x,0,z,parent)}
function plate(r,m,x=0,y=0,z=0,parent=model){return lathe([[0,0],[r*.65,0],[r*.96,.08],[r,.16],[r,.2],[r*.7,.12],[0,.12]],m,x,y,z,parent)}
function bowl(r,h,m,x=0,y=0,z=0,parent=model){return lathe([[0,0],[r*.38,0],[r*.6,h*.2],[r*.86,h*.65],[r,h],[r-.065,h],[r*.8,h*.65],[r*.5,.12],[0,.12]],m,x,y,z,parent)}
function handle(r,h,m,x=0,z=0,parent=model){tube([[x+r*.94,h*.8,z],[x+r*1.65,h*.88,z],[x+r*1.7,h*.37,z],[x+r*.95,h*.22,z]],.075,m,parent)}
function tray(w,d,h,m,x=0,z=0){box(w,.08,d,m,x,.04,z);box(w,h,.08,m,x,h/2,z+d/2);box(w,h,.08,m,x,h/2,z-d/2);box(.08,h,d,m,x-w/2,h/2,z);box(.08,h,d,m,x+w/2,h/2,z);}
function cutlery(kind,x,z,m=steel,scale=1){const g=new T.Group();model.add(g);g.position.set(x,.12,z);g.scale.setScalar(scale);const stem=box(.13,.07,1.2,m,0,0,.3,g);if(kind==='spoon'){const s=mesh(new T.SphereGeometry(.27,24,12),m,0,.035,-.55,g);s.scale.set(1,.18,1.4)}else if(kind==='fork'){box(.4,.06,.23,m,0,0,-.45,g);for(let i=0;i<4;i++)box(.052,.055,.4,m,-.16+i*.105,0,-.74,g)}else box(.27,.06,.75,m,.07,0,-.65,g);return g;}
function make(slug,options){
for(const o of [...model.children]){model.remove(o);o.traverse(n=>n.geometry?.dispose())}currentSlug=slug;currentOptions=options;
const color=(options.color||options.finish||'').toLowerCase();const cm=color.includes('blue')?material('#668caf',.05,.22):color.includes('grey')?material('#a3a5a0',.02,.3):ceramic;
const metal=color.includes('black')?dark:steel;const size=parseFloat(options.size)||24;
if(slug.startsWith('tc-')){
const name=slug.slice(3),isAngelic=name.includes('angelic'),m=isAngelic?ceramic:name.includes('domino')?material('#dddcd7',0,.25):name.includes('victoria')?ceramic:glass;
function flutedPlate(r,x=0,y=0,z=0){const dish=plate(r,m,x,y,z);if(isAngelic){dish.geometry.dispose();dish.geometry=new T.LatheGeometry([[0,0],[r*.65,0],[r*.96,.08],[r,.16],[r,.2],[r*.7,.12],[0,.12]].map(([radius,h])=>new T.Vector2(radius,h)),256);const p=dish.geometry.attributes.position;for(let i=0;i<p.count;i++){const radius=Math.hypot(p.getX(i),p.getZ(i));if(radius>r*.72&&p.getY(i)>.1){const angle=Math.atan2(p.getZ(i),p.getX(i));p.setY(i,p.getY(i)+.009*Math.cos(angle*64)*(radius/r-.72)/.28);}}dish.geometry.computeVertexNormals();ring(r-.025,.018,gold,x,y+.19,z);}}
if(name.includes('stainless-steel')){const r=parseFloat(name)/20,h=r*.95;vessel(r,h,steel);for(const sign of [-1,1])tube([[sign*r*.9,h*.76,0],[sign*r*1.3,h*.85,.22],[sign*r*1.3,h*.85,-.22],[sign*r*.9,h*.76,-.12]],.06,steel);lathe([[0,h+.18],[r*.7,h+.13],[r,h+.03],[r,h],[0,h]],steel);tube([[-.2,h+.16,0],[-.16,h+.32,0],[.16,h+.32,0],[.2,h+.16,0]],.045,steel);
}else if(name.includes('plate')){const r=(parseFloat(name.match(/([0-9]+)cm/)?.[1])||27)/20;for(let i=0;i<6;i++)flutedPlate(r,0,i*.105);if(name.includes('domino'))for(let i=0;i<6;i++)ring(r*.97,.018,dark,0,i*.105+.18);
}else if(name.includes('teacup')){for(let i=0;i<6;i++){const x=(i%3-1)*1.45,z=(Math.floor(i/3)-.5)*1.55;flutedPlate(.65,x,0,z);vessel(.37,.53,m,x,z);handle(.37,.53,m,x,z);ring(.37,.015,gold,x,.53,z)}}
else if(name.includes('teapot')){lathe([[0,0],[.5,0],[.8,.35],[.78,.8],[.48,1.05],[.45,1.1],[.39,1.1],[.42,1.02],[.7,.77],[.72,.35],[.46,.1],[0,.1]],m);handle(.8,1.05,m);tube([[-.65,.45,0],[-1.1,.65,0],[-1.3,1.02,0]],.12,m);lathe([[0,1.19],[.46,1.13],[.46,1.09],[0,1.09]],m);mesh(new T.SphereGeometry(.08,20,12),gold,0,1.23,0);ring(.45,.014,gold,0,1.12)}
else if(name.includes('jug')){vessel(.65,1.65,glass);handle(.65,1.65,glass);ring(.65,.025,glass,0,1.65);for(let i=0;i<24;i++){const a=i*Math.PI/12;tube([[Math.cos(a)*.6,.1,Math.sin(a)*.6],[Math.cos(a)*.65,1.55,Math.sin(a)*.65]],.016,glass)}}
else if(name.includes('decanter')){lathe([[0,0],[.62,0],[.66,.18],[.61,1.05],[.24,1.5],[.24,1.82],[.19,1.82],[.19,1.5],[.55,1.04],[.6,.18],[0,.1]],glass);mesh(new T.SphereGeometry(.24,24,16),glass,0,2.02);for(let i=0;i<24;i++){const a=i*Math.PI/12;tube([[Math.cos(a)*.64,.15,Math.sin(a)*.64],[Math.cos(a)*.6,1.05,Math.sin(a)*.6]],.016,glass)}}
else if(name.includes('ice-bucket')){vessel(.9,1.1,glass);for(const sign of [-1,1])tube([[sign*.86,.85,0],[sign*1.15,.95,0],[sign*1.15,.6,0],[sign*.86,.65,0]],.05,glass);tube([[-.5,.12,1.3],[0,.2,1.7],[.5,.12,1.3]],.035,steel)}
else if(name.includes('tumblers')){for(let i=0;i<6;i++){const x=(i%3-1)*1.15,z=(Math.floor(i/3)-.5)*1.2;vessel(.4,.92,glass,x,z);for(let j=0;j<16;j++){const a=j*Math.PI/8;tube([[x+Math.cos(a)*.36,.1,z+Math.sin(a)*.36],[x+Math.cos(a)*.4,.86,z+Math.sin(a)*.4]],.013,glass)}}}
else if(name.includes('ice-cream')){for(let i=0;i<6;i++){const x=(i%3-1)*1.2,z=(Math.floor(i/3)-.5)*1.2;plate(.32,glass,x,0,z);mesh(new T.CylinderGeometry(.07,.09,.25,24),glass,x,.2,z);bowl(.5,.42,glass,x,.3,z)}}
else{const count=name.includes('salad')?1:6;for(let i=0;i<count;i++){bowl(count===1?.95:.65,.5,m,(i%3-1)*1.5,0,Math.floor(i/3)*1.5);if(isAngelic)ring(count===1?.95:.65,.015,gold,(i%3-1)*1.5,.5,Math.floor(i/3)*1.5)}}
}else if(slug==='ceramic-non-stick-frying-pan'){
const r=size/20;lathe([[0,0],[r*.85,0],[r,.12],[r,.33],[r-.05,.33],[r*.82,.09],[0,.09]],ceramic);plate(r*.8,dark,0,.015);box(.28,.18,1.65,dark,0,.26,r+ .7);ring(.065,.024,steel,0,.35,r+1.42);
}else if(slug==='cast-iron-dutch-oven'||slug==='stainless-steel-saucepans'){
const r=size/22,h=r*.8,m=slug.includes('cast')?material('#315c58',.25,.3):steel;vessel(r,h,m);
if(slug.includes('cast')){for(const sign of [-1,1])tube([[sign*r*.9,h*.7,0],[sign*r*1.35,h*.7,.1],[sign*r*1.35,h*.7,-.25],[sign*r*.9,h*.7,-.2]],.07,m)}else box(.23,.16,1.7,steel,0,h*.7,r+.75);
lathe([[0,h+.2],[r*.7,h+.18],[r,h+.04],[r,h],[0,h]],m);mesh(new T.SphereGeometry(.14,24,12),dark,0,h+.27);
}else if(slug==='porcelain-dinner-set-12pc'){
for(let i=0;i<4;i++){plate(1.1,cm,-1.3,i*.1,-.5);plate(.76,cm,1.05,i*.09,-.65);bowl(.65,.5,cm,.5,i*.14,1)}
}else if(slug==='stoneware-bowls-set-4'){
for(let i=0;i<4;i++)bowl(.8,.65,cm,(i%2)*1.85-.9,0,Math.floor(i/2)*1.85-.9);
}else if(slug==='ceramic-charger-plates-set-6'){
for(let i=0;i<6;i++){plate(1.45,ceramic,0,i*.1);if(color.includes('gold'))ring(1.4,.025,gold,0,i*.1+.2)}
}else if(slug==='ceramic-serving-platter-set-3'){
for(let i=0;i<3;i++){const p=plate(1.2-i*.17,cm,(i-1)*1.4,i*.1,(i-1)*.6);p.scale.z=.62;}
}else if(slug==='non-stick-baking-tray'){
const large=(options.size||'').includes('45');tray(large?4.5:3.4,large?3.2:2.4,.19,dark);
}else if(slug==='silicone-muffin-tray-12'){
const silicone=material('#648bac',0,.8);box(3.45,.06,2.6,silicone,0,.45);for(let i=0;i<12;i++){const x=(i%4-1.5)*.78,z=(Math.floor(i/4)-1)*.8;lathe([[0,0],[.22,0],[.35,.45],[.28,.45],[.17,.08],[0,.08]],silicone,x,0,z);mesh(new T.CircleGeometry(.28,32),dark,x,.455,z).rotation.x=-Math.PI/2;}
}else if(slug==='carbon-steel-cake-pie-pans-set-4'){
vessel(.75,.55,dark,-1.1,-1);tray(1.45,1.45,.55,dark,1,-1);tray(1.5,.8,.5,dark,-1,1);bowl(.85,.3,dark,1,0,1);
}else if(slug==='borosilicate-glass-tea-set'){
lathe([[0,0],[.65,0],[.95,.4],[.93,.9],[.45,1.25],[.4,1.35],[.35,1.35],[.4,1.2],[.86,.9],[.88,.4],[.6,.1],[0,.1]],glass,0,0,-.55);handle(.9,1.25,glass,0,-.55);tube([[-.8,.6,-.55],[-1.3,.8,-.55],[-1.45,1.22,-.55]],.13,glass);lathe([[0,1.44],[.46,1.39],[.46,1.33],[0,1.33]],glass,0,0,-.55);mesh(new T.SphereGeometry(.1,20,12),glass,0,1.5,-.55);
for(let i=0;i<4;i++){const x=(i%2)*1.25-.9,z=1+Math.floor(i/2)*1.2;vessel(.4,.55,glass,x,z);handle(.4,.55,glass,x,z)}
}else if(slug==='glass-carafe-with-tumblers-set-6'){
lathe([[0,0],[.6,0],[.68,.2],[.61,1.1],[.33,1.6],[.3,2.2],[.38,2.28],[.33,2.28],[.25,2.2],[.27,1.6],[.55,1.1],[.61,.2],[.55,.08],[0,.08]],glass,0,0,-.5);
for(let i=0;i<6;i++)vessel(.32,.7,glass,(i%3-1)*.9,1+Math.floor(i/3));
}else if(slug==='nordic-glass-tumblers-set-4'||slug==='double-wall-tumblers-set-2'){
const count=slug.includes('nordic')?4:2;for(let i=0;i<count;i++){const x=(i%2-.5)*1.3,z=Math.floor(i/2)*1.3;vessel(.45,1.05,count===2?metal:glass,x,z);if(count===2)ring(.42,.025,steel,x,1.05,z);else for(let j=0;j<16;j++){const a=j*Math.PI/8;tube([[x+Math.cos(a)*.41,.08,z+Math.sin(a)*.41],[x+Math.cos(a)*.45,1.03,z+Math.sin(a)*.45]],.012,glass)}}
}else if(slug==='stainless-steel-cutlery-set-24pc'){
for(let i=0;i<6;i++)for(let j=0;j<4;j++)cutlery(['knife','fork','spoon','spoon'][j],(i-2.5)*.46,(j-1.5)*1.9,metal,j===3?.7:1);
}else if(slug==='bamboo-utensil-set-6pc'){
for(let i=0;i<6;i++){const g=cutlery(i%3===0?'fork':i%3===1?'spoon':'knife',(i-2.5)*.53,0,wood,1.4);if(i===3){for(let j=0;j<3;j++)box(.055,.08,.3,dark,(i-2.5)*.53+(j-1)*.11,.16,-.85)}}
}else if(slug==='glass-food-containers-set-5'){
for(let i=0;i<5;i++){const w=1.1+i*.13,x=(i%3-1)*1.75,z=Math.floor(i/3)*1.7;tray(w,w*.8,.5,glass,x,z);box(w+.05,.09,w*.8+.05,material('#c4d0c2',0,.65),x,.56,z)}
}else if(slug==='airtight-spice-jars-set-12'){
for(let i=0;i<12;i++){const x=(i%4-1.5)*.9,z=(Math.floor(i/4)-1)*.9;vessel(.32,.65,glass,x,z);mesh(new T.CylinderGeometry(.33,.33,.13,48),wood,x,.7,z);mesh(new T.CylinderGeometry(.26,.26,.4,36),material(['#c99542','#8b613b','#999451'][i%3],0,.9),x,.24,z)}
}else if(slug==='acacia-wood-serving-board-set-3'||slug==='marble-cheese-board-with-knives'){
const marble=material('#e4e2dc',0,.3);const isMarble=slug.includes('marble');for(let i=0;i<(isMarble?1:3);i++){const r=1.25-i*.15;mesh(new T.CylinderGeometry(r,r,.1,80),isMarble?marble:wood,i*.65,.07+i*.1,-i*.35);if(!isMarble)box(.36,.1,.65,wood,i*.65,.07+i*.1,r+.24-i*.35);}
if(isMarble){for(let i=0;i<4;i++)cutlery('knife',(i-1.5)*.45,2,steel,.8);for(let i=0;i<6;i++)tube([[-1+i*.35,.125,-.6],[-.7+i*.35,.125,0],[-.9+i*.35,.125,.8]],.009,material('#bbb9b2',0,.9));}
else for(let i=0;i<12;i++)tube([[-.9+i*.16,.128,-.65],[-.95+i*.16,.128,0],[-.85+i*.16,.128,.65]],.006,material('#754a27',0,.9));
}else if(slug==='rattan-placemat-set-6'){
for(let i=0;i<6;i++){const x=(i%3-1)*2.4,z=(Math.floor(i/3)-.5)*2.4;for(let j=0;j<26;j++)ring(.08+j*.038,.018,wood,x,.04,z);for(let j=0;j<32;j++){const a=j*Math.PI/16;tube([[x,.04,z],[x+Math.cos(a)*1.06,.04,z+Math.sin(a)*1.06]],.011,wood)}}
}else if(slug==='linen-napkin-set-6'){
for(let i=0;i<6;i++){const g=new T.Group();model.add(g);g.position.set((i%3-1)*1.7,.04,(Math.floor(i/3)-.5)*1.9);const geo=new T.PlaneGeometry(1.25,1.5,32,32);const a=geo.attributes.position;for(let j=0;j<a.count;j++)a.setZ(j,.025*Math.sin(a.getX(j)*15)+.012*Math.cos(a.getY(j)*22));geo.computeVertexNormals();const cloth=mesh(geo,linen,0,.04,0,g);cloth.rotation.x=-Math.PI/2;box(1.2,.025,1.48,linen,0,.015,0,g);}
}else{status.textContent='Use Product photo to view this item.';return;}
model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3()),sizeV=bounds.getSize(new T.Vector3());model.position.x=-center.x;model.position.z=-center.z;model.position.y=-bounds.min.y;target.set(0,sizeV.y*.43,0);baseDistance=Math.max(sizeV.x,sizeV.z,sizeV.y)*1.7+1;distance=baseDistance;yaw=.5;pitch=.65;updateCamera();window.huWaModel={slug,meshCount:0,approximate:true};model.traverse(o=>{if(o.isMesh)window.huWaModel.meshCount++});status.textContent=Object.values(options).join(' · ');
}
function updateCamera(){needsRender=true;camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*distance,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(target)}
let dragging=false,lastX,lastY;renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;yaw-=(e.clientX-lastX)*.008;pitch=Math.max(.08,Math.min(1.48,pitch+(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY;updateCamera()});for(const event of ['pointerup','pointercancel'])renderer.domElement.addEventListener(event,()=>dragging=false);
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(baseDistance*.4,Math.min(baseDistance*2,distance*Math.exp(e.deltaY*.001)));updateCamera()},{passive:false});
document.querySelector('#reset').onclick=()=>{yaw=.5;pitch=.65;distance=baseDistance;updateCamera()};document.querySelector('#spin').onclick=e=>{spin=!spin;e.target.setAttribute('aria-pressed',spin);e.target.textContent=spin?'Pause':'Rotate'};
new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();needsRender=true}).observe(stage);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='huwa-shop-model')return;make(e.data.slug,e.data.options||{})});
window.buildShopModel=make;window.shopModelScene=model;
// Export the same meshes shown here as a portable binary glTF asset.
window.exportShopGLB=()=>{
 model.updateMatrixWorld(true);const chunks=[],views=[],accessors=[],meshes=[],nodes=[],materials=[],materialIds=new Map();let byteLength=0;
 const pack=(array,type,count,min,max)=>{const bytes=new Uint8Array(array.buffer);const offset=byteLength;const padded=new Uint8Array(Math.ceil(bytes.length/4)*4);padded.set(bytes);chunks.push(padded);byteLength+=padded.length;const view=views.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;return accessors.push({bufferView:view,componentType:5126,count,type,...(min?{min,max}:{})})-1;};
 model.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);const pos=geometry.attributes.position.array.slice();for(let i=0;i<pos.length;i++)pos[i]/=10;const norm=geometry.attributes.normal.array;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<pos.length;i++){const a=i%3;min[a]=Math.min(min[a],pos[i]);max[a]=Math.max(max[a],pos[i]);}let mat=materialIds.get(o.material);if(mat===undefined){const m=o.material;mat=materials.length;materials.push({pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,m.opacity],metallicFactor:m.metalness||0,roughnessFactor:m.roughness||.3},doubleSided:m.side===T.DoubleSide,...(m.transparent?{alphaMode:'BLEND'}:{})});materialIds.set(m,mat)}const p=pack(pos,'VEC3',pos.length/3,min,max),n=pack(norm,'VEC3',norm.length/3);meshes.push({primitives:[{attributes:{POSITION:p,NORMAL:n},material:mat}]});nodes.push({mesh:meshes.length-1});geometry.dispose();});
 const gltf={asset:{version:'2.0',generator:'HUWA catalog preview',extras:{approximate:true,slug:currentSlug,options:currentOptions}},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,buffers:[{byteLength}],bufferViews:views,accessors};const json=new TextEncoder().encode(JSON.stringify(gltf));const jsonLength=Math.ceil(json.length/4)*4;const output=new ArrayBuffer(12+8+jsonLength+8+byteLength),dv=new DataView(output),bytes=new Uint8Array(output);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,output.byteLength,true);dv.setUint32(12,jsonLength,true);dv.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonLength);bytes.set(json,20);dv.setUint32(20+jsonLength,byteLength,true);dv.setUint32(24+jsonLength,0x004e4942,true);let offset=28+jsonLength;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return bytes;
};
const download=document.createElement('button');download.textContent='GLB';download.setAttribute('aria-label','Download approximate 3D model');document.querySelector('footer div').appendChild(download);download.onclick=()=>{const url=URL.createObjectURL(new Blob([window.exportShopGLB()],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download=currentSlug+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
renderer.setAnimationLoop(()=>{if(spin&&!dragging){yaw+=.004;updateCamera()}if(needsRender){renderer.render(scene,camera);needsRender=false}});
})();
