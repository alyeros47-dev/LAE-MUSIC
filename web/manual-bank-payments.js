const stamp=x=>new Date(x).toLocaleString();
export function paymentMessage(p){
 if(p.status==='awaiting_transfer')return p.expired?'Payment deadline passed. If you paid, upload your receipt for review.':'After paying, upload your receipt below.';
 return {submitted:'Receipt sent. Waiting for approval.',approved:p.guest_order_id&&!p.guest_claimed?'Payment confirmed. Finish setting up your account.':'Payment confirmed.',rejected:'Payment not confirmed. Check the review note before paying again.',cancelled:'Payment cancelled.'}[p.status]||p.notice||'';
}
export function bankDetails(p,e){
 const row=(label,value,copy=value)=>`<dt>${label}</dt><dd>${e(value)} <button type="button" class="text-button" data-bank-copy="${e(copy)}" data-bank-label="${label}" aria-label="Copy ${label.toLowerCase()}">Copy</button></dd>`;
 return `<dl>${row('Amount',p.amount,(Number(p.charge_minor)/100).toFixed(2))}${row('Bank name',p.bank_account.bank_name)}${row('Account name',p.bank_account.account_name)}${row('Account number',p.bank_account.account_number)}${row('Reference',p.reference)}<dt>Pay by</dt><dd>${e(stamp(p.expires_at))}</dd></dl>`;
}
export function bindBankCopies(root){
 root.querySelectorAll('[data-bank-copy]').forEach(button=>button.onclick=async()=>{
  const status=root.querySelector('[data-bank-copy-status]'),value=button.dataset.bankCopy,label=button.dataset.bankLabel||'Value';
  let copied=false;try{await navigator.clipboard.writeText(value);copied=true;}catch{
   const input=document.createElement('textarea');input.value=value;input.style.position='fixed';input.style.opacity='0';input.setAttribute('aria-hidden','true');root.append(input);input.select();try{copied=document.execCommand('copy');}catch{}input.remove();button.focus();
  }
  if(status)status.textContent=copied?label+' copied.':'Could not copy. Select and copy the '+label.toLowerCase()+'.';
 });
}
export function bankHistory(payments,e){return payments.length?`<section><h2>Bank-transfer payments</h2><div class="draft-grid">${payments.map(p=>`<article class="panel"><h3>${e(p.product_label)}</h3><p>${e(p.amount)} · <strong>${e(p.status.replaceAll('_',' '))}</strong></p><p class="code-link">${e(p.reference)}</p><p>${e(p.notice)}</p>${p.review_note?`<p>Review: ${e(p.review_note)}</p>`:''}<button class="button secondary" data-bank-payment="${e(p.id)}">View payment</button></article>`).join('')}</div></section>`:'';}
export async function openBankPayment(ctx,{role='artist',orderId,paymentId}={}){
 const {api,e,actionDialog,bindForm,keyFor,clearKey}=ctx,base=role==='guest'?'/api/platform/guest-payments':'/api/platform/manual-payments',query=role==='guest'?'':'?role='+role;
 const home=role==='guest'?'/pay':role==='artist'?'/workspace?tab=purchases':'/premium';
 const render=(root,p)=>{
  root.innerHTML=`<span class="eyebrow">BANK TRANSFER${p.mode==='test'?' · TEST ONLY · DO NOT SEND MONEY':''}</span><h2>${e(p.product_label)}</h2>${bankDetails(p,e)}<p data-bank-copy-status role="status" aria-live="polite"></p><p role="status">${e(paymentMessage(p))}</p>${p.review_note?`<p>Review note: ${e(p.review_note)}</p>`:''}${p.status==='awaiting_transfer'?`<form id="bank-confirmation"><h3>Upload your payment receipt</h3><label>Sender's bank account name<input name="payer_name" autocomplete="name" maxlength="160" required></label><label>Payment receipt · JPEG, PNG or WebP, up to 1 MB<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></label><button class="button" type="submit">Send payment receipt</button><p class="form-status" role="status"></p></form>`:''}<div class="row-actions"><button type="button" class="button secondary" id="bank-refresh">Check payment status</button><button type="button" class="text-button" id="bank-history">View purchase history</button>${p.status==='awaiting_transfer'?'<button type="button" class="text-button" id="bank-cancel">Cancel · I have not transferred</button>':''}</div><p id="bank-status" role="status"></p>`;
  bindBankCopies(root);
  const form=root.querySelector('#bank-confirmation');if(form)bindForm(form,async b=>{const f=form.elements.proof.files[0];if(!f||f.size>1048576||!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('Choose a receipt image up to 1 MB.');const data={payer_name:b.payer_name,proof:await ctx.readFile(f)};const result=await api(base+'/'+p.id+'/submit'+query,'POST',data,{headers:{'Idempotency-Key':keyFor('bank-submit:'+p.id,data)}});clearKey('bank-submit:'+p.id);render(root,result.payment);});
  root.querySelector('#bank-refresh').onclick=async ev=>{ev.target.disabled=true;root.querySelector('#bank-status').textContent='Checking payment…';try{const x=await api(base+'/'+p.id+query);if(x.payment.status==='approved')await ctx.refreshSession?.();render(root,x.payment);}catch(error){root.querySelector('#bank-status').textContent=error.message;ev.target.disabled=false;}};
  root.querySelector('#bank-history').onclick=()=>{document.getElementById('action-dialog').close();ctx.navigate(home);};
  const cancel=root.querySelector('#bank-cancel');if(cancel)cancel.onclick=async()=>{cancel.disabled=true;try{const x=await api(base+'/'+p.id+'/cancel'+query,'POST',{}, {headers:{'Idempotency-Key':keyFor('bank-cancel:'+p.id,{id:p.id})}});clearKey('bank-cancel:'+p.id);render(root,x.payment);}catch(error){root.querySelector('#bank-status').textContent=error.message;cancel.disabled=false;}};
 };
 if(paymentId){const x=await api(base+'/'+paymentId+query);actionDialog('<h2>Loading payment…</h2>',root=>render(root,x.payment));return;}
 let panel,status;
 actionDialog('<h2>Bank transfer</h2><p data-bank-loading role="status">Loading bank details…</p>',root=>{panel=root;status=root.querySelector('[data-bank-loading]');});
 const data={order_id:orderId};
 try{
  const x=await api(base+query,'POST',data,{headers:{'Idempotency-Key':keyFor('bank-start:'+orderId,data)}});
  clearKey('bank-start:'+orderId);if(status.isConnected)render(panel,x.payment);
 }catch(error){if(status.isConnected)status.textContent=error.message;throw error;}
}
export async function adminBankPayments(view,intro,ctx,url){
 const {api,e,bindForm,keyFor,clearKey}=ctx,status=url.searchParams.get('status')||'submitted';
 const data=await api('/api/platform/admin/manual-payments?status='+encodeURIComponent(status));
 const review=p=>`<form data-bank-review="${e(p.id)}"><button class="button" type="submit">Approve payment</button><p class="form-status" role="status"></p></form>`;
 const reject=p=>`<details><summary>Reject payment</summary><form data-bank-reject="${e(p.id)}"><label>Reason, optional<textarea name="note" minlength="10" maxlength="1000"></textarea></label><button class="button secondary" type="submit">Reject payment</button><p class="form-status" role="status"></p></form></details>`;
 const html=intro+`<section class="panel"><h2>Bank payments</h2><p>Check the sender, exact amount and payment deadline in the business bank account, then approve.</p><p data-bank-pending-count role="status">Receipts to review: ${data.payments.filter(p=>p.status==='submitted').length}</p>${!data.configuration.enabled?'<p>New bank payments are unavailable. You can still review submitted receipts.</p>':''}<nav class="tabs" aria-label="Payment status">${['submitted','awaiting_transfer','approved','rejected','cancelled'].map(s=>`<a href="/admin/console?section=manual-payments&status=${s}" data-nav ${s===status?'aria-current="page"':''}>${s==='submitted'?'To review':e(s.replaceAll('_',' '))}</a>`).join('')}</nav></section>${data.payments.length?data.payments.map(p=>`<article class="panel" data-bank-card="${e(p.id)}"><h3>${e(p.product_label)} · ${e(p.amount)}</h3><p><strong>Sender's bank account name: ${e(p.payer_name||'Not submitted yet')}</strong></p><p>${e(p.customer_name)} · ${e(p.customer_email)}${p.mode==='test'?' · TEST ONLY':''}</p><p class="code-link">Payment reference: ${e(p.reference)}</p><p>Pay by: ${e(stamp(p.expires_at))}</p>${p.proof_available?`<a href="/api/platform/admin/manual-payments/${e(p.id)}/receipt" target="_blank" rel="noopener noreferrer">View payment receipt ↗</a>`:p.status==='submitted'?'<p>No image attached to this older submission.</p>':''}<div data-bank-decision>${p.review_note?`<p>${e(p.status)} · ${e(p.review_note)}</p>`:p.status==='submitted'?review(p)+reject(p):p.status==='awaiting_transfer'?reject(p):`<p>${e(p.status.replaceAll('_',' '))}</p>`}</div></article>`).join(''):'<section class="panel"><p>No payments here.</p></section>'}`;
 if(!view.set(html))return;
 document.querySelectorAll('[data-bank-review],[data-bank-reject]').forEach(form=>{const id=form.dataset.bankReview||form.dataset.bankReject,approved=!!form.dataset.bankReview;bindForm(form,async b=>{const input={decision:approved?'approved':'rejected',...(approved?{receipt_verified:true}:b.note?{note:b.note}:{})};const x=await api('/api/platform/admin/manual-payments/'+id+'/review','POST',input,{headers:{'Idempotency-Key':keyFor('bank-review:'+id,input)}});clearKey('bank-review:'+id);form.closest('[data-bank-decision]').innerHTML=`<p role="status">Payment ${e(x.payment.status)}.</p>`;const p=data.payments.find(p=>p.id===id);if(p)p.status=x.payment.status;document.querySelector('[data-bank-pending-count]').textContent='Receipts to review: '+data.payments.filter(p=>p.status==='submitted').length;});});
}
