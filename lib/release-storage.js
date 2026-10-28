'use strict';
const { fail } = require('./transactions');
const { verifyStoredPrefix } = require('./file-signatures');
function createReleaseStorage({storage,presign,fetcher=fetch}) {
  return {
    configured:()=>!!storage?.(),
    async put(key,media) {
      const config=storage?.();if(!config)throw fail(503,'Music storage is temporarily unavailable.');
      const response=await fetcher(presign(config,key,'put',120),{method:'PUT',headers:{'Content-Type':media.mime,'Content-Length':String(media.bytes.length)},body:media.bytes,redirect:'error',signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw fail(502,'The generated file could not be saved to music storage.');
      const head=await fetcher(presign(config,key,'head',120),{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!head.ok||Number(head.headers.get('content-length'))!==media.bytes.length||head.headers.get('content-type')!==media.mime)throw fail(502,'The saved media could not be verified.');
      await verifyStoredPrefix(presign(config,key,'get',120),media.mime,fetcher);
    },
    async read(key,kind='audio'){const config=storage?.();if(!config)throw fail(503,'Music storage is temporarily unavailable.');const response=await fetcher(presign(config,key,'get',120),{redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw fail(502,'Saved media could not be retrieved.');const media=require('./media-download');const bytes=await media.readBounded(response,kind==='audio'?media.AUDIO_LIMIT:media.ART_LIMIT);return {bytes,...media.detectFormat(bytes,kind)};},
    signed(key){const config=storage?.();if(!config)throw fail(503,'Music storage is temporarily unavailable.');return presign(config,key,'get',300);}
  };
}
module.exports={createReleaseStorage};
