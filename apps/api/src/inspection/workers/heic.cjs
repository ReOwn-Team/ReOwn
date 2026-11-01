const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 const images=await require('heic-decode').all({buffer:Buffer.from(workerData)});
 try {
  if(images.length!==1)throw Error('HEIC image sequence is not supported');
  const image=images[0];
  if(image.width<=0||image.height<=0||image.width*image.height>40000000)throw Error('Image dimensions exceed limit');
  const result=await image.decode();
  parentPort.postMessage({width:result.width,height:result.height,data:result.data});
 }finally{images.dispose();}
})().catch(()=>parentPort.postMessage({error:true}));
