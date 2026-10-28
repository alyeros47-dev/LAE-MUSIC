'use strict';
function databaseOptions(env=process.env){
 if(!env.DATABASE_URL)return null;let url;try{url=new URL(env.DATABASE_URL);}catch{throw Error('DATABASE_URL must be a valid PostgreSQL URL.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')throw Error('DATABASE_URL must identify a PostgreSQL host and database.');
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,''),local=['localhost','127.0.0.1','::1'].includes(host);
 const requested=env.DATABASE_SSL_MODE||url.searchParams.get('sslmode')||(local?'local':'verify-full');
 if(['no-verify','allow','prefer','disable'].includes(requested)&&!local)throw Error('Remote database certificate verification cannot be disabled. Use verified TLS or an explicitly configured private Render hostname.');
 let ssl;if(local&&['local','disable'].includes(requested))ssl=false;
 else if(requested==='private'){
  if(env.DATABASE_PRIVATE_HOST!==url.hostname||!(host.endsWith('.internal')||/^[a-z0-9-]+$/.test(host)))throw Error('Private database transport requires an exact, explicitly approved internal hostname.');ssl=false;
 }else if(['require','verify-ca','verify-full'].includes(requested)){
  const ca=env.PG_CA_CERT?.replace(/\\n/g,'\n');if(ca&&(ca.length>100000||!ca.includes('-----BEGIN CERTIFICATE-----')))throw Error('PG_CA_CERT must contain a PEM certificate chain.');ssl={rejectUnauthorized:true,...(ca?{ca}:{})};
 }else throw Error('Choose a supported DATABASE_SSL_MODE.');
 for(const name of ['host','hostaddr','port','user','password','database','dbname','connectionString'])if(url.searchParams.has(name))throw Error('DATABASE_URL connection details must be specified in the URL authority and path.');
 for(const name of ['ssl','sslmode','sslcert','sslkey','sslrootcert','sslnegotiation','uselibpqcompat'])url.searchParams.delete(name);
 const maximum=Number(env.DATABASE_POOL_MAX||10);if(!Number.isInteger(maximum)||maximum<1||maximum>50)throw Error('DATABASE_POOL_MAX must be between 1 and 50.');
 return {connectionString:url.toString(),ssl,max:maximum,connectionTimeoutMillis:10000,idleTimeoutMillis:30000};
}
module.exports={databaseOptions};
