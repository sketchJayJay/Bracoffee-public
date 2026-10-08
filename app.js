(() => {
  'use strict';

  const STORAGE_KEY = 'bracoffee_db_v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const defaultDB = () => ({
    schemaVersion: 3,
    settings: {
      companyName: 'BRACOFFEE CO LTDA.',
      companyDoc: '52.981.416/0001-31',
      companyCity: 'Varginha/MG',
      companyIE: '004.766.165.00-10',
      companyAddress: 'Rua do Comercio de Café, 342 - Industrial Reinaldo Foresti',
      companyPostalCode: '37.026-530',
      companyPhone: '+55 35 99932-1644',
      companyEmail: 'rubens@bracoffeeco.com',
      companyWebsite: 'www.bracoffee.com.br',
      companyInstagram: '@bracoffee.co',
      invoiceNotes: 'ICMS S/FRETE DIFERIDO CONF. ART.7, PARAGRAFO 1 DECRETO 43080/02.\nVENDA EFETUADA COM ALIQUOTA "ZERO" PARA PIS/COFINS CONF ART 1 INCS XXI DA LEI 10925/04, COM REDAÇÃO DADA PELA LEI 12839/13.',
      invoiceContacts: 'bracoffee.adm@gmail.com\nrubens@bracoffeeco.com',
      ocPrefix: 'OC',
      contractTerms: 'O vendedor declara ser legítimo proprietário do café descrito nesta ordem de compra e concorda com a quantidade, classificação, preço e condição de pagamento registrados neste documento. A entrega, conferência e liquidação financeira seguirão as condições acordadas entre as partes.'
    },
    producers: [],
    samples: [],
    purchases: [],
    stockLots: [],
    finance: [],
    sales: [],
    unloadingLocations: [{ id: 'unloading-ldc-varginha', name: 'LOUIS DREYFUS COMPANY BRASIL S.A.', address: 'ROD. BR. 491 S/N, KM 233. - Aeroporto', city: 'Varginha/MG', postalCode: '37.030-087', doc: '47.067.525/0075-44', ie: '707.621.265.0536' }],
    counters: {}
  });

  let db = loadDB();
  let activePurchaseId = null;
  let invoicePurchaseId = null;
  let invoiceLocationSnapshot = null;
  let activeFinanceId = null;
  let activeProducerId = null;

  function migrateDB(data) {
    let changed = false;
    data.purchases = Array.isArray(data.purchases) ? data.purchases : [];
    data.stockLots = Array.isArray(data.stockLots) ? data.stockLots : [];
    if (Number(data.schemaVersion || 1) < 2) {
      const defaults = defaultDB().settings;
      ['companyDoc','companyCity'].forEach(key => { if (!String(data.settings[key] || '').trim()) data.settings[key] = defaults[key]; });
      if (!data.settings.companyName || data.settings.companyName.trim().toUpperCase() === 'BRACOFFEE') data.settings.companyName = defaults.companyName;
      data.schemaVersion = 2;
      changed = true;
    }
    if (!Array.isArray(data.unloadingLocations)) { data.unloadingLocations = defaultDB().unloadingLocations; changed = true; }
    ['producers','samples','finance','sales'].forEach(key=>{if(!Array.isArray(data[key])){data[key]=[];changed=true;}});
    data.counters=data.counters&&typeof data.counters==='object'?data.counters:{};
    data.purchases.forEach(p=>{const m=String(p.oc||'').match(/-(\d{4})-(\d+)$/);if(m)data.counters[m[1]]=Math.max(Number(data.counters[m[1]]||0),Number(m[2]));});
    if(Number(data.schemaVersion||1)<3){
      data.finance.forEach(f=>{
        if(!Array.isArray(f.payments)){
          const paid=Number(f.paidAmount??(f.status==='paid'?f.amount:0));
          f.payments=paid>0?[{id:'opening-'+f.id,amount:paid,date:f.paidAt||'',method:f.method||'',notes:'Saldo registrado anteriormente',opening:true}]:[];
        }
        reconcileFinance(f,data);
      });
      data.schemaVersion=3;changed=true;
    }
    const purchaseMap = new Map(data.purchases.map(p => [p.id, p]));

    // Versões antigas criavam um lote automaticamente ao finalizar a compra.
    // Preservamos esse registro para não apagar histórico, mas ele deixa de contar
    // como estoque físico até que uma entrada seja feita manualmente pela OC.
    data.stockLots.forEach(lot => {
      if (lot.entryType) return;
      const purchase = purchaseMap.get(lot.purchaseId);
      if (purchase && purchase.lotId === lot.id) {
        lot.entryType = 'legacy_auto_purchase';
        changed = true;
      } else {
        lot.entryType = 'manual_oc';
        changed = true;
      }
    });
    return { data, changed };
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultDB();
      const parsed = JSON.parse(raw);
      const merged = { ...defaultDB(), ...parsed, schemaVersion: parsed.schemaVersion || 1, settings: { ...defaultDB().settings, ...(parsed.settings || {}) } };
      const migrated = migrateDB(merged);
      if (migrated.changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated.data));
      return migrated.data;
    } catch (e) {
      console.error(e);
      return defaultDB();
    }
  }

  function saveDB() {
    try{localStorage.setItem(STORAGE_KEY, JSON.stringify(db));}catch(e){console.warn('Cópia local indisponível',e);}
    renderAll();
    window.BracoffeeSync.queue(db);
  }

  function roundMoney(value){return Math.round((Number(value||0)+Number.EPSILON)*100)/100;}
  function paidFor(f){return roundMoney((f.payments||[]).filter(p=>!p.reversedAt).reduce((s,p)=>s+Number(p.amount||0),0));}
  function pendingFor(f){return Math.max(0,roundMoney(Number(f.amount||0)-paidFor(f)));}
  function reconcileFinance(f,data=db){
    f.paidAmount=paidFor(f);const total=roundMoney(f.amount);
    f.status=total>0&&f.paidAmount>=total?'paid':f.paidAmount>0?'partial':'pending';
    const payments=(f.payments||[]).filter(p=>!p.reversedAt&&p.date).sort((a,b)=>a.date.localeCompare(b.date));
    f.paidAt=f.status==='paid'?(payments.at(-1)?.date||''):'';
    const p=data.purchases.find(p=>p.id===f.purchaseId);if(p)p.paymentStatus=f.status;
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

  const LB_PER_BAG = 60 * 2.20462262185;
  const destinationLabel = (v) => ({stock:'Para estoque',direct:'Venda direta',future:'Compra futura'}[v] || 'Para estoque');
  const purchaseTermLabel = (v) => ({cash:'À vista',term:'A prazo',fix:'A fixar'}[v] || 'À vista');
  const deliveryLabel = (v) => v === 'delivered' ? 'Posto' : 'Retirar';
  const brokeragePayerLabel = (v) => ({buyer:'Comprador',seller:'Vendedor',unspecified:'A combinar'}[v] || 'A combinar');
  const diffNum = (n) => Number(n || 0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});

  function calcDifferential(pricePerBag, ny, usd) {
    pricePerBag = Number(pricePerBag || 0); ny = Number(ny || 0); usd = Number(usd || 0);
    if (!pricePerBag || !ny || !usd) return null;
    return ((pricePerBag / usd / LB_PER_BAG) * 100) - ny;
  }

  function isPhysicalStockLot(lot) {
    return lot && lot.entryType !== 'legacy_auto_purchase';
  }

  function physicalStockLots() {
    return db.stockLots.filter(isPhysicalStockLot);
  }

  function receivedForPurchase(purchaseId) {
    return physicalStockLots().filter(l => l.purchaseId === purchaseId).reduce((sum,l) => sum + Number(l.bags || 0), 0);
  }

  function remainingToReceive(purchase) {
    return Math.max(0, Number(purchase?.bags || 0) - receivedForPurchase(purchase?.id));
  }


  async function logoutApp() {
    await window.BracoffeeSync.whenIdle();
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {
      console.warn('Falha ao encerrar sessão no servidor', e);
    } finally {
      location.replace('/login');
    }
  }

  function toast(title, detail = '', type = 'success') {
    while($('#toastStack').children.length>=2)$('#toastStack').firstElementChild.remove();
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
      dashboard: ['SEU ESCRITÓRIO', 'Visão geral'],
      balcao: ['NEGOCIAÇÃO', 'Balcão de compras'],
      provas: ['PROVADOR', 'Provas de café'],
      compras: ['HISTÓRICO', 'Ordens de compra'],
      estoque: ['SALDO', 'Estoque'],
      financeiro: ['CONTROLE', 'Financeiro'],
      produtores: ['RELACIONAMENTOS', 'Fornecedores']
    };
    $('#pageEyebrow').textContent = titles[page]?.[0] || 'BRACOFFEE';
    $('#pageTitle').textContent = titles[page]?.[1] || 'BRACOFFEE';
    $('#backPageBtn').hidden=page==='dashboard';
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
    updatePurchaseSummary();
  }

  function stockByDrink() {
    const map = new Map();
    physicalStockLots().forEach(l => {
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
    const brokers = [...new Set(db.purchases.map(p => p.brokerName).filter(Boolean))];
    $('#brokerList').innerHTML = brokers.map(name => `<option value="${esc(name)}"></option>`).join('');
  }

  function producerExact(name) {
    const n = normalize(name);
    return db.producers.find(p => normalize(p.name) === n);
  }

  function fillSellerFromProducer() {
    const p = producerExact($('#sellerName').value);
    if (!p) return;
    $('#sellerDoc').value = p.doc || '';
    $('#sellerIE').value = p.ie || '';
    $('#sellerPhone').value = p.phone || '';
    $('#sellerFarm').value = p.farm || '';
    $('#sellerAddress').value = p.address || '';
    $('#sellerCity').value = p.city || '';
  }

  function updatePurchaseCalculations() {
    const bags = Number($('#purchaseBags').value || 0);
    const price = Number($('#purchasePrice').value || 0);
    if (bags > 0 && (document.activeElement === $('#purchaseBags') || !$('#purchaseWeight').value)) $('#purchaseWeight').value = Number((bags * 60).toFixed(2));
    else if (!bags) $('#purchaseWeight').value = '';
    $('#purchaseTotal').textContent = money(bags * price);
    const diff = calcDifferential(price, $('#purchaseNY').value, $('#purchaseUSD').value);
    const el = $('#purchaseDifferential');
    el.classList.remove('positive','negative');
    if (diff === null) el.textContent = '—';
    else {
      el.textContent = `${diff >= 0 ? '+' : ''}${diffNum(diff)}`;
      el.classList.add(diff >= 0 ? 'positive' : 'negative');
    }
    updateBrokerageCalculations();updatePurchaseSummary();
  }

  function brokerageAmount(type, value, total) {
    const amount = type === 'percent' ? Number(total || 0) * Number(value || 0) / 100 : type === 'fixed' ? Number(value || 0) : 0;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function brokerageLabel(p) {
    if (!p.brokerName) return 'Compra direta, sem corretor';
    if (!p.brokerageType || p.brokerageType === 'none') return 'Sem corretagem';
    const amount = brokerageAmount(p.brokerageType, p.brokerageValue, p.total);
    return p.brokerageType === 'percent' ? `${num(p.brokerageValue,4)}% sobre ${money(p.total)} = ${money(amount)}` : `Valor fixo de ${money(amount)}`;
  }

  function updateBrokerageCalculations() {
    const hasBroker = $('#purchaseHasBroker').value === 'yes';
    const type = hasBroker ? $('#purchaseBrokerageType').value : 'none';
    const total = Number($('#purchaseBags').value || 0) * Number($('#purchasePrice').value || 0);
    $('#purchaseBrokerageTotal').textContent = money(brokerageAmount(type, $('#purchaseBrokerageValue').value, total));
    updatePurchaseSummary();
  }

  function updateBrokerUI() {
    const hasBroker = $('#purchaseHasBroker').value === 'yes';
    const type = $('#purchaseBrokerageType').value;
    const hasFee = hasBroker && type !== 'none';
    $('#purchaseBrokerFields').hidden = !hasBroker;
    $$('input,select', $('#purchaseBrokerFields')).forEach(el => { el.disabled = !hasBroker; });
    $('#purchaseBrokerName').required = hasBroker;
    ['#purchaseBrokerageValueField','#purchaseBrokerageTotalField','#purchaseBrokeragePayerField'].forEach(sel => { $(sel).hidden = !hasFee; });
    $('#purchaseBrokerageValue').disabled = !hasFee;
    $('#purchaseBrokerageValue').required = hasFee;
    $('#purchaseBrokeragePayer').disabled = !hasFee;
    $('#purchaseBrokerageValueLabel').textContent = type === 'fixed' ? 'Valor fixo (R$) *' : 'Percentual (%) *';
    $('#purchaseBrokerageValue').step = type === 'fixed' ? '0.01' : '0.0001';
    $('#purchaseBrokerageValue').placeholder = type === 'fixed' ? 'Valor combinado' : 'Ex.: 0,5 ou 0,2';
    if (type === 'percent') $('#purchaseBrokerageValue').max = '100'; else $('#purchaseBrokerageValue').removeAttribute('max');
    updateBrokerageCalculations();
  }

  function updateDeliveryUI() {
    const posted = $('#purchaseDeliveryType').value === 'delivered';
    $('#deliveryLocationLabel').textContent = posted ? 'Armazém / local de entrega' : 'Local de retirada';
    $('#purchaseDeliveryLocation').placeholder = posted ? 'Informe o armazém / destino' : 'Informe onde será retirado';
  }

  function updateDestinationUI() {
    const future = $('#purchaseDestination').value === 'future';
    $('#expectedReceiptField').hidden = !future;updatePurchaseSummary();
  }

  function resetPurchaseForm() {
    $('#purchaseForm').reset();
    $('#purchaseForm').dataset.editingId = '';
    $('#purchaseFormTitle').textContent='Nova compra';
    $('#purchasePaymentStatus').disabled=false;
    $('#purchasePaymentEditHelp').hidden=true;
    $('#purchaseDate').value = todayISO();
    $('#purchaseTotal').textContent = money(0);
    $('#purchaseDifferential').textContent = '—';
    $('#purchaseDifferential').classList.remove('positive','negative');
    $('#purchasePaymentStatus').value = 'pending';
    $('#purchasePaymentMethod').value = 'PIX';
    $('#purchaseDestination').value = 'stock';
    $('#purchaseTerm').value = 'cash';
    $('#purchaseDeliveryType').value = 'pickup';
    updateDeliveryUI(); updateDestinationUI(); updateBrokerUI();
    activePurchaseId = null;
  }

  function collectPurchaseForm() {
    const bags = Number($('#purchaseBags').value || 0);
    const pricePerBag = Number($('#purchasePrice').value || 0);
    const ny = Number($('#purchaseNY').value || 0);
    const usd = Number($('#purchaseUSD').value || 0);
    const hasBroker = $('#purchaseHasBroker').value === 'yes';
    const brokerageType = hasBroker ? $('#purchaseBrokerageType').value : 'none';
    const brokerageValue = brokerageType === 'none' ? 0 : Number($('#purchaseBrokerageValue').value || 0);
    return {
      sellerName: $('#sellerName').value.trim(),
      sellerDoc: $('#sellerDoc').value.trim(),
      sellerIE: $('#sellerIE').value.trim(),
      sellerPhone: $('#sellerPhone').value.trim(),
      sellerFarm: $('#sellerFarm').value.trim(),
      sellerAddress: $('#sellerAddress').value.trim(),
      sellerCity: $('#sellerCity').value.trim(),
      bags,
      weight: Number($('#purchaseWeight').value || bags * 60 || 0),
      pricePerBag, total: roundMoney(bags * pricePerBag), ny, usd, differential: calcDifferential(pricePerBag,ny,usd),
      destination: $('#purchaseDestination').value,
      expectedReceipt: $('#purchaseExpectedReceipt').value,
      drink: $('#purchaseDrink').value.trim(),
      cata: Number($('#purchaseCata').value || 0),
      moisture: Number($('#purchaseMoisture').value || 0),
      classification: $('#purchaseClass').value.trim(),
      notes: $('#purchaseNotes').value.trim(),
      date: $('#purchaseDate').value,
      purchaseTerm: $('#purchaseTerm').value,
      paymentStatus: $('#purchasePaymentStatus').value,
      paymentMethod: $('#purchasePaymentMethod').value,
      dueDate: $('#purchaseDueDate').value,
      deliveryType: $('#purchaseDeliveryType').value,
      deliveryLocation: $('#purchaseDeliveryLocation').value.trim(),
      brokerName: hasBroker ? $('#purchaseBrokerName').value.trim() : '',
      brokerDoc: hasBroker ? $('#purchaseBrokerDoc').value.trim() : '',
      brokerPhone: hasBroker ? $('#purchaseBrokerPhone').value.trim() : '',
      brokerageType, brokerageValue,
      brokerageAmount: brokerageAmount(brokerageType, brokerageValue, bags * pricePerBag),
      brokeragePayer: brokerageType === 'none' ? 'unspecified' : $('#purchaseBrokeragePayer').value,
      brokerageNotes: hasBroker ? $('#purchaseBrokerageNotes').value.trim() : ''
    };
  }

  function upsertProducerFromPurchase(data) {
    let p = producerExact(data.sellerName);
    if (p) {
      p.doc = data.sellerDoc || p.doc || ''; p.ie = data.sellerIE || p.ie || ''; p.phone = data.sellerPhone || p.phone || '';
      p.farm = data.sellerFarm || p.farm || ''; p.address = data.sellerAddress || p.address || ''; p.city = data.sellerCity || p.city || '';
      p.updatedAt = new Date().toISOString(); return p;
    }
    p = { id: uid('prod'), name: data.sellerName, doc: data.sellerDoc, ie:data.sellerIE, phone: data.sellerPhone, farm: data.sellerFarm, address:data.sellerAddress, city: data.sellerCity, createdAt: new Date().toISOString() };
    db.producers.push(p); return p;
  }

  function createPurchase(data) {
    const producer = upsertProducerFromPurchase(data);
    const purchase = { id: uid('buy'), oc: nextOC(), producerId: producer.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const finance = { id: uid('fin'), type: 'payable', purchaseId: purchase.id, oc: purchase.oc, person: purchase.sellerName, amount: purchase.total, paidAmount: purchase.paymentStatus === 'paid' ? purchase.total : 0, status: purchase.paymentStatus, method: purchase.paymentMethod, dueDate: purchase.dueDate, date: purchase.date, createdAt: new Date().toISOString() };
    finance.payments=purchase.paymentStatus==='paid'&&purchase.total>0?[{id:uid('payment'),amount:purchase.total,date:purchase.date,method:purchase.paymentMethod,notes:'Pagamento informado na compra',createdAt:new Date().toISOString()}]:[];
    reconcileFinance(finance);
    purchase.paymentStatus=finance.status;
    purchase.financeId = finance.id;
    db.purchases.push(purchase); db.finance.push(finance); saveDB();
    toast('Compra registrada', `${purchase.oc} criada. O estoque só será movimentado quando o café for recebido.`);
    resetPurchaseForm(); openPurchaseDetail(purchase.id);
  }

  function updatePurchase(id, data) {
    const p = db.purchases.find(x => x.id === id); if (!p) return;
    const received = receivedForPurchase(id);
    if (Number(data.bags) < received) { toast('Quantidade inválida', `Já foram recebidas ${num(received)} sacas desta OC.`,'error'); return; }
    const fin = db.finance.find(f => f.id === p.financeId || f.purchaseId === p.id);
    if(fin&&roundMoney(data.total)<paidFor(fin)){toast('Valor abaixo do que já foi pago',`Esta compra já recebeu ${money(paidFor(fin))} em pagamentos.`,'error');return;}
    if(received>0&&data.destination!=='stock'){toast('Esta compra já tem recebimento','Mantenha o tipo “Para estoque” para preservar as entradas físicas.','error');return;}
    Object.assign(p, data, { updatedAt: new Date().toISOString() });
    const prod = upsertProducerFromPurchase(data); p.producerId = prod.id;
    db.stockLots.filter(l => l.purchaseId === id).forEach(l => Object.assign(l,{oc:p.oc,sellerName:p.sellerName,drink:p.drink,cata:p.cata,moisture:p.moisture,classification:p.classification}));
    if (fin) {Object.assign(fin,{person:p.sellerName,amount:p.total,method:p.paymentMethod,dueDate:p.dueDate,date:p.date});reconcileFinance(fin);p.financeId=fin.id;}
    saveDB(); toast('Compra atualizada', `${p.oc} foi atualizada.`); resetPurchaseForm(); openPurchaseDetail(id);
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
    updatePurchaseCalculations(); navigate('balcao'); toast('Prova carregada','Complete a negociação e finalize a compra.');
  }

  function renderPurchases() {
    const q=normalize($('#purchaseSearch')?.value||''); const filter=$('#purchaseFilter')?.value||'all';
    const destination=$('#purchaseDestinationFilter').value,month=$('#purchaseMonth').value;
    const rows=[...db.purchases].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')).filter(p=>{
      const okQ=!q||normalize(`${p.oc} ${p.sellerName} ${p.sellerDoc} ${p.drink} ${p.brokerName||''} ${destinationLabel(p.destination)}`).includes(q);
      const okStatus=filter==='all'||(filter==='pending'&&p.paymentStatus!=='paid')||(filter==='uninvoiced'&&!p.invoiceIssued)||p.paymentStatus===filter;
      return okQ&&okStatus&&(destination==='all'||(p.destination||'stock')===destination)&&(!month||p.date?.startsWith(month));
    });
    $('#purchaseResults').textContent=`${rows.length} compra(s) · ${num(rows.reduce((s,p)=>s+Number(p.bags||0),0))} sacas · ${money(rows.reduce((s,p)=>s+Number(p.total||0),0))}`;
    $('#purchasesTable').innerHTML=rows.length?rows.map(p=>`<tr>
      <td><strong>${esc(p.oc)}</strong></td><td>${esc(p.sellerName)}</td><td>${dateBR(p.date)}</td><td>${num(p.bags)}</td><td>${esc(p.drink)}<small>${esc(destinationLabel(p.destination))}</small></td><td><strong>${money(p.total)}</strong></td><td>${badge(p.paymentStatus)}</td><td><button class="table-link" data-purchase-open="${p.id}">Abrir ${icon('arrowUpRight')}</button></td>
    </tr>`).join(''):`<tr><td colspan="8">${emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.')}</td></tr>`;
    $('#purchasesMobile').innerHTML=rows.length?rows.map(p=>`<div class="purchase-mobile-card">
      <div class="purchase-mobile-top"><div><strong>${esc(p.oc)}</strong><br><small>${esc(p.sellerName)}</small></div>${badge(p.paymentStatus)}</div>
      <div class="purchase-mobile-grid"><div><small>Sacas</small><strong>${num(p.bags)}</strong></div><div><small>Valor</small><strong>${money(p.total)}</strong></div><div><small>Tipo</small><strong>${esc(destinationLabel(p.destination))}</strong></div><div><small>Data</small><strong>${dateBR(p.date)}</strong></div></div>
      <button class="mini-btn primary" data-purchase-open="${p.id}">Abrir compra</button></div>`).join(''):emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.');
  }

  function openPurchaseDetail(id) { renderPurchaseDetail(id,true); }

  function renderPurchaseDetail(id,open=true) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return; activePurchaseId=id;
    const lots=physicalStockLots().filter(l=>l.purchaseId===p.id); const received=receivedForPurchase(p.id); const remaining=remainingToReceive(p);
    const fin=db.finance.find(f=>f.id===p.financeId||f.purchaseId===id),paid=fin?paidFor(fin):0,balance=fin?pendingFor(fin):Number(p.total||0);
    const lotIds=lots.map(l=>l.id); const sales=db.sales.filter(s=>lotIds.includes(s.lotId));
    const stockLabel = (p.destination || 'stock') === 'stock'
      ? `${num(received)} sc recebidas${received ? ` · ${num(remaining)} sc ainda não recebidas` : ' · nenhuma entrada física registrada'}`
      : 'Não enviado ao estoque';
    $('#detailOc').textContent=p.oc;
    $('#purchaseDetailBody').innerHTML=`
      <div class="order-summary"><div><span class="oc-label">${dateBR(p.date)} · ${esc(destinationLabel(p.destination))}</span><h3>${esc(p.sellerName)}</h3><p>${num(p.bags)} sacas · ${esc(p.drink)}</p></div><div><strong>${money(p.total)}</strong>${badge(p.paymentStatus)}</div></div>
      <div class="order-stages"><div class="order-stage done"><strong>Compra registrada</strong>OC e contrato disponíveis</div><div class="order-stage ${p.invoiceIssued?'done':''}"><strong>Faturamento</strong>${p.invoiceIssued?'Instrução emitida':'Instrução a emitir'}</div><div class="order-stage ${received>=p.bags?'done':''}"><strong>${p.destination==='direct'?'Entrega direta':p.destination==='future'?'Entrega futura':'Recebimento'}</strong>${p.destination==='direct'?'Sem entrada no estoque':p.destination==='future'?(p.expectedReceipt?dateBR(p.expectedReceipt):'Data a combinar'):`${num(received)} de ${num(p.bags)} sc`}</div><div class="order-stage ${balance===0?'done':''}"><strong>Pagamento</strong>${balance===0?'Liquidado':`${money(balance)} em aberto`}</div></div>
      <div class="detail-grid">
        <div class="detail-box"><label>Vendedor</label><strong>${esc(p.sellerName)}</strong></div>
        <div class="detail-box"><label>CPF / CNPJ · IE</label><strong>${esc(p.sellerDoc||'—')} · ${esc(p.sellerIE||'—')}</strong></div>
        <div class="detail-box span-2"><label>Endereço</label><strong>${esc([p.sellerAddress,p.sellerCity].filter(Boolean).join(' · ')||'—')}</strong></div>
        <div class="detail-box"><label>Negociação</label><strong>${num(p.bags)} sc · ${money(p.pricePerBag)}/sc</strong></div>
        <div class="detail-box"><label>Valor total</label><strong>${money(p.total)}</strong></div>
        <div class="detail-box"><label>NY / USD</label><strong>${p.ny?num(p.ny,2):'—'} · ${p.usd?num(p.usd,4):'—'}</strong></div>
        <div class="detail-box"><label>Diferencial</label><strong>${p.differential===null||p.differential===undefined?'—':`${p.differential>=0?'+':''}${diffNum(p.differential)}`}</strong></div>
        <div class="detail-box"><label>Qualidade</label><strong>${esc(p.drink||'—')} · Cata ${p.cata?num(p.cata)+'%':'—'} · Umid. ${p.moisture?num(p.moisture)+'%':'—'}</strong></div>
        <div class="detail-box"><label>Classificação</label><strong>${esc(p.classification||'—')}</strong></div>
        <div class="detail-box"><label>Tipo da compra</label><strong>${esc(destinationLabel(p.destination))}${p.expectedReceipt?' · '+dateBR(p.expectedReceipt):''}</strong></div>
        <div class="detail-box"><label>Estoque</label><strong>${stockLabel}</strong></div>
        <div class="detail-box"><label>Pagamento</label><strong>${purchaseTermLabel(p.purchaseTerm)} · ${p.paymentStatus==='paid'?'Pago':p.paymentStatus==='partial'?'Parcial':'A pagar'} · ${esc(p.paymentMethod||'—')}</strong></div>
        <div class="detail-box"><label>Pago / saldo em aberto</label><strong>${money(paid)} / ${money(balance)}</strong></div>
        <div class="detail-box"><label>Entrega / retirada</label><strong>${deliveryLabel(p.deliveryType)} · ${esc(p.deliveryLocation||'—')}</strong></div>
        <div class="detail-box"><label>Corretor</label><strong>${esc(p.brokerName||'Compra direta, sem corretor')}</strong></div>
        <div class="detail-box"><label>Corretagem</label><strong>${esc(brokerageLabel(p))}${p.brokerName&&p.brokerageType&&p.brokerageType!=='none'?' · Responsável: '+esc(brokeragePayerLabel(p.brokeragePayer)):''}</strong></div>
        ${p.brokerageNotes?`<div class="detail-box span-2"><label>Condições da corretagem</label><strong>${esc(p.brokerageNotes)}</strong></div>`:''}
        ${p.invoiceIssued?`<div class="detail-box span-2"><label>Última instrução de faturamento</label><strong>Emitida em ${dateBR(p.invoiceIssued.date)} · ${esc(p.invoiceIssued.unloadingLocation?.name||'Sem local de descarga')}</strong></div>`:''}
        <div class="detail-box span-2"><label>Observação</label><strong>${esc(p.notes||'Sem observação')}</strong></div>
      </div>
      <div class="detail-section"><h4>Movimentação</h4><div class="timeline">
        <div class="timeline-row"><div><strong>Compra registrada</strong><small>${dateBR(p.date)}</small></div><strong>${num(p.bags)} sc</strong></div>
        ${lots.map(l=>`<div class="timeline-row"><div><strong>Entrada no estoque${l.warehouse?' · '+esc(l.warehouse):''}</strong><small>${dateBR(l.date)}</small></div><strong>+ ${num(l.bags)} sc</strong></div>`).join('')}
        ${sales.map(s=>`<div class="timeline-row"><div><strong>Saída${s.buyer?' · '+esc(s.buyer):''}</strong><small>${dateBR(s.date)}</small></div><strong>- ${num(s.bags)} sc</strong></div>`).join('')}
      </div></div>`;
    $('#detailPayBtn').textContent=p.paymentStatus==='paid'?'Ver pagamentos':'Registrar pagamento';
    if(open){$('#purchaseDetailModal').showModal();$('#purchaseDetailModal').scrollTop=0;}
  }

  function editPurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return; resetPurchaseForm();
    const map={sellerName:p.sellerName,sellerDoc:p.sellerDoc,sellerIE:p.sellerIE,sellerPhone:p.sellerPhone,sellerFarm:p.sellerFarm,sellerAddress:p.sellerAddress,sellerCity:p.sellerCity,purchaseBags:p.bags,purchaseWeight:p.weight,purchasePrice:p.pricePerBag,purchaseNY:p.ny,purchaseUSD:p.usd,purchaseDestination:p.destination||'stock',purchaseExpectedReceipt:p.expectedReceipt,purchaseDrink:p.drink,purchaseCata:p.cata,purchaseMoisture:p.moisture,purchaseClass:p.classification,purchaseNotes:p.notes,purchaseDate:p.date,purchaseTerm:p.purchaseTerm||'cash',purchasePaymentStatus:p.paymentStatus,purchasePaymentMethod:p.paymentMethod,purchaseDueDate:p.dueDate,purchaseDeliveryType:p.deliveryType||'pickup',purchaseDeliveryLocation:p.deliveryLocation};
    Object.entries(map).forEach(([id,val])=>{const el=$(`#${id}`);if(el)el.value=val??'';});
    $('#purchaseFormTitle').textContent='Editar '+p.oc;
    $('#purchasePaymentStatus').disabled=true;$('#purchasePaymentEditHelp').hidden=false;
    const brokerMap={purchaseHasBroker:p.brokerName?'yes':'no',purchaseBrokerName:p.brokerName,purchaseBrokerDoc:p.brokerDoc,purchaseBrokerPhone:p.brokerPhone,purchaseBrokerageType:p.brokerageType||'none',purchaseBrokerageValue:p.brokerageValue||'',purchaseBrokeragePayer:p.brokeragePayer||'unspecified',purchaseBrokerageNotes:p.brokerageNotes};
    Object.entries(brokerMap).forEach(([id,val])=>{$(`#${id}`).value=val??'';});
    $('#purchaseForm').dataset.editingId=id; updatePurchaseCalculations(); updateDeliveryUI(); updateDestinationUI(); updateBrokerUI(); $('#purchaseDetailModal').close(); navigate('balcao'); toast('Editando compra',p.oc);
  }

  function deletePurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return;
    if(!confirm(`Excluir ${p.oc}? Entradas de estoque, financeiro e saídas ligadas a essa compra também serão removidos.`)) return;
    db.purchases=db.purchases.filter(x=>x.id!==id); db.finance=db.finance.filter(x=>x.purchaseId!==id);
    const lotIds=db.stockLots.filter(l=>l.purchaseId===id).map(l=>l.id); db.stockLots=db.stockLots.filter(l=>l.purchaseId!==id); db.sales=db.sales.filter(s=>!lotIds.includes(s.lotId));
    saveDB(); $('#purchaseDetailModal').close(); toast('Compra excluída',p.oc); activePurchaseId=null;
  }

  function eligibleStockPurchases() {
    // Somente OCs explicitamente marcadas como “Para estoque” podem ser puxadas.
    // Compra futura e venda direta ficam totalmente fora do estoque nesta etapa.
    return db.purchases.filter(p => (p.destination || 'stock') === 'stock' && remainingToReceive(p) > 0.0001);
  }

  function renderStock() {
    const physicalLots=physicalStockLots();
    const total=physicalLots.reduce((s,l)=>s+Number(l.remaining||0),0); const groups=stockByDrink(); const lotsOpen=physicalLots.filter(l=>Number(l.remaining||0)>0).length;
    const receivedEntries=physicalLots.length;
    $('#stockStats').innerHTML=[['Saldo físico',`${num(total)} sacas`,'Somente entradas lançadas no estoque'],['Lotes físicos',String(lotsOpen),'Com saldo disponível'],['Entradas registradas',String(receivedEntries),'Lançamentos feitos por OC']].map(([l,v,h])=>`<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-help">${h}</div></div>`).join('');
    const q=normalize($('#stockSearch')?.value||'');
    const rows=[...physicalLots].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).filter(l=>Number(l.remaining||0)>0&&(!q||normalize(`${l.oc} ${l.sellerName} ${l.drink} ${l.warehouse||''}`).includes(q)));
    $('#stockLots').innerHTML=rows.length?rows.map(l=>`<div class="data-card">
      <div class="main-info"><strong>${esc(l.oc)} · ${esc(l.sellerName)}</strong><small>Entrada ${dateBR(l.date)}${l.warehouse?' · '+esc(l.warehouse):''}</small></div>
      <div class="data-meta"><label>Saldo</label><strong>${num(l.remaining)} sc</strong></div><div class="data-meta"><label>Bebida</label><strong>${esc(l.drink)}</strong></div>
      <div class="data-meta hide-mid"><label>Cata</label><strong>${l.cata?num(l.cata)+'%':'—'}</strong></div><div class="data-meta hide-mid"><label>Umidade</label><strong>${l.moisture?num(l.moisture)+'%':'—'}</strong></div>
      <div class="card-actions"><button class="mini-btn primary" data-lot-sell="${l.id}">Registrar saída</button><button class="mini-btn" data-purchase-open="${l.purchaseId}">Ver OC</button></div>
    </div>`).join(''):emptyHTML('Nenhum lote disponível','Use “Entrada por OC” quando o café chegar fisicamente.');
  }

  function openStockEntryModal(purchaseId='') {
    const eligible=eligibleStockPurchases();
    if (!eligible.length) {
      toast('Nenhuma OC disponível','Marque a compra como “Para estoque” antes de puxá-la para o estoque.','error');
      return;
    }
    const select=$('#stockEntryPurchaseId');
    select.innerHTML=`<option value="">Selecione uma OC</option>`+eligible.map(p=>`<option value="${p.id}">${esc(p.oc)} · ${esc(p.sellerName)} · ${num(remainingToReceive(p))} sc disponíveis para entrada</option>`).join('');
    select.value=purchaseId && eligible.some(p=>p.id===purchaseId)?purchaseId:''; $('#stockEntryDate').value=todayISO(); $('#stockEntryBags').value=''; $('#stockEntryWeight').value=''; $('#stockEntryWarehouse').value=''; $('#stockEntryNotes').value='';
    updateStockEntrySummary(); $('#stockEntryModal').showModal();
  }

  function updateStockEntrySummary() {
    const p=db.purchases.find(x=>x.id===$('#stockEntryPurchaseId').value);
    if(!p){$('#stockEntrySummary').innerHTML='Selecione uma OC.'; $('#stockEntryBags').max=''; return;}
    const pending=remainingToReceive(p); $('#stockEntryBags').max=pending;
    $('#stockEntrySummary').innerHTML=`<strong>${esc(p.oc)} · ${esc(p.sellerName)}</strong><br>${esc(p.drink||'—')} · comprado ${num(p.bags)} sc · recebido ${num(receivedForPurchase(p.id))} sc · <strong>pendente ${num(pending)} sc</strong>`;
  }

  function saveStockEntry() {
    const p=db.purchases.find(x=>x.id===$('#stockEntryPurchaseId').value); if(!p){toast('Selecione uma OC','','error');return;}
    if ((p.destination || 'stock') !== 'stock') { toast('OC fora do estoque','Somente compras marcadas como “Para estoque” podem gerar entrada física.','error'); return; }
    const bags=Number($('#stockEntryBags').value||0), pending=remainingToReceive(p);
    if(bags<=0||bags>pending+0.0001){toast('Quantidade inválida',`Ainda faltam receber ${num(pending)} sacas.`,'error');return;}
    const weight=Number($('#stockEntryWeight').value||bags*60);
    const lot={id:uid('lot'),entryType:'manual_oc',purchaseId:p.id,oc:p.oc,sellerName:p.sellerName,bags,remaining:bags,weight,drink:p.drink,cata:p.cata,moisture:p.moisture,classification:p.classification,date:$('#stockEntryDate').value||todayISO(),warehouse:$('#stockEntryWarehouse').value.trim(),notes:$('#stockEntryNotes').value.trim(),createdAt:new Date().toISOString()};
    db.stockLots.push(lot); saveDB(); $('#stockEntryModal').close(); toast('Entrada confirmada',`${num(bags)} sacas recebidas da ${p.oc}.`);
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

  function openProducerModal(p=null){$('#producerModalTitle').textContent=p?'Editar vendedor':'Novo vendedor';$('#producerId').value=p?.id||'';$('#producerName').value=p?.name||'';$('#producerDoc').value=p?.doc||'';$('#producerIE').value=p?.ie||'';$('#producerPhone').value=p?.phone||'';$('#producerFarm').value=p?.farm||'';$('#producerAddress').value=p?.address||'';$('#producerCity').value=p?.city||'';$('#producerModal').showModal();}
  function saveProducer(){const id=$('#producerId').value;const data={name:$('#producerName').value.trim(),doc:$('#producerDoc').value.trim(),ie:$('#producerIE').value.trim(),phone:$('#producerPhone').value.trim(),farm:$('#producerFarm').value.trim(),address:$('#producerAddress').value.trim(),city:$('#producerCity').value.trim(),updatedAt:new Date().toISOString()};if(!data.name)return;if(id)Object.assign(db.producers.find(p=>p.id===id),data);else db.producers.push({id:uid('prod'),...data,createdAt:new Date().toISOString()});saveDB();$('#producerModal').close();toast(id?'Vendedor atualizado':'Vendedor cadastrado');}
  function deleteProducer(id){const p=db.producers.find(x=>x.id===id);if(!p)return;const used=db.purchases.some(x=>x.producerId===id);if(used){toast('Cadastro em uso','Este produtor possui compras vinculadas e não pode ser excluído.','error');return;}if(confirm(`Excluir ${p.name}?`)){db.producers=db.producers.filter(x=>x.id!==id);saveDB();toast('Produtor excluído');}}

  function openDocumentWindow() {
    const w=window.open('','_blank');
    if(!w)toast('Pop-up bloqueado','Permita pop-ups para abrir o documento.','error');
    return w;
  }

  function documentHeader(oc,date,buyer,label='ORDEM DE COMPRA') {
    const logo=new URL('bracoffee_logo.png',location.href).href;
    return `<header class="head"><img src="${esc(logo)}" class="logo" alt="BRACOFFEE"><div class="header-contact">${[buyer.phone,buyer.email,buyer.website,buyer.instagram].filter(Boolean).map(v=>`<div>${esc(v)}</div>`).join('')}</div></header><div class="reference"><strong>${esc(oc)}</strong><span>${esc(label)} · ${esc(dateBR(date))}</span></div>`;
  }

  function writeDocument(w,title,body,kind='contract') {
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#2a2521;margin:0;font-size:10.5px;line-height:1.35;background:#fff}.paper{max-width:186mm;margin:24px auto;padding:0 12px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:2px solid #75502f;padding-bottom:12px;margin-bottom:12px}.logo{width:200px;height:auto}.header-contact{text-align:right;color:#615245;font-size:9px;line-height:1.5}.reference{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.reference strong{font-size:14px;color:#75502f}.reference span{font-size:9px;color:#746b63}.title{margin:10px 0 12px;font-size:17px;text-align:center;color:#493423}.section{break-inside:avoid}.section-title{margin:10px 0 5px;color:#75502f;font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:bold}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.box{border:1px solid #ded4c9;border-radius:5px;padding:6px 8px;min-width:0;break-inside:avoid}.box span{display:block;font-size:7.5px;text-transform:uppercase;color:#88796a;font-weight:bold}.box strong{display:block;margin-top:2px;font-size:10.5px;overflow-wrap:anywhere}.wide{grid-column:1/-1}.party{border:1px solid #ded4c9;border-radius:5px;padding:8px 10px;overflow-wrap:anywhere}.party strong{display:block}.terms{margin-top:12px}.terms p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:42px;break-inside:avoid}.signs.has-broker{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.sign{border-top:1px solid #4b423b;padding-top:6px;text-align:center;font-size:9px;overflow-wrap:anywhere}.muted{color:#746b63}.foot{margin-top:18px;text-align:center;font-size:8px;color:#8b8076;break-inside:avoid}.no-print{max-width:186mm;margin:16px auto;padding:12px;background:#f4eee6;border-radius:8px;font-size:12px}.no-print button{background:#8a6035;color:#fff;border:0;border-radius:6px;padding:10px 14px;font-weight:bold;cursor:pointer}.no-print span{margin-left:10px;color:#6a5a4b}.invoice{font-size:12px;line-height:1.5}.invoice .section-title{margin:18px 0 7px;font-size:10px}.invoice .party{padding:12px}.invoice .title{margin:18px 0;font-size:18px}.trade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border-top:1px solid #d7c9b9;border-bottom:1px solid #d7c9b9;padding:14px 0}.trade small{display:block;color:#88796a;font-size:9px;text-transform:uppercase}.trade strong{display:block;font-size:14px;overflow-wrap:anywhere}.description{margin:8px 0 12px;font-weight:bold;overflow-wrap:anywhere}.text-block{white-space:pre-wrap;overflow-wrap:anywhere}.invoice .foot{margin-top:24px}.invoice .box strong{font-size:12px}.signature-block{break-inside:avoid}.contract .head{padding-bottom:9px;margin-bottom:9px}.contract .logo{width:180px}.contract .title{margin:8px 0 9px;font-size:16px}.contract .section-title{margin:8px 0 4px}.contract .box{padding:5px 7px}.contract .party{padding:6px 9px}.contract .terms{margin-top:9px}.contract .signs{margin-top:30px}.contract .foot{margin-top:8px}@media print{.no-print{display:none!important}.paper{width:auto;max-width:none;margin:0;padding:0}body{background:#fff}a{color:inherit;text-decoration:none}}@media(max-width:560px){.no-print span{display:block;margin:8px 0 0}.logo{width:160px}.header-contact{font-size:8px}.reference{align-items:flex-start}.reference span{text-align:right}.trade{gap:6px}.trade strong{font-size:12px}}
    </style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button><span>Na impressão, escolha “Salvar como PDF” para enviar ao fornecedor.</span></div><main class="paper ${kind}">${body}</main><script>window.addEventListener('load',async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode?i.decode().catch(()=>{}):Promise.resolve()));setTimeout(()=>window.print(),200)})<\/script></body></html>`);
    w.document.close();
  }

  function printBox(label,value,wide=false) {
    return `<div class="box${wide?' wide':''}"><span>${esc(label)}</span><strong>${esc(value??'Não informado')}</strong></div>`;
  }

  function printSection(title,boxes) {
    return `<section class="section"><h3 class="section-title">${esc(title)}</h3><div class="grid">${boxes}</div></section>`;
  }

  function printContract(id) {
    const p=db.purchases.find(x=>x.id===id);if(!p)return;
    const w=openDocumentWindow();if(!w)return;
    const buyer=companyData();
    const diff=p.differential===null||p.differential===undefined?'Não informado':`${p.differential>=0?'+':''}${diffNum(p.differential)}`;
    const seller=printSection('Vendedor',[
      printBox('Vendedor',p.sellerName),printBox('CPF / CNPJ · IE',[p.sellerDoc,p.sellerIE].filter(Boolean).join(' · ')||'Não informado'),
      printBox('Telefone',p.sellerPhone||'Não informado'),printBox('Propriedade',p.sellerFarm||'Não informada'),
      printBox('Endereço / cidade',[p.sellerAddress,p.sellerCity].filter(Boolean).join(' · ')||'Não informado',true)
    ].join(''));
    const negotiation=printSection('Negociação',[
      printBox('Quantidade',`${num(p.bags)} sacas (${num(p.weight)} kg)`),printBox('Preço por saca',money(p.pricePerBag)),
      printBox('Valor total do café',money(p.total)),printBox('Tipo da compra',`${destinationLabel(p.destination)}${p.expectedReceipt?' · Previsão '+dateBR(p.expectedReceipt):''}`),
      printBox('NY / USD',`${p.ny?num(p.ny,2):'Não informado'} / ${p.usd?num(p.usd,4):'Não informado'}`),printBox('Diferencial',diff)
    ].join(''));
    const quality=printSection('Qualidade',[
      printBox('Bebida / classificação',[p.drink,p.classification].filter(Boolean).join(' · ')||'Não informada'),
      printBox('Catação / umidade',`${p.cata?num(p.cata)+'%':'Não informada'} / ${p.moisture?num(p.moisture)+'%':'Não informada'}`),
      p.notes?printBox('Observações',p.notes,true):''
    ].join(''));
    const logistics=printSection('Pagamento e logística',[
      printBox('Condição / forma de pagamento',`${purchaseTermLabel(p.purchaseTerm)} · ${p.paymentMethod||'Não informada'}`),
      printBox('Situação / vencimento',`${p.paymentStatus==='paid'?'Pago':p.paymentStatus==='partial'?'Pagamento parcial':'A pagar'} · ${dateBR(p.dueDate)}`),
      printBox('Entrega / retirada',deliveryLabel(p.deliveryType)),printBox('Local',p.deliveryLocation||'Não informado')
    ].join(''));
    const broker=p.brokerName?printSection('Corretor e corretagem',[
      printBox('Corretor',`${p.brokerName}${p.brokerDoc?' · '+p.brokerDoc:''}${p.brokerPhone?' · '+p.brokerPhone:''}`),
      printBox('Corretagem',brokerageLabel(p)),
      p.brokerageType&&p.brokerageType!=='none'?printBox('Responsável pelo pagamento',brokeragePayerLabel(p.brokeragePayer)):'',
      p.brokerageNotes?printBox('Condições combinadas',p.brokerageNotes,true):''
    ].join('')):'';
    const signs=`<div class="signs${p.brokerName?' has-broker':''}"><div class="sign">${esc(p.sellerName)}<br><span class="muted">Vendedor</span></div><div class="sign">${esc(buyer.name||'BRACOFFEE')}<br><span class="muted">Comprador</span></div>${p.brokerName?`<div class="sign">${esc(p.brokerName)}<br><span class="muted">Corretor</span></div>`:''}</div>`;
    writeDocument(w,`${p.oc} - Contrato de compra`,`${documentHeader(p.oc,p.date,buyer)}<h2 class="title">CONTRATO DE COMPRA DE CAFÉ</h2><section class="section"><h3 class="section-title">Comprador</h3><div class="party">${partyHTML(buyer)}</div></section>${seller}${negotiation}${quality}${logistics}${broker}<div class="terms"><strong>Condições</strong><p>${esc(db.settings.contractTerms||'')}</p></div><div class="signature-block">${signs}<div class="foot">Documento vinculado à ordem de compra ${esc(p.oc)}.</div></div>`);
  }

  function writeInvoice(w,i) {
    const location=i.unloadingLocation?`<section class="section"><h3 class="section-title">Local de descarga</h3><div class="party">${partyHTML(i.unloadingLocation)}</div></section>`:'';
    const body=`${documentHeader(i.oc,i.date,i.buyer,'INSTRUÇÃO DE FATURAMENTO')}<h2 class="title">INSTRUÇÃO DE FATURAMENTO</h2><section class="section"><h3 class="section-title">Fornecedor / emitente da nota</h3><div class="party">${partyHTML(i.seller)}</div></section><section class="section"><h3 class="section-title">Faturar para</h3><div class="party">${partyHTML(i.buyer)}</div></section><section class="section"><h3 class="section-title">Café da ordem de compra</h3><p class="description">${esc(i.description)}</p><div class="trade"><div><small>Quantidade / peso</small><strong>${num(i.bags)} sacas</strong><span>${num(i.weight)} kg</span></div><div><small>Preço por saca</small><strong>${money(i.pricePerBag)}</strong></div><div><small>Valor total do café</small><strong>${money(i.total)}</strong></div></div></section>${location}${i.notes?`<section class="section"><h3 class="section-title">Observações para a nota fiscal</h3><div class="text-block">${esc(i.notes)}</div></section>`:''}${i.contacts?`<section class="section"><h3 class="section-title">Contatos para envio de NF e documentos</h3><div class="text-block">${esc(i.contacts)}</div></section>`:''}<div class="foot">Referência: ${esc(i.oc)} · ${esc(i.buyer.name)}<br>Orientações para emissão da nota fiscal pelo fornecedor.</div>`;
    writeDocument(w,`${i.oc} - Instrução de faturamento`,body,'invoice');
  }

  function reprintInvoice() {
    const p=db.purchases.find(x=>x.id===invoicePurchaseId);if(!p?.invoiceIssued)return;
    const w=openDocumentWindow();if(w)writeInvoice(w,p.invoiceIssued);
  }


  const settingFields = {settingCompanyName:'companyName',settingOcPrefix:'ocPrefix',settingCompanyDoc:'companyDoc',settingCompanyCity:'companyCity',settingCompanyIE:'companyIE',settingCompanyPostalCode:'companyPostalCode',settingCompanyAddress:'companyAddress',settingCompanyPhone:'companyPhone',settingCompanyEmail:'companyEmail',settingCompanyWebsite:'companyWebsite',settingCompanyInstagram:'companyInstagram',settingContractTerms:'contractTerms',settingInvoiceNotes:'invoiceNotes',settingInvoiceContacts:'invoiceContacts'};

  function openSettings(){Object.entries(settingFields).forEach(([id,key])=>{$(`#${id}`).value=db.settings[key]||'';});$('#settingsModal').showModal();}

  function saveSettings(){
    Object.entries(settingFields).forEach(([id,key])=>{db.settings[key]=$(`#${id}`).value.trim();});
    db.settings.companyName=db.settings.companyName||'BRACOFFEE';db.settings.ocPrefix=(db.settings.ocPrefix||'OC').toUpperCase();
    saveDB();$('#settingsModal').close();
    if($('#invoiceModal').open)renderInvoiceBuyerPreview();
    toast('Configurações salvas');
  }

  function companyData() {
    const s=db.settings;
    return {name:s.companyName,doc:s.companyDoc,ie:s.companyIE,address:s.companyAddress,city:s.companyCity,postalCode:s.companyPostalCode,phone:s.companyPhone,email:s.companyEmail,website:s.companyWebsite,instagram:s.companyInstagram};
  }

  function partyHTML(p) {
    return `<strong>${esc(p.name||'')}</strong>${p.doc?`<div>CPF / CNPJ: ${esc(p.doc)}${p.ie?' · IE: '+esc(p.ie):''}</div>`:p.ie?`<div>IE: ${esc(p.ie)}</div>`:''}${p.address?`<div>${esc(p.address)}</div>`:''}${p.city||p.postalCode?`<div>${esc(p.city||'')}${p.postalCode?' · CEP '+esc(p.postalCode):''}</div>`:''}`;
  }

  function renderInvoiceBuyerPreview() {
    $('#invoiceBuyerPreview').innerHTML=`<small>Faturar para</small>${partyHTML(companyData())}`;
  }

  function selectedInvoiceLocation() {
    const id=$('#invoiceUnloadingLocation').value;
    if(!id)return null;
    if(id==='__snapshot__')return invoiceLocationSnapshot;
    return db.unloadingLocations.find(l=>l.id===id)||null;
  }

  function renderInvoiceLocationOptions(selection) {
    const select=$('#invoiceUnloadingLocation');
    const current=selection===undefined?selectedInvoiceLocation():selection;
    invoiceLocationSnapshot=current?{...current}:null;
    const saved=current&&db.unloadingLocations.find(l=>l.id===current.id);
    const matches=saved&&['name','address','city','postalCode','doc','ie'].every(key=>(saved[key]||'')===(current[key]||''));
    select.innerHTML='<option value="">Sem local de descarga</option>'+db.unloadingLocations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}${l.city?' · '+esc(l.city):''}</option>`).join('');
    if(current&&!matches)select.insertAdjacentHTML('beforeend',`<option value="__snapshot__">${esc(current.name)} (dados salvos nesta instrução)</option>`);
    select.value=current?(matches?current.id:'__snapshot__'):'';
    updateInvoiceLocationPreview();
  }

  function updateInvoiceLocationPreview() {
    const l=selectedInvoiceLocation();
    $('#invoiceLocationPreview').hidden=!l;
    $('#invoiceLocationPreview').innerHTML=l?partyHTML(l):'';
  }

  function openInvoice(id) {
    const p=db.purchases.find(x=>x.id===id);if(!p)return;
    invoicePurchaseId=id;
    const draft=p.invoiceInstruction||{};
    $('#invoiceOc').textContent=p.oc;
    $('#invoiceSummary').innerHTML=`<strong>${esc(p.sellerName)}</strong><br>${num(p.bags)} sacas · ${num(p.weight)} kg · ${money(p.pricePerBag)}/saca · <strong>${money(p.total)}</strong>`;
    $('#invoiceDate').value=draft.date||todayISO();
    $('#invoiceDescription').value=draft.description||`Café${p.drink?' - '+p.drink:''}${p.classification?' - '+p.classification:''}`;
    $('#invoiceNotes').value=draft.notes??db.settings.invoiceNotes??'';
    $('#invoiceContacts').value=draft.contacts??db.settings.invoiceContacts??'';
    renderInvoiceLocationOptions(draft.unloadingLocation||null);renderInvoiceBuyerPreview();
    $('#invoiceReprintBtn').hidden=!p.invoiceIssued;
    $('#invoiceModal').showModal();$('#invoiceModal').scrollTop=0;
  }

  function collectInvoiceForm() {
    const l=selectedInvoiceLocation();
    return {date:$('#invoiceDate').value,description:$('#invoiceDescription').value.trim(),notes:$('#invoiceNotes').value.trim(),contacts:$('#invoiceContacts').value.trim(),unloadingLocation:l?{...l}:null};
  }

  function saveInvoice(issue=false) {
    const p=db.purchases.find(x=>x.id===invoicePurchaseId);if(!p)return;
    const data=collectInvoiceForm();
    if(!data.date||!data.description){toast('Confira a instrução','Data e descrição do café são obrigatórias.','error');return;}
    let w=null;
    if(issue){
      const buyer=companyData();
      if(!buyer.name||!buyer.doc||!buyer.address||!buyer.city){toast('Complete os dados da empresa','Preencha razão social, documento, endereço e cidade nas configurações.','error');return;}
      w=openDocumentWindow();if(!w)return;
    }
    p.invoiceInstruction=data;
    if(issue){
      p.invoiceIssued={...data,oc:p.oc,buyer:{...companyData()},seller:{name:p.sellerName,doc:p.sellerDoc,ie:p.sellerIE,address:p.sellerAddress,city:p.sellerCity},bags:p.bags,weight:p.weight,pricePerBag:p.pricePerBag,total:p.total,issuedAt:new Date().toISOString()};
    }
    saveDB();
    $('#invoiceReprintBtn').hidden=!p.invoiceIssued;
    toast(issue?'Instrução emitida':'Rascunho salvo',p.oc);
    if(issue)writeInvoice(w,p.invoiceIssued);
  }

  function openUnloadingLocations() {renderUnloadingLocations();$('#unloadingLocationsModal').showModal();}

  function renderUnloadingLocations() {
    $('#unloadingLocationsList').innerHTML=db.unloadingLocations.length?db.unloadingLocations.map(l=>`<div class="location-card">${partyHTML(l)}<div class="inline-actions"><button class="mini-btn" data-location-edit="${esc(l.id)}">Editar</button><button class="mini-btn" data-location-delete="${esc(l.id)}">Excluir</button></div></div>`).join(''):emptyHTML('Nenhum local cadastrado','Cadastre um armazém ou destino de descarga.');
  }

  function openUnloadingLocation(id='') {
    const l=db.unloadingLocations.find(x=>x.id===id)||{};
    $('#unloadingLocationForm').reset();
    const map={unloadingLocationId:l.id,unloadingLocationName:l.name,unloadingLocationAddress:l.address,unloadingLocationCity:l.city,unloadingLocationPostalCode:l.postalCode,unloadingLocationDoc:l.doc,unloadingLocationIE:l.ie};
    Object.entries(map).forEach(([id,value])=>{$(`#${id}`).value=value||'';});
    $('#unloadingLocationTitle').textContent=id?'Editar local':'Cadastrar local';
    $('#unloadingLocationModal').showModal();
  }

  function saveUnloadingLocation() {
    const id=$('#unloadingLocationId').value;
    const data={id:id||uid('unloading'),name:$('#unloadingLocationName').value.trim(),address:$('#unloadingLocationAddress').value.trim(),city:$('#unloadingLocationCity').value.trim(),postalCode:$('#unloadingLocationPostalCode').value.trim(),doc:$('#unloadingLocationDoc').value.trim(),ie:$('#unloadingLocationIE').value.trim()};
    if(!data.name){toast('Informe o nome do local','','error');return;}
    const existing=db.unloadingLocations.find(l=>l.id===id);
    if(existing)Object.assign(existing,data);else db.unloadingLocations.push(data);
    saveDB();renderUnloadingLocations();
    if($('#invoiceModal').open)renderInvoiceLocationOptions(data);
    $('#unloadingLocationModal').close();toast('Local salvo',data.name);
  }

  function deleteUnloadingLocation(id) {
    const l=db.unloadingLocations.find(x=>x.id===id);if(!l||!confirm(`Excluir ${l.name} dos locais disponíveis? Instruções já emitidas mantêm os dados salvos.`))return;
    const selected=$('#invoiceModal').open?selectedInvoiceLocation():null;
    db.unloadingLocations=db.unloadingLocations.filter(x=>x.id!==id);saveDB();renderUnloadingLocations();
    if($('#invoiceModal').open)renderInvoiceLocationOptions(selected);
    toast('Local excluído');
  }

  function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bracoffee-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup exportado');}
  function importBackup(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data||!Array.isArray(data.purchases)||!Array.isArray(data.stockLots))throw new Error('inválido');if(!confirm('Importar este backup? Os dados atuais serão substituídos.'))return;db=migrateDB({...defaultDB(),...data,schemaVersion:data.schemaVersion||1,settings:{...defaultDB().settings,...(data.settings||{})}}).data;saveDB();toast('Backup importado');$('#settingsModal').close();}catch(e){toast('Arquivo inválido','Não foi possível importar este backup.','error');}};r.readAsText(file);}

  function icon(name) {
    const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',plus:'M12 5v14M5 12h14',coffee:'M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2',file:'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h5',box:'m3 7 9-4 9 4v11l-9 4-9-4ZM3 7l9 4 9-4M12 11v11M7 5l9 4',wallet:'M20 8H4V5h14v3M4 8v13h17V8ZM17 12h4v5h-4a2.5 2.5 0 0 1 0-5Z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 4a4 4 0 0 1 0 7M18 15a4 4 0 0 1 4 4v2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6',calendar:'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4',logout:'M9 4H4v16h5M10 12h11M17 8l4 4-4 4',arrowLeft:'M20 12H4M10 6l-6 6 6 6',arrowRight:'M4 12h16M14 6l6 6-6 6',arrowUpRight:'M5 19 19 5M5 5h14v14',chevronDown:'m6 9 6 6 6-6',check:'m5 12 4 4L19 6',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',menu:'M4 6h16M4 12h16M4 18h16',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',activity:'M3 12h4l3-8 4 16 3-8h4'};
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"></path></svg>`;
  }
  function hydrateIcons(){
    const map={dashboard:'home',balcao:'plus',provas:'coffee',compras:'file',estoque:'box',financeiro:'wallet',produtores:'users'};
    $$('[data-page]').forEach(b=>{const target=$('.nav-icon',b)||$('span',b);if(target)target.innerHTML=icon(map[b.dataset.page]);});
    $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
  }
  function statHTML(label,value,help,type='file',go=''){
    return `<${go?'button':'div'} class="stat-card" ${go?`data-goto="${go}"`:''}><div class="stat-top"><span class="stat-label">${esc(label)}</span><span class="stat-icon">${icon(type)}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-help">${esc(help)}${go?icon('arrowUpRight'):''}</div></${go?'button':'div'}>`;
  }
  function renderDashboard(){
    const month=$('#dashboardMonth').value||todayISO().slice(0,7),purchases=db.purchases.filter(p=>p.date?.startsWith(month));
    const stock=physicalStockLots().reduce((s,l)=>s+Number(l.remaining||0),0),allFinance=db.finance.filter(f=>f.type==='payable');
    const amount=purchases.reduce((s,p)=>s+Number(p.total||0),0),bags=purchases.reduce((s,p)=>s+Number(p.bags||0),0),pending=allFinance.reduce((s,f)=>s+pendingFor(f),0);
    $('#dashboardDate').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    $('#dashboardStats').innerHTML=statHTML('Contratado no mês',money(amount),`${purchases.length} ordens de compra`,'file','compras')+statHTML('Sacas negociadas',num(bags),`Compras do mês selecionado`,'coffee','compras')+statHTML('Estoque disponível',num(stock)+' sc','Café fisicamente recebido','box','estoque')+statHTML('Saldo a pagar',money(pending),'Todas as compras em aberto','wallet','financeiro');
    const recent=[...db.purchases].sort((a,b)=>(b.createdAt||b.date||'').localeCompare(a.createdAt||a.date||'')).slice(0,5);
    $('#recentPurchases').innerHTML=recent.length?recent.map(p=>`<button class="list-row" data-purchase-open="${esc(p.id)}"><span class="order-mark">${icon('file')}</span><span class="list-row-copy"><span class="oc-label">${esc(p.oc)}</span><strong>${esc(p.sellerName)}</strong><small>${num(p.bags)} sc · ${esc(p.drink)} · ${dateBR(p.date)}</small></span><span class="amount">${money(p.total)}<span>${badge(p.paymentStatus)}</span></span><span class="row-arrow">${icon('arrowUpRight')}</span></button>`).join(''):emptyHTML('Seu primeiro negócio começa aqui','Registre uma compra para acompanhar sua operação.');
    const groups=stockByDrink(),total=groups.reduce((s,g)=>s+g.total,0);
    $('#stockSummary').innerHTML=groups.length?groups.slice(0,6).map(g=>`<div class="stock-line"><div class="stock-line-top"><strong>${esc(g.drink)}</strong><span>${num(g.total)} <small>sc</small></span></div><div class="stock-bar"><i style="width:${total?g.total/total*100:0}%"></i></div></div>`).join(''):emptyHTML('Aguardando café no armazém','Receba uma OC para formar o estoque físico.');
    const base=new Date(month+'-01T12:00:00'),months=[];
    for(let i=5;i>=0;i--){const d=new Date(base);d.setMonth(d.getMonth()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');months.push({key,label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),bags:db.purchases.filter(p=>p.date?.startsWith(key)).reduce((s,p)=>s+Number(p.bags||0),0)});}
    const max=Math.max(1,...months.map(m=>m.bags));
    $('#volumeChart').innerHTML=`<div class="chart-top"><strong>${num(bags)}<span> sacas</span></strong><small>no mês selecionado</small></div><div class="chart-bars">${months.map(m=>`<div class="chart-column ${m.key===month?'current':''}"><small>${num(m.bags)}</small><div class="chart-track"><div class="chart-bar" style="height:${m.bags?Math.max(4,m.bags/max*100):2}%" title="${esc(m.label)}: ${num(m.bags)} sacas"></div></div><span>${esc(m.label)}</span></div>`).join('')}</div>`;
    const actions=[];
    allFinance.filter(f=>pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).forEach(f=>actions.push({type:'wallet',title:'Pagamento vencido',detail:`${f.person} · ${money(pendingFor(f))}`,attrs:`data-finance-toggle="${esc(f.id)}"`,tone:'late'}));
    db.purchases.filter(p=>!p.invoiceIssued).slice().reverse().forEach(p=>actions.push({type:'file',title:'Emitir instrução de faturamento',detail:`${p.oc} · ${p.sellerName}`,attrs:`data-invoice-open="${esc(p.id)}"`,tone:'documents'}));
    eligibleStockPurchases().slice().reverse().forEach(p=>actions.push({type:'box',title:'Acompanhar recebimento',detail:`${p.oc} · ${num(remainingToReceive(p))} sc pendentes`,attrs:`data-purchase-open="${esc(p.id)}"`,tone:'receipt'}));
    const samples=db.samples.filter(s=>s.status==='pending');if(samples.length)actions.push({type:'coffee',title:'Provas em análise',detail:`${samples.length} prova(s) aguardando classificação`,attrs:'data-goto="provas"',tone:'sample'});
    $('#actionCount').textContent=actions.length;
    $('#operatingActions').innerHTML=actions.length?actions.slice(0,4).map(a=>`<button class="operating-action ${a.tone}" ${a.attrs}><span class="action-icon">${icon(a.type)}</span><span><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></span>${icon('arrowRight')}</button>`).join(''):emptyHTML('Tudo organizado por aqui','Suas próximas ações aparecem neste painel.');
  }
  function updatePurchaseSummary(){
    if(!$('#purchaseSummaryBody'))return;
    const name=$('#sellerName').value.trim(),drink=$('#purchaseDrink').value.trim(),bags=Number($('#purchaseBags').value||0),price=Number($('#purchasePrice').value||0);
    $('#purchaseTotal').textContent=money(roundMoney(bags*price));
    $('#purchaseMobileTotal').textContent=money(roundMoney(bags*price));
    $('#purchaseSummaryBody').innerHTML=`<h3>${esc(name||'Seu próximo fornecedor')}</h3><p>${esc(drink||'Café a definir')}</p><dl><div><dt>Quantidade</dt><dd>${num(bags)} sc</dd></div><div><dt>Preço por saca</dt><dd>${money(price)}</dd></div><div><dt>Destino</dt><dd>${esc(destinationLabel($('#purchaseDestination').value))}</dd></div>${$('#purchaseHasBroker').value==='yes'?`<div><dt>Corretor</dt><dd>${esc($('#purchaseBrokerName').value||'A informar')}</dd></div>`:''}</dl>`;
    const fields=[['Fornecedor',Boolean(name)],['Café e quantidade',Boolean(drink&&bags>0)],['Data da compra',Boolean($('#purchaseDate').value)]];
    $('#purchaseChecklist').innerHTML=fields.map(([label,ok])=>`<div class="${ok?'complete':''}"><i>${ok?icon('check'):''}</i>${esc(label)}</div>`).join('');
    $('.draft-badge').textContent=$('#purchaseForm').dataset.editingId?'EDIÇÃO DA OC':'RASCUNHO';
    $$('.summary-submit,.purchase-mobile-buttons [type="submit"]').forEach(b=>{b.innerHTML=icon('check')+($('#purchaseForm').dataset.editingId?' Salvar alterações':' Finalizar compra');});
  }
  function renderFinance(){
    const all=db.finance.filter(f=>f.type==='payable'),month=$('#financeMonth').value||todayISO().slice(0,7),pending=all.reduce((s,f)=>s+pendingFor(f),0),paidMonth=all.reduce((sum,f)=>sum+(f.payments||[]).filter(p=>!p.reversedAt&&p.date?.startsWith(month)).reduce((s,p)=>s+Number(p.amount||0),0),0),late=all.filter(f=>pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO());
    $('#financeStats').innerHTML=statHTML('Saldo a pagar',money(pending),'Todas as compras em aberto','wallet')+statHTML('Pago no mês',money(paidMonth),'Conforme a data de cada pagamento','check')+statHTML('Vencido',money(late.reduce((s,f)=>s+pendingFor(f),0)),`${late.length} conta(s) vencida(s)`,'clock')+statHTML('Compras quitadas',String(all.filter(f=>f.status==='paid').length),`${all.length} contas no histórico`,'file');
    const q=normalize($('#financeSearch').value),filter=$('#financeFilter').value;
    const rows=all.slice().filter(f=>(!q||normalize(`${f.oc} ${f.person}`).includes(q))&&(filter==='all'||(filter==='pending'?pendingFor(f)>0:filter==='late'?pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO():f.status===filter))).sort((a,b)=>{const al=a.dueDate&&a.dueDate<todayISO()&&pendingFor(a)>0,bl=b.dueDate&&b.dueDate<todayISO()&&pendingFor(b)>0;return Number(bl)-Number(al)||(b.date||'').localeCompare(a.date||'');});
    $('#financeList').innerHTML=rows.length?rows.map(f=>{const percent=f.amount>0?Math.min(100,paidFor(f)/f.amount*100):0;return `<div class="data-card finance-card"><div class="main-info"><span class="oc-label">${esc(f.oc)}</span><strong>${esc(f.person)}</strong><small>Vencimento ${dateBR(f.dueDate)}${pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO()?' · <b class="late-text">Vencida</b>':''}</small></div><div class="finance-values"><div><label>Total da compra</label><strong>${money(f.amount)}</strong></div><div><label>Pago</label><strong class="paid-value">${money(paidFor(f))}</strong></div><div><label>Saldo a pagar</label><strong>${money(pendingFor(f))}</strong></div><div class="payment-progress"><i style="width:${percent}%"></i></div></div><div class="card-actions">${badge(f.status)}<button class="mini-btn ${pendingFor(f)>0?'primary':''}" data-finance-toggle="${esc(f.id)}">${pendingFor(f)>0?'Registrar pagamento':'Ver pagamentos'}</button><button class="mini-btn" data-purchase-open="${esc(f.purchaseId)}">Ver OC</button></div></div>`;}).join(''):emptyHTML('Nenhuma conta neste filtro','As compras criam o financeiro automaticamente.');
  }
  function toggleFinance(id){openPayment(id);}
  function openPayment(id){
    const f=db.finance.find(f=>f.id===id);if(!f)return;activeFinanceId=id;
    $('#paymentOc').textContent=f.oc+' · '+f.person;const remaining=pendingFor(f);
    $('#paymentSummary').innerHTML=`<div><small>Total da compra</small><strong>${money(f.amount)}</strong></div><div><small>Já pago</small><strong class="paid-value">${money(paidFor(f))}</strong></div><div><small>Saldo a pagar</small><strong>${money(remaining)}</strong></div>`;
    $('#paymentAmount').value=remaining.toFixed(2);$('#paymentAmount').max=remaining.toFixed(2);$('#paymentDate').value=todayISO();$('#paymentMethod').value=f.method||'PIX';$('#paymentNotes').value='';
    $('#paymentEntryFields').hidden=remaining<=0;$('#paymentSaveBtn').hidden=remaining<=0;$$('input,select',$('#paymentEntryFields')).forEach(el=>{el.disabled=remaining<=0;});
    $('#paymentHistory').innerHTML=(f.payments||[]).length?(f.payments||[]).slice().reverse().map(p=>`<div class="payment-history-row ${p.reversedAt?'reversed':''}"><span class="history-dot"></span><div><strong>${money(p.amount)} ${p.reversedAt?'<span class="badge gray">Estornado</span>':''}</strong><small>${p.date?dateBR(p.date):'Data não registrada'} · ${esc(p.method||'Não informado')}${p.notes?' · '+esc(p.notes):''}</small></div>${p.reversedAt?'':`<button type="button" class="text-btn" data-payment-reverse="${esc(p.id)}">Estornar</button>`}</div>`).join(''):emptyHTML('Nenhum pagamento registrado','Registre uma parcela ou quite o saldo da compra.');
    if(!$('#paymentModal').open){$('#paymentModal').showModal();$('#paymentModal').scrollTop=0;}
  }
  function savePayment(){
    const f=db.finance.find(f=>f.id===activeFinanceId);if(!f)return;
    const amount=roundMoney($('#paymentAmount').value),remaining=pendingFor(f),date=$('#paymentDate').value;
    if(!Number.isFinite(amount)||amount<=0||amount>remaining||!date){toast('Confira o pagamento',`Informe uma data e um valor entre R$ 0,01 e ${money(remaining)}.`,'error');return;}
    f.payments.push({id:uid('payment'),amount,date,method:$('#paymentMethod').value,notes:$('#paymentNotes').value.trim(),createdAt:new Date().toISOString()});reconcileFinance(f);saveDB();$('#paymentModal').close();toast('Pagamento registrado',`${money(amount)} · saldo ${money(pendingFor(f))}`);
    if($('#purchaseDetailModal').open&&activePurchaseId===f.purchaseId)renderPurchaseDetail(f.purchaseId,false);
  }
  function reversePayment(id){
    const f=db.finance.find(f=>f.id===activeFinanceId),payment=f?.payments?.find(p=>p.id===id);if(!payment||payment.reversedAt)return;
    if(!confirm(`Estornar o pagamento de ${money(payment.amount)}? O saldo será reaberto e o histórico será preservado.`))return;
    payment.reversedAt=new Date().toISOString();reconcileFinance(f);saveDB();openPayment(f.id);toast('Pagamento estornado');
    if($('#purchaseDetailModal').open&&activePurchaseId===f.purchaseId)renderPurchaseDetail(f.purchaseId,false);
  }
  function producerPurchases(id){return db.purchases.filter(p=>p.producerId===id);}
  function openProducerProfile(id){
    const p=db.producers.find(p=>p.id===id);if(!p)return;activeProducerId=id;
    const purchases=producerPurchases(id),ids=new Set(purchases.map(p=>p.id)),finance=db.finance.filter(f=>ids.has(f.purchaseId));
    $('#producerProfileName').textContent=p.name;
    $('#producerProfileBody').innerHTML=`<div class="supplier-contact">${partyHTML(p)}${p.phone?`<p>Telefone: ${esc(p.phone)}</p>`:''}</div><div class="supplier-stats">${statHTML('Comprado',money(purchases.reduce((s,p)=>s+Number(p.total||0),0)),`${purchases.length} negociações`,'file')}${statHTML('Já pago',money(finance.reduce((s,f)=>s+paidFor(f),0)),'Pagamentos registrados','check')}${statHTML('Saldo a pagar',money(finance.reduce((s,f)=>s+pendingFor(f),0)),'Contas deste fornecedor','wallet')}</div><p class="eyebrow">HISTÓRICO DE COMPRAS</p><div class="supplier-history">${purchases.length?purchases.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>`<button class="list-row" data-purchase-open="${esc(p.id)}"><span class="list-row-copy"><span class="oc-label">${esc(p.oc)}</span><strong>${num(p.bags)} sc · ${esc(p.drink)}</strong><small>${dateBR(p.date)}</small></span><span class="amount">${money(p.total)}</span>${icon('arrowUpRight')}</button>`).join(''):emptyHTML('Ainda sem compras','A próxima negociação aparecerá aqui.')}</div>`;
    $('#producerProfileModal').showModal();$('#producerProfileModal').scrollTop=0;
  }
  function buyFromProducer(id){const p=db.producers.find(p=>p.id===id);if(!p)return;resetPurchaseForm();$('#sellerName').value=p.name;fillSellerFromProducer();$('#producerProfileModal').close();navigate('balcao');updatePurchaseSummary();}
  function renderProducers(){
    const q=normalize($('#producerSearch').value),rows=db.producers.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).filter(p=>!q||normalize(`${p.name} ${p.doc} ${p.phone} ${p.city} ${p.farm}`).includes(q));
    $('#producersList').innerHTML=rows.length?rows.map(p=>{const orders=producerPurchases(p.id),ids=new Set(orders.map(p=>p.id)),balance=db.finance.filter(f=>ids.has(f.purchaseId)).reduce((s,f)=>s+pendingFor(f),0);const initials=p.name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('');return `<div class="data-card supplier-card"><span class="supplier-avatar">${esc(initials)}</span><div class="main-info"><strong>${esc(p.name)}</strong><small>${esc(p.doc||p.farm||'Documento não informado')} · ${esc(p.city||'Cidade não informada')}</small></div><div class="data-meta"><label>Compras</label><strong>${orders.length}</strong></div><div class="data-meta"><label>Saldo a pagar</label><strong>${money(balance)}</strong></div><div class="card-actions"><button class="mini-btn primary" data-producer-profile="${esc(p.id)}">Abrir ficha</button><button class="mini-btn" data-producer-edit="${esc(p.id)}">Editar</button><button class="mini-btn" data-producer-delete="${esc(p.id)}">Excluir</button></div></div>`;}).join(''):emptyHTML('Seus fornecedores ficam aqui','O cadastro também é feito automaticamente no balcão.');
  }

  function bindEvents(){
    $('#logoutBtn')?.addEventListener('click', logoutApp);
    document.addEventListener('click',e=>{
      const go=e.target.closest('[data-goto]');if(go)navigate(go.dataset.goto);
      const nav=e.target.closest('[data-page]');if(nav)navigate(nav.dataset.page);
      const close=e.target.closest('[data-close-dialog]');if(close)document.getElementById(close.dataset.closeDialog)?.close();
      const so=e.target.closest('[data-sample-edit]');if(so)openSampleModal(db.samples.find(s=>s.id===so.dataset.sampleEdit));
      const sb=e.target.closest('[data-sample-buy]');if(sb)sampleToPurchase(sb.dataset.sampleBuy);
      const sd=e.target.closest('[data-sample-delete]');if(sd){const s=db.samples.find(x=>x.id===sd.dataset.sampleDelete);if(s&&confirm(`Excluir a prova de ${s.name}?`)){db.samples=db.samples.filter(x=>x.id!==s.id);saveDB();toast('Prova excluída');}}
      const po=e.target.closest('[data-purchase-open]');if(po){$('#producerProfileModal').close();openPurchaseDetail(po.dataset.purchaseOpen);}
      const io=e.target.closest('[data-invoice-open]');if(io)openInvoice(io.dataset.invoiceOpen);
      const ls=e.target.closest('[data-lot-sell]');if(ls)openSaleModal(ls.dataset.lotSell);
      const sr=e.target.closest('[data-stock-receive]');if(sr)openStockEntryModal(sr.dataset.stockReceive);
      const ft=e.target.closest('[data-finance-toggle]');if(ft)toggleFinance(ft.dataset.financeToggle);
      const pe=e.target.closest('[data-producer-edit]');if(pe)openProducerModal(db.producers.find(p=>p.id===pe.dataset.producerEdit));
      const pd=e.target.closest('[data-producer-delete]');if(pd)deleteProducer(pd.dataset.producerDelete);
      const pp=e.target.closest('[data-producer-profile]');if(pp)openProducerProfile(pp.dataset.producerProfile);
      const pr=e.target.closest('[data-payment-reverse]');if(pr)reversePayment(pr.dataset.paymentReverse);
      const le=e.target.closest('[data-location-edit]');if(le)openUnloadingLocation(le.dataset.locationEdit);
      const ld=e.target.closest('[data-location-delete]');if(ld)deleteUnloadingLocation(ld.dataset.locationDelete);
    });

    $('#quickBuyBtn').addEventListener('click',()=>navigate('balcao'));
    $('#backPageBtn').addEventListener('click',()=>navigate('dashboard'));
    $('#navSearchBtn').addEventListener('click',()=>{navigate('compras');$('#purchaseSearch').focus();});
    $('#dashboardMonth').addEventListener('change',renderDashboard);
    $('#financeMonth').addEventListener('change',renderFinance);
    $('#purchaseDestinationFilter').addEventListener('change',renderPurchases);
    $('#purchaseMonth').addEventListener('change',renderPurchases);
    $('#purchaseForm').addEventListener('input',updatePurchaseSummary);
    $('#purchaseForm').addEventListener('change',updatePurchaseSummary);
    $('#clearPurchaseAsideBtn').addEventListener('click',()=>{if(confirm('Limpar os dados desta negociação?'))resetPurchaseForm();});
    $('#paymentForm').addEventListener('submit',e=>{e.preventDefault();savePayment();});
    $('#producerProfileBuyBtn').addEventListener('click',()=>buyFromProducer(activeProducerId));
    $('#producerProfileEditBtn').addEventListener('click',()=>{$('#producerProfileModal').close();openProducerModal(db.producers.find(p=>p.id===activeProducerId));});
    $('#mobileMoreBtn').addEventListener('click',()=>$('#moreMenuModal').showModal());
    $('#moreSettingsBtn').addEventListener('click',()=>{$('#moreMenuModal').close();openSettings();});
    $('#moreBackupBtn').addEventListener('click',()=>{$('#moreMenuModal').close();exportBackup();});
    $('#moreLogoutBtn').addEventListener('click',logoutApp);
    ['#downloadRescueBtn','#settingsRescueBtn'].forEach(sel=>$(sel).addEventListener('click',downloadRescuedCopy));
    $('#resolveSyncBtn').addEventListener('click',async()=>{try{await window.BracoffeeSync.resolveConflict();$('#syncConflictModal').close();toast('Dados atualizados','Sua cópia anterior continua disponível em Configurações.');}catch{toast('Não foi possível atualizar','Confira sua conexão e tente novamente.','error');}});
    $('#syncConflictModal').addEventListener('cancel',e=>e.preventDefault());
    document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();navigate('compras');$('#purchaseSearch').focus();}});
    $('#sellerName').addEventListener('change',fillSellerFromProducer);
    ['#purchaseBags','#purchasePrice','#purchaseNY','#purchaseUSD'].forEach(sel=>$(sel).addEventListener('input',updatePurchaseCalculations));
    $('#purchaseDeliveryType').addEventListener('change',updateDeliveryUI); $('#purchaseDestination').addEventListener('change',updateDestinationUI);
    $('#purchaseHasBroker').addEventListener('change',updateBrokerUI);
    $('#purchaseBrokerageType').addEventListener('change',()=>{$('#purchaseBrokerageValue').value='';updateBrokerUI();});
    $('#purchaseBrokerageValue').addEventListener('input',updateBrokerageCalculations);
    $('#clearPurchaseBtn').addEventListener('click',()=>{if(confirm('Limpar os dados desta compra?'))resetPurchaseForm();});
    $('#purchaseForm').addEventListener('submit',e=>{
      e.preventDefault();const data=collectPurchaseForm();
      if(!data.sellerName||!Number.isFinite(data.bags)||data.bags<=0||!Number.isFinite(data.pricePerBag)||data.pricePerBag<0||!data.drink||!data.date){toast('Confira os campos','Informe vendedor, quantidade positiva, preço, bebida e data.','error');return;}
      if($('#purchaseHasBroker').value==='yes'&&!data.brokerName){toast('Informe o corretor','O nome será usado no contrato e na assinatura.','error');return;}
      if(data.brokerageType!=='none'&&(!Number.isFinite(data.brokerageValue)||data.brokerageValue<=0||(data.brokerageType==='percent'&&data.brokerageValue>100))){toast('Confira a corretagem','Informe um valor positivo. O percentual pode ser de até 100%.','error');return;}
      const id=e.currentTarget.dataset.editingId;if(id)updatePurchase(id,data);else createPurchase(data);
    });

    $('#newSampleBtn').addEventListener('click',()=>openSampleModal()); $('#sampleForm').addEventListener('submit',e=>{e.preventDefault();saveSample();});
    $('#sampleSearch').addEventListener('input',renderSamples); $('#sampleFilter').addEventListener('change',renderSamples);
    $('#purchaseSearch').addEventListener('input',renderPurchases); $('#purchaseFilter').addEventListener('change',renderPurchases);
    $('#stockSearch').addEventListener('input',renderStock); $('#financeSearch').addEventListener('input',renderFinance); $('#financeFilter').addEventListener('change',renderFinance);
    $('#producerSearch').addEventListener('input',renderProducers); $('#newProducerBtn').addEventListener('click',()=>openProducerModal()); $('#producerForm').addEventListener('submit',e=>{e.preventDefault();saveProducer();});
    $('#newStockEntryBtn').addEventListener('click',()=>openStockEntryModal());
    $('#stockEntryPurchaseId').addEventListener('change',updateStockEntrySummary);
    $('#stockEntryBags').addEventListener('input',()=>{const b=Number($('#stockEntryBags').value||0);if(b>0)$('#stockEntryWeight').value=Number((b*60).toFixed(2));});
    $('#stockEntryForm').addEventListener('submit',e=>{e.preventDefault();saveStockEntry();});
    $('#saleForm').addEventListener('submit',e=>{e.preventDefault();saveSale();});

    $('#detailContractBtn').addEventListener('click',()=>activePurchaseId&&printContract(activePurchaseId));
    $('#detailInvoiceBtn').addEventListener('click',()=>activePurchaseId&&openInvoice(activePurchaseId));
    $('#invoiceUnloadingLocation').addEventListener('change',updateInvoiceLocationPreview);
    $('#invoiceForm').addEventListener('submit',e=>{e.preventDefault();saveInvoice(e.submitter?.id==='invoiceIssueBtn');});
    $('#invoiceReprintBtn').addEventListener('click',reprintInvoice);
    $('#invoiceNewLocationBtn').addEventListener('click',()=>openUnloadingLocation());
    $('#invoiceManageLocationsBtn').addEventListener('click',openUnloadingLocations);
    $('#newUnloadingLocationBtn').addEventListener('click',()=>openUnloadingLocation());
    $('#unloadingLocationForm').addEventListener('submit',e=>{e.preventDefault();saveUnloadingLocation();});
    $('#invoiceSettingsBtn').addEventListener('click',openSettings);
    $('#settingsLocationsBtn').addEventListener('click',openUnloadingLocations);
    $('#detailEditBtn').addEventListener('click',()=>activePurchaseId&&editPurchase(activePurchaseId));
    $('#detailDeleteBtn').addEventListener('click',()=>activePurchaseId&&deletePurchase(activePurchaseId));
    $('#detailPayBtn').addEventListener('click',()=>{const p=db.purchases.find(x=>x.id===activePurchaseId);if(p)openPayment(p.financeId);});

    $('#openSettingsBtn').addEventListener('click',openSettings); $('#settingsForm').addEventListener('submit',e=>{e.preventDefault();saveSettings();});
    $('#openSettingsMobileBtn').addEventListener('click',openSettings);
    $('#exportBackupBtn').addEventListener('click',exportBackup); $('#settingsExportBtn').addEventListener('click',exportBackup); $('#importBackupBtn').addEventListener('click',()=>$('#backupFileInput').click()); $('#backupFileInput').addEventListener('change',e=>importBackup(e.target.files[0]));

    $$('dialog').filter(d=>d.id!=='syncConflictModal').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
    $$('[data-goto]').forEach(b=>b.addEventListener('click',()=>$('#moreMenuModal').close()));
  }

  function showSyncStatus(status){
    const labels={loading:'Carregando',saved:'Tudo salvo',saving:'Salvando',offline:'Sem conexão',conflict:'Revisar atualização'};
    $('#syncStatus').dataset.state=status;$('#syncStatus span').textContent=labels[status]||status;
    const banner=$('#connectionBanner');banner.hidden=!['offline','conflict'].includes(status);
    banner.textContent=status==='offline'?'Sem conexão. Consulte os dados salvos e reconecte para registrar alterações.':'Os dados foram atualizados em outro aparelho. Confira a atualização para continuar.';
  }
  function downloadRescuedCopy(){const data=window.BracoffeeSync.rescued;if(!data)return;downloadJSON(data,'bracoffee-copia-preservada-'+todayISO()+'.json');}
  function downloadJSON(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function normalizeDB(data){return migrateDB({...defaultDB(),...data,schemaVersion:data.schemaVersion||1,settings:{...defaultDB().settings,...(data.settings||{})}}).data;}
  async function init(){
    hydrateIcons();
    $('#purchaseDate').value=todayISO();
    $('#dashboardMonth').value=todayISO().slice(0,7);$('#financeMonth').value=todayISO().slice(0,7);
    const local=db;
    const incoming=await window.BracoffeeSync.connect(local,{
      onStatus:showSyncStatus,
      onConflict:()=>{if(!$('#syncConflictModal').open)$('#syncConflictModal').showModal();},
      onRescue:()=>{$('#rescueBackupPanel').hidden=false;},
      isEditing:()=>Boolean($('dialog[open]')||$('#page-balcao').classList.contains('active')),
      onRemote:(data,force)=>{db=normalizeDB(data);if(force){$$('dialog').forEach(d=>d.close());resetPurchaseForm();}renderAll();}
    });
    const sourceVersion=Number(incoming.schemaVersion||1);
    db=normalizeDB(incoming);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch{}
    if(window.BracoffeeSync.canWrite&&sourceVersion<3)window.BracoffeeSync.queue(db);
    updateDeliveryUI(); updateDestinationUI(); updateBrokerUI();
    bindEvents();
    renderAll();
    $('#appLoading').hidden=true;$('#rescueBackupPanel').hidden=!window.BracoffeeSync.rescued;
    if(window.BracoffeeSync.status==='conflict'&&!$('#syncConflictModal').open)$('#syncConflictModal').showModal();
    const guard=e=>{const target=e.target;const mutation=e.type==='submit'||(e.type==='click'&&target.closest('[data-sample-delete],[data-producer-delete],[data-location-delete],[data-payment-reverse],#detailDeleteBtn,#importBackupBtn'))||(e.type==='change'&&target.id==='backupFileInput');if(mutation&&!window.BracoffeeSync.canWrite){e.preventDefault();e.stopImmediatePropagation();toast('Aguarde para registrar alterações',window.BracoffeeSync.status==='conflict'?'Carregue a versão atual dos dados.':'Confira a conexão e tente novamente.','error');}};
    ['submit','click','change'].forEach(type=>document.addEventListener(type,guard,true));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(()=>{});
    }
  }

  init();
})();
