'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs');
const {runtime}=require('./runtime.cjs'),{launchBrowser,engine}=require('./browser-engine.cjs'),AxeBuilder=require('@axe-core/playwright').default;
function tone(){const count=8000*30,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.sin(i*.2)*1500,44+i*2);return b;}
(async()=>{
 const app=await runtime(),browser=await launchBrowser(),wav=tone();
 const server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:950},...(width<700?{isMobile:true,hasTouch:true}:{}),reducedMotion:'reduce'}),page=await context.newPage(),errors=[],messages=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/support-tone.wav',r=>r.fulfill({contentType:'audio/wav',body:wav}));
 await page.route('**/api/support/config',r=>r.fulfill({json:{available:true,greeting:'Hi! I’m LAE-MUSIC’s AI support guide. How can I help?',suggestions:['How do I create an account?']}}));
 await page.route('**/api/support/chat',async r=>{const b=r.request().postDataJSON();messages.push(b);if(b.message==='connection test')return r.abort('failed');await new Promise(resolve=>setTimeout(resolve,100));await r.fulfill({json:{answer:b.message.includes('private')?'<img src=x onerror=alert(1)>':'Open Premium listening, choose a plan, and complete checkout.',ai:true,conversation:'synthetic-encrypted-conversation',links:[{path:'/premium',label:'Premium listening'}],escalate:b.message.includes('paid'),summary:'I need help with a payment or purchased access.',...(b.message.includes('paid')?{whatsapp_number:'2347040728318'}:{})}});});
 await context.addInitScript(()=>localStorage.setItem('lae_listening_preferences_v1',JSON.stringify({version:1,selections:[{family:'gospel',genres:['praise']}]})));
 await page.goto(origin+'/about');await page.getByRole('button',{name:'Open customer support'}).click();
 const noContact=async()=>{assert.equal(await page.getByRole('button',{name:'Talk to a person',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Open WhatsApp'}).count(),0);assert.equal(await page.locator('#customer-support a[href*="wa.me"]').count(),0);};
 await noContact();
 await page.locator('#audio').evaluate(async a=>{window.supportAudio=a;a.src='/support-tone.wav';await a.play();});
 await page.getByRole('button',{name:'How do I create an account?',exact:true}).click();await page.getByText('Checking…',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Send',exact:true}).isDisabled());
 await page.getByText('Open Premium listening, choose a plan, and complete checkout.',{exact:true}).waitFor();await noContact();
 await page.locator('#support-question').fill('I already paid; help please');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('Would you like to contact our customer support representative on WhatsApp?',{exact:true}).waitFor();
 assert.equal(messages[1].conversation,'synthetic-encrypted-conversation');const wa=page.getByRole('link',{name:'Open WhatsApp'});let url=new URL(await wa.getAttribute('href'));assert.equal(url.pathname,'/2347040728318');assert.equal(url.searchParams.get('text'),'Hello LAE-MUSIC support.');
 await page.getByRole('checkbox',{name:'Include a short description of the issue'}).check();url=new URL(await wa.getAttribute('href'));assert(url.searchParams.get('text').includes('payment or purchased access'));assert(!url.searchParams.get('text').includes('already paid'));
 await page.getByRole('button',{name:'Minimize support'}).click();assert(await page.getByRole('button',{name:'Open customer support'}).isVisible());await page.getByRole('button',{name:'Open customer support'}).click();
 await page.locator('#customer-support').getByRole('link',{name:'Premium listening',exact:true}).first().click();await page.waitForURL('**/premium');assert(await page.locator('#audio').evaluate(a=>a===window.supportAudio&&!a.paused));
 await page.locator('#support-question').fill('connection test');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('Could not get a reply.',{exact:true}).waitFor();await noContact();
 await page.getByRole('button',{name:'New chat',exact:true}).click();await noContact();await page.locator('#support-question').fill('private');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('#customer-support img').count(),0);await noContact();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const box=await page.locator('.support-window').boundingBox(),player=await page.locator('#player').boundingBox();assert(box.y>=0);assert(box.y+box.height<=(player?.y||950-96)+1,'Support must not cover music controls');
 const axe=await new AxeBuilder({page}).include('#customer-support').analyze();assert.deepEqual(axe.violations,[]);
 await page.getByRole('button',{name:'Close support'}).click();assert(await page.locator('#audio').evaluate(a=>!a.paused));assert.deepEqual(errors,[]);
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/customer-support-'+width+'.png'});await context.close();console.log('PASS '+engine+' '+width+'px: conversation, feedback, minimize/close, private opt-in WhatsApp, safe text, navigation, continuing audio, layout and accessibility.');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
