(() => {
  'use strict';

  const STORAGE_KEY = 'bracoffee_db_v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const defaultDB = () => ({
    settings: {
      companyName: 'BRACOFFEE',
      companyDoc: '',
      companyCity: '',
      ocPrefix: 'OC',
      contractTerms: 'O vendedor declara ser legítimo proprietário do café descrito nesta ordem de compra e concorda com a quantidade, classificação, preço e condição de pagamento registrados neste documento. A entrega, conferência e liquidação financeira seguirão as condições acordadas entre as partes.'
    },
    producers: [],
    samples: [],
    purchases: [],
    stockLots: [],
    finance: [],
    sales: [],
    counters: {}
  });

  let db = loadDB();
  let activePurchaseId = null;

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultDB();
      const parsed = JSON.parse(raw);
      return { ...defaultDB(), ...parsed, settings: { ...defaultDB().settings, ...(parsed.settings || {}) } };
    } catch (e) {
      console.error(e);
      return defaultDB();
    }
  }

  function saveDB() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    renderAll();
  }

  function uid(prefix = 'id') {
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${id}`;
  }

  const todayISO = () => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n, max = 2) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max });
  const dateBR = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function toast(title, detail = '', type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}`;
    $('#toastStack').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function badge(status, type = 'payment') {
    const map = type === 'sample'
      ? { pending: ['Em análise', 'amber'], approved: ['Aprovada', 'green'], rejected: ['Reprovada', 'red'] }
      : { pending: ['A pagar', 'amber'], paid: ['Pago', 'green'], partial: ['Parcial', 'amber'] };
    const [label, cls] = map[status] || [status || '—', 'gray'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function navigate(page) {
    $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    $$('.nav-item,.mobile-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    const titles = {
      dashboard: ['VISÃO GERAL', 'Bom trabalho 👋'],
      balcao: ['BALCÃO', 'Compra rápida'],
      provas: ['PROVADOR', 'Provas de café'],
      compras: ['HISTÓRICO', 'Ordens de compra'],
      estoque: ['SALDO', 'Estoque'],
      financeiro: ['CONTROLE', 'Financeiro'],
      produtores: ['CADASTRO', 'Produtores']
    };
    $('#pageEyebrow').textContent = titles[page]?.[0] || 'BRACOFFEE';
    $('#pageTitle').textContent = titles[page]?.[1] || 'BRACOFFEE';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'balcao') setTimeout(() => $('#sellerName')?.focus(), 120);
  }

  function nextOC() {
    const year = new Date().getFullYear();
    const current = Number(db.counters[year] || 0) + 1;
    db.counters[year] = current;
    const prefix = (db.settings.ocPrefix || 'OC').trim().toUpperCase();
    return `${prefix}-${year}-${String(current).padStart(6, '0')}`;
  }

  function renderAll() {
    renderProducerDatalist();
    renderDashboard();
    renderSamples();
    renderPurchases();
    renderStock();
    renderFinance();
    renderProducers();
  }

  function renderDashboard() {
    const today = todayISO();
    const month = today.slice(0, 7);
    const monthPurchases = db.purchases.filter(p => p.date?.startsWith(month));
    const todayPurchases = db.purchases.filter(p => p.date === today);
    const stock = db.stockLots.reduce((s, l) => s + Number(l.remaining || 0), 0);
    const pending = db.finance.filter(f => f.type === 'payable' && f.status !== 'paid').reduce((s, f) => s + Math.max(0, Number(f.amount) - Number(f.paidAmount || 0)), 0);
    const monthTotal = monthPurchases.reduce((s, p) => s + Number(p.total || 0), 0);

    $('#dashboardStats').innerHTML = [
      ['Compras hoje', `${todayPurchases.length}`, todayPurchases.length ? `${num(todayPurchases.reduce((s,p)=>s+Number(p.bags||0),0))} sacas` : 'Nenhuma compra hoje'],
      ['Comprado no mês', money(monthTotal), `${monthPurchases.length} ordem(ns) de compra`],
      ['Estoque disponível', `${num(stock)} sacas`, 'Saldo atual dos lotes'],
      ['A pagar', money(pending), 'Compras ainda não liquidadas']
    ].map(([label,value,help]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-help">${help}</div></div>`).join('');

    const recent = [...db.purchases].sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0,5);
    $('#recentPurchases').innerHTML = recent.length ? recent.map(p => `
      <div class="list-row">
        <div><strong>${esc(p.oc)} · ${esc(p.sellerName)}</strong><small>${dateBR(p.date)} · ${num(p.bags)} sacas · ${esc(p.drink)}</small></div>
        <div class="amount">${money(p.total)}<br>${badge(p.paymentStatus)}</div>
      </div>`).join('') : emptyHTML('Ainda não há compras', 'A primeira compra feita no balcão vai aparecer aqui.');

    const groups = stockByDrink();
    const max = Math.max(1, ...groups.map(g => g.total));
    $('#stockSummary').innerHTML = groups.length ? groups.slice(0,6).map(g => `
      <div class="stock-line"><div><strong>${esc(g.drink)}</strong><div class="stock-bar"><i style="width:${Math.max(4,(g.total/max)*100)}%"></i></div></div><strong>${num(g.total)} sc</strong></div>`).join('') : emptyHTML('Estoque vazio', 'Os lotes entram automaticamente após uma compra.');
  }

  function stockByDrink() {
    const map = new Map();
    db.stockLots.forEach(l => {
      if (Number(l.remaining || 0) <= 0) return;
      const key = l.drink || 'Sem classificação';
      map.set(key, (map.get(key) || 0) + Number(l.remaining || 0));
    });
    return [...map.entries()].map(([drink,total]) => ({drink,total})).sort((a,b) => b.total-a.total);
  }

  function emptyHTML(title, detail) {
    return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
  }

  function renderProducerDatalist() {
    $('#producerList').innerHTML = db.producers.map(p => `<option value="${esc(p.name)}"></option>`).join('');
  }

  function producerExact(name) {
    const n = normalize(name);
    return db.producers.find(p => normalize(p.name) === n);
  }

  function fillSellerFromProducer() {
    const p = producerExact($('#sellerName').value);
    if (!p) return;
    $('#sellerDoc').value = p.doc || '';
    $('#sellerPhone').value = p.phone || '';
    $('#sellerFarm').value = p.farm || '';
    $('#sellerCity').value = p.city || '';
  }

  function updatePurchaseTotal() {
    const total = Number($('#purchaseBags').value || 0) * Number($('#purchasePrice').value || 0);
    $('#purchaseTotal').textContent = money(total);
    if (!$('#purchaseWeight').value && Number($('#purchaseBags').value) > 0) {
      $('#purchaseWeight').placeholder = `≈ ${num(Number($('#purchaseBags').value) * 60)} kg`;
    }
  }

  function resetPurchaseForm() {
    $('#purchaseForm').reset();
    $('#purchaseForm').dataset.editingId = '';
    $('#purchaseDate').value = todayISO();
    $('#purchaseTotal').textContent = money(0);
    $('#purchasePaymentStatus').value = 'pending';
    $('#purchasePaymentMethod').value = 'PIX';
    $('#purchaseWeight').placeholder = 'Calculado ou informado';
    activePurchaseId = null;
  }

  function collectPurchaseForm() {
    const bags = Number($('#purchaseBags').value || 0);
    const pricePerBag = Number($('#purchasePrice').value || 0);
    return {
      sellerName: $('#sellerName').value.trim(),
      sellerDoc: $('#sellerDoc').value.trim(),
      sellerPhone: $('#sellerPhone').value.trim(),
      sellerFarm: $('#sellerFarm').value.trim(),
      sellerCity: $('#sellerCity').value.trim(),
      bags,
      weight: Number($('#purchaseWeight').value || bags * 60 || 0),
      drink: $('#purchaseDrink').value.trim(),
      cata: Number($('#purchaseCata').value || 0),
      moisture: Number($('#purchaseMoisture').value || 0),
      classification: $('#purchaseClass').value.trim(),
      notes: $('#purchaseNotes').value.trim(),
      pricePerBag,
      total: bags * pricePerBag,
      date: $('#purchaseDate').value,
      paymentStatus: $('#purchasePaymentStatus').value,
      paymentMethod: $('#purchasePaymentMethod').value,
      dueDate: $('#purchaseDueDate').value
    };
  }

  function upsertProducerFromPurchase(data) {
    let p = producerExact(data.sellerName);
    if (p) {
      p.doc = data.sellerDoc || p.doc || '';
      p.phone = data.sellerPhone || p.phone || '';
      p.farm = data.sellerFarm || p.farm || '';
      p.city = data.sellerCity || p.city || '';
      p.updatedAt = new Date().toISOString();
      return p;
    }
    p = { id: uid('prod'), name: data.sellerName, doc: data.sellerDoc, phone: data.sellerPhone, farm: data.sellerFarm, city: data.sellerCity, createdAt: new Date().toISOString() };
    db.producers.push(p);
    return p;
  }

  function createPurchase(data) {
    const producer = upsertProducerFromPurchase(data);
    const purchase = {
      id: uid('buy'), oc: nextOC(), producerId: producer.id, ...data,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const lot = {
      id: uid('lot'), purchaseId: purchase.id, oc: purchase.oc, sellerName: purchase.sellerName,
      bags: purchase.bags, remaining: purchase.bags, drink: purchase.drink, cata: purchase.cata,
      moisture: purchase.moisture, classification: purchase.classification, date: purchase.date,
      createdAt: new Date().toISOString()
    };
    const finance = {
      id: uid('fin'), type: 'payable', purchaseId: purchase.id, oc: purchase.oc, person: purchase.sellerName,
      amount: purchase.total, paidAmount: purchase.paymentStatus === 'paid' ? purchase.total : 0,
      status: purchase.paymentStatus, method: purchase.paymentMethod, dueDate: purchase.dueDate,
      date: purchase.date, createdAt: new Date().toISOString()
    };
    purchase.lotId = lot.id;
    purchase.financeId = finance.id;
    db.purchases.push(purchase);
    db.stockLots.push(lot);
    db.finance.push(finance);
    saveDB();
    toast('Compra registrada', `${purchase.oc} criada com contrato, estoque e financeiro.`);
    resetPurchaseForm();
    openPurchaseDetail(purchase.id);
  }

  function updatePurchase(id, data) {
    const p = db.purchases.find(x => x.id === id);
    if (!p) return;
    const oldBags = Number(p.bags || 0);
    Object.assign(p, data, { updatedAt: new Date().toISOString() });
    const prod = upsertProducerFromPurchase(data);
    p.producerId = prod.id;
    const lot = db.stockLots.find(l => l.id === p.lotId);
    if (lot) {
      const sold = Math.max(0, oldBags - Number(lot.remaining || 0));
      Object.assign(lot, { oc:p.oc, sellerName:p.sellerName, bags:p.bags, remaining:Math.max(0,Number(p.bags)-sold), drink:p.drink, cata:p.cata, moisture:p.moisture, classification:p.classification, date:p.date });
    }
    const fin = db.finance.find(f => f.id === p.financeId);
    if (fin) {
      const wasPaid = fin.status === 'paid';
      Object.assign(fin, { person:p.sellerName, amount:p.total, status:p.paymentStatus, method:p.paymentMethod, dueDate:p.dueDate, date:p.date });
      if (p.paymentStatus === 'paid') fin.paidAmount = p.total;
      else if (wasPaid) fin.paidAmount = 0;
    }
    saveDB();
    toast('Compra atualizada', `${p.oc} foi atualizada.`);
    resetPurchaseForm();
    openPurchaseDetail(id);
  }

  function renderSamples() {
    const q = normalize($('#sampleSearch')?.value || '');
    const filter = $('#sampleFilter')?.value || 'all';
    const rows = [...db.samples].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).filter(s => {
      const okQ = !q || normalize(`${s.name} ${s.drink} ${s.notes}`).includes(q);
      return okQ && (filter === 'all' || s.status === filter);
    });
    $('#samplesList').innerHTML = rows.length ? rows.map(s => `
      <div class="data-card">
        <div class="main-info"><strong>${esc(s.name)}</strong><small>${dateBR(s.date || s.createdAt?.slice(0,10))} · ${badge(s.status,'sample')}</small></div>
        <div class="data-meta"><label>Sacas</label><strong>${num(s.bags)}</strong></div>
        <div class="data-meta"><label>Bebida</label><strong>${esc(s.drink)}</strong></div>
        <div class="data-meta hide-mid"><label>Cata</label><strong>${s.cata ? `${num(s.cata)}%` : '—'}</strong></div>
        <div class="data-meta hide-mid"><label>Umidade</label><strong>${s.moisture ? `${num(s.moisture)}%` : '—'}</strong></div>
        <div class="card-actions">
          <button class="mini-btn" data-sample-edit="${s.id}">Editar</button>
          <button class="mini-btn primary" data-sample-buy="${s.id}">Comprar</button>
          <button class="mini-btn" data-sample-delete="${s.id}">Excluir</button>
        </div>
      </div>`).join('') : emptyHTML('Nenhuma prova encontrada', 'Crie uma prova para começar.');
  }

  function openSampleModal(sample = null) {
    $('#sampleModalTitle').textContent = sample ? 'Editar prova' : 'Nova prova';
    $('#sampleId').value = sample?.id || '';
    $('#sampleName').value = sample?.name || '';
    $('#sampleBags').value = sample?.bags || '';
    $('#sampleDrink').value = sample?.drink || '';
    $('#sampleCata').value = sample?.cata || '';
    $('#sampleMoisture').value = sample?.moisture || '';
    $('#sampleNotes').value = sample?.notes || '';
    $('#sampleStatus').value = sample?.status || 'pending';
    $('#sampleModal').showModal();
  }

  function saveSample() {
    const id = $('#sampleId').value;
    const data = {
      name: $('#sampleName').value.trim(), bags:Number($('#sampleBags').value||0), drink:$('#sampleDrink').value.trim(),
      cata:Number($('#sampleCata').value||0), moisture:Number($('#sampleMoisture').value||0), notes:$('#sampleNotes').value.trim(),
      status:$('#sampleStatus').value, date:todayISO(), updatedAt:new Date().toISOString()
    };
    if (!data.name || !data.drink) return;
    if (id) Object.assign(db.samples.find(s=>s.id===id), data);
    else db.samples.push({ id:uid('sample'), ...data, createdAt:new Date().toISOString() });
    saveDB(); $('#sampleModal').close(); toast(id ? 'Prova atualizada' : 'Prova salva');
  }

  function sampleToPurchase(id) {
    const s = db.samples.find(x=>x.id===id); if(!s) return;
    resetPurchaseForm();
    $('#sellerName').value=s.name; $('#purchaseBags').value=s.bags||''; $('#purchaseDrink').value=s.drink||'';
    $('#purchaseCata').value=s.cata||''; $('#purchaseMoisture').value=s.moisture||''; $('#purchaseNotes').value=s.notes||'';
    const prod=producerExact(s.name); if(prod) fillSellerFromProducer();
    updatePurchaseTotal(); navigate('balcao'); toast('Prova carregada','Complete o preço e finalize a compra.');
  }

  function renderPurchases() {
    const q=normalize($('#purchaseSearch')?.value||''); const filter=$('#purchaseFilter')?.value||'all';
    const rows=[...db.purchases].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')).filter(p=>{
      const okQ=!q||normalize(`${p.oc} ${p.sellerName} ${p.sellerDoc} ${p.drink}`).includes(q);
      return okQ&&(filter==='all'||p.paymentStatus===filter);
    });
    $('#purchasesTable').innerHTML=rows.length?rows.map(p=>`<tr>
      <td><strong>${esc(p.oc)}</strong></td><td>${esc(p.sellerName)}</td><td>${dateBR(p.date)}</td><td>${num(p.bags)}</td><td>${esc(p.drink)}</td><td><strong>${money(p.total)}</strong></td><td>${badge(p.paymentStatus)}</td><td><button class="table-link" data-purchase-open="${p.id}">Abrir</button></td>
    </tr>`).join(''):`<tr><td colspan="8">${emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.')}</td></tr>`;
    $('#purchasesMobile').innerHTML=rows.length?rows.map(p=>`<div class="purchase-mobile-card">
      <div class="purchase-mobile-top"><div><strong>${esc(p.oc)}</strong><br><small>${esc(p.sellerName)}</small></div>${badge(p.paymentStatus)}</div>
      <div class="purchase-mobile-grid"><div><small>Sacas</small><strong>${num(p.bags)}</strong></div><div><small>Valor</small><strong>${money(p.total)}</strong></div><div><small>Bebida</small><strong>${esc(p.drink)}</strong></div><div><small>Data</small><strong>${dateBR(p.date)}</strong></div></div>
      <button class="mini-btn primary" data-purchase-open="${p.id}">Abrir compra</button></div>`).join(''):emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.');
  }

  function openPurchaseDetail(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return; activePurchaseId=id;
    const lot=db.stockLots.find(l=>l.id===p.lotId); const fin=db.finance.find(f=>f.id===p.financeId); const sales=db.sales.filter(s=>s.lotId===p.lotId);
    $('#detailOc').textContent=p.oc;
    $('#purchaseDetailBody').innerHTML=`
      <div class="detail-grid">
        <div class="detail-box"><label>Vendedor</label><strong>${esc(p.sellerName)}</strong></div>
        <div class="detail-box"><label>Documento</label><strong>${esc(p.sellerDoc||'—')}</strong></div>
        <div class="detail-box"><label>Café</label><strong>${num(p.bags)} sacas · ${esc(p.drink)}</strong></div>
        <div class="detail-box"><label>Valor</label><strong>${money(p.total)}</strong></div>
        <div class="detail-box"><label>Preço / saca</label><strong>${money(p.pricePerBag)}</strong></div>
        <div class="detail-box"><label>Pagamento</label><strong>${p.paymentStatus==='paid'?'Pago':'A pagar'} · ${esc(p.paymentMethod||'—')}</strong></div>
        <div class="detail-box"><label>Cata / Umidade</label><strong>${p.cata?num(p.cata)+'%':'—'} · ${p.moisture?num(p.moisture)+'%':'—'}</strong></div>
        <div class="detail-box"><label>Estoque restante</label><strong>${num(lot?.remaining||0)} sacas</strong></div>
        <div class="detail-box span-2"><label>Observação</label><strong>${esc(p.notes||'Sem observação')}</strong></div>
      </div>
      <div class="detail-section"><h4>Movimentação do lote</h4><div class="timeline">
        <div class="timeline-row"><div><strong>Entrada da compra</strong><small>${dateBR(p.date)}</small></div><strong>+ ${num(p.bags)} sc</strong></div>
        ${sales.map(s=>`<div class="timeline-row"><div><strong>Saída${s.buyer?' · '+esc(s.buyer):''}</strong><small>${dateBR(s.date)}</small></div><strong>- ${num(s.bags)} sc</strong></div>`).join('')||''}
      </div></div>`;
    $('#detailPayBtn').textContent=p.paymentStatus==='paid'?'Marcar como pendente':'Dar baixa';
    $('#purchaseDetailModal').showModal();
  }

  function editPurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return;
    resetPurchaseForm();
    const map={sellerName:p.sellerName,sellerDoc:p.sellerDoc,sellerPhone:p.sellerPhone,sellerFarm:p.sellerFarm,sellerCity:p.sellerCity,purchaseBags:p.bags,purchaseWeight:p.weight,purchaseDrink:p.drink,purchaseCata:p.cata,purchaseMoisture:p.moisture,purchaseClass:p.classification,purchaseNotes:p.notes,purchasePrice:p.pricePerBag,purchaseDate:p.date,purchasePaymentStatus:p.paymentStatus,purchasePaymentMethod:p.paymentMethod,purchaseDueDate:p.dueDate};
    Object.entries(map).forEach(([id,val])=>{const el=$(`#${id}`);if(el)el.value=val??'';});
    $('#purchaseForm').dataset.editingId=id; updatePurchaseTotal(); $('#purchaseDetailModal').close(); navigate('balcao');
    toast('Editando compra',p.oc);
  }

  function setPurchasePaid(id, paid) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return;
    p.paymentStatus=paid?'paid':'pending'; p.updatedAt=new Date().toISOString();
    const f=db.finance.find(x=>x.id===p.financeId); if(f){f.status=p.paymentStatus;f.paidAmount=paid?f.amount:0;f.paidAt=paid?todayISO():'';}
    saveDB(); openPurchaseDetail(id); toast(paid?'Pagamento baixado':'Pagamento reaberto',p.oc);
  }

  function deletePurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return;
    if(!confirm(`Excluir ${p.oc}? Estoque, financeiro e saídas ligadas a essa compra também serão removidos.`)) return;
    db.purchases=db.purchases.filter(x=>x.id!==id); db.finance=db.finance.filter(x=>x.purchaseId!==id);
    const lotIds=db.stockLots.filter(l=>l.purchaseId===id).map(l=>l.id); db.stockLots=db.stockLots.filter(l=>l.purchaseId!==id); db.sales=db.sales.filter(s=>!lotIds.includes(s.lotId));
    saveDB(); $('#purchaseDetailModal').close(); toast('Compra excluída',p.oc); activePurchaseId=null;
  }

  function renderStock() {
    const total=db.stockLots.reduce((s,l)=>s+Number(l.remaining||0),0); const groups=stockByDrink(); const lotsOpen=db.stockLots.filter(l=>Number(l.remaining||0)>0).length;
    $('#stockStats').innerHTML=[['Saldo total',`${num(total)} sacas`,'Disponível no depósito'],['Lotes abertos',String(lotsOpen),'Com saldo disponível'],['Tipos de bebida',String(groups.length),'Classificações com saldo']].map(([l,v,h])=>`<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-help">${h}</div></div>`).join('');
    const q=normalize($('#stockSearch')?.value||'');
    const rows=[...db.stockLots].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).filter(l=>Number(l.remaining||0)>0&&(!q||normalize(`${l.oc} ${l.sellerName} ${l.drink}`).includes(q)));
    $('#stockLots').innerHTML=rows.length?rows.map(l=>`<div class="data-card">
      <div class="main-info"><strong>${esc(l.oc)} · ${esc(l.sellerName)}</strong><small>Entrada ${dateBR(l.date)}</small></div>
      <div class="data-meta"><label>Saldo</label><strong>${num(l.remaining)} sc</strong></div><div class="data-meta"><label>Bebida</label><strong>${esc(l.drink)}</strong></div>
      <div class="data-meta hide-mid"><label>Cata</label><strong>${l.cata?num(l.cata)+'%':'—'}</strong></div><div class="data-meta hide-mid"><label>Umidade</label><strong>${l.moisture?num(l.moisture)+'%':'—'}</strong></div>
      <div class="card-actions"><button class="mini-btn primary" data-lot-sell="${l.id}">Registrar saída</button><button class="mini-btn" data-purchase-open="${l.purchaseId}">Ver OC</button></div>
    </div>`).join(''):emptyHTML('Nenhum lote disponível','As compras finalizadas entram aqui automaticamente.');
  }

  function openSaleModal(lotId) {
    const l=db.stockLots.find(x=>x.id===lotId);if(!l)return;
    $('#saleLotId').value=lotId; $('#saleBags').value=''; $('#salePrice').value=''; $('#saleBuyer').value='';
    $('#saleBags').max=l.remaining; $('#saleLotSummary').innerHTML=`<strong>${esc(l.oc)} · ${esc(l.drink)}</strong><br>Disponível: ${num(l.remaining)} sacas`;
    $('#saleModal').showModal();
  }

  function saveSale() {
    const lot=db.stockLots.find(x=>x.id===$('#saleLotId').value);if(!lot)return;
    const bags=Number($('#saleBags').value||0); if(bags<=0||bags>Number(lot.remaining)){toast('Quantidade inválida',`Disponível: ${num(lot.remaining)} sacas.`,'error');return;}
    const price=Number($('#salePrice').value||0); const sale={id:uid('sale'),lotId:lot.id,purchaseId:lot.purchaseId,date:todayISO(),bags,pricePerBag:price,total:bags*price,buyer:$('#saleBuyer').value.trim(),createdAt:new Date().toISOString()};
    lot.remaining=Number(lot.remaining)-bags; db.sales.push(sale); saveDB(); $('#saleModal').close(); toast('Saída registrada',`${num(bags)} sacas baixadas do lote.`);
  }

  function renderFinance() {
    const all=db.finance.filter(f=>f.type==='payable'); const pending=all.reduce((s,f)=>s+(f.status==='paid'?0:Math.max(0,Number(f.amount)-Number(f.paidAmount||0))),0); const paidMonth=all.filter(f=>f.status==='paid'&&(f.paidAt||f.date||'').startsWith(todayISO().slice(0,7))).reduce((s,f)=>s+Number(f.paidAmount||f.amount||0),0); const total=all.reduce((s,f)=>s+Number(f.amount||0),0);
    $('#financeStats').innerHTML=[['A pagar',money(pending),'Saldo pendente'],['Pago no mês',money(paidMonth),'Compras liquidadas'],['Total comprado',money(total),'Histórico acumulado']].map(([l,v,h])=>`<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-help">${h}</div></div>`).join('');
    const q=normalize($('#financeSearch')?.value||''); const filter=$('#financeFilter')?.value||'all';
    const rows=[...all].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).filter(f=>(!q||normalize(`${f.oc} ${f.person}`).includes(q))&&(filter==='all'||f.status===filter));
    $('#financeList').innerHTML=rows.length?rows.map(f=>`<div class="data-card">
      <div class="main-info"><strong>${esc(f.oc)} · ${esc(f.person)}</strong><small>${dateBR(f.date)} · ${esc(f.method||'—')}</small></div>
      <div class="data-meta"><label>Valor</label><strong>${money(f.amount)}</strong></div><div class="data-meta"><label>Vencimento</label><strong>${dateBR(f.dueDate)}</strong></div>
      <div class="data-meta hide-mid"><label>Status</label><strong>${badge(f.status)}</strong></div><div class="data-meta hide-mid"><label>Pago</label><strong>${money(f.paidAmount||0)}</strong></div>
      <div class="card-actions"><button class="mini-btn ${f.status==='paid'?'':'primary'}" data-finance-toggle="${f.id}">${f.status==='paid'?'Reabrir':'Dar baixa'}</button><button class="mini-btn" data-purchase-open="${f.purchaseId}">Ver OC</button></div>
    </div>`).join(''):emptyHTML('Nenhum lançamento encontrado','As compras do balcão criam o financeiro automaticamente.');
  }

  function toggleFinance(id) {
    const f=db.finance.find(x=>x.id===id);if(!f)return; const paid=f.status!=='paid'; f.status=paid?'paid':'pending';f.paidAmount=paid?f.amount:0;f.paidAt=paid?todayISO():'';
    const p=db.purchases.find(x=>x.id===f.purchaseId);if(p)p.paymentStatus=f.status;saveDB();toast(paid?'Pagamento baixado':'Pagamento reaberto',f.oc);
  }

  function renderProducers() {
    const q=normalize($('#producerSearch')?.value||''); const rows=[...db.producers].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).filter(p=>!q||normalize(`${p.name} ${p.doc} ${p.phone} ${p.city} ${p.farm}`).includes(q));
    $('#producersList').innerHTML=rows.length?rows.map(p=>`<div class="data-card">
      <div class="main-info"><strong>${esc(p.name)}</strong><small>${esc(p.farm||p.city||'Sem propriedade informada')}</small></div>
      <div class="data-meta"><label>Documento</label><strong>${esc(p.doc||'—')}</strong></div><div class="data-meta"><label>Telefone</label><strong>${esc(p.phone||'—')}</strong></div>
      <div class="data-meta hide-mid"><label>Cidade</label><strong>${esc(p.city||'—')}</strong></div><div class="data-meta hide-mid"><label>Compras</label><strong>${db.purchases.filter(x=>x.producerId===p.id).length}</strong></div>
      <div class="card-actions"><button class="mini-btn" data-producer-edit="${p.id}">Editar</button><button class="mini-btn" data-producer-delete="${p.id}">Excluir</button></div>
    </div>`).join(''):emptyHTML('Nenhum produtor cadastrado','Ao fazer uma compra, o vendedor também pode ser cadastrado automaticamente.');
  }

  function openProducerModal(p=null){$('#producerModalTitle').textContent=p?'Editar produtor':'Novo produtor';$('#producerId').value=p?.id||'';$('#producerName').value=p?.name||'';$('#producerDoc').value=p?.doc||'';$('#producerPhone').value=p?.phone||'';$('#producerFarm').value=p?.farm||'';$('#producerCity').value=p?.city||'';$('#producerModal').showModal();}
  function saveProducer(){const id=$('#producerId').value;const data={name:$('#producerName').value.trim(),doc:$('#producerDoc').value.trim(),phone:$('#producerPhone').value.trim(),farm:$('#producerFarm').value.trim(),city:$('#producerCity').value.trim(),updatedAt:new Date().toISOString()};if(!data.name)return;if(id)Object.assign(db.producers.find(p=>p.id===id),data);else db.producers.push({id:uid('prod'),...data,createdAt:new Date().toISOString()});saveDB();$('#producerModal').close();toast(id?'Produtor atualizado':'Produtor cadastrado');}
  function deleteProducer(id){const p=db.producers.find(x=>x.id===id);if(!p)return;const used=db.purchases.some(x=>x.producerId===id);if(used){toast('Cadastro em uso','Este produtor possui compras vinculadas e não pode ser excluído.','error');return;}if(confirm(`Excluir ${p.name}?`)){db.producers=db.producers.filter(x=>x.id!==id);saveDB();toast('Produtor excluído');}}

  function printContract(id){
    const p=db.purchases.find(x=>x.id===id);if(!p)return;
    const s=db.settings; const logo=new URL('assets/bracoffee_logo.png',location.href).href;
    const w=window.open('','_blank'); if(!w){toast('Pop-up bloqueado','Permita pop-ups para imprimir o contrato.','error');return;}
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(p.oc)} - Contrato</title><style>
      @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#2a2521;margin:0;font-size:12px;line-height:1.45}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #8a6035;padding-bottom:14px;margin-bottom:20px}.logo{width:235px;height:auto}.oc{text-align:right}.oc h1{font-size:20px;margin:4px 0;color:#75502f}.muted{color:#746b63}.title{text-align:center;margin:22px 0 18px;font-size:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{border:1px solid #ddd2c5;border-radius:8px;padding:10px}.box span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#88796a;font-weight:bold}.box strong{display:block;margin-top:3px;font-size:12px}.wide{grid-column:1/-1}.terms{margin-top:22px;text-align:justify}.signs{display:grid;grid-template-columns:1fr 1fr;gap:55px;margin-top:70px}.sign{border-top:1px solid #4b423b;padding-top:6px;text-align:center}.foot{margin-top:34px;text-align:center;font-size:10px;color:#8b8076}@media print{.no-print{display:none!important}}
    </style></head><body>
      <div class="head"><img src="${logo}" class="logo"><div class="oc"><span class="muted">ORDEM DE COMPRA</span><h1>${esc(p.oc)}</h1><span>${dateBR(p.date)}</span></div></div>
      <h2 class="title">CONTRATO DE COMPRA DE CAFÉ</h2>
      <div class="grid">
        <div class="box"><span>Vendedor</span><strong>${esc(p.sellerName)}</strong></div><div class="box"><span>CPF / CNPJ</span><strong>${esc(p.sellerDoc||'Não informado')}</strong></div>
        <div class="box"><span>Propriedade</span><strong>${esc(p.sellerFarm||'Não informada')}</strong></div><div class="box"><span>Cidade</span><strong>${esc(p.sellerCity||'Não informada')}</strong></div>
        <div class="box"><span>Quantidade</span><strong>${num(p.bags)} sacas (${num(p.weight)} kg)</strong></div><div class="box"><span>Bebida</span><strong>${esc(p.drink)}</strong></div>
        <div class="box"><span>Cata</span><strong>${p.cata?num(p.cata)+'%':'Não informado'}</strong></div><div class="box"><span>Umidade</span><strong>${p.moisture?num(p.moisture)+'%':'Não informado'}</strong></div>
        <div class="box"><span>Preço por saca</span><strong>${money(p.pricePerBag)}</strong></div><div class="box"><span>Valor total</span><strong>${money(p.total)}</strong></div>
        <div class="box"><span>Pagamento</span><strong>${esc(p.paymentMethod||'Não informado')} · ${p.paymentStatus==='paid'?'Pago':'A pagar'}</strong></div><div class="box"><span>Vencimento</span><strong>${dateBR(p.dueDate)}</strong></div>
        <div class="box wide"><span>Observações</span><strong>${esc(p.notes||'Sem observações adicionais.')}</strong></div>
      </div>
      <div class="terms"><strong>Condições</strong><p>${esc(s.contractTerms||'')}</p></div>
      <div class="signs"><div class="sign">${esc(p.sellerName)}<br><span class="muted">Vendedor</span></div><div class="sign">${esc(s.companyName||'BRACOFFEE')}<br><span class="muted">Comprador</span></div></div>
      <div class="foot">${esc(s.companyName||'BRACOFFEE')}${s.companyDoc?' · '+esc(s.companyDoc):''}${s.companyCity?' · '+esc(s.companyCity):''}<br>Documento vinculado à ordem de compra ${esc(p.oc)}.</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
    </body></html>`); w.document.close();
  }

  function openSettings(){const s=db.settings;$('#settingCompanyName').value=s.companyName||'';$('#settingOcPrefix').value=s.ocPrefix||'OC';$('#settingCompanyDoc').value=s.companyDoc||'';$('#settingCompanyCity').value=s.companyCity||'';$('#settingContractTerms').value=s.contractTerms||'';$('#settingsModal').showModal();}
  function saveSettings(){db.settings={...db.settings,companyName:$('#settingCompanyName').value.trim()||'BRACOFFEE',ocPrefix:$('#settingOcPrefix').value.trim().toUpperCase()||'OC',companyDoc:$('#settingCompanyDoc').value.trim(),companyCity:$('#settingCompanyCity').value.trim(),contractTerms:$('#settingContractTerms').value.trim()};saveDB();$('#settingsModal').close();toast('Configurações salvas');}

  function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bracoffee-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup exportado');}
  function importBackup(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data||!Array.isArray(data.purchases)||!Array.isArray(data.stockLots))throw new Error('inválido');if(!confirm('Importar este backup? Os dados atuais serão substituídos.'))return;db={...defaultDB(),...data,settings:{...defaultDB().settings,...(data.settings||{})}};saveDB();toast('Backup importado');$('#settingsModal').close();}catch(e){toast('Arquivo inválido','Não foi possível importar este backup.','error');}};r.readAsText(file);}

  function bindEvents(){
    document.addEventListener('click',e=>{
      const go=e.target.closest('[data-goto]');if(go)navigate(go.dataset.goto);
      const nav=e.target.closest('[data-page]');if(nav)navigate(nav.dataset.page);
      const close=e.target.closest('[data-close-dialog]');if(close)document.getElementById(close.dataset.closeDialog)?.close();
      const so=e.target.closest('[data-sample-edit]');if(so)openSampleModal(db.samples.find(s=>s.id===so.dataset.sampleEdit));
      const sb=e.target.closest('[data-sample-buy]');if(sb)sampleToPurchase(sb.dataset.sampleBuy);
      const sd=e.target.closest('[data-sample-delete]');if(sd){const s=db.samples.find(x=>x.id===sd.dataset.sampleDelete);if(s&&confirm(`Excluir a prova de ${s.name}?`)){db.samples=db.samples.filter(x=>x.id!==s.id);saveDB();toast('Prova excluída');}}
      const po=e.target.closest('[data-purchase-open]');if(po)openPurchaseDetail(po.dataset.purchaseOpen);
      const ls=e.target.closest('[data-lot-sell]');if(ls)openSaleModal(ls.dataset.lotSell);
      const ft=e.target.closest('[data-finance-toggle]');if(ft)toggleFinance(ft.dataset.financeToggle);
      const pe=e.target.closest('[data-producer-edit]');if(pe)openProducerModal(db.producers.find(p=>p.id===pe.dataset.producerEdit));
      const pd=e.target.closest('[data-producer-delete]');if(pd)deleteProducer(pd.dataset.producerDelete);
    });

    $('#quickBuyBtn').addEventListener('click',()=>navigate('balcao'));
    $('#sellerName').addEventListener('change',fillSellerFromProducer);
    $('#purchaseBags').addEventListener('input',updatePurchaseTotal); $('#purchasePrice').addEventListener('input',updatePurchaseTotal);
    $('#clearPurchaseBtn').addEventListener('click',()=>{if(confirm('Limpar os dados desta compra?'))resetPurchaseForm();});
    $('#purchaseForm').addEventListener('submit',e=>{e.preventDefault();const data=collectPurchaseForm();if(!data.sellerName||!data.bags||!data.drink||!data.date){toast('Confira os campos','Vendedor, sacas, bebida e data são obrigatórios.','error');return;}const id=e.currentTarget.dataset.editingId;if(id)updatePurchase(id,data);else createPurchase(data);});

    $('#newSampleBtn').addEventListener('click',()=>openSampleModal()); $('#sampleForm').addEventListener('submit',e=>{e.preventDefault();saveSample();});
    $('#sampleSearch').addEventListener('input',renderSamples); $('#sampleFilter').addEventListener('change',renderSamples);
    $('#purchaseSearch').addEventListener('input',renderPurchases); $('#purchaseFilter').addEventListener('change',renderPurchases);
    $('#stockSearch').addEventListener('input',renderStock); $('#financeSearch').addEventListener('input',renderFinance); $('#financeFilter').addEventListener('change',renderFinance);
    $('#producerSearch').addEventListener('input',renderProducers); $('#newProducerBtn').addEventListener('click',()=>openProducerModal()); $('#producerForm').addEventListener('submit',e=>{e.preventDefault();saveProducer();});
    $('#saleForm').addEventListener('submit',e=>{e.preventDefault();saveSale();});

    $('#detailContractBtn').addEventListener('click',()=>activePurchaseId&&printContract(activePurchaseId));
    $('#detailEditBtn').addEventListener('click',()=>activePurchaseId&&editPurchase(activePurchaseId));
    $('#detailDeleteBtn').addEventListener('click',()=>activePurchaseId&&deletePurchase(activePurchaseId));
    $('#detailPayBtn').addEventListener('click',()=>{const p=db.purchases.find(x=>x.id===activePurchaseId);if(p)setPurchasePaid(p.id,p.paymentStatus!=='paid');});

    $('#openSettingsBtn').addEventListener('click',openSettings); $('#settingsForm').addEventListener('submit',e=>{e.preventDefault();saveSettings();});
    $('#exportBackupBtn').addEventListener('click',exportBackup); $('#settingsExportBtn').addEventListener('click',exportBackup); $('#importBackupBtn').addEventListener('click',()=>$('#backupFileInput').click()); $('#backupFileInput').addEventListener('change',e=>importBackup(e.target.files[0]));

    $$('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
  }

  function init(){
    $('#purchaseDate').value=todayISO();
    bindEvents(); renderAll();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  init();
})();
