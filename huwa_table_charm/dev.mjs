import { spawn } from 'node:child_process';
import path from 'node:path';
const root=import.meta.dirname;
const apiPort=process.env.HUWA_API_PORT||'4018';
const webPort=process.env.HUWA_WEB_PORT||'5175';
const api=spawn(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),'src/server.ts'],{cwd:path.join(root,'backend'),stdio:'inherit',env:{...process.env,NODE_ENV:'development',PORT:apiPort,ALLOWED_ORIGINS:'http://127.0.0.1:'+webPort},windowsHide:true});
const web=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',webPort,'--strictPort'],{cwd:path.join(root,'frontend'),stdio:'inherit',env:{...process.env,HUWA_API_PORT:apiPort},windowsHide:true});
console.log('HUWA system: http://127.0.0.1:'+webPort+' / Shop + enquiries');
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;api.kill();web.kill();};
for(const child of [api,web]){child.on('error',e=>{console.error(e.message);stop();process.exitCode=1;});child.on('exit',code=>{if(!stopping){stop();process.exitCode=code||0;}});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
