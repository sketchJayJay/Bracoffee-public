/* Commercial operations shared by the browser, server validation and tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BracoffeeCommercial=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EPS=0.000001,qty=n=>Math.round((Number(n)+Number.EPSILON)*10000)/10000,money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  const fail=message=>{throw new Error(message);};
  const finite=n=>Number.isFinite(Number(n));
  const live=s=>!s.cancelledAt;
  const deliveries=s=>(s.deliveries||[]).filter(d=>!d.reversedAt);
  const delivered=s=>qty(deliveries(s).reduce((v,d)=>v+Number(d.bags),0));
  const paid=f=>money((f?.payments||[]).filter(p=>!p.reversedAt).reduce((v,p)=>v+Number(p.amount),0));
  const remaining=s=>Math.max(0,qty(s.bags-delivered(s)));
  function explicitLotReserved(db,lotId,exclude=''){
    return qty(db.sales.filter(s=>live(s)&&!s.reviewPending&&s.id!==exclude&&s.source==='stock').reduce((total,s)=>{
      const allocation=(s.allocations||[]).find(a=>a.lotId===lotId);if(!allocation)return total;
      const sent=deliveries(s).reduce((v,d)=>v+(d.allocations||[]).filter(a=>a.lotId===lotId).reduce((w,a)=>w+Number(a.bags),0),0);
      return total+Math.max(0,Number(allocation.bags)-sent);
    },0));
  }
  function futureReservations(db,exclude=''){
    const future=db.sales.filter(s=>live(s)&&!s.reviewPending&&s.id!==exclude&&s.source==='future'&&db.purchases.some(p=>p.id===s.purchaseId&&p.destination==='stock'));
    if(!future.length)return {};
    const result={};const lots=db.stockLots.filter(physical),free={};
    lots.forEach(l=>free[l.id]=Math.max(0,qty(Number(l.remaining)-explicitLotReserved(db,l.id,exclude))));
    future.forEach(s=>{
      let pending=remaining(s);result[s.id]=[];
      lots.filter(l=>l.purchaseId===s.purchaseId).forEach(l=>{const n=Math.min(pending,free[l.id]);if(n>EPS){result[s.id].push({lotId:l.id,bags:qty(n)});free[l.id]=qty(free[l.id]-n);pending=qty(pending-n);}});
    });return result;
  }
  function lotReserved(db,lotId,exclude='',futurePlan=null){
    const future=Object.values(futurePlan||futureReservations(db,exclude)).flat().filter(a=>a.lotId===lotId).reduce((v,a)=>v+a.bags,0);
    return qty(explicitLotReserved(db,lotId,exclude)+future);
  }
  const physical=lot=>lot&&lot.entryType!=='legacy_auto_purchase'&&!lot.reversedAt&&!lot.deletedAt;
  function available(db,lotId,exclude='',futurePlan=null){const lot=db.stockLots.find(l=>l.id===lotId);return !physical(lot)?0:Math.max(0,qty(Number(lot.remaining)-lotReserved(db,lotId,exclude,futurePlan)));}
  function purchaseCommitted(db,purchaseId,exclude=''){
    const lots=new Set(db.stockLots.filter(l=>l.purchaseId===purchaseId).map(l=>l.id));
    return qty(db.sales.filter(s=>live(s)&&!s.reviewPending&&s.id!==exclude).reduce((v,s)=>v+(s.source!=='stock'&&s.purchaseId===purchaseId?Number(s.bags):s.source==='stock'?(s.allocations||[]).filter(a=>lots.has(a.lotId)).reduce((w,a)=>w+Number(a.bags),0):0),0));
  }
  function externalDelivered(db,purchaseId){return qty(db.sales.filter(s=>s.purchaseId===purchaseId).reduce((v,s)=>v+deliveries(s).filter(d=>!(d.allocations||[]).length).reduce((w,d)=>w+Number(d.bags),0),0));}
  function nextOV(db,date){const year=String(date).slice(0,4);db.saleCounters=db.saleCounters||{};const n=(Number(db.saleCounters[year])||0)+1;db.saleCounters[year]=n;return (db.settings.ovPrefix||'OV').trim().toUpperCase()+'-'+year+'-'+String(n).padStart(6,'0');}
  function migrate(db){
    let changed=false;
    if(!Array.isArray(db.stockGuides)){db.stockGuides=[];changed=true;}
    if(!Array.isArray(db.customers)){db.customers=[];changed=true;}
    if(!Array.isArray(db.stockMovements)){db.stockMovements=[];changed=true;}
    if(!db.saleCounters){db.saleCounters={};changed=true;}
    db.sales.forEach(s=>{if(s.ov){const m=s.ov.match(/-(\d{4})-(\d+)$/);if(m)db.saleCounters[m[1]]=Math.max(Number(db.saleCounters[m[1]]||0),Number(m[2]));}});
    db.sales.forEach(s=>{
      if(s.commercialVersion===4)return;
      const lot=db.stockLots.find(l=>l.id===s.lotId);
      s.ov=s.ov||nextOV(db,s.date||'2000-01-01');s.buyer=s.buyer||'Comprador não informado';s.source='stock';s.drink=s.drink||lot?.drink||'';s.weight=qty(Number(s.bags||0)*60);
      s.allocations=[{lotId:s.lotId,bags:Number(s.bags||0)}];
      s.deliveries=[{id:'legacy-delivery-'+s.id,date:s.date||'',bags:Number(s.bags||0),allocations:s.allocations.map(a=>({...a})),legacy:true,notes:'Saída registrada na versão anterior'}];
      s.reviewPending=true;s.commercialVersion=4;changed=true;
    });
    return changed;
  }
  function validateSale(db,s,exclude=''){
    if(!String(s.buyer||'').trim()||!String(s.drink||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(s.date||''))fail('Informe comprador, bebida e data.');
    if(!finite(s.bags)||Number(s.bags)<=0||!finite(s.pricePerBag)||Number(s.pricePerBag)<0||s.saleTerm!=='fix'&&Number(s.pricePerBag)<=0)fail('Informe sacas e preço positivos, ou selecione a condição A fixar.');
    if(Math.abs(qty(s.bags)-Number(s.bags))>EPS||Math.abs(money(s.pricePerBag)-Number(s.pricePerBag))>EPS)fail('Use até quatro casas nas sacas e duas no preço.');
    if(s.saleTerm==='fix'&&s.initialStatus==='paid')fail('Fixe o preço antes de confirmar o recebimento.');
    if(!['stock','direct','future'].includes(s.source))fail('Escolha a origem da venda.');
    if(s.source==='stock'){
      const used=new Set();let sum=0;
      for(const a of s.allocations||[]){
        if(used.has(a.lotId)||!finite(a.bags)||Number(a.bags)<=0)fail('Use cada lote uma vez e informe sacas positivas.');
        used.add(a.lotId);sum+=Number(a.bags);
        const old=db.sales.find(v=>v.id===exclude);
        const sent=old?deliveries(old).reduce((v,d)=>v+(d.allocations||[]).filter(i=>i.lotId===a.lotId).reduce((w,i)=>w+Number(i.bags),0),0):0;
        if(Number(a.bags)<sent-EPS||Number(a.bags)>available(db,a.lotId,exclude)+sent+EPS)fail('O lote não tem saldo livre suficiente ou já houve entrega dessa quantidade.');
      }
      if(Math.abs(sum-Number(s.bags))>EPS)fail('A soma dos lotes precisa ser igual às sacas da venda.');
    }else{
      const p=db.purchases.find(p=>p.id===s.purchaseId);if(!p)fail('Vincule a ordem de compra de origem.');
      const old=db.sales.find(v=>v.id===exclude);
      if(p.destination!==s.source&&!(s.source==='future'&&p.destination==='stock'&&old?.source==='future'&&old.purchaseId===p.id))fail('A origem deve corresponder ao tipo da compra: direta ou futura.');
      if(Number(s.bags)+purchaseCommitted(db,p.id,exclude)>Number(p.bags)+EPS)fail('A OC já está comprometida com outras vendas.');
    }
    if(s.brokerageType&&s.brokerageType!=='none'&&(!s.brokerName||!finite(s.brokerageValue)||s.brokerageValue<=0||(s.brokerageType==='percent'&&s.brokerageValue>100)))fail('Confira o corretor e o valor da corretagem.');
    const old=db.sales.find(v=>v.id===exclude),fin=db.finance.find(f=>f.saleId===exclude);
    if(s.saleTerm==='fix'&&paid(fin)>0)fail('Já houve recebimento. Estorne os recebimentos antes de retornar a venda para A fixar.');
    if(old){
      if(old.cancelledAt)fail('A venda está cancelada.');
      if(delivered(old)>Number(s.bags)+EPS)fail('A venda não pode ficar abaixo das sacas já entregues.');
      if(delivered(old)>0&&(old.source!==s.source||(old.source!=='stock'&&old.purchaseId!==s.purchaseId)))fail('Estorne as entregas antes de alterar a origem.');
      for(const a of old.allocations||[])if(s.source==='stock'&&!s.allocations.some(i=>i.lotId===a.lotId)&&deliveries(old).some(d=>(d.allocations||[]).some(i=>i.lotId===a.lotId)))fail('Não remova um lote com entrega registrada.');
      if(money(Number(s.bags)*Number(s.pricePerBag))<paid(fin))fail('O total não pode ficar abaixo do que já foi recebido.');
    }
  }
  function saveSale(db,input,id,newId,now){
    const old=db.sales.find(s=>s.id===id);const wasReview=!!old?.reviewPending;
    validateSale(db,input,id);const total=money(input.bags*input.pricePerBag);
    const s=old||{id:newId,ov:nextOV(db,input.date),deliveries:[],createdAt:now,commercialVersion:4};
    Object.assign(s,input,{bags:qty(input.bags),pricePerBag:money(input.pricePerBag),total,weight:money(input.bags*60),pricePending:input.saleTerm==='fix',reviewPending:false,updatedAt:now});
    if(!old)db.sales.push(s);
    let f=db.finance.find(f=>f.saleId===s.id);
    if(!f){f={id:'receivable-'+s.id,type:'receivable',saleId:s.id,payments:[],createdAt:now};db.finance.push(f);}
    Object.assign(f,{oc:s.ov,person:s.buyer,amount:s.total,date:s.date,dueDate:s.dueDate,method:s.paymentMethod,pricePending:s.pricePending});
    if((!old||wasReview)&&input.initialStatus==='paid')f.payments.push({id:'initial-'+s.id,amount:total,date:s.date,method:s.paymentMethod,notes:wasReview?'Recebimento histórico confirmado pelo usuário':'Recebimento informado na venda',createdAt:now});
    f.paidAmount=paid(f);f.status=s.pricePending?'fixing':f.paidAmount>=f.amount?'paid':f.paidAmount>0?'partial':'pending';s.paymentStatus=f.status;s.financeId=f.id;return s;
  }
  function dispatch(db,id,input,movementId,now){
    const s=db.sales.find(s=>s.id===id);if(!s||!live(s)||s.reviewPending)fail('Confirme a venda antes de registrar a entrega.');
    const bags=qty(input.bags);if(!finite(bags)||bags<=0||bags>remaining(s)+EPS||!input.date)fail('Confira a data e as sacas ainda não entregues.');
    const allocation=[];let toSend=bags;
    const viaStock=s.source==='stock'||s.source==='future'&&db.purchases.some(p=>p.id===s.purchaseId&&p.destination==='stock');
    if(viaStock){
      const origin=s.source==='stock'?s.allocations:(futureReservations(db)[s.id]||[]);
      for(const a of origin){
        const sent=s.source==='stock'?deliveries(s).reduce((v,d)=>v+(d.allocations||[]).filter(i=>i.lotId===a.lotId).reduce((w,i)=>w+Number(i.bags),0),0):0;
        const n=Math.min(toSend,Math.max(0,Number(a.bags)-sent));if(n>EPS){const l=db.stockLots.find(l=>l.id===a.lotId);if(!physical(l)||Number(l.remaining)+EPS<n)fail('Saldo físico insuficiente para esta entrega.');allocation.push({lotId:l.id,bags:qty(n)});toSend=qty(toSend-n);}
      }
      if(toSend>EPS)fail('Ainda não há café físico suficiente reservado para esta entrega. Registre o recebimento da OC.');
      allocation.forEach(a=>{const l=db.stockLots.find(l=>l.id===a.lotId);l.remaining=qty(l.remaining-a.bags);});
    }
    const d={id:movementId,bags,date:input.date,notes:input.notes||'',nf:input.nf||'',carrier:input.carrier||'',plate:input.plate||'',allocations:allocation,createdAt:now};s.deliveries.push(d);s.updatedAt=now;return d;
  }
  function reverseDelivery(db,id,deliveryId,now){
    const s=db.sales.find(s=>s.id===id),d=s?.deliveries.find(d=>d.id===deliveryId);if(!d||d.reversedAt)fail('Entrega não encontrada.');
    if(d.legacy&&s.reviewPending)fail('Confirme os dados históricos da venda antes do estorno.');
    const adjustments=(d.allocations||[]).map(a=>{const l=db.stockLots.find(l=>l.id===a.lotId);if(!physical(l))fail('Lote físico original não encontrado. O histórico antigo será preservado.');return {l,bags:a.bags};});
    adjustments.forEach(a=>{a.l.remaining=qty(a.l.remaining+a.bags);});d.reversedAt=now;s.updatedAt=now;
  }
  function cancel(db,id,reason,now){
    const s=db.sales.find(s=>s.id===id),f=db.finance.find(f=>f.saleId===id);if(!s||!live(s))fail('Venda não encontrada.');
    if(delivered(s)>EPS||paid(f)>0)fail('Estorne as entregas e os recebimentos antes de cancelar a venda.');
    if(!String(reason||'').trim())fail('Informe o motivo do cancelamento.');
    s.cancelledAt=now;s.cancelReason=reason; if(f){f.cancelledAt=now;f.status='cancelled';}s.paymentStatus='cancelled';
  }
  function reverseEntry(db,lotId,reason,now){
    const l=db.stockLots.find(l=>l.id===lotId);if(!l||l.reversedAt)fail('Entrada não encontrada.');
    if(Math.abs(Number(l.remaining)-Number(l.bags))>EPS||lotReserved(db,lotId)>EPS)fail('Estorne as saídas e libere as reservas antes de estornar a entrada.');
    if(!String(reason||'').trim())fail('Informe o motivo do estorno.');l.remaining=0;l.reversedAt=now;l.reverseReason=reason;
  }
  function audit(db){
    const errors=[];const ids=new Set(),plan=futureReservations(db);
    for(const f of db.finance||[]){
      if(!finite(f.amount)||f.amount<0||(f.payments||[]).some(p=>!finite(p.amount)||p.amount<=0)||paid(f)>Number(f.amount)+EPS)errors.push('Valores inválidos ou recebimentos/pagamentos acima do total.');
      if(f.pricePending&&paid(f)>0)errors.push('Fixe o preço antes de registrar recebimentos.');
    }
    for(const g of db.stockGuides||[]){if(!finite(g.bags)||g.bags<=0||!finite(g.weight)||g.weight<=0||!String(g.warehouse||'').trim()||!String(g.lotId||'').trim())errors.push('Guia de armazém inválida.');}
    for(const s of db.sales||[]){if(s.commercialVersion!==4)continue;if(ids.has(s.id))errors.push('Venda duplicada.');ids.add(s.id);
      if(!finite(s.bags)||s.bags<=0||!finite(s.total)||s.total<0||delivered(s)>s.bags+EPS)errors.push('Quantidade ou valor inválido na venda.');
      if(!s.reviewPending){if(Math.abs(money(s.bags*s.pricePerBag)-s.total)>0.001)errors.push('Total da venda inconsistente.');const f=db.finance.find(f=>f.saleId===s.id);if(!f||Math.abs(f.amount-s.total)>0.001||paid(f)>f.amount+EPS)errors.push('Financeiro da venda inconsistente.');}
    }
    for(const l of db.stockLots||[]){if(!physical(l))continue;if(!finite(l.bags)||l.bags<=0||!finite(l.remaining)||l.remaining<0||Number(l.remaining)>Number(l.bags)+EPS||lotReserved(db,l.id,'',plan)>Number(l.remaining)+EPS)errors.push('Estoque negativo ou reservas acima do saldo.');}
    for(const p of db.purchases||[])if(purchaseCommitted(db,p.id)>Number(p.bags)+EPS)errors.push('Vendas acima da quantidade da OC.');
    return [...new Set(errors)];
  }
  return {qty,money,paid,physical,delivered,remaining,lotReserved,available,purchaseCommitted,externalDelivered,futureReservations,migrate,validateSale,saveSale,dispatch,reverseDelivery,cancel,reverseEntry,audit};
});
