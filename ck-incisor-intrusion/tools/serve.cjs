// Minimal static server for local preview and headless rendering
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.css':'text/css','.m4a':'audio/mp4','.bin':'application/octet-stream'};
function start(port=8123){return new Promise(r=>{const s=http.createServer((q,res)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});s.listen(port,()=>r(s));});}
module.exports={start};
if(require.main===module){const port=+process.argv[2]||8123;start(port).then(()=>console.log('http://localhost:'+port+'/'));}
