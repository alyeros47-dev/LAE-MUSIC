'use strict';
const crypto=require('node:crypto');
// A real tiny PNG with an explicit synthetic marker; each fixture represents a
// distinct receipt. Reusing the same value deliberately tests duplicate evidence.
function receiptFile(label=crypto.randomUUID()){
 return {name:'fixture-receipt.png',mimeType:'image/png',buffer:Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+aXcAAAAASUVORK5CYII=','base64'),Buffer.from('\nSYNTHETIC RECEIPT - NOT A PAYMENT: '+label)])};
}
function receiptProof(label){return 'data:image/png;base64,'+receiptFile(label).buffer.toString('base64');}
module.exports={receiptFile,receiptProof};
