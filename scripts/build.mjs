import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','favicon.svg','src','docs','examples'])await cp(file,`dist/${file}`,{recursive:true});
console.log('Built static site in dist/ with relative URLs for GitHub Pages.');
