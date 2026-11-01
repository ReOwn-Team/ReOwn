require('reflect-metadata');
const assert=require('node:assert/strict');const {randomBytes}=require('node:crypto');const {createClient}=require('redis');
const {OtpStore}=require('../../dist/otp/otp.store');const {OtpAuthService}=require('../../dist/otp/otp-auth.service');const {RedisService}=require('../../dist/redis/redis.service');
const prefix=`reown:test:otp:${randomBytes(12).toString('hex')}:`;
process.env.REDIS_KEY_PREFIX=prefix;process.env.OTP_SECRET=randomBytes(48).toString('hex');
const redis=createClient({url:process.env.TEST_REDIS_URL??'redis://127.0.0.1:6379',socket:{reconnectStrategy:false}});redis.on('error',()=>{});
let accounts=0,sessions=0,failMail=false;const sent=[];
const users={prepareRegistration:async dto=>({...dto,password:undefined,passwordHash:'test-password-hash'}),verifyCredentials:async dto=>({user:{id:'test-user',email:dto.identifier},passwordHash:'test-login-hash'}),completeRegistration:async()=>{accounts++;sessions++;return {auth:{user:{emailVerified:1}}};},completeOtpLogin:async()=>{sessions++;return {auth:{user:{emailVerified:1}}};}};
const mail={assertConfigured(){},async send(email,code){sent.push({email,code});if(failMail)throw Error('Simulated mail failure');}};
const registration=email=>({displayName:'OTP Test',email,phone:'+84901234567',password:'sensitive-plaintext-password'});
async function clearCooldown(){const keys=await redis.keys(prefix+'otp:cooldown:*');if(keys.length)await redis.del(keys);}
async function rejected(action,status=401){try{await action();assert.fail('Expected rejection');}catch(error){if(error.code==='ERR_ASSERTION')throw error;if(status!==undefined)assert.equal(error.getStatus?.(),status);}}
(async()=>{try{
 await redis.connect();const service=new OtpAuthService(new OtpStore(new RedisService(redis)),mail,users);
 let challenge=await service.register(registration('first@example.com'));let code=sent.at(-1).code;
 assert.equal(accounts,0);assert.equal(sessions,0);assert.equal(challenge.requiresOtp,true);
 const raw=await redis.get(prefix+'otp:challenge:'+challenge.challengeId);assert.ok(!raw.includes(code));assert.ok(!raw.includes('sensitive-plaintext-password'));assert.ok(!raw.includes('test-password-hash'));
 await rejected(()=>service.verify({challengeId:challenge.challengeId,code:code==='000000'?'111111':'000000'}));assert.equal(sessions,0);
 await service.verify({challengeId:challenge.challengeId,code});assert.equal(accounts,1);assert.equal(sessions,1);
 await rejected(()=>service.verify({challengeId:challenge.challengeId,code}));
 console.log('PASS OTP: no user/session before verification; HMAC code and encrypted pending data; wrong-code/replay rejected');
 challenge=await service.login({identifier:'resend@example.com',password:'password'});const old=sent.at(-1).code;
 await rejected(()=>service.resend(challenge.challengeId),429);await clearCooldown();await service.resend(challenge.challengeId);code=sent.at(-1).code;assert.notEqual(code,old);
 await rejected(()=>service.verify({challengeId:challenge.challengeId,code:old}));await service.verify({challengeId:challenge.challengeId,code});
 console.log('PASS OTP: resend cooldown enforced; previous code invalidated');
 challenge=await service.login({identifier:'attempts@example.com',password:'password'});code=sent.at(-1).code;
 for(let i=0;i<5;i++)await rejected(()=>service.verify({challengeId:challenge.challengeId,code:code==='000000'?'111111':'000000'}));
 await rejected(()=>service.verify({challengeId:challenge.challengeId,code}));
 challenge=await service.login({identifier:'parallel@example.com',password:'password'});code=sent.at(-1).code;const before=sessions;
 const results=await Promise.allSettled(Array.from({length:12},()=>service.verify({challengeId:challenge.challengeId,code})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(sessions,before+1);
 console.log('PASS OTP: five-attempt limit and one atomic winner across parallel verification requests');
 challenge=await service.login({identifier:'expired@example.com',password:'password'});code=sent.at(-1).code;
 await redis.pExpire(prefix+'otp:challenge:'+challenge.challengeId,1);await new Promise(r=>setTimeout(r,10));await rejected(()=>service.verify({challengeId:challenge.challengeId,code}));
 for(let i=0;i<5;i++){await clearCooldown();await service.login({identifier:'quota@example.com',password:'password'});}await clearCooldown();await rejected(()=>service.login({identifier:'quota@example.com',password:'password'}),429);
 console.log('PASS OTP: expired codes rejected; per-recipient hourly send quota enforced');
 failMail=true;const count=sessions;await assert.rejects(()=>service.login({identifier:'failed@example.com',password:'password'}));assert.equal(sessions,count);
 const remaining=await redis.keys(prefix+'otp:challenge:*');for(const key of remaining){const record=JSON.parse(await redis.get(key));assert.equal(record.ready,true);}
 console.log('PASS OTP: failed email delivery does not leave an activatable code or create a session');
 const keys=await redis.keys(prefix+'*');if(keys.length)await redis.del(keys);redis.destroy();failMail=false;
 await rejected(()=>service.login({identifier:'offline@example.com',password:'password'}),503);
 console.log('PASS OTP: Redis outage fails closed without sending an email');
}catch(error){console.error(error);process.exitCode=1;}finally{if(redis.isReady){const keys=await redis.keys(prefix+'*');if(keys.length)await redis.del(keys);await redis.quit();}}})();
