'use strict';
// Real Nodemailer and TLS against a loopback-only fixture. No outside mail server.
if(process.env.LAE_EMAIL_TESTS!=='1')throw Error('SMTP fixture requires explicit LAE_EMAIL_TESTS=1.');
const test=require('node:test'),assert=require('node:assert/strict'),tls=require('node:tls'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const nodemailer=require('nodemailer'),{emailRuntime}=require('../lib/account-email');
test('real SMTP library and verified TLS use an isolated local mail server',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lae-smtp-')),certPath=path.join(directory,'cert.pem'),keyPath=path.join(directory,'key.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',keyPath,'-out',certPath],{stdio:'ignore'});
 const cert=fs.readFileSync(certPath),key=fs.readFileSync(keyPath),sockets=new Set(),messages=[];let refuse=false;
 const server=tls.createServer({cert,key},socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.write('220 localhost ESMTP LAE fixture\r\n');let buffer='',data=false,authenticated=false;
  socket.on('data',chunk=>{buffer+=chunk.toString();for(;;){if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;messages.push(buffer.slice(0,end));buffer=buffer.slice(end+5);data=false;socket.write('250 2.0.0 queued-fixture\r\n');continue;}const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);const command=line.split(' ')[0].toUpperCase();if(command==='EHLO'||command==='HELO')socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 100000\r\n');else if(command==='AUTH'){const fields=Buffer.from(line.split(' ')[2]||'','base64').toString().split('\0');authenticated=fields.at(-2)==='fixture-user'&&fields.at(-1)==='fixture-password';socket.write(authenticated?'235 2.7.0 authenticated\r\n':'535 5.7.8 invalid fixture credentials\r\n');}else if(command==='MAIL')socket.write(authenticated?'250 2.1.0 sender accepted\r\n':'530 authenticate\r\n');else if(command==='RCPT')socket.write(refuse?'550 5.1.1 recipient rejected\r\n':'250 2.1.5 recipient accepted\r\n');else if(command==='DATA'){data=true;socket.write('354 end with dot\r\n');}else if(command==='QUIT'){socket.end('221 closing\r\n');return;}else if(command==='RSET'||command==='NOOP')socket.write('250 OK\r\n');else socket.write('500 unsupported fixture command\r\n');}});
 });
 server.on('tlsClientError',()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const config={enabled:true,provider:'smtp',public_origin:'https://lae.test',smtp_host:'smtp.example.test',smtp_port:465,sender:'security@lae.test'},env={NODE_ENV:'staging',ACCOUNT_EMAIL_KEY:'12'.repeat(32),SMTP_USER:'fixture-user',SMTP_PASSWORD:'fixture-password'};
 const create=trust=>emailRuntime({config,env,createTransport:options=>nodemailer.createTransport({...options,host:'127.0.0.1',port:server.address().port,tls:{...options.tls,servername:'localhost',...(trust?{ca:cert}:{})}})});
 const message={email:'recipient@fixture.invalid',purpose:'reset_password',url:'https://lae.test/recover#token='+'a'.repeat(64)+'&role=listener'};
 try{
  await t.test('SMTP authentication, MIME encoding and recipient acceptance use the actual library',async()=>{await create(true).send(message);assert.equal(messages.length,1);assert.match(messages[0],/Subject: Reset your LAE-MUSIC password/);assert.match(messages[0],/Content-Type: text\/plain/);assert.match(messages[0],/recipient@fixture.invalid/);assert.match(messages[0],/https:\/\/lae.test\/recover/);});
  await t.test('recipient rejection is not reported as accepted',async()=>{refuse=true;await assert.rejects(create(true).send(message));refuse=false;assert.equal(messages.length,1);});
  await t.test('an untrusted SMTP certificate fails closed',async()=>{await assert.rejects(create(false).send(message));assert.equal(messages.length,1);});
 }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
