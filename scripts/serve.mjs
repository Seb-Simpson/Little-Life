import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const args=process.argv.slice(2), portIndex=args.indexOf('--port'), hostIndex=args.indexOf('--host');
const root=process.cwd(), port=Number(portIndex >= 0 ? args[portIndex+1] : process.env.PORT || 5173);
const host=hostIndex >= 0 ? args[hostIndex+1] : '127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost'), path=resolve(root,`.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if(!path.startsWith(root+sep)||url.pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
    const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,host,()=>console.log(`Little Life is ready on port ${port}`));
