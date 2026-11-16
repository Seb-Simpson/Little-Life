import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),privateIndex=args.indexOf('--private-origin');
let origin=null;
if(privateIndex>=0){
  const url=new URL(args[privateIndex+1]);
  if(url.protocol!=='https:'||url.hostname.endsWith('.github.io')||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('Private build needs a dedicated HTTPS origin at its root, outside shared github.io hosting.');
  origin=url.origin;
}
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','favicon.svg','src','docs','examples'])await cp(file,`dist/${file}`,{recursive:true});
await writeFile('dist/src/deployment-policy.js',`export const deploymentPolicy = Object.freeze(${JSON.stringify({publicDemoOnly:!origin,allowLoopback:false,personalOrigins:origin?[origin]:[]})});\n`);
await writeFile('dist/.nojekyll','');
console.log(`Built static site in dist/: ${origin?'private origin '+origin:'PUBLIC DEMO ONLY; personal data inputs disabled'}.`);
