const {createServer}=require("node:http");
const {createHash}=require("node:crypto");
module.exports=async function fakeR2() {
  const objects=new Map(), requests=[];
  const server=createServer(async(req,res)=>{
    try {
      if(!/^AWS4-HMAC-SHA256 /.test(req.headers.authorization??"")){res.writeHead(403);res.end();return;}
      const key=new URL(req.url,"http://localhost").pathname;
      requests.push({method:req.method,key,contentType:req.headers["content-type"]});
      if(req.method==="PUT") {
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);objects.set(key,bytes);
        res.writeHead(200,{ETag:`"${createHash("md5").update(bytes).digest("hex")}"`});res.end();return;
      }
      if(req.method==="GET") {
        const bytes=objects.get(key);
        if(!bytes){res.writeHead(404,{"Content-Type":"application/xml"});res.end("<Error><Code>NoSuchKey</Code></Error>");return;}
        res.writeHead(200,{"Content-Type":"image/webp","Content-Length":bytes.length});res.end(bytes);return;
      }
      if(req.method==="DELETE"){objects.delete(key);res.writeHead(204);res.end();return;}
      res.writeHead(405);res.end();
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {objects,requests,env:{R2_ACCOUNT_ID:"0".repeat(32),R2_BUCKET:"reown-test",R2_ACCESS_KEY_ID:"isolated-test-access-key",R2_SECRET_ACCESS_KEY:"isolated-test-secret",R2_ENDPOINT:`http://127.0.0.1:${server.address().port}`},close:()=>new Promise(resolve=>server.close(resolve))};
};
