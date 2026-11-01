const {createServer}=require("node:http");const {randomUUID}=require("node:crypto");
module.exports=async function fakeResend(){
  const sent=[],idempotency=new Map();
  const server=createServer(async(req,res)=>{try{
    if(req.method!=="POST"||req.url!=="/emails"||req.headers.authorization!=="Bearer test-resend-key"){res.writeHead(403);res.end('{}');return;}
    let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text),key=req.headers['idempotency-key'];
    const previous=idempotency.get(key);if(previous){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:previous}));return;}
    const id=randomUUID();const code=/\b(\d{6})\b/.exec(body.text)?.[1];if(!code)throw Error();
    sent.push({email:body.to[0],code,id});idempotency.set(key,id);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id}));
  }catch{res.writeHead(500);res.end('{}');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {sent,code:(email)=>sent.filter(message=>message.email===email).at(-1)?.code,env:{RESEND_API_KEY:'test-resend-key',RESEND_FROM:'ReOwn <otp@example.com>',RESEND_TEST_ENDPOINT:`http://127.0.0.1:${server.address().port}/emails`},close:()=>new Promise(resolve=>server.close(resolve))};
};
