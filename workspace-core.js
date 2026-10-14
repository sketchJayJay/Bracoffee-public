/* Read-only projections for the daily workspace. Shared with regression tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./commercial-core'));else root.BracoffeeWorkspaceCore=factory(root.BracoffeeCommercial);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const balance=f=>f&&!f.cancelledAt&&!f.pricePending?Math.max(0,C.money(Number(f.amount||0)-C.paid(f))):0;
  const received=(db,id)=>C.qty(db.stockLots.filter(l=>C.physical(l)&&l.purchaseId===id).reduce((n,l)=>n+Number(l.bags),0));
  function tasks(db,today){
    const result=[],add=(group,title,record,date,action,priority=3,amount=0)=>result.push({id:group+'-'+action.id,group,title,record,date:date||'',action,priority,amount,late:!!date&&date<today&&!['documents','review'].includes(group)});
    for(const f of db.finance){const n=balance(f);if(!n||!f.dueDate)continue;if(f.dueDate<=today)add('finance',f.type==='receivable'?'Receber '+f.person:'Pagar '+f.person,f.oc,f.dueDate,{type:'finance',id:f.id},f.dueDate<today?0:1,n);}
    for(const p of db.purchases){if(p.cancelledAt)continue;if(p.pricePending){add('fix','Fixar preço da compra',p.oc,p.dueDate,{type:'editPurchase',id:p.id},2);continue;}
      if(!p.invoiceIssued)add('documents','Emitir instrução de faturamento',p.oc+' · '+p.sellerName,p.date,{type:'invoice',id:p.id},4);
      const pending=C.qty(Number(p.bags)-received(db,p.id)-C.externalDelivered(db,p.id));if(p.destination==='stock'&&pending>0)add('receipt','Receber café · '+pending.toLocaleString('pt-BR')+' sc',p.oc+' · '+p.sellerName,p.expectedReceipt,{type:'receipt',id:p.id},p.expectedReceipt&&p.expectedReceipt<today?1:3);
      if(p.destination==='future'&&pending>0)add('future','Conferir entrega futura',p.oc+' · '+p.sellerName,p.expectedReceipt,{type:'purchase',id:p.id},p.expectedReceipt&&p.expectedReceipt<today?1:5);
    }
    for(const s of db.sales){if(s.cancelledAt)continue;if(s.reviewPending){add('review','Conferir venda antiga',s.ov+' · '+s.buyer,s.date,{type:'editSale',id:s.id},3);continue;}
      if(s.pricePending)add('fix','Fixar preço da venda',s.ov+' · '+s.buyer,s.dueDate,{type:'editSale',id:s.id},2);
      if(C.remaining(s)>0)add('delivery','Entregar café · '+C.remaining(s).toLocaleString('pt-BR')+' sc',s.ov+' · '+s.buyer,s.expectedDelivery,{type:'sale',id:s.id},s.expectedDelivery&&s.expectedDelivery<today?1:3);
    }
    return result.sort((a,b)=>a.priority-b.priority||(a.date||'9999').localeCompare(b.date||'9999')||a.record.localeCompare(b.record));
  }
  function search(db,query){
    const q=norm(query),items=[];if(!q)return [];
    const add=(type,id,title,subtitle,extra='')=>{const n=norm(title+' '+subtitle+' '+extra);if(n.includes(q))items.push({type,id,title,subtitle,rank:norm(title)===q?0:norm(title).startsWith(q)?1:2});};
    db.purchases.forEach(p=>add('purchase',p.id,p.oc,p.sellerName+' · '+(p.drink||''),[p.sellerDoc,p.brokerName,p.nfNumber,p.notes].join(' ')));
    db.stockLots.filter(C.physical).forEach(l=>add('lot',l.id,'Lote '+(l.lotRef||l.oc),[l.oc,l.quality||l.drink,l.warehouse,l.nf?'NF '+l.nf:''].filter(Boolean).join(' · '),l.sellerName));
    db.sales.forEach(s=>add('sale',s.id,s.ov,s.buyer+' · '+s.drink,[s.buyerDoc,s.brokerName,s.cancelledAt?'Cancelada':''].join(' ')));
    (db.stockGuides||[]).forEach(g=>add('guide',g.id,g.code,[g.lotSnapshot?.lotRef,g.warehouse,g.recipient,g.cancelledAt?'Cancelada':''].filter(Boolean).join(' · '),[g.lotSnapshot?.nf,g.saleRef].join(' ')));
    db.producers.forEach(p=>add('producer',p.id,p.name,[p.doc,p.city,p.phone].filter(Boolean).join(' · ')));
    (db.customers||[]).forEach(c=>add('customer',c.id,c.name,[c.doc,c.city,c.phone].filter(Boolean).join(' · ')));
    db.finance.filter(f=>!f.cancelledAt).forEach(f=>add('finance',f.id,(f.type==='receivable'?'Receber · ':'Pagar · ')+f.person,[f.oc,f.category].filter(Boolean).join(' · '),f.notes));
    return items.sort((a,b)=>a.rank-b.rank||a.title.localeCompare(b.title)).slice(0,60);
  }
  function trace(db,id){const lot=db.stockLots.find(l=>l.id===id);if(!lot)return null;return {lot,purchase:db.purchases.find(p=>p.id===lot.purchaseId),sales:db.sales.filter(s=>(s.allocations||[]).some(a=>a.lotId===id)||(s.deliveries||[]).some(d=>(d.allocations||[]).some(a=>a.lotId===id))||s.source==='future'&&s.purchaseId===lot.purchaseId),guides:(db.stockGuides||[]).filter(g=>g.lotId===id),movements:(db.stockMovements||[]).filter(m=>m.lotId===id)};}
  return {norm,balance,received,tasks,search,trace};
});
