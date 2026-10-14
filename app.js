(() => {
  'use strict';

  const STORAGE_KEY = 'bracoffee_db_v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const defaultDB = () => ({
    schemaVersion: 4,
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
      ovPrefix: 'OV',
      saleContractTerms: 'O vendedor se compromete a entregar o café na quantidade e qualidade descritas, e o comprador a efetuar o pagamento nas condições e datas combinadas. A entrega e a conferência serão registradas pelas partes. Alterações nas condições dependem de acordo entre comprador e vendedor.',
      contractTerms: 'O vendedor declara ser legítimo proprietário do café descrito nesta ordem de compra e concorda com a quantidade, classificação, preço e condição de pagamento registrados neste documento. A entrega, conferência e liquidação financeira seguirão as condições acordadas entre as partes.'
    },
    producers: [],
    samples: [],
    purchases: [],
    stockLots: [],
    finance: [],
    sales: [],
    customers: [],
    stockMovements: [],
    saleCounters: {},
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
    changed=window.BracoffeeCommercial.migrate(data)||changed;
    if(Number(data.schemaVersion||1)<4){data.schemaVersion=4;changed=true;}
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
    window.BracoffeeSync.preserveLocal?.('Antes de registrar alterações');
    try{localStorage.setItem(STORAGE_KEY, JSON.stringify(db));}catch(e){console.warn('Cópia local indisponível',e);}
    renderAll();
    window.BracoffeeSync.queue(db);
  }

  function roundMoney(value){return Math.round((Number(value||0)+Number.EPSILON)*100)/100;}
  function paidFor(f){return roundMoney((f.payments||[]).filter(p=>!p.reversedAt).reduce((s,p)=>s+Number(p.amount||0),0));}
  function pendingFor(f){if(f.pricePending||f.cancelledAt)return 0;return Math.max(0,roundMoney(Number(f.amount||0)-paidFor(f)));}
  function reconcileFinance(f,data=db){
    f.paidAmount=paidFor(f);const total=roundMoney(f.amount);
    if(f.pricePending){f.status='fixing';f.paidAt='';const purchase=data.purchases.find(p=>p.id===f.purchaseId);if(purchase)purchase.paymentStatus='fixing';const sale=data.sales.find(s=>s.id===f.saleId);if(sale)sale.paymentStatus='fixing';return;}
    f.status=total>0&&f.paidAmount>=total?'paid':f.paidAmount>0?'partial':'pending';
    const payments=(f.payments||[]).filter(p=>!p.reversedAt&&p.date).sort((a,b)=>a.date.localeCompare(b.date));
    f.paidAt=f.status==='paid'?(payments.at(-1)?.date||''):'';
    const p=data.purchases.find(p=>p.id===f.purchaseId);if(p)p.paymentStatus=f.status;
    const sale=data.sales.find(s=>s.id===f.saleId);if(sale)sale.paymentStatus=f.status;
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
  const num = (n, max = 4) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max });
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
    return lot && lot.entryType !== 'legacy_auto_purchase' && !lot.reversedAt && !lot.deletedAt;
  }

  function physicalStockLots() {
    return db.stockLots.filter(isPhysicalStockLot);
  }

  function receivedForPurchase(purchaseId) {
    return physicalStockLots().filter(l => l.purchaseId === purchaseId).reduce((sum,l) => sum + Number(l.bags || 0), 0);
  }

  function remainingToReceive(purchase) {
    const external=window.BracoffeeCommercial.externalDelivered(db,purchase?.id);
    return Math.max(0, Number(purchase?.bags || 0) - receivedForPurchase(purchase?.id)-external);
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
      : { pending: ['A pagar', 'amber'], paid: ['Pago', 'green'], fixing:['A fixar','amber'], partial: ['Parcial', 'amber'] };
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
      guias: ['INSTRUÇÕES AO ARMAZÉM', 'Guias de armazém'],
      financeiro: ['CONTROLE', 'Financeiro'],
      produtores: ['RELACIONAMENTOS', 'Fornecedores'],
      vendas: ['NEGOCIAÇÕES E ENTREGAS', 'Ordens de venda']
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
    commercialPlan=C.futureReservations(db);
    renderProducerDatalist();
    renderDashboard();
    renderSamples();
    renderPurchases();
    renderStock();
    renderFinance();
    renderProducers();
    renderCommercial();window.BracoffeeWorkspaceUI?.render();
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
    updatePurchasePriceMode();
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
    if(p.pricePending&&p.brokerageType==='percent')return num(p.brokerageValue)+'% sobre o valor a fixar';
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

  function updatePurchasePriceMode(){if(!$('#purchaseTerm'))return;const fix=$('#purchaseTerm').value==='fix';$('#purchasePrice').required=!fix;$('#purchasePrice').min=fix?'0':'0.01';if(!$('#purchaseForm').dataset.editingId){$('#purchasePaymentStatus').disabled=fix;if(fix)$('#purchasePaymentStatus').value='pending';}}
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
    $('#purchaseForm').dataset.editingId = '';$('#purchaseForm').dataset.sampleId='';
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
    activePurchaseId = null;window.dispatchEvent(new Event('bracoffee:purchaseReset'));
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
      sampleId:$('#purchaseForm').dataset.sampleId||'',sellerName: $('#sellerName').value.trim(),
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
      species:$('#purchaseSpecies').value.trim(),crop:$('#purchaseCrop').value.trim(),screen:$('#purchaseScreen').value.trim(),sampleRef:$('#purchaseSampleRef').value.trim(),
      notes: $('#purchaseNotes').value.trim(),
      date: $('#purchaseDate').value,
      purchaseTerm: $('#purchaseTerm').value,
      paymentStatus: $('#purchasePaymentStatus').value,
      pricePending:$('#purchaseTerm').value==='fix',
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
    const finance = { id: uid('fin'), type: 'payable', pricePending:purchase.pricePending, purchaseId: purchase.id, oc: purchase.oc, person: purchase.sellerName, amount: purchase.total, paidAmount: purchase.paymentStatus === 'paid' ? purchase.total : 0, status: purchase.paymentStatus, method: purchase.paymentMethod, dueDate: purchase.dueDate, date: purchase.date, createdAt: new Date().toISOString() };
    finance.payments=purchase.paymentStatus==='paid'&&purchase.total>0?[{id:uid('payment'),amount:purchase.total,date:purchase.date,method:purchase.paymentMethod,notes:'Pagamento informado na compra',createdAt:new Date().toISOString()}]:[];
    reconcileFinance(finance);
    purchase.paymentStatus=finance.status;
    purchase.financeId = finance.id;
    db.purchases.push(purchase); db.finance.push(finance); saveDB();
    window.dispatchEvent(new Event('bracoffee:purchaseSaved'));toast('Compra registrada', `${purchase.oc} criada. O estoque só será movimentado quando o café for recebido.`);
    resetPurchaseForm(); openPurchaseDetail(purchase.id);
  }

  function updatePurchase(id, data) {
    const p = db.purchases.find(x => x.id === id); if (!p) return;
    const linked=db.sales.filter(v=>!v.cancelledAt&&!v.reviewPending&&v.source!=='stock'&&v.purchaseId===id);
    if(linked.length&&(data.destination!==p.destination||data.bags<linked.reduce((v,s)=>v+s.bags,0))){toast('Compra vinculada a vendas','Mantenha o tipo e as sacas comprometidas pelas OVs.','error');return;}
    const received = receivedForPurchase(id);
    if(Number(data.bags)<Math.max(window.BracoffeeCommercial.purchaseCommitted(db,id),received+window.BracoffeeCommercial.externalDelivered(db,id))){toast('Quantidade já comprometida','As entregas, os recebimentos e as OVs vinculadas precisam ser preservados.','error');return;}
    if (Number(data.bags) < received) { toast('Quantidade inválida', `Já foram recebidas ${num(received)} sacas desta OC.`,'error'); return; }
    const fin = db.finance.find(f => f.id === p.financeId || f.purchaseId === p.id);
    if(fin&&data.pricePending&&paidFor(fin)>0){toast('Compra já paga','Mantenha o preço fixado ou estorne os pagamentos antes de retornar para A fixar.','error');return;}
    if(fin&&roundMoney(data.total)<paidFor(fin)){toast('Valor abaixo do que já foi pago',`Esta compra já recebeu ${money(paidFor(fin))} em pagamentos.`,'error');return;}
    if(received>0&&data.destination!=='stock'){toast('Esta compra já tem recebimento','Mantenha o tipo “Para estoque” para preservar as entradas físicas.','error');return;}
    Object.assign(p, data, { updatedAt: new Date().toISOString() });
    const prod = upsertProducerFromPurchase(data); p.producerId = prod.id;
    db.stockLots.filter(l => l.purchaseId === id).forEach(l => Object.assign(l,{oc:p.oc,sellerName:p.sellerName,drink:p.drink,cata:p.cata,moisture:p.moisture,classification:p.classification}));
    if (fin) {Object.assign(fin,{person:p.sellerName,amount:p.total,pricePending:p.pricePending,method:p.paymentMethod,dueDate:p.dueDate,date:p.date});reconcileFinance(fin);p.financeId=fin.id;}
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
    Object.entries({sampleSpecies:sample?.species,sampleCrop:sample?.crop,sampleScreen:sample?.screen,sampleRef:sample?.sampleRef}).forEach(([id,v])=>$('#'+id).value=v||'');
    $('#sampleStatus').value = sample?.status || 'pending';
    $('#sampleModal').showModal();
  }

  function saveSample() {
    const id = $('#sampleId').value;
    const data = {
      name: $('#sampleName').value.trim(), bags:Number($('#sampleBags').value||0), drink:$('#sampleDrink').value.trim(),
      cata:Number($('#sampleCata').value||0), moisture:Number($('#sampleMoisture').value||0), notes:$('#sampleNotes').value.trim(),
      species:$('#sampleSpecies').value.trim(),crop:$('#sampleCrop').value.trim(),screen:$('#sampleScreen').value.trim(),sampleRef:$('#sampleRef').value.trim(),status:$('#sampleStatus').value, date:db.samples.find(s=>s.id===id)?.date||todayISO(), updatedAt:new Date().toISOString()
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
    $('#purchaseCata').value=s.cata||''; $('#purchaseMoisture').value=s.moisture||''; $('#purchaseNotes').value=s.notes||'';$('#purchaseForm').dataset.sampleId=s.id;Object.entries({purchaseSpecies:s.species,purchaseCrop:s.crop,purchaseScreen:s.screen,purchaseSampleRef:s.sampleRef}).forEach(([id,v])=>$('#'+id).value=v||'');
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
    $('#purchasesTable').innerHTML=rows.length?rows.slice(0,commercialLimits.purchases).map(p=>`<tr>
      <td><strong>${esc(p.oc)}</strong></td><td>${esc(p.sellerName)}</td><td>${dateBR(p.date)}</td><td>${num(p.bags)}</td><td>${esc(p.drink)}<small>${esc(destinationLabel(p.destination))}</small></td><td><strong>${p.pricePending?'A fixar':money(p.total)}</strong></td><td>${badge(p.paymentStatus)}</td><td><button class="table-link" data-purchase-open="${p.id}">Abrir ${icon('arrowUpRight')}</button></td>
    </tr>`).join(''):`<tr><td colspan="8">${emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.')}</td></tr>`;
    $('#purchasesMobile').innerHTML=rows.length?rows.slice(0,commercialLimits.purchases).map(p=>`<div class="purchase-mobile-card">
      <div class="purchase-mobile-top"><div><strong>${esc(p.oc)}</strong><br><small>${esc(p.sellerName)}</small></div>${badge(p.paymentStatus)}</div>
      <div class="purchase-mobile-grid"><div><small>Sacas</small><strong>${num(p.bags)}</strong></div><div><small>Valor</small><strong>${p.pricePending?'A fixar':money(p.total)}</strong></div><div><small>Tipo</small><strong>${esc(destinationLabel(p.destination))}</strong></div><div><small>Data</small><strong>${dateBR(p.date)}</strong></div></div>
      <button class="mini-btn primary" data-purchase-open="${p.id}">Abrir compra</button></div>`).join(''):emptyHTML('Nenhuma compra encontrada','Registre uma compra no balcão.');
    $('#purchasePageControls').innerHTML='';addMoreControl($('#purchasePageControls'),rows.length,'purchases');
  }

  function openPurchaseDetail(id) { renderPurchaseDetail(id,true); }

  function renderPurchaseDetail(id,open=true) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return; activePurchaseId=id;
    const lots=physicalStockLots().filter(l=>l.purchaseId===p.id); const received=receivedForPurchase(p.id); const remaining=remainingToReceive(p);
    const fin=db.finance.find(f=>f.id===p.financeId||f.purchaseId===id),paid=fin?paidFor(fin):0,balance=fin?pendingFor(fin):Number(p.total||0);
    const lotIds=lots.map(l=>l.id); const sales=db.sales.filter(s=>s.purchaseId===p.id||(s.allocations||[]).some(a=>lotIds.includes(a.lotId)));
    const stockLabel = (p.destination || 'stock') === 'stock'
      ? `${num(received)} sc recebidas${received ? ` · ${num(remaining)} sc ainda não recebidas` : ' · nenhuma entrada física registrada'}`
      : 'Não enviado ao estoque';
    $('#detailOc').textContent=p.oc;
    $('#purchaseDetailBody').innerHTML=`
      <div class="order-summary"><div><span class="oc-label">${dateBR(p.date)} · ${esc(destinationLabel(p.destination))}</span><h3>${esc(p.sellerName)}</h3><p>${num(p.bags)} sacas · ${esc(p.drink)}</p></div><div><strong>${p.pricePending?'A fixar':money(p.total)}</strong>${badge(p.paymentStatus)}</div></div>
      <div class="order-stages"><div class="order-stage done"><strong>Compra registrada</strong>OC e contrato disponíveis</div><div class="order-stage ${p.invoiceIssued?'done':''}"><strong>Faturamento</strong>${p.invoiceIssued?'Instrução emitida':'Instrução a emitir'}</div><div class="order-stage ${received>=p.bags?'done':''}"><strong>${p.destination==='direct'?'Entrega direta':p.destination==='future'?'Entrega futura':'Recebimento'}</strong>${p.destination==='direct'?'Sem entrada no estoque':p.destination==='future'?(p.expectedReceipt?dateBR(p.expectedReceipt):'Data a combinar'):`${num(received)} de ${num(p.bags)} sc`}</div><div class="order-stage ${balance===0?'done':''}"><strong>Pagamento</strong>${balance===0?'Liquidado':`${money(balance)} em aberto`}</div></div>
      <div class="detail-grid">
        <div class="detail-box"><label>Vendedor</label><strong>${esc(p.sellerName)}</strong></div>
        <div class="detail-box"><label>CPF / CNPJ · IE</label><strong>${esc(p.sellerDoc||'—')} · ${esc(p.sellerIE||'—')}</strong></div>
        <div class="detail-box span-2"><label>Endereço</label><strong>${esc([p.sellerAddress,p.sellerCity].filter(Boolean).join(' · ')||'—')}</strong></div>
        <div class="detail-box"><label>Negociação</label><strong>${num(p.bags)} sc · ${money(p.pricePerBag)}/sc</strong></div>
        <div class="detail-box"><label>Valor total</label><strong>${p.pricePending?'A fixar':money(p.total)}</strong></div>
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
        ${p.nfNumber?`<div class="detail-box span-2"><label>NF recebida</label><strong>${esc(p.nfNumber)} · ${dateBR(p.nfDate)}${p.nfKey?' · '+esc(p.nfKey):''}</strong></div>`:''}
        ${p.invoiceIssued?`<div class="detail-box span-2"><label>Última instrução de faturamento</label><strong>Emitida em ${dateBR(p.invoiceIssued.date)} · ${esc(p.invoiceIssued.unloadingLocation?.name||'Sem local de descarga')}</strong></div>`:''}
        <div class="detail-box span-2"><label>Observação</label><strong>${esc(p.notes||'Sem observação')}</strong></div>
      </div>
      <div class="detail-section"><h4>Movimentação</h4><div class="timeline">
        <div class="timeline-row"><div><strong>Compra registrada</strong><small>${dateBR(p.date)}</small></div><strong>${num(p.bags)} sc</strong></div>
        ${lots.map(l=>`<div class="timeline-row"><div><strong>Entrada no estoque${l.warehouse?' · '+esc(l.warehouse):''}</strong><small>${dateBR(l.date)}</small></div><strong>+ ${num(l.bags)} sc</strong></div>`).join('')}
        ${sales.map(s=>`<div class="timeline-row"><div><strong>Venda vinculada · ${esc(s.ov||'Histórico')} · ${esc(s.buyer||'')}</strong><small>${dateBR(s.date)} · ${s.cancelledAt?'Cancelada':'Entregue '+num(window.BracoffeeCommercial.delivered(s))+' de '+num(s.bags)+' sc'}</small></div><button class="text-btn" data-sale-open="${esc(s.id)}">Abrir OV</button></div>`).join('')}
      </div></div>`;
    $('#detailPayBtn').disabled=!!p.pricePending;$('#detailPayBtn').textContent=p.paymentStatus==='paid'?'Ver pagamentos':'Registrar pagamento';
    window.BracoffeeWorkspaceUI?.decoratePurchase(id);
    if(open){$('#purchaseDetailModal').showModal();$('#purchaseDetailModal').scrollTop=0;}
  }

  function editPurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return; resetPurchaseForm();
    const map={sellerName:p.sellerName,sellerDoc:p.sellerDoc,sellerIE:p.sellerIE,sellerPhone:p.sellerPhone,sellerFarm:p.sellerFarm,sellerAddress:p.sellerAddress,sellerCity:p.sellerCity,purchaseBags:p.bags,purchaseWeight:p.weight,purchasePrice:p.pricePerBag,purchaseNY:p.ny,purchaseUSD:p.usd,purchaseDestination:p.destination||'stock',purchaseExpectedReceipt:p.expectedReceipt,purchaseDrink:p.drink,purchaseCata:p.cata,purchaseMoisture:p.moisture,purchaseClass:p.classification,purchaseSpecies:p.species,purchaseCrop:p.crop,purchaseScreen:p.screen,purchaseSampleRef:p.sampleRef,purchaseNotes:p.notes,purchaseDate:p.date,purchaseTerm:p.purchaseTerm||'cash',purchasePaymentStatus:p.paymentStatus,purchasePaymentMethod:p.paymentMethod,purchaseDueDate:p.dueDate,purchaseDeliveryType:p.deliveryType||'pickup',purchaseDeliveryLocation:p.deliveryLocation};
    Object.entries(map).forEach(([id,val])=>{const el=$(`#${id}`);if(el)el.value=val??'';});
    $('#purchaseFormTitle').textContent='Editar '+p.oc;
    $('#purchasePaymentStatus').disabled=true;$('#purchasePaymentEditHelp').hidden=false;
    const brokerMap={purchaseHasBroker:p.brokerName?'yes':'no',purchaseBrokerName:p.brokerName,purchaseBrokerDoc:p.brokerDoc,purchaseBrokerPhone:p.brokerPhone,purchaseBrokerageType:p.brokerageType||'none',purchaseBrokerageValue:p.brokerageValue||'',purchaseBrokeragePayer:p.brokeragePayer||'unspecified',purchaseBrokerageNotes:p.brokerageNotes};
    Object.entries(brokerMap).forEach(([id,val])=>{$(`#${id}`).value=val??'';});
    $('#purchaseForm').dataset.editingId=id;$('#purchaseForm').dataset.sampleId=p.sampleId||''; updatePurchaseCalculations(); updateDeliveryUI(); updateDestinationUI(); updateBrokerUI(); $('#purchaseDetailModal').close(); updatePurchasePriceMode();navigate('balcao'); toast('Editando compra',p.oc);
  }

  function deletePurchase(id) {
    const p=db.purchases.find(x=>x.id===id); if(!p)return;
    if(db.stockLots.some(l=>l.purchaseId===id)||db.sales.some(v=>v.purchaseId===id||(v.allocations||[]).some(a=>db.stockLots.some(l=>l.id===a.lotId&&l.purchaseId===id)))||db.finance.some(f=>f.purchaseId===id&&(f.payments||[]).length)){toast('Compra com histórico','Entradas, vendas e pagamentos precisam permanecer rastreáveis. Corrija a OC pela edição.','error');return;}
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

  function renderStock(){ commercialStock(); }

  function openStockEntryModal(purchaseId='') {
    const eligible=eligibleStockPurchases();
    if (!eligible.length) {
      toast('Nenhuma OC disponível','Marque a compra como “Para estoque” antes de puxá-la para o estoque.','error');
      return;
    }
    const select=$('#stockEntryPurchaseId');
    select.innerHTML=`<option value="">Selecione uma OC</option>`+eligible.map(p=>`<option value="${p.id}">${esc(p.oc)} · ${esc(p.sellerName)} · ${num(remainingToReceive(p))} sc disponíveis para entrada</option>`).join('');
    select.value=purchaseId && eligible.some(p=>p.id===purchaseId)?purchaseId:''; $('#stockEntryDate').value=todayISO(); $('#stockEntryBags').value=''; $('#stockEntryWeight').value=''; $('#stockEntryWarehouse').value=''; $('#stockEntryNotes').value=''; $('#stockEntryNF').value=''; $('#stockEntryLotRef').value=''; $('#stockEntryQuality').value='';
    updateStockEntrySummary(); $('#stockEntryModal').showModal();
  }

  function updateStockEntrySummary() {
    const p=db.purchases.find(x=>x.id===$('#stockEntryPurchaseId').value);
    if(!p){$('#stockEntrySummary').innerHTML='Selecione uma OC.'; $('#stockEntryBags').max=''; return;}
    const pending=remainingToReceive(p); $('#stockEntryBags').max=pending;$('#stockEntryWeight').max=roundMoney(pending*60);$('#stockEntryQuality').value=p.drink||'';$('#stockEntryNF').value=p.nfNumber||'';
    $('#stockEntrySummary').innerHTML=`<strong>${esc(p.oc)} · ${esc(p.sellerName)}</strong><br>${esc(p.drink||'—')} · comprado ${num(p.bags)} sc · recebido ${num(receivedForPurchase(p.id))} sc · <strong>pendente ${num(pending)} sc</strong>`;
  }

  function saveStockEntry() {
    const p=db.purchases.find(x=>x.id===$('#stockEntryPurchaseId').value); if(!p){toast('Selecione uma OC','','error');return;}
    if ((p.destination || 'stock') !== 'stock') { toast('OC fora do estoque','Somente compras marcadas como “Para estoque” podem gerar entrada física.','error'); return; }
    const bags=window.BracoffeeCommercial.qty(Number($('#stockEntryWeight').value||0)/60), pending=remainingToReceive(p);
    if(bags<=0||bags>pending+0.0001){toast('Quantidade inválida',`Ainda faltam receber ${num(pending)} sacas.`,'error');return;}
    const weight=Number($('#stockEntryWeight').value);if(!Number.isFinite(weight)||weight<=0){toast('Informe o peso líquido recebido','','error');return;}
    const lot={id:uid('lot'),entryType:'manual_oc',purchaseId:p.id,oc:p.oc,sellerName:p.sellerName,bags,remaining:bags,weight,drink:p.drink,quality:$('#stockEntryQuality').value.trim()||p.drink,cata:p.cata,classification:p.classification,species:p.species,crop:p.crop,screen:p.screen,sampleRef:p.sampleRef,date:$('#stockEntryDate').value||todayISO(),warehouse:$('#stockEntryWarehouse').value.trim(),nf:$('#stockEntryNF').value.trim(),lotRef:$('#stockEntryLotRef').value.trim(),notes:$('#stockEntryNotes').value.trim(),createdAt:new Date().toISOString()};
    db.stockLots.push(lot); saveDB(); $('#stockEntryModal').close(); if($('#purchaseDetailModal').open)renderPurchaseDetail(p.id,false);toast('Entrada confirmada',`${num(bags)} sacas recebidas da ${p.oc}.`);
  }

  function openSaleModal(lotId){openCommercialSale({lotId});}
  function saveSale(){toast('Use Nova venda','Abra uma ordem de venda para registrar a operação.','error');}

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
    </style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button><span>Na impressão, escolha “Salvar como PDF” para compartilhar o documento.</span></div><main class="paper ${kind}">${body}</main><script>window.addEventListener('load',async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode?i.decode().catch(()=>{}):Promise.resolve()));setTimeout(()=>window.print(),200)})<\/script></body></html>`);
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
      printBox('Espécie / safra / peneira',[p.species,p.crop,p.screen,p.sampleRef].filter(Boolean).join(' · ')||'Conforme negociação'),
      printBox('Quantidade',`${num(p.bags)} sacas (${num(p.weight)} kg)`),printBox('Preço por saca',p.pricePending?'A fixar':money(p.pricePerBag)),
      printBox('Valor total do café',p.pricePending?'A fixar':money(p.total)),printBox('Tipo da compra',`${destinationLabel(p.destination)}${p.expectedReceipt?' · Previsão '+dateBR(p.expectedReceipt):''}`),
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
    $('#invoiceSummary').innerHTML=`<strong>${esc(p.sellerName)}</strong><br>${num(p.bags)} sacas · ${num(p.weight)} kg · ${money(p.pricePerBag)}/saca · <strong>${p.pricePending?'A fixar':money(p.total)}</strong>`;
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
    if(issue&&p.pricePending){toast('Fixe o preço da compra','Edite a OC antes de emitir a instrução de faturamento.','error');return;}
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
  let pendingBackup=null;
  function importBackup(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data||!Array.isArray(data.purchases)||!Array.isArray(data.stockLots))throw new Error('Arquivo inválido.');pendingBackup=normalizeDB(data);const issues=window.BracoffeeCommercial.audit(pendingBackup);if(issues.length)throw Error(issues.join(' '));$('#restoreBackupForm').reset();$('#restoreBackupSummary').textContent=pendingBackup.purchases.length+' compras · '+pendingBackup.stockLots.length+' lotes · '+pendingBackup.sales.length+' vendas no arquivo';$('#restoreBackupModal').showModal();}catch(e){toast('Não foi possível importar',e.message,'error');}finally{$('#backupFileInput').value='';}};r.readAsText(file);}


  function icon(name) {
    const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',plus:'M12 5v14M5 12h14',coffee:'M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2',file:'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h5',box:'m3 7 9-4 9 4v11l-9 4-9-4ZM3 7l9 4 9-4M12 11v11M7 5l9 4',wallet:'M20 8H4V5h14v3M4 8v13h17V8ZM17 12h4v5h-4a2.5 2.5 0 0 1 0-5Z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 4a4 4 0 0 1 0 7M18 15a4 4 0 0 1 4 4v2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6',calendar:'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4',logout:'M9 4H4v16h5M10 12h11M17 8l4 4-4 4',arrowLeft:'M20 12H4M10 6l-6 6 6 6',arrowRight:'M4 12h16M14 6l6 6-6 6',arrowUpRight:'M5 19 19 5M5 5h14v14',chevronDown:'m6 9 6 6 6-6',check:'m5 12 4 4L19 6',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',menu:'M4 6h16M4 12h16M4 18h16',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',activity:'M3 12h4l3-8 4 16 3-8h4'};
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"></path></svg>`;
  }
  function hydrateIcons(){
    const map={dashboard:'home',balcao:'plus',provas:'coffee',compras:'file',estoque:'box',guias:'file',financeiro:'wallet',produtores:'users',vendas:'file'};
    $$('[data-page]').forEach(b=>{const target=$('.nav-icon',b)||$('span',b);if(target)target.innerHTML=icon(map[b.dataset.page]);});
    $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
  }
  function statHTML(label,value,help,type='file',go=''){
    return `<${go?'button':'div'} class="stat-card" ${go?`data-goto="${go}"`:''}><div class="stat-top"><span class="stat-label">${esc(label)}</span><span class="stat-icon">${icon(type)}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-help">${esc(help)}${go?icon('arrowUpRight'):''}</div></${go?'button':'div'}>`;
  }
  function renderDashboard(){
    commercialTaskCount=0;
    const month=$('#dashboardMonth').value||todayISO().slice(0,7),purchases=db.purchases.filter(p=>p.date?.startsWith(month));
    const stock=physicalStockLots().reduce((s,l)=>s+Number(l.remaining||0),0),allFinance=db.finance.filter(f=>f.type==='payable'&&!f.cancelledAt);
    const amount=purchases.filter(p=>!p.pricePending).reduce((s,p)=>s+Number(p.total||0),0),bags=purchases.reduce((s,p)=>s+Number(p.bags||0),0),pending=allFinance.reduce((s,f)=>s+pendingFor(f),0);
    $('#dashboardDate').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    $('#dashboardStats').innerHTML=statHTML('Contratado no mês',money(amount),`${purchases.length} ordens de compra`,'file','compras')+statHTML('Sacas negociadas',num(bags),`Compras do mês selecionado`,'coffee','compras')+statHTML('Estoque físico',num(stock)+' sc','Café fisicamente recebido','box','estoque')+statHTML('Saldo a pagar',money(pending),'Todas as compras em aberto','wallet','financeiro');
    const recent=[...db.purchases].sort((a,b)=>(b.createdAt||b.date||'').localeCompare(a.createdAt||a.date||'')).slice(0,5);
    $('#recentPurchases').innerHTML=recent.length?recent.map(p=>`<button class="list-row" data-purchase-open="${esc(p.id)}"><span class="order-mark">${icon('file')}</span><span class="list-row-copy"><span class="oc-label">${esc(p.oc)}</span><strong>${esc(p.sellerName)}</strong><small>${num(p.bags)} sc · ${esc(p.drink)} · ${dateBR(p.date)}</small></span><span class="amount">${money(p.total)}<span>${badge(p.paymentStatus)}</span></span><span class="row-arrow">${icon('arrowUpRight')}</span></button>`).join(''):emptyHTML('Seu primeiro negócio começa aqui','Registre uma compra para acompanhar sua operação.');
    const groups=stockByDrink(),total=groups.reduce((s,g)=>s+g.total,0);
    $('#stockSummary').innerHTML=groups.length?groups.slice(0,6).map(g=>`<div class="stock-line"><div class="stock-line-top"><strong>${esc(g.drink)}</strong><span>${num(g.total)} <small>sc</small></span></div><div class="stock-bar"><i style="width:${total?g.total/total*100:0}%"></i></div></div>`).join(''):emptyHTML('Aguardando café no armazém','Receba uma OC para formar o estoque físico.');
    const base=new Date(month+'-01T12:00:00'),months=[];
    for(let i=5;i>=0;i--){const d=new Date(base);d.setMonth(d.getMonth()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');months.push({key,label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),bags:db.purchases.filter(p=>p.date?.startsWith(key)).reduce((s,p)=>s+Number(p.bags||0),0)});}
    const max=Math.max(1,...months.map(m=>m.bags));
    $('#volumeChart').innerHTML=`<div class="chart-top"><strong>${num(bags)}<span> sacas</span></strong><small>no mês selecionado</small></div><div class="chart-bars">${months.map(m=>`<div class="chart-column ${m.key===month?'current':''}"><small>${num(m.bags)}</small><div class="chart-track"><div class="chart-bar" style="height:${m.bags?Math.max(4,m.bags/max*100):2}%" title="${esc(m.label)}: ${num(m.bags)} sacas"></div></div><span>${esc(m.label)}</span></div>`).join('')}</div>`;
    const actions=[];
    db.finance.filter(f=>!f.cancelledAt&&pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).forEach(f=>actions.push({type:'wallet',title:f.type==='receivable'?'Recebimento vencido':'Pagamento vencido',detail:`${f.person} · ${money(pendingFor(f))}`,attrs:`data-finance-toggle="${esc(f.id)}"`,tone:'late'}));
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
  function renderFinance(){commercialFinance();}
  function toggleFinance(id){openPayment(id);}
  function openPayment(id){
    const f=db.finance.find(f=>f.id===id);if(!f)return;if(f.pricePending){toast('Preço a fixar','Edite a ordem e informe o preço definitivo antes de registrar o pagamento ou recebimento.','error');return;}activeFinanceId=id;
    const isReceipt=f.type==='receivable';$('#paymentModal h3').textContent=f.manual?(isReceipt?'Recebimentos do lançamento':'Pagamentos do lançamento'):isReceipt?'Recebimentos da venda':'Pagamentos da compra';$('#paymentSaveBtn').textContent=isReceipt?'Registrar recebimento':'Registrar pagamento';$('#paymentAmount').closest('label').querySelector('span').textContent=isReceipt?'Valor recebido *':'Valor pago *';$('#paymentDate').closest('label').querySelector('span').textContent=isReceipt?'Data do recebimento *':'Data do pagamento *';
    $('#paymentOc').textContent=f.oc+' · '+f.person;const remaining=pendingFor(f);
    $('#paymentSummary').innerHTML=`<div><small>${f.manual?'Total do lançamento':isReceipt?'Total da venda':'Total da compra'}</small><strong>${money(f.amount)}</strong></div><div><small>${isReceipt?'Já recebido':'Já pago'}</small><strong class="paid-value">${money(paidFor(f))}</strong></div><div><small>${isReceipt?'Saldo a receber':'Saldo a pagar'}</small><strong>${money(remaining)}</strong></div>`;
    $('#paymentAmount').value=remaining.toFixed(2);$('#paymentAmount').max=remaining.toFixed(2);$('#paymentDate').value=todayISO();$('#paymentMethod').value=f.method||'PIX';$('#paymentNotes').value='';
    $('#paymentEntryFields').hidden=remaining<=0;$('#paymentSaveBtn').hidden=remaining<=0;$$('input,select',$('#paymentEntryFields')).forEach(el=>{el.disabled=remaining<=0;});
    $('#paymentHistory').innerHTML=(f.payments||[]).length?(f.payments||[]).slice().reverse().map(p=>`<div class="payment-history-row ${p.reversedAt?'reversed':''}"><span class="history-dot"></span><div><strong>${money(p.amount)} ${p.reversedAt?'<span class="badge gray">Estornado</span>':''}</strong><small>${p.date?dateBR(p.date):'Data não registrada'} · ${esc(p.method||'Não informado')}${p.notes?' · '+esc(p.notes):''}</small></div>${p.reversedAt?'':`<button type="button" class="text-btn" data-payment-reverse="${esc(p.id)}">Estornar</button>`}</div>`).join(''):emptyHTML(isReceipt?'Nenhum recebimento registrado':'Nenhum pagamento registrado','Registre uma parcela ou quite o saldo da operação.');
    if(!$('#paymentModal').open){$('#paymentModal').showModal();$('#paymentModal').scrollTop=0;}
  }
  function savePayment(){
    const f=db.finance.find(f=>f.id===activeFinanceId);if(!f)return;
    const amount=roundMoney($('#paymentAmount').value),remaining=pendingFor(f),date=$('#paymentDate').value;
    if(!Number.isFinite(amount)||amount<=0||amount>remaining||!date){toast('Confira o pagamento',`Informe uma data e um valor entre R$ 0,01 e ${money(remaining)}.`,'error');return;}
    f.payments.push({id:uid('payment'),amount,date,method:$('#paymentMethod').value,notes:$('#paymentNotes').value.trim(),createdAt:new Date().toISOString()});reconcileFinance(f);saveDB();$('#paymentModal').close();toast(f.type==='receivable'?'Recebimento registrado':'Pagamento registrado',`${money(amount)} · saldo ${money(pendingFor(f))}`);
    if($('#purchaseDetailModal').open&&activePurchaseId===f.purchaseId)renderPurchaseDetail(f.purchaseId,false);
  }
  function reversePayment(id){
    const f=db.finance.find(f=>f.id===activeFinanceId),payment=f?.payments?.find(p=>p.id===id);if(!payment||payment.reversedAt)return;
    if(!confirm(`Estornar o pagamento de ${money(payment.amount)}? O saldo será reaberto e o histórico será preservado.`))return;
    payment.reversedAt=new Date().toISOString();reconcileFinance(f);saveDB();openPayment(f.id);toast('Lançamento estornado');
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
    $('#dashboardMonth').addEventListener('change',()=>{renderDashboard();renderCommercial();});
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
    $('#resolveSyncBtn').addEventListener('click',async()=>{try{await window.BracoffeeSync.resolveConflict();$('#syncConflictModal').close();toast('Dados atualizados','Sua cópia anterior continua disponível em Configurações.');}catch(error){toast('Não foi possível atualizar',error.message||'Confira sua conexão e tente novamente.','error');}});
    $('#syncConflictModal').addEventListener('cancel',e=>e.preventDefault());
    document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();navigate('compras');$('#purchaseSearch').focus();}});
    $('#sellerName').addEventListener('change',fillSellerFromProducer);
    $('#purchaseWeight').addEventListener('input',()=>{$('#purchaseBags').step='0.0001';$('#purchaseBags').value=window.BracoffeeCommercial.qty(Number($('#purchaseWeight').value)/60);updatePurchaseCalculations();});
    $('#stockEntryWeight').addEventListener('input',()=>{$('#stockEntryBags').step='0.0001';$('#stockEntryBags').value=window.BracoffeeCommercial.qty(Number($('#stockEntryWeight').value)/60);});
    ['#purchaseBags','#purchasePrice','#purchaseNY','#purchaseUSD'].forEach(sel=>$(sel).addEventListener('input',updatePurchaseCalculations));
    $('#purchaseTerm').addEventListener('change',updatePurchasePriceMode);$('#purchaseDeliveryType').addEventListener('change',updateDeliveryUI); $('#purchaseDestination').addEventListener('change',updateDestinationUI);
    $('#purchaseHasBroker').addEventListener('change',updateBrokerUI);
    $('#purchaseBrokerageType').addEventListener('change',()=>{$('#purchaseBrokerageValue').value='';updateBrokerUI();});
    $('#purchaseBrokerageValue').addEventListener('input',updateBrokerageCalculations);
    $('#clearPurchaseBtn').addEventListener('click',()=>{if(confirm('Limpar os dados desta compra?'))resetPurchaseForm();});
    $('#purchaseForm').addEventListener('submit',e=>{
      e.preventDefault();const data=collectPurchaseForm();
      if(!data.sellerName||!Number.isFinite(data.bags)||data.bags<=0||!Number.isFinite(data.pricePerBag)||data.pricePerBag<0||(!data.pricePending&&data.pricePerBag===0)||!data.drink||!data.date){toast('Confira os campos','Informe vendedor, quantidade positiva, preço, bebida e data.','error');return;}
      if($('#purchaseHasBroker').value==='yes'&&!data.brokerName){toast('Informe o corretor','O nome será usado no contrato e na assinatura.','error');return;}
      if(data.brokerageType!=='none'&&(!Number.isFinite(data.brokerageValue)||data.brokerageValue<=0||(data.brokerageType==='percent'&&data.brokerageValue>100))){toast('Confira a corretagem','Informe um valor positivo. O percentual pode ser de até 100%.','error');return;}
      if(data.pricePending&&data.paymentStatus==='paid'){toast('Fixe o preço antes de confirmar o pagamento','','error');return;}
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
    const labels={loading:'Carregando',saved:'Tudo salvo',saving:'Salvando',offline:'Sem conexão',conflict:'Revisar atualização',blocked:'Revisar dados'};
    $('#syncStatus').dataset.state=status;$('#syncStatus span').textContent=labels[status]||status;
    const banner=$('#connectionBanner');banner.hidden=!['offline','conflict','blocked'].includes(status);
    banner.textContent=status==='blocked'?'Uma alteração não passou na validação. Exporte a cópia deste aparelho e confira os dados antes de continuar.':status==='offline'?'Sem conexão. Consulte os dados salvos e reconecte para registrar alterações.':'Os dados foram atualizados em outro aparelho. Confira a atualização para continuar.';
  }
  function downloadRescuedCopy(){const data=window.BracoffeeSync.rescued;if(!data)return;downloadJSON(data,'bracoffee-copia-preservada-'+todayISO()+'.json');}
  function downloadJSON(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function normalizeDB(data){return migrateDB({...defaultDB(),...data,schemaVersion:data.schemaVersion||1,settings:{...defaultDB().settings,...(data.settings||{})}}).data;}
  let activeLotId='';
  function installWarehouseUI(){
    document.body.insertAdjacentHTML('beforeend',commercialDialog('restoreBackupModal','Restaurar backup',`<div class="commercial-body"><p class="lot-highlight" id="restoreBackupSummary"></p><p class="field-help">A restauração substitui a base inteira, inclusive lotes e guias. Exporte os dados atuais antes de continuar. Informe a senha de acesso para autorizar.</p>${inputField('restoreBackupPassword','Senha de acesso *','password','required autocomplete="current-password"')}</div>`,'<button type="button" class="ghost-btn" data-close-dialog="restoreBackupModal">Cancelar</button><button class="primary-btn" id="restoreBackupConfirm">Restaurar backup</button>','restoreBackupForm'));
    $('#restoreBackupForm').onsubmit=async e=>{e.preventDefault();if(!pendingBackup)return;$('#restoreBackupConfirm').disabled=true;try{await window.BracoffeeSync.commitDeletion(pendingBackup,$('#restoreBackupPassword').value,true);pendingBackup=null;$$('dialog').forEach(d=>d.close());resetPurchaseForm();toast('Backup restaurado','Dados salvos no servidor.');}catch(error){toast('Não foi possível restaurar',error.message,'error');}finally{$('#restoreBackupPassword').value='';$('#restoreBackupConfirm').disabled=false;}};

    $('.nav-item[data-page=estoque]').insertAdjacentHTML('afterend','<button class="nav-item" data-page="guias"><span class="nav-icon"></span><span>Guias de armazém</span></button>');
    $('.more-menu').insertAdjacentHTML('beforeend','<button data-goto="guias"><span data-icon="file"></span>Guias de armazém</button>');
    $('#page-estoque .section-intro').insertAdjacentHTML('beforeend','<button class="ghost-btn" data-goto="guias">Guias de armazém</button>');
    $('main.main').insertAdjacentHTML('beforeend',`<section class="page" id="page-guias"><div class="section-intro row-mobile-stack"><div><p class="eyebrow">INSTRUÇÕES AO ARMAZÉM</p><h2>Guias de armazém</h2><p>Gere a guia a partir de um lote do estoque e imprima ou salve em PDF.</p></div><button class="primary-btn" id="newWarehouseGuide">+ Nova guia</button></div><div class="lot-highlight">A guia orienta o armazém. A saída física deve ser confirmada na entrega da venda; emitir uma guia não altera o saldo.</div><div class="toolbar commercial-gap"><div class="search-box"><input id="guideSearch" placeholder="Buscar guia, lote, NF ou armazém"></div></div><div class="cards-list" id="warehouseGuides"></div></section>`);
    document.body.insertAdjacentHTML('beforeend',commercialDialog('lotDetailModal','Detalhes do lote','<div class="commercial-body" id="lotDetailBody"></div>','<button class="ghost-btn" id="lotEditBtn">Editar lote</button><button class="primary-btn" id="lotGuideBtn">Emitir guia</button><button class="ghost-btn" id="lotDeleteBtn">Excluir com senha</button><button class="ghost-btn" data-close-dialog="lotDetailModal">Fechar</button>'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('lotEditModal','Editar lote',`<div class="commercial-body"><p class="field-help">O peso recalcula as sacas. Entregas e reservas já registradas são preservadas.</p><div class="form-grid cols-2">${inputField('lotEditWeight','Peso líquido total de entrada (kg) *','number','required min="0.01" step="0.01"')+inputField('lotEditBags','Sacas calculadas','number','readonly step="0.0001"')+inputField('lotEditRef','Número do lote *','text','required')+inputField('lotEditNF','Número da nota fiscal')+inputField('lotEditQuality','Qualidade *','text','required')+inputField('lotEditWarehouse','Armazém / local *','text','required')+inputField('lotEditDate','Data de entrada *','date','required')+inputField('lotEditNotes','Observações')}</div></div>`,'<button type="button" class="ghost-btn" data-close-dialog="lotEditModal">Cancelar</button><button class="primary-btn">Salvar lote</button>','lotEditForm'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('lotDeleteModal','Excluir lote com senha',`<div class="commercial-body"><p class="lot-highlight" id="lotDeleteSummary"></p><p class="field-help">Informe a senha de acesso ao sistema. Só é possível excluir uma entrada sem saídas e sem reservas; o registro permanece no histórico.</p><div class="form-grid">${inputField('lotDeleteReason','Motivo da exclusão *','text','required')+inputField('lotDeletePassword','Senha de acesso *','password','required autocomplete="current-password"')}</div></div>`,'<button type="button" class="ghost-btn" data-close-dialog="lotDeleteModal">Cancelar</button><button class="primary-btn" id="confirmLotDelete">Excluir lote</button>','lotDeleteForm'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('warehouseGuideModal','Emitir guia para o armazém',`<div class="commercial-body"><div class="form-grid cols-2">${selectField('guideLot','Lote do estoque *','')+selectField('guideKind','Finalidade',option('retirada','Retirada')+option('transferencia','Transferência')+option('deposito','Orientação de depósito'))}</div><div id="guideLotSummary" class="lot-highlight span-2"></div><div class="form-grid cols-2">${inputField('guideWeight','Peso líquido autorizado (kg) *','number','required min="0.01" step="0.01"')+inputField('guideBags','Sacas calculadas','number','readonly step="0.0001"')+inputField('guideDate','Data da guia *','date','required')+inputField('guideWarehouse','Armazém destinatário *','text','required')+inputField('guideRecipient','Retirar / receber em nome de *','text','required')+inputField('guideRecipientDoc','CPF / CNPJ do destinatário')+inputField('guideDestination','Destino do café')+inputField('guideSaleRef','Referência da OV / autorização')+inputField('guideCarrier','Transportador')+inputField('guidePlate','Placa do veículo')+inputField('guideDriver','Motorista / contato')+inputField('guideNotes','Instruções ao armazém')}</div><p class="field-help">Confira as autorizações já emitidas para evitar instruções duplicadas. A guia não reserva nem baixa estoque.</p></div>`,'<button type="button" class="ghost-btn" data-close-dialog="warehouseGuideModal">Cancelar</button><button class="primary-btn">Emitir e abrir PDF</button>','warehouseGuideForm'));
    $('#lotEditBtn').onclick=()=>{const l=db.stockLots.find(l=>l.id===activeLotId);Object.entries({lotEditWeight:l.weight||C.money(l.bags*60),lotEditBags:l.bags,lotEditRef:l.lotRef,lotEditNF:l.nf,lotEditQuality:l.quality||l.drink,lotEditWarehouse:l.warehouse,lotEditDate:l.date,lotEditNotes:l.notes}).forEach(([id,value])=>$('#'+id).value=value??'');$('#lotEditModal').showModal();};
    $('#lotEditWeight').oninput=()=>$('#lotEditBags').value=C.qty(Number($('#lotEditWeight').value)/60);
    $('#lotEditForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{const l=db.stockLots.find(l=>l.id===activeLotId);if(!isPhysicalStockLot(l))throw Error('Lote indisponível.');const weight=C.money($('#lotEditWeight').value),bags=C.qty(weight/60),used=C.qty(l.bags-l.remaining),reserved=C.lotReserved(db,l.id);if(!Number.isFinite(weight)||weight<=0||bags+0.000001<used+reserved)throw Error('O peso não pode ficar abaixo das saídas e reservas do lote.');const purchase=db.purchases.find(p=>p.id===l.purchaseId);if(purchase&&bags+receivedForPurchase(purchase.id)-l.bags+C.externalDelivered(db,purchase.id)>Number(purchase.bags)+0.000001)throw Error('A entrada ultrapassa a quantidade comprada na OC.');const before={...l},warehouse=$('#lotEditWarehouse').value.trim(),now=new Date().toISOString();Object.assign(l,{weight,bags,remaining:C.qty(bags-used),lotRef:$('#lotEditRef').value.trim(),nf:$('#lotEditNF').value.trim(),quality:$('#lotEditQuality').value.trim(),warehouse,date:$('#lotEditDate').value,notes:$('#lotEditNotes').value.trim(),updatedAt:now});if(warehouse!==before.warehouse)db.stockMovements.push({id:uid('movement'),lotId:l.id,kind:'transfer',bags:l.remaining,date:todayISO(),from:before.warehouse||'Não informado',to:warehouse,createdAt:now});l.edits=l.edits||[];l.edits.push({at:now,before:{weight:before.weight,bags:before.bags,lotRef:before.lotRef,nf:before.nf,quality:before.quality||before.drink,warehouse:before.warehouse,date:before.date,notes:before.notes}});saveDB();$('#lotEditModal').close();openLotDetail(l.id,false);toast('Lote atualizado','Histórico, reservas e entregas preservados.');});};
    $('#lotDeleteBtn').onclick=()=>{const l=db.stockLots.find(l=>l.id===activeLotId);$('#lotDeleteForm').reset();$('#lotDeleteSummary').textContent='Lote '+(l.lotRef||l.oc)+' · '+num(l.remaining)+' sc';$('#lotDeleteModal').showModal();};
    $('#lotDeleteForm').onsubmit=async e=>{e.preventDefault();const button=$('#confirmLotDelete');button.disabled=true;try{await window.BracoffeeSync.whenIdle();const next=JSON.parse(JSON.stringify(db)),now=new Date().toISOString();C.reverseEntry(next,activeLotId,$('#lotDeleteReason').value.trim(),now);const l=next.stockLots.find(l=>l.id===activeLotId);l.deletedAt=now;await window.BracoffeeSync.commitDeletion(next,$('#lotDeletePassword').value);$('#lotDeleteModal').close();$('#lotDetailModal').close();toast('Lote excluído','Registro preservado no histórico.');}catch(error){toast('Não foi possível excluir',error.message,'error');}finally{$('#lotDeletePassword').value='';button.disabled=false;}};
    $('#lotGuideBtn').onclick=()=>openWarehouseGuide(activeLotId);$('#newWarehouseGuide').onclick=()=>openWarehouseGuide();$('#guideSearch').oninput=renderWarehouseGuides;
    $('#guideLot').onchange=updateGuideLot;$('#guideWeight').oninput=()=>$('#guideBags').value=C.qty(Number($('#guideWeight').value)/60);
    $('#warehouseGuideForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{const l=db.stockLots.find(l=>l.id===$('#guideLot').value),weight=C.money($('#guideWeight').value),bags=C.qty(weight/60);if(!isPhysicalStockLot(l)||!Number.isFinite(weight)||weight<=0||bags>l.remaining+0.000001)throw Error('Informe um peso dentro do saldo físico do lote.');const year=$('#guideDate').value.slice(0,4),sequence=(db.stockGuides||[]).filter(g=>g.date.startsWith(year)).reduce((v,g)=>Math.max(v,Number(g.sequence)||0),0)+1;const guide={id:uid('guide'),code:'GUIA-'+year+'-'+String(sequence).padStart(6,'0'),sequence,lotId:l.id,lotSnapshot:JSON.parse(JSON.stringify(l)),company:{...companyData()},weight,bags,date:$('#guideDate').value,kind:$('#guideKind').value,warehouse:$('#guideWarehouse').value.trim(),recipient:$('#guideRecipient').value.trim(),recipientDoc:$('#guideRecipientDoc').value.trim(),destination:$('#guideDestination').value.trim(),saleRef:$('#guideSaleRef').value.trim(),carrier:$('#guideCarrier').value.trim(),plate:$('#guidePlate').value.trim(),driver:$('#guideDriver').value.trim(),notes:$('#guideNotes').value.trim(),createdAt:new Date().toISOString()};const w=openDocumentWindow();if(!w)return;db.stockGuides.push(guide);saveDB();$('#warehouseGuideModal').close();printWarehouseGuide(guide,w);toast('Guia emitida','Saldo físico mantido.');});};
    document.addEventListener('click',e=>{const view=e.target.closest('[data-lot-view]');if(view)openLotDetail(view.dataset.lotView);const issue=e.target.closest('[data-lot-guide]');if(issue)openWarehouseGuide(issue.dataset.lotGuide);const reprint=e.target.closest('[data-guide-print]');if(reprint){const g=db.stockGuides.find(g=>g.id===reprint.dataset.guidePrint);const w=openDocumentWindow();if(w)printWarehouseGuide(g,w);}const cancel=e.target.closest('[data-guide-cancel]');if(cancel)commercialTry(()=>{const g=db.stockGuides.find(g=>g.id===cancel.dataset.guideCancel),reason=prompt('Motivo do cancelamento da guia:');if(reason?.trim()){g.cancelledAt=new Date().toISOString();g.cancelReason=reason.trim();saveDB();toast('Guia cancelada','Avise o armazém sobre o cancelamento.');}});});
    $('#openingBags').closest('label').insertAdjacentHTML('beforebegin',inputField('openingWeight','Peso líquido inicial (kg) *','number','required min="0.01" step="0.01"'));
    $('#openingBags').readOnly=true;$('#openingBags').step='0.0001';$('#openingWeight').oninput=()=>$('#openingBags').value=C.qty(Number($('#openingWeight').value)/60);
    $('#openingNotes').closest('label').insertAdjacentHTML('beforebegin',inputField('openingNF','Número da nota fiscal')+inputField('openingQuality','Qualidade *','text','required'));
  }
  function detailItem(label,value){return `<div class="detail-box"><label>${esc(label)}</label><strong>${esc(value)}</strong></div>`;}
  function openLotDetail(id,show=true){const l=db.stockLots.find(l=>l.id===id);if(!l)return;activeLotId=id;$('#lotDetailBody').innerHTML=`<div class="lot-highlight"><strong>Lote ${esc(l.lotRef||l.oc)}</strong><br>${esc(l.quality||l.drink)}</div><div class="detail-grid commercial-gap">${detailItem('OC / origem',l.oc)+detailItem('Nota fiscal',l.nf||'Não informada')+detailItem('Peso de entrada',num(l.weight||l.bags*60)+' kg')+detailItem('Sacas de entrada',num(l.bags)+' sc')+detailItem('Saldo físico',num(l.remaining)+' sc · '+num(C.money(l.remaining*60))+' kg')+detailItem('Reservado',num(C.lotReserved(db,l.id))+' sc')+detailItem('Armazém',l.warehouse||'Não informado')+detailItem('Data de entrada',dateBR(l.date))+detailItem('Fornecedor',l.sellerName||'Estoque inicial')+detailItem('Observações',l.notes||'—')}</div><p class="field-help">${l.edits?.length||0} edição(ões) registrada(s). As guias emitidas mantêm os dados da emissão.</p>`;window.BracoffeeWorkspaceUI?.decorateLot(id);if(show)$('#lotDetailModal').showModal();}
  function openWarehouseGuide(lotId=''){const lots=physicalStockLots().filter(l=>l.remaining>0);if(lotId&&!lots.some(l=>l.id===lotId)){toast('Lote sem saldo disponível','Selecione um lote com saldo físico para emitir a guia.','error');return;}if(!lots.length){toast('Não há lote com saldo','Receba uma OC ou cadastre o estoque inicial.','error');return;}$('#warehouseGuideForm').reset();$('#guideLot').innerHTML=lots.map(l=>option(l.id,'Lote '+(l.lotRef||l.oc)+' · '+(l.quality||l.drink)+' · '+num(l.remaining)+' sc')).join('');if(lotId&&lots.some(l=>l.id===lotId))$('#guideLot').value=lotId;$('#guideDate').value=todayISO();updateGuideLot();$('#warehouseGuideModal').showModal();}
  function updateGuideLot(){const l=db.stockLots.find(l=>l.id===$('#guideLot').value);if(!l)return;$('#guideWeight').value=C.money(l.remaining*60);$('#guideWeight').max=C.money(l.remaining*60);$('#guideBags').value=l.remaining;$('#guideWarehouse').value=l.warehouse||'';$('#guideLotSummary').innerHTML=`<strong>Lote ${esc(l.lotRef||l.oc)} · ${esc(l.quality||l.drink)}</strong><br>${esc(l.oc)} · NF ${esc(l.nf||'não informada')} · físico ${num(l.remaining)} sc · reservado ${num(C.lotReserved(db,l.id))} sc`;}
  function renderWarehouseGuides(){if(!$('#warehouseGuides'))return;const q=normalize($('#guideSearch').value);const rows=(db.stockGuides||[]).slice().reverse().filter(g=>!q||normalize([g.code,g.lotSnapshot?.lotRef,g.lotSnapshot?.nf,g.warehouse,g.recipient,g.saleRef].join(' ')).includes(q));$('#warehouseGuides').innerHTML=rows.slice(0,commercialLimits.guides).map(g=>`<div class="data-card"><div class="main-info"><strong>${esc(g.code)} · Lote ${esc(g.lotSnapshot?.lotRef||g.lotSnapshot?.oc)}</strong><small>${dateBR(g.date)} · ${esc(g.warehouse)} · ${esc(g.recipient)}</small>${g.cancelledAt?`<span class="badge red">Cancelada</span><small>${esc(g.cancelReason)}</small>`:''}</div><div class="data-meta"><label>Peso / sacas</label><strong>${num(g.weight)} kg · ${num(g.bags)} sc</strong></div><div class="card-actions"><button class="mini-btn" data-guide-print="${esc(g.id)}">Reimprimir guia</button>${g.cancelledAt?'':`<button class="mini-btn" data-guide-cancel="${esc(g.id)}">Cancelar guia</button>`}</div></div>`).join('')||emptyHTML('Nenhuma guia emitida','Escolha um lote do estoque para gerar a instrução ao armazém.');addMoreControl($('#warehouseGuides'),rows.length,'guides');}
  function printWarehouseGuide(g,w){const l=g.lotSnapshot,b=g.company;writeDocument(w,g.code+' - Guia de armazém',documentHeader(g.code,g.date,b,'GUIA DE ARMAZÉM')+`<h2 class="title">GUIA DE ${esc(({retirada:'RETIRADA',transferencia:'TRANSFERÊNCIA',deposito:'ORIENTAÇÃO DE DEPÓSITO'})[g.kind]||'ARMAZÉM')}</h2>${g.cancelledAt?'<h2 class="title">CANCELADA · '+esc(g.cancelReason)+'</h2>':''}`+printSection('Empresa emitente',printBox('Nome / documento',[b.name,b.doc].filter(Boolean).join(' · '))+printBox('Contato',[b.phone,b.email].filter(Boolean).join(' · ')))+printSection('Instrução ao armazém',printBox('Armazém destinatário',g.warehouse)+printBox('Em nome de / documento',[g.recipient,g.recipientDoc].filter(Boolean).join(' · '))+printBox('Destino',g.destination||'Conforme instrução')+printBox('OV / referência',g.saleRef||'Não informada'))+printSection('Identificação do café',printBox('Número do lote',l.lotRef||l.oc)+printBox('Número da nota fiscal',l.nf||'Não informado')+printBox('Qualidade',l.quality||l.drink)+printBox('OC / origem',l.oc)+printBox('Peso líquido autorizado',num(g.weight)+' kg')+printBox('Quantidade equivalente',num(g.bags)+' sacas de 60 kg'))+printSection('Transporte',printBox('Transportador',g.carrier||'A informar')+printBox('Placa / motorista',[g.plate,g.driver].filter(Boolean).join(' · ')||'A informar'))+`<div class="terms"><strong>Instruções</strong><p>${esc(g.notes||'Conferir lote, qualidade e peso antes da movimentação. Comunicar divergências à empresa emitente.')}</p></div><div class="signs"><div class="sign">${esc(b.name)}<br>Autorização da empresa</div><div class="sign">${esc(g.warehouse)}<br>Conferência do armazém</div></div><div class="foot">${esc(g.code)} · Documento de instrução comercial. Não substitui documento fiscal. Emissão não confirma saída física.</div>`,'invoice');}

  async function init(){
    installCommercialUI();
    installWarehouseUI();
    hydrateIcons();
    $('#purchaseDate').value=todayISO();
    $('#dashboardMonth').value=todayISO().slice(0,7);$('#financeMonth').value=todayISO().slice(0,7);
    const local=db;
    const incoming=await window.BracoffeeSync.connect(local,{
      onStatus:showSyncStatus,
      onConflict:()=>{window.BracoffeeWorkspaceUI?.describeSyncConflict();if(!$('#syncConflictModal').open)$('#syncConflictModal').showModal();},
      onError:message=>toast('Alteração não salva',message,'error'),
      onRescue:()=>{$('#rescueBackupPanel').hidden=false;},
      isEditing:()=>Boolean($('dialog[open]')||$('#page-balcao').classList.contains('active')),
      onRemote:(data,force)=>{db=normalizeDB(data);if(force){$$('dialog').forEach(d=>d.close());resetPurchaseForm();}renderAll();}
    });
    const sourceVersion=Number(incoming.schemaVersion||1);
    db=normalizeDB(incoming);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch{}
    if(window.BracoffeeSync.canWrite&&sourceVersion<4)window.BracoffeeSync.queue(db);
    updateDeliveryUI(); updateDestinationUI(); updateBrokerUI();
    bindEvents();
    renderAll();
    $('#appLoading').hidden=true;$('#rescueBackupPanel').hidden=!window.BracoffeeSync.rescued;
    if(window.BracoffeeSync.status==='conflict'&&!$('#syncConflictModal').open){window.BracoffeeWorkspaceUI?.describeSyncConflict();$('#syncConflictModal').showModal();}
    const guard=e=>{const target=e.target;const mutation=(e.type==='submit'&&target.id!=='restoreBackupForm')||(e.type==='click'&&target.closest('[data-sample-delete],[data-producer-delete],[data-location-delete],[data-payment-reverse],#detailDeleteBtn,#saleCancelBtn,#cancelManualFinanceBtn,#purchaseReceiveV3,[data-entry-reverse],[data-delivery-reverse],[data-lot-move],[data-guide-cancel]'));if(mutation&&!window.BracoffeeSync.canWrite){e.preventDefault();e.stopImmediatePropagation();toast('Aguarde para registrar alterações',window.BracoffeeSync.status==='conflict'?'Carregue a versão atual dos dados.':'Confira a conexão e tente novamente.','error');}};
    ['submit','click','change'].forEach(type=>document.addEventListener(type,guard,true));
    window.dispatchEvent(new Event('bracoffee:ready'));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(()=>{});
    }
  }

  const C=window.BracoffeeCommercial;
  let commercialPlan={};
  let commercialTaskCount=0;
  const commercialLimits={sales:80,finance:80,stock:80,purchases:80,guides:80};
  let activeSaleId=null;
  const commercialTry=fn=>{try{return fn();}catch(e){toast('Confira a operação',e.message,'error');return null;}};
  const inputField=(id,label,type='text',extra='')=>`<label class="field"><span>${label}</span><input id="${id}" type="${type}" ${extra}></label>`;
  const selectField=(id,label,options)=>`<label class="field"><span>${label}</span><select id="${id}">${options}</select></label>`;
  const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
  const saleSource=s=>({stock:'Do estoque físico',direct:'Direta · origem na OC',future:'Entrega futura · origem na OC'}[s]||'—');
  const saleFinance=s=>db.finance.find(f=>f.saleId===s.id);
  function commercialDialog(id,title,body,buttons,form=''){
    return `<dialog class="modal wide commercial-modal" id="${id}">${form?`<form id="${form}">`:''}<div class="modal-head"><div><p class="eyebrow">BRACOFFEE · OPERAÇÃO COMERCIAL</p><h3>${title}</h3></div><button type="button" class="icon-btn" data-close-dialog="${id}" aria-label="Fechar">×</button></div>${body}<div class="modal-actions wrap">${buttons}</div>${form?'</form>':''}</dialog>`;
  }
  function installCommercialUI(){
    $('.nav-item[data-page=compras]').insertAdjacentHTML('afterend','<button class="nav-item" data-page="vendas"><span class="nav-icon"></span><span>Ordens de venda</span></button>');
    $('.more-menu').insertAdjacentHTML('afterbegin','<button data-goto="vendas"><span data-icon="file"></span>Ordens de venda</button>');
    $('.mobile-nav-item[data-page=provas]').dataset.page='vendas';$('.mobile-nav-item[data-page=vendas] small').textContent='Vendas';
    $('.more-menu').insertAdjacentHTML('beforeend','<button data-goto="provas"><span data-icon="coffee"></span>Provas de café</button>');
    $('main.main').insertAdjacentHTML('beforeend',`<section class="page" id="page-vendas"><div class="section-intro row-mobile-stack"><div><p class="eyebrow">NEGOCIAR, ENTREGAR E RECEBER</p><h2>Vendas</h2><p>Estoque reservado ao negociar. Saída física somente ao confirmar a entrega.</p></div><div class="inline-actions"><button class="ghost-btn" id="customersBtn">Clientes</button><button class="primary-btn" id="newSaleOrderBtn">+ Nova venda</button></div></div><div class="stats-grid" id="salesStats"></div><div class="toolbar"><div class="search-box"><input id="salesSearch" placeholder="Buscar OV, cliente, corretor ou bebida"></div><select id="salesFilter">${option('all','Todas as vendas')+option('delivery','A entregar')+option('pending','A receber')+option('done','Concluídas')+option('review','Histórico a conferir')+option('cancelled','Canceladas')}</select><label class="filter-month"><input type="month" id="salesMonth" aria-label="Mês das vendas"></label><button class="ghost-btn" id="salesClearMonth">Todo o histórico</button></div><div id="salesList" class="cards-list"></div></section>`);
    $('#purchasesMobile').insertAdjacentHTML('afterend','<div id="purchasePageControls"></div>');
    $('#financeFilter').insertAdjacentHTML('beforebegin',`<select id="financeType" aria-label="Tipo de conta">${option('all','Pagar e receber')+option('payable','Contas a pagar')+option('receivable','Contas a receber')}</select>`);
    $('#page-financeiro .section-intro p:last-child').textContent='Compras a pagar e vendas a receber, com parcelas e estornos no mesmo histórico.';
    $('#page-financeiro .section-intro').insertAdjacentHTML('beforeend','<button class="ghost-btn" id="reportBtn">Relatório do mês</button>');
    $('#page-estoque .section-intro').insertAdjacentHTML('beforeend','<button class="ghost-btn" id="openingStockBtn">+ Estoque inicial</button>');
    $('#stockSearch').parentElement.insertAdjacentHTML('afterend','<label class="stock-closed"><input type="checkbox" id="stockIncludeClosed"> Mostrar lotes encerrados</label>');
    $('#page-estoque').insertAdjacentHTML('beforeend','<article class="panel stock-panel-gap"><div class="panel-head"><div><p class="eyebrow">RASTREABILIDADE</p><h3>Histórico de movimentações</h3></div><button class="text-btn" id="exportStockBtn">Exportar CSV</button></div><div id="stockHistory" class="list-stack"></div></article>');
    $('#purchaseDetailModal .modal-actions').insertAdjacentHTML('afterbegin','<button class="ghost-btn" id="purchaseReceiveV3">Receber café</button><button class="ghost-btn" id="purchaseNFBtn">Registrar NF</button>');
    $('#settingsForm .form-grid').insertAdjacentHTML('beforeend',inputField('settingOvPrefix','Prefixo da ordem de venda','text','maxlength="8"')+'<label class="field span-2"><span>Condições padrão do contrato de venda</span><textarea id="settingSaleTerms" rows="5"></textarea></label>');
    $('#purchasePaymentStatus').insertAdjacentHTML('beforeend','<option value="fixing" disabled>A fixar</option>');
    Object.assign(settingFields,{settingOvPrefix:'ovPrefix',settingSaleTerms:'saleContractTerms'});
    $('#stockEntryNotes').closest('label').insertAdjacentHTML('beforebegin',inputField('stockEntryNF','Número / referência da NF')+inputField('stockEntryLotRef','Número do lote *','text','required')+inputField('stockEntryQuality','Qualidade do café *','text','required placeholder="Bebida, tipo, peneira…"'));
    $('#sampleNotes').closest('label').insertAdjacentHTML('beforebegin','<details class="form-disclosure span-2"><summary>Identificação e classificação da amostra</summary><div class="form-grid cols-2">'+inputField('sampleSpecies','Espécie')+inputField('sampleCrop','Safra')+inputField('sampleScreen','Peneira')+inputField('sampleRef','Referência da amostra')+'</div></details>');
    $('#purchaseClass').closest('label').insertAdjacentHTML('afterend',inputField('purchaseSpecies','Espécie','text','placeholder="Arábica / Conilon"')+inputField('purchaseCrop','Safra','text','placeholder="Ex.: 2026/2027"')+inputField('purchaseScreen','Peneira','text','placeholder="Conforme a prova"')+inputField('purchaseSampleRef','Referência da amostra'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('saleOrderModal','Nova ordem de venda',`<input id="saleOrderId" type="hidden"><div class="commercial-body"><div class="form-grid cols-2">${inputField('ovBuyer','Comprador *','text','required list="customerList" autocomplete="off"')+inputField('ovDate','Data da venda *','date','required')}<datalist id="customerList"></datalist></div><details class="form-disclosure"><summary>Dados do comprador para contrato e faturamento</summary><div class="form-grid cols-2">${inputField('ovBuyerDoc','CPF / CNPJ')+inputField('ovBuyerIE','Inscrição estadual')+inputField('ovBuyerPhone','Telefone')+inputField('ovBuyerCity','Cidade / UF')+inputField('ovBuyerAddress','Endereço')+inputField('ovBuyerEmail','E-mail','email')}</div></details><div class="form-grid cols-2 commercial-gap">${selectField('ovSource','Origem do café *',option('stock','Do estoque físico')+option('direct','Venda direta, sem estoque')+option('future','Entrega futura, sem estoque'))+selectField('ovPurchase','OC de origem',option('','Selecione a OC'))}</div><div id="ovAllocations"></div><button type="button" class="text-btn" id="ovAddLot">+ Acrescentar outro lote</button><p class="field-help" id="ovAvailability"></p><div class="form-grid cols-2 commercial-gap">${inputField('ovBags','Sacas *','number','required min="0.01" step="0.01"')+inputField('ovWeight','Peso líquido (kg)','number','min="0.01" step="0.01"')+inputField('ovPrice','Preço por saca *','number','required min="0.01" step="0.01"')+inputField('ovDrink','Bebida *','text','required list="drinkList"')+selectField('ovTerm','Condição',option('cash','À vista')+option('term','A prazo')+option('fix','A fixar'))+inputField('ovDue','Vencimento','date')+selectField('ovInitialStatus','Recebimento inicial',option('pending','A receber')+option('paid','Recebido integralmente'))+selectField('ovMethod','Forma de recebimento',['PIX','Transferência','Dinheiro','Cheque','Boleto','Outro'].map(v=>option(v,v)).join(''))+inputField('ovExpectedDelivery','Previsão de entrega','date')+inputField('ovLocation','Local de entrega / retirada')}</div><details class="form-disclosure"><summary>Qualidade, corretor e condições do contrato</summary><div class="form-grid cols-2">${inputField('ovClass','Classificação / peneira / safra')+inputField('ovBroker','Corretor (opcional)')+inputField('ovBrokerDoc','CPF / CNPJ do corretor')+selectField('ovBrokerageType','Corretagem',option('none','Sem corretagem')+option('percent','Percentual do café')+option('fixed','Valor fixo em reais'))+inputField('ovBrokerageValue','Percentual (%) ou valor fixo (R$)','number','min="0" step="0.0001"')+selectField('ovBrokeragePayer','Responsável pela corretagem',option('unspecified','A combinar')+option('buyer','Comprador')+option('seller','Vendedor'))}<label class="field span-2"><span>Condições da negociação e entrega</span><textarea id="ovNotes" rows="3"></textarea></label><label class="field span-2"><span>Condições do contrato de venda</span><textarea id="ovTerms" rows="5"></textarea></label></div></details><div class="lot-highlight" id="ovTotal">Total do café: R$ 0,00</div></div>`,`<button type="button" class="ghost-btn" data-close-dialog="saleOrderModal">Cancelar</button><button class="primary-btn" id="ovSave">Salvar ordem de venda</button>`,'saleOrderForm'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('saleDetailModal','Ordem de venda','<div id="saleDetailBody" class="commercial-body"></div>',`<button class="ghost-btn" id="saleEditBtn">Editar</button><button class="ghost-btn" id="saleDispatchBtn">Registrar entrega</button><button class="ghost-btn" id="saleReceiveBtn">Recebimentos</button><button class="ghost-btn" id="saleOrderPrintBtn">Imprimir OV</button><button class="primary-btn" id="saleContractBtn">Emitir contrato</button><button class="ghost-btn" id="saleContractReprintBtn">Reimprimir contrato</button><button class="ghost-btn" id="saleCancelBtn">Cancelar venda</button>`));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('dispatchModal','Confirmar entrega do café',`<div class="commercial-body"><p class="lot-highlight" id="dispatchSummary"></p><div class="form-grid cols-2">${inputField('dispatchBags','Sacas entregues *','number','required min="0.01" step="0.01"')+inputField('dispatchDate','Data da entrega *','date','required')+inputField('dispatchNF','Número da nota fiscal')+inputField('dispatchCarrier','Transportador')+inputField('dispatchPlate','Placa do veículo')+inputField('dispatchNotes','Observações')}</div></div>`,`<button type="button" class="ghost-btn" data-close-dialog="dispatchModal">Cancelar</button><button class="primary-btn">Confirmar entrega</button>`,'dispatchForm'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('openingStockModal','Estoque físico já existente',`<div class="commercial-body"><p class="field-help">Use para o café já presente no armazém antes de começar a usar o sistema. Não cria compra nem conta a pagar.</p><div class="form-grid cols-2">${inputField('openingBags','Sacas *','number','required min="0.01" step="0.01"')+inputField('openingDrink','Bebida *','text','required list="drinkList"')+inputField('openingDate','Data *','date','required')+inputField('openingWarehouse','Armazém / local *','text','required')+inputField('openingRef','Lote / documento de origem *','text','required')+inputField('openingNotes','Observação')}</div></div>`,`<button type="button" class="ghost-btn" data-close-dialog="openingStockModal">Cancelar</button><button class="primary-btn">Registrar saldo inicial</button>`,'openingStockForm'));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('customersModal','Clientes e histórico','<div class="commercial-body"><div class="search-box"><input id="customerSearch" placeholder="Buscar cliente, documento ou cidade"></div><div id="customersBody" class="cards-list commercial-gap"></div></div>',`<button class="ghost-btn" data-close-dialog="customersModal">Fechar</button>`));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('customerProfileModal','Ficha do cliente','<div class="commercial-body" id="customerProfileBody"></div>',`<button class="ghost-btn" data-close-dialog="customerProfileModal">Fechar</button>`));
    document.body.insertAdjacentHTML('beforeend',commercialDialog('purchaseNFModal','Documento fiscal recebido',`<div class="commercial-body"><div class="form-grid cols-2">${inputField('purchaseNFNumber','Número / série da NF *','text','required')+inputField('purchaseNFDate','Data da NF *','date','required')+inputField('purchaseNFKey','Chave de acesso (opcional)','text','maxlength="44"')+inputField('purchaseNFNotes','Observação')}</div></div>`,`<button type="button" class="ghost-btn" data-close-dialog="purchaseNFModal">Cancelar</button><button class="primary-btn">Salvar referência da NF</button>`,'purchaseNFForm'));
    $('#newSaleOrderBtn').onclick=()=>openCommercialSale();$('#customersBtn').onclick=()=>{$('#customersModal').showModal();renderCustomers();};
    ['salesSearch','salesFilter','salesMonth'].forEach(id=>$('#'+id).addEventListener(id==='salesSearch'?'input':'change',renderCommercial));$('#salesClearMonth').onclick=()=>{$('#salesMonth').value='';renderCommercial();};
    $('#reportBtn').insertAdjacentHTML('beforebegin','<button class="primary-btn" id="newFinanceAccountBtn">+ Lançamento</button>');
    document.body.insertAdjacentHTML('beforeend',commercialDialog('manualFinanceModal','Lançamento financeiro',`<input id="manualFinanceId" type="hidden"><div class="commercial-body"><p class="field-help">Use para corretagem, frete, armazenagem e outras contas avulsas. Para quitar uma OC ou OV, registre o pagamento ou recebimento na própria ordem.</p><div class="form-grid cols-2">${selectField('manualFinanceType','Tipo',option('payable','Conta a pagar')+option('receivable','Conta a receber'))+selectField('manualFinanceCategory','Categoria',['Corretagem','Frete','Armazenagem','Despesa operacional','Receita avulsa','Outro'].map(v=>option(v,v)).join(''))+inputField('manualFinancePerson','Pessoa / empresa *','text','required')+inputField('manualFinanceAmount','Valor total *','number','required min="0.01" step="0.01"')+inputField('manualFinanceDate','Data do lançamento *','date','required')+inputField('manualFinanceDue','Vencimento','date')+inputField('manualFinanceRef','Referência / OC / OV')+inputField('manualFinanceNotes','Descrição / observação')}</div></div>`,`<button type="button" class="ghost-btn" data-close-dialog="manualFinanceModal">Fechar</button><button type="button" class="ghost-btn" id="cancelManualFinanceBtn">Cancelar conta</button><button class="primary-btn">Salvar lançamento</button>`,'manualFinanceForm'));
    $('#newFinanceAccountBtn').onclick=()=>openManualFinance();
    $('#manualFinanceForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{const id=$('#manualFinanceId').value,old=db.finance.find(f=>f.id===id),amount=roundMoney($('#manualFinanceAmount').value),type=$('#manualFinanceType').value;if(!Number.isFinite(amount)||amount<=0)throw Error('Informe um valor positivo.');if(old?.cancelledAt)throw Error('Esta conta está cancelada.');if(old&&amount<paidFor(old))throw Error('O total não pode ficar abaixo dos pagamentos ou recebimentos registrados.');if(old&&(old.payments||[]).some(p=>!p.reversedAt)&&old.type!==type)throw Error('Estorne os lançamentos antes de alterar o tipo da conta.');const f=old||{id:uid('finance'),manual:true,payments:[],createdAt:new Date().toISOString()};Object.assign(f,{type,person:$('#manualFinancePerson').value.trim(),amount,date:$('#manualFinanceDate').value,dueDate:$('#manualFinanceDue').value,oc:$('#manualFinanceRef').value.trim()||'Lançamento avulso',category:$('#manualFinanceCategory').value,notes:$('#manualFinanceNotes').value.trim(),updatedAt:new Date().toISOString()});reconcileFinance(f);if(!old)db.finance.push(f);saveDB();$('#manualFinanceModal').close();toast('Lançamento financeiro salvo');});};
    $('#cancelManualFinanceBtn').onclick=()=>commercialTry(()=>{const f=db.finance.find(f=>f.id===$('#manualFinanceId').value);if(!f)return;if(paidFor(f)>0)throw Error('Estorne os pagamentos ou recebimentos antes de cancelar a conta.');const reason=prompt('Motivo do cancelamento da conta:');if(reason?.trim()){f.cancelledAt=new Date().toISOString();f.cancelReason=reason.trim();f.status='cancelled';saveDB();$('#manualFinanceModal').close();toast('Conta cancelada','Histórico mantido.');}});
    document.addEventListener('click',e=>{const target=e.target.closest('[data-finance-edit]');if(target)openManualFinance(target.dataset.financeEdit);});

    $('#financeType').onchange=renderFinance;$('#stockIncludeClosed').onchange=renderStock;$('#customerSearch').oninput=renderCustomers;
    $('#openingStockBtn').onclick=()=>{$('#openingStockForm').reset();$('#openingDate').value=todayISO();$('#openingStockModal').showModal();};
    $('#openingStockForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{const b=Number($('#openingBags').value);if(!Number.isFinite(b)||b<=0)throw Error('Informe sacas positivas.');const now=new Date().toISOString();const code='SI-'+todayISO().slice(0,4)+'-'+String(db.stockLots.filter(l=>l.entryType==='opening').length+1).padStart(6,'0');db.stockLots.push({id:uid('lot'),entryType:'opening',oc:code,sellerName:'Estoque inicial',bags:b,remaining:b,weight:C.money($('#openingWeight').value),quality:$('#openingQuality').value.trim(),nf:$('#openingNF').value.trim(),drink:$('#openingDrink').value.trim(),warehouse:$('#openingWarehouse').value.trim(),date:$('#openingDate').value,lotRef:$('#openingRef').value.trim(),notes:$('#openingNotes').value.trim(),createdAt:now});saveDB();$('#openingStockModal').close();toast('Saldo inicial registrado');});};
    $('#saleOrderForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{
      const data=collectSaleOrder();const old=db.sales.find(s=>s.id===$('#saleOrderId').value);const s=C.saveSale(db,data,old?.id||'',uid('sale'),new Date().toISOString());
      let customer=db.customers.find(c=>normalize(c.name)===normalize(s.buyer));if(!customer){customer={id:uid('customer')};db.customers.push(customer);}Object.assign(customer,{name:s.buyer,doc:s.buyerDoc,ie:s.buyerIE,address:s.buyerAddress,city:s.buyerCity,phone:s.buyerPhone,email:s.buyerEmail});s.customerId=customer.id;
      const f=saleFinance(s);reconcileFinance(f);saveDB();$('#saleOrderModal').close();openSaleDetail(s.id);toast(old?'Venda atualizada':'Venda registrada',s.ov+' · entrega e recebimento acompanhados separadamente.');
    });};
    $('#ovTerm').onchange=updateSaleTerms;$('#ovSource').onchange=()=>updateSaleOrigin();$('#ovPurchase').onchange=()=>{const p=db.purchases.find(p=>p.id===$('#ovPurchase').value);if(p){$('#ovDrink').value=p.drink;$('#ovClass').value=[p.quality,p.classification,p.species,p.crop,p.screen].filter(Boolean).join(' · ');}updateSaleTotals();};
    $('#ovAddLot').onclick=()=>addSaleAllocation();$('#ovBuyer').onchange=()=>{const c=db.customers.find(c=>normalize(c.name)===normalize($('#ovBuyer').value));if(c)Object.entries({ovBuyerDoc:c.doc,ovBuyerIE:c.ie,ovBuyerAddress:c.address,ovBuyerCity:c.city,ovBuyerPhone:c.phone,ovBuyerEmail:c.email}).forEach(([k,v])=>$('#'+k).value=v||'');};
    $('#saleOrderForm').addEventListener('input',e=>{if(e.target.classList.contains('allocation-bags'))updateAllocationTotal();if(e.target.id==='ovWeight'){$('#ovBags').value=C.qty(Number(e.target.value)/60);$('#ovBags').step='0.0001';}else if(e.target.id==='ovBags')$('#ovWeight').value=C.qty(Number(e.target.value)*60);if(['ovBags','ovWeight'].includes(e.target.id)&&$$('.allocation-row').length===1)$('.allocation-bags').value=$('#ovBags').value;updateSaleTotals();});
    $('#saleOrderForm').addEventListener('change',e=>{if(e.target.classList.contains('allocation-lot')&&e.target.closest('.allocation-row')===$('.allocation-row')){const l=db.stockLots.find(l=>l.id===e.target.value);if(l){$('#ovDrink').value=l.drink;$('#ovClass').value=qualityDescription(l);}}updateSaleTotals();});
    $('#saleEditBtn').onclick=()=>openCommercialSale({id:activeSaleId});$('#saleDispatchBtn').onclick=()=>openDispatch(activeSaleId);$('#saleReceiveBtn').onclick=()=>{const s=db.sales.find(s=>s.id===activeSaleId);if(s?.reviewPending){toast('Confira a venda antiga','Edite a venda e confirme se houve recebimento para abrir seu financeiro.','error');return;}if(s)openPayment(s.financeId);};
    $('#saleOrderPrintBtn').onclick=()=>printSaleDocument(false);$('#saleContractBtn').onclick=()=>printSaleDocument(true);$('#saleContractReprintBtn').onclick=()=>printSaleDocument(true,true);
    $('#saleCancelBtn').onclick=()=>{const reason=prompt('Motivo do cancelamento da venda:');if(reason)commercialTry(()=>{C.cancel(db,activeSaleId,reason,new Date().toISOString());saveDB();openSaleDetail(activeSaleId,false);toast('Venda cancelada','Reservas liberadas; histórico mantido.');});};
    $('#dispatchForm').onsubmit=e=>{e.preventDefault();commercialTry(()=>{C.dispatch(db,activeSaleId,{bags:$('#dispatchBags').value,date:$('#dispatchDate').value,nf:$('#dispatchNF').value.trim(),carrier:$('#dispatchCarrier').value.trim(),plate:$('#dispatchPlate').value.trim(),notes:$('#dispatchNotes').value.trim()},uid('delivery'),new Date().toISOString());saveDB();$('#dispatchModal').close();openSaleDetail(activeSaleId,false);toast('Entrega registrada');});};
    $('#purchaseReceiveV3').onclick=()=>commercialTry(()=>{const p=db.purchases.find(p=>p.id===activePurchaseId);if(!p)return;if(p.destination!=='stock'){if(p.destination==='direct')throw Error('Uma compra direta não entra no estoque. Edite o tipo da compra se a negociação mudou.');if(!confirm('Destinar esta compra futura ao estoque e registrar o recebimento físico?'))return;p.previousDestination='future';p.destination='stock';saveDB();}openStockEntryModal(p.id);});
    $('#purchaseNFBtn').onclick=()=>{const p=db.purchases.find(p=>p.id===activePurchaseId);$('#purchaseNFNumber').value=p.nfNumber||'';$('#purchaseNFDate').value=p.nfDate||todayISO();$('#purchaseNFKey').value=p.nfKey||'';$('#purchaseNFNotes').value=p.nfNotes||'';$('#purchaseNFModal').showModal();};
    $('#purchaseNFForm').onsubmit=e=>{e.preventDefault();const p=db.purchases.find(p=>p.id===activePurchaseId);Object.assign(p,{nfNumber:$('#purchaseNFNumber').value.trim(),nfDate:$('#purchaseNFDate').value,nfKey:$('#purchaseNFKey').value.trim(),nfNotes:$('#purchaseNFNotes').value.trim()});saveDB();$('#purchaseNFModal').close();renderPurchaseDetail(p.id,false);toast('Referência fiscal registrada');};
    $('#reportBtn').onclick=printMonthlyReport;$('#exportStockBtn').onclick=exportStockCSV;
    document.addEventListener('click',e=>{
      const more=e.target.closest('[data-commercial-more]');if(more){commercialLimits[more.dataset.commercialMore]+=80;({sales:renderCommercial,stock:renderStock,finance:renderFinance,purchases:renderPurchases,guides:renderWarehouseGuides})[more.dataset.commercialMore]();}
      const open=e.target.closest('[data-sale-open]');if(open){$('#customersModal').close();$('#customerProfileModal').close();openSaleDetail(open.dataset.saleOpen);}
      const cust=e.target.closest('[data-customer-profile]');if(cust)openCustomerProfile(cust.dataset.customerProfile);
      const remove=e.target.closest('[data-allocation-remove]');if(remove){remove.closest('.allocation-row').remove();updateAllocationTotal();updateSaleTotals();}
      const rev=e.target.closest('[data-delivery-reverse]');if(rev&&confirm('Estornar esta entrega? O café volta ao saldo físico e permanece reservado pela OV.'))commercialTry(()=>{C.reverseDelivery(db,activeSaleId,rev.dataset.deliveryReverse,new Date().toISOString());saveDB();openSaleDetail(activeSaleId,false);});
      const receipt=e.target.closest('[data-entry-reverse]');if(receipt){const reason=prompt('Motivo do estorno desta entrada:');if(reason)commercialTry(()=>{C.reverseEntry(db,receipt.dataset.entryReverse,reason,new Date().toISOString());saveDB();toast('Entrada estornada','A OC pode ser recebida novamente.');});}
      const move=e.target.closest('[data-lot-move]');if(move){const l=db.stockLots.find(l=>l.id===move.dataset.lotMove),destination=prompt('Novo armazém para o saldo deste lote:',l.warehouse||'');if(destination?.trim()){db.stockMovements.push({id:uid('movement'),lotId:l.id,kind:'transfer',bags:l.remaining,date:todayISO(),from:l.warehouse||'Não informado',to:destination.trim(),createdAt:new Date().toISOString()});l.warehouse=destination.trim();saveDB();toast('Local do lote atualizado','Movimentação registrada no histórico.');}}
    });
    $('#salesMonth').value='';
  }
  const qualityDescription=p=>[p.quality,p.classification,p.species,p.crop,p.screen,p.cata?'Cata '+num(p.cata)+'%':''].filter(Boolean).join(' · ');
  function addSaleAllocation(a={}){
    const id=$('#saleOrderId').value;
    const choices=physicalStockLots().filter(l=>C.available(db,l.id,id)>0||l.id===a.lotId).map(l=>option(l.id,`${l.oc} · ${l.drink} · ${l.warehouse||'Sem local'} · livre ${num(C.available(db,l.id,id))} sc`)).join('');
    $('#ovAllocations').insertAdjacentHTML('beforeend',`<div class="allocation-row"><label class="field"><span>Lote físico *</span><select class="allocation-lot" required>${option('','Selecione um lote')+choices}</select></label><label class="field"><span>Sacas deste lote *</span><input class="allocation-bags" type="number" min="0.0001" step="0.0001" required></label><button type="button" class="icon-btn" data-allocation-remove aria-label="Remover lote">×</button></div>`);
    const row=$$('.allocation-row').at(-1);$('.allocation-lot',row).value=a.lotId||'';$('.allocation-bags',row).value=a.bags||'';updateAllocationTotal();updateSaleTotals();
  }
  function updateSaleOrigin(s){
    const type=$('#ovSource').value,isStock=type==='stock';$('#ovPurchase').closest('label').hidden=isStock;$('#ovSource').closest('label').style.gridColumn=isStock?'1 / -1':'';$('#ovBags').readOnly=isStock;$('#ovWeight').readOnly=isStock;$('#ovBags').closest('label').querySelector('span').textContent=isStock?'Total de sacas dos lotes':'Sacas *';$('#ovPurchase').disabled=isStock;$('#ovPurchase').required=!isStock;$('#ovAddLot').hidden=!isStock;$('#ovAllocations').hidden=!isStock;
    $$('input,select',$('#ovAllocations')).forEach(e=>e.disabled=!isStock);
    const previous=s?.purchaseId||$('#ovPurchase').value;
    $('#ovPurchase').innerHTML=option('','Selecione a OC')+db.purchases.filter(p=>p.destination===type||p.id===(s?.purchaseId||db.sales.find(v=>v.id===$('#saleOrderId').value)?.purchaseId)).map(p=>option(p.id,`${p.oc} · ${p.sellerName} · livre ${num(Math.max(0,p.bags-C.purchaseCommitted(db,p.id,$('#saleOrderId').value)))} sc`)).join('');$('#ovPurchase').value=previous;
    if(isStock&&!$$('.allocation-row').length)addSaleAllocation();
    updateSaleTotals();
  }
  function updateAllocationTotal(){if($('#ovSource').value==='stock'){const bags=C.qty($$('.allocation-bags').reduce((v,e)=>v+Number(e.value||0),0));$('#ovBags').value=bags||'';$('#ovWeight').value=goodsWeight(bags);}}
  const goodsWeight=qty=>C.money(Number(qty||0)*60);
  function updateSaleTotals(){
    const b=Number($('#ovBags')?.value||0),price=Number($('#ovPrice')?.value||0);if(!$('#ovTotal'))return;
    const fee=brokerageAmount($('#ovBrokerageType').value,Number($('#ovBrokerageValue').value||0),b*price);
    $('#ovTotal').textContent=`Total do café: ${$('#ovTerm').value==='fix'?'A fixar':money(b*price)} · ${num(b*60)} kg${fee?' · corretagem separada '+money(fee):''}`;
    const sum=$$('.allocation-bags').reduce((v,e)=>v+Number(e.value||0),0);$('#ovAvailability').textContent=$('#ovSource').value==='stock'?`${num(sum)} sc distribuídas nos lotes. A reserva ocorre ao salvar; o estoque só sai ao entregar.`:'Entrega na origem da OC, sem passar pelo estoque físico.';
  }
  function openCommercialSale({id='',lotId=''}={}){
    const s=db.sales.find(s=>s.id===id);if(s?.cancelledAt){toast('Venda cancelada','','error');return;}
    $('#saleOrderForm').reset();$$('details',$('#saleOrderForm')).forEach(d=>d.open=false);$('#saleOrderId').value=id;$('#ovAllocations').innerHTML='';$('#saleOrderModal h3').textContent=s?'Editar '+s.ov:'Nova ordem de venda';
    const fields={ovBuyer:s?.buyer,ovDate:s?.date||todayISO(),ovBuyerDoc:s?.buyerDoc,ovBuyerIE:s?.buyerIE,ovBuyerAddress:s?.buyerAddress,ovBuyerCity:s?.buyerCity,ovBuyerPhone:s?.buyerPhone,ovBuyerEmail:s?.buyerEmail,ovSource:s?.source||'stock',ovBags:s?.bags,ovWeight:s?.weight,ovPrice:s?.pricePerBag,ovDrink:s?.drink,ovTerm:s?.saleTerm||'cash',ovDue:s?.dueDate,ovMethod:s?.paymentMethod||'PIX',ovExpectedDelivery:s?.expectedDelivery,ovLocation:s?.deliveryLocation,ovClass:s?.classification,ovBroker:s?.brokerName,ovBrokerDoc:s?.brokerDoc,ovBrokerageType:s?.brokerageType||'none',ovBrokerageValue:s?.brokerageValue||'',ovBrokeragePayer:s?.brokeragePayer||'unspecified',ovNotes:s?.notes,ovTerms:s?.contractTerms||db.settings.saleContractTerms};
    Object.entries(fields).forEach(([k,v])=>$('#'+k).value=v??'');$('#ovInitialStatus').disabled=!!s&&!s.reviewPending;$('#ovInitialStatus').value='pending';
    if(s?.source==='stock')s.allocations.forEach(a=>addSaleAllocation(a));else if(lotId)addSaleAllocation({lotId});
    updateSaleOrigin(s);if(lotId){const l=db.stockLots.find(l=>l.id===lotId);$('#ovDrink').value=l.drink;$('#ovClass').value=qualityDescription(l);}
    updateSaleTerms();$('#saleDetailModal').close();$('#saleOrderModal').showModal();$('#saleOrderModal').scrollTop=0;updateSaleTotals();
  }
  function updateSaleTerms(){const fix=$('#ovTerm').value==='fix',old=db.sales.find(s=>s.id===$('#saleOrderId').value);$('#ovPrice').min=fix?'0':'0.01';$('#ovPrice').required=!fix;$('#ovInitialStatus').disabled=fix||!!old&&!old.reviewPending;if(fix)$('#ovInitialStatus').value='pending';updateSaleTotals();}
  function collectSaleOrder(){
    const get=id=>$('#'+id).value.trim(),bags=Number(get('ovBags')),price=Number(get('ovPrice')),feeType=get('ovBrokerageType');
    return {buyer:get('ovBuyer'),date:get('ovDate'),buyerDoc:get('ovBuyerDoc'),buyerIE:get('ovBuyerIE'),buyerAddress:get('ovBuyerAddress'),buyerCity:get('ovBuyerCity'),buyerPhone:get('ovBuyerPhone'),buyerEmail:get('ovBuyerEmail'),source:get('ovSource'),purchaseId:get('ovSource')==='stock'?'':get('ovPurchase'),allocations:get('ovSource')==='stock'?$$('.allocation-row').map(row=>({lotId:$('.allocation-lot',row).value,bags:Number($('.allocation-bags',row).value)})):[],bags,pricePerBag:price,drink:get('ovDrink'),saleTerm:get('ovTerm'),dueDate:get('ovDue'),paymentMethod:get('ovMethod'),initialStatus:get('ovInitialStatus'),expectedDelivery:get('ovExpectedDelivery'),deliveryLocation:get('ovLocation'),classification:get('ovClass'),brokerName:get('ovBroker'),brokerDoc:get('ovBrokerDoc'),brokerageType:feeType,brokerageValue:Number(get('ovBrokerageValue')||0),brokerageAmount:brokerageAmount(feeType,Number(get('ovBrokerageValue')||0),bags*price),brokeragePayer:get('ovBrokeragePayer'),notes:get('ovNotes'),contractTerms:get('ovTerms')};
  }
  function renderCommercial(){
    if(!$('#salesList'))return;
    $('#customerList').innerHTML=db.customers.map(c=>option(c.name,c.name)).join('');
    const q=normalize($('#salesSearch').value),month=$('#salesMonth').value,filter=$('#salesFilter').value;
    const monthly=db.sales.filter(s=>!s.cancelledAt&&!s.reviewPending&&!s.pricePending&&(!month||s.date?.startsWith(month))),receivables=db.finance.filter(f=>f.type==='receivable'&&!f.cancelledAt);
    $('#salesStats').innerHTML=statHTML('Vendido no período',money(monthly.reduce((v,s)=>v+s.total,0)),`${monthly.length} ordens de venda`,'file')+statHTML('A receber',money(receivables.reduce((v,f)=>v+pendingFor(f),0)),'Todas as vendas em aberto','wallet','financeiro')+statHTML('A entregar',num(db.sales.filter(s=>!s.cancelledAt&&!s.reviewPending).reduce((v,s)=>v+C.remaining(s),0))+' sc','Contratado e ainda não entregue','box')+statHTML('Reservado no estoque',num(physicalStockLots().reduce((v,l)=>v+C.lotReserved(db,l.id,'',commercialPlan),0))+' sc','Reserva das ordens de venda','box','estoque');
    const rows=db.sales.slice().reverse().filter(s=>{const f=saleFinance(s),due=C.remaining(s),done=due===0&&f&&pendingFor(f)===0;return (!month||s.date?.startsWith(month))&&(!q||normalize(`${s.ov} ${s.buyer} ${s.drink} ${s.brokerName||''}`).includes(q))&&(filter==='all'||filter==='cancelled'?filter==='all'||!!s.cancelledAt:!s.cancelledAt&&(filter==='review'?s.reviewPending:filter==='delivery'?!s.reviewPending&&due>0:filter==='pending'?f&&pendingFor(f)>0:done));});
    $('#salesList').innerHTML=rows.length?rows.slice(0,commercialLimits.sales).map(s=>{const f=saleFinance(s);return `<article class="data-card sale-card"><div class="main-info"><span class="oc-label">${esc(s.ov)} · ${dateBR(s.date)}</span><strong>${esc(s.buyer)}</strong><small>${esc(s.drink)} · ${esc(saleSource(s.source))}</small></div><div class="data-meta"><label>${s.pricePending?'Preço a fixar':'Valor do café'}</label><strong>${s.pricePending?'A fixar':money(s.total)}</strong></div><div class="data-meta"><label>Entrega</label><strong>${num(C.delivered(s))} / ${num(s.bags)} sc</strong></div><div class="data-meta"><label>A receber</label><strong>${s.cancelledAt?'Cancelada':s.reviewPending?'A conferir':s.pricePending?'A fixar':money(f?pendingFor(f):s.total)}</strong></div><div class="card-actions"><span class="badge ${s.cancelledAt?'gray':s.reviewPending?'amber':f?.status==='paid'?'green':'amber'}">${s.cancelledAt?'Cancelada':s.reviewPending?'Histórico a conferir':s.pricePending?'A fixar':f?.status==='paid'?'Recebida':f?.status==='partial'?'Parcial':'A receber'}</span><button class="mini-btn primary" data-sale-open="${esc(s.id)}">Abrir venda</button></div></article>`;}).join(''):emptyHTML('Suas vendas ficam aqui','Registre a negociação, confirme a entrega e acompanhe o recebimento.');
    addMoreControl($('#salesList'),rows.length,'sales');
    if($('#saleDetailModal').open&&activeSaleId)openSaleDetail(activeSaleId,false);
    renderStockHistory();renderWarehouseGuides();
    const sold=db.sales.filter(s=>!s.cancelledAt&&!s.reviewPending&&!s.pricePending&&s.date?.startsWith($('#dashboardMonth').value));
    if(!$('#dashboardSalesStats'))$('#dashboardStats').insertAdjacentHTML('afterend','<div class="stats-grid commercial-dashboard" id="dashboardSalesStats"></div>');
    $('#dashboardSalesStats').innerHTML=statHTML('Vendas no mês',money(sold.reduce((v,s)=>v+s.total,0)),`${sold.length} ordens de venda`,'file','vendas')+statHTML('Saldo a receber',money(receivables.reduce((v,f)=>v+pendingFor(f),0)),'Todas as vendas em aberto','wallet','financeiro');
    $$('.commercial-sale-task').forEach(e=>e.remove());$('#actionCount').textContent=Math.max(0,Number($('#actionCount').textContent)-commercialTaskCount);
    commercialTaskCount=db.sales.filter(s=>!s.cancelledAt&&!s.reviewPending&&C.remaining(s)>0).length;
    const tasks=db.sales.filter(s=>!s.cancelledAt&&!s.reviewPending&&C.remaining(s)>0).slice(0,2).map(s=>`<button class="operating-action commercial-sale-task" data-sale-open="${esc(s.id)}"><span class="action-icon">${icon('box')}</span><span><strong>${s.expectedDelivery&&s.expectedDelivery<todayISO()?'Entrega prevista vencida':'Entregar venda'}</strong><small>${esc(s.ov)} · ${num(C.remaining(s))} sc · ${esc(s.buyer)}</small></span>${icon('arrowRight')}</button>`).join('');
    if(tasks){if($('#operatingActions .empty-state'))$('#operatingActions').innerHTML='';$('#operatingActions').insertAdjacentHTML('beforeend',tasks);$('#actionCount').textContent=Number($('#actionCount').textContent)+commercialTaskCount;}
  }
  function openSaleDetail(id,open=true){
    const s=db.sales.find(s=>s.id===id);if(!s)return;activeSaleId=id;const f=saleFinance(s);
    $('#saleDetailModal h3').textContent=s.ov;
    $('#saleDetailBody').innerHTML=`${s.reviewPending?'<p class="connection-banner">Saída preservada da versão anterior. Edite esta venda para confirmar o comprador e o recebimento. O estoque não será baixado novamente.</p>':''}${s.cancelledAt?`<p class="connection-banner">Cancelada em ${dateBR(s.cancelledAt.slice(0,10))} · ${esc(s.cancelReason)}</p>`:''}<div class="order-summary"><div><h3>${esc(s.buyer)}</h3><p>${esc(s.drink)} · ${esc(saleSource(s.source))}</p></div><strong>${s.pricePending?'A fixar':money(s.total)}</strong></div><div class="order-stages"><div class="order-stage done"><strong>Contratado</strong>${num(s.bags)} sc</div><div class="order-stage ${C.remaining(s)===0?'done':''}"><strong>Entregue</strong>${num(C.delivered(s))} sc</div><div class="order-stage ${f&&pendingFor(f)===0?'done':''}"><strong>Recebido</strong>${money(f?paidFor(f):0)}</div></div><div class="detail-grid">${[['Comprador / documento',[s.buyer,s.buyerDoc,s.buyerIE].filter(Boolean).join(' · ')],['Endereço / contato',[s.buyerAddress,s.buyerCity,s.buyerPhone].filter(Boolean).join(' · ')||'Não informado'],['Quantidade / peso',`${num(s.bags)} sc · ${num(s.weight)} kg`],['Preço por saca',s.pricePending?'A fixar':money(s.pricePerBag)],['A entregar',num(C.remaining(s))+' sc'],['A receber',s.reviewPending?'A conferir':s.pricePending?'A fixar':money(f?pendingFor(f):0)],['Previsão / local',[dateBR(s.expectedDelivery),s.deliveryLocation].filter(Boolean).join(' · ')],['Vencimento / condição',dateBR(s.dueDate)+' · '+purchaseTermLabel(s.saleTerm)],['Qualidade',s.classification||s.drink],['Corretor / corretagem',(s.brokerName||'Sem corretor')+' · '+brokerageLabel(s)],['Origem',s.source==='stock'?(s.allocations||[]).map(a=>{const l=db.stockLots.find(l=>l.id===a.lotId);return (l?.oc||'Lote antigo')+' · '+num(a.bags)+' sc';}).join(' / '):(db.purchases.find(p=>p.id===s.purchaseId)?.oc||'—')],['Observações',s.notes||'Sem observações']].map(([label,value])=>`<div class="detail-box"><label>${esc(label)}</label><strong>${esc(value)}</strong></div>`).join('')}</div><div class="detail-section"><h4>Entregas e estornos</h4>${(s.deliveries||[]).length?s.deliveries.map(d=>`<div class="timeline-row"><div><strong>${num(d.bags)} sc · ${dateBR(d.date)} ${d.reversedAt?'· Estornada':''}</strong><small>${esc([d.nf?'NF '+d.nf:'',d.carrier,d.plate,d.notes].filter(Boolean).join(' · '))}</small></div>${d.reversedAt?'':`<button class="text-btn" data-delivery-reverse="${esc(d.id)}">Estornar entrega</button>`}</div>`).join(''):emptyHTML('Nenhuma entrega registrada','A negociação não representa uma saída física.')}</div>`;
    ['saleEditBtn','saleDispatchBtn','saleReceiveBtn','saleContractBtn','saleCancelBtn'].forEach(id=>$('#'+id).disabled=!!s.cancelledAt);$('#saleDispatchBtn').disabled=!!s.cancelledAt||!!s.reviewPending||C.remaining(s)===0;$('#saleReceiveBtn').disabled=!!s.cancelledAt||!!s.pricePending;$('#saleContractReprintBtn').hidden=!s.contractIssued;
    window.BracoffeeWorkspaceUI?.decorateSale(id);
    if(open){$('#saleDetailModal').showModal();$('#saleDetailModal').scrollTop=0;}
  }
  function openDispatch(id){const s=db.sales.find(s=>s.id===id);activeSaleId=id;$('#dispatchForm').reset();$('#dispatchSummary').textContent=s.ov+' · '+num(C.remaining(s))+' sc ainda não entregues · '+saleSource(s.source);$('#dispatchBags').value=C.remaining(s);$('#dispatchBags').max=C.remaining(s);$('#dispatchDate').value=todayISO();$('#dispatchModal').showModal();}
  function renderCustomers(){
    const q=normalize($('#customerSearch').value);$('#customersBody').innerHTML=db.customers.filter(c=>!q||normalize(`${c.name} ${c.doc} ${c.city}`).includes(q)).map(c=>{const ids=db.sales.filter(s=>s.customerId===c.id).map(s=>s.id);const f=db.finance.filter(f=>ids.includes(f.saleId)&&!f.cancelledAt);return `<article class="data-card supplier-card"><div class="main-info"><strong>${esc(c.name)}</strong><small>${esc(c.doc||'Documento não informado')} · ${esc(c.city||'Cidade não informada')}</small></div><div class="data-meta"><label>Saldo a receber</label><strong>${money(f.reduce((v,f)=>v+pendingFor(f),0))}</strong></div><div class="card-actions"><button class="mini-btn primary" data-customer-profile="${esc(c.id)}">Abrir ficha</button></div></article>`;}).join('')||emptyHTML('Nenhum cliente cadastrado','O cadastro é criado ao salvar uma venda.');
  }
  function openCustomerProfile(id){const c=db.customers.find(c=>c.id===id),sales=db.sales.filter(s=>s.customerId===id),ids=sales.map(s=>s.id),finance=db.finance.filter(f=>ids.includes(f.saleId)&&!f.cancelledAt);$('#customerProfileBody').innerHTML=`<div class="supplier-contact">${partyHTML(c)}<p>${esc([c.phone,c.email].filter(Boolean).join(' · '))}</p></div><div class="supplier-stats">${statHTML('Vendido',money(sales.filter(s=>!s.cancelledAt).reduce((v,s)=>v+s.total,0)),'Ordens deste cliente')+statHTML('Recebido',money(finance.reduce((v,f)=>v+paidFor(f),0)),'Recebimentos registrados')+statHTML('A receber',money(finance.reduce((v,f)=>v+pendingFor(f),0)),'Saldo deste cliente')}</div>${sales.map(s=>`<button class="list-row" data-sale-open="${esc(s.id)}"><span class="list-row-copy"><strong>${esc(s.ov)} · ${num(s.bags)} sc</strong><small>${dateBR(s.date)} · ${esc(s.drink)}</small></span><span class="amount">${money(s.total)}</span></button>`).join('')}`;$('#customerProfileModal').showModal();}
  function printSaleDocument(contract=false,reprint=false){
    const s=db.sales.find(s=>s.id===activeSaleId);if(!s)return;
    if(contract&&!reprint&&(!s.buyerDoc||!s.buyerAddress||!s.buyerCity)){toast('Complete os dados do comprador','Informe CPF/CNPJ, endereço e cidade na edição da venda antes de emitir o contrato.','error');return;}
    const company=companyData();if(contract&&!reprint&&(!company.doc||!company.address||!company.city)){toast('Complete a empresa em Configurações','','error');return;}
    const w=openDocumentWindow();if(!w)return;
    let snapshot=reprint?s.contractIssued:{sale:JSON.parse(JSON.stringify({...s,contractIssued:undefined})),company:{...company},issuedAt:new Date().toISOString()};
    if(!snapshot){w.close();return;}if(contract&&!reprint&&window.BracoffeeSync.canWrite){s.contractIssued=snapshot;saveDB();}
    const v=snapshot.sale,b=snapshot.company;const buyer={name:v.buyer,doc:v.buyerDoc,ie:v.buyerIE,address:v.buyerAddress,city:v.buyerCity,phone:v.buyerPhone,email:v.buyerEmail};
    const trade=printSection('Café e negociação',printBox('Quantidade / peso',num(v.bags)+' sacas · '+num(v.weight)+' kg')+printBox('Bebida / classificação',[v.drink,v.classification].filter(Boolean).join(' · '))+printBox('Preço por saca',v.pricePending?'A fixar':money(v.pricePerBag))+printBox('Valor total do café',v.pricePending?'A fixar':money(v.total))+printBox('Origem / entrega',saleSource(v.source)+' · '+(v.deliveryLocation||'A combinar'))+printBox('Previsão / pagamento',dateBR(v.expectedDelivery)+' · '+purchaseTermLabel(v.saleTerm)+' · '+dateBR(v.dueDate)));
    const broker=v.brokerName?printSection('Corretor',printBox('Nome / documento',[v.brokerName,v.brokerDoc].filter(Boolean).join(' · '))+printBox('Corretagem / responsável',brokerageLabel(v)+' · '+brokeragePayerLabel(v.brokeragePayer))):'';
    const signs=contract?`<div class="signs ${v.brokerName?'has-broker':''}"><div class="sign">${esc(b.name)}<br>Vendedor</div><div class="sign">${esc(v.buyer)}<br>Comprador</div>${v.brokerName?`<div class="sign">${esc(v.brokerName)}<br>Corretor</div>`:''}</div>`:'';
    writeDocument(w,v.ov+' - '+(contract?'Contrato de venda':'Ordem de venda'),documentHeader(v.ov,v.date,b,'ORDEM DE VENDA')+`<h2 class="title">${contract?'CONTRATO DE VENDA DE CAFÉ':'ORDEM DE VENDA DE CAFÉ'}</h2><h3 class="section-title">Vendedor</h3><div class="party">${partyHTML(b)}</div><h3 class="section-title">Comprador</h3><div class="party">${partyHTML(buyer)}</div>`+trade+broker+`<div class="terms"><strong>Condições combinadas</strong><p>${esc(v.notes||'')}</p>${contract?`<p>${esc(v.contractTerms||'')}</p>`:''}</div>`+signs+`<div class="foot">${esc(v.ov)} · Corretagem separada do valor do café. ${contract?'Modelo comercial configurado pela empresa.':'Este documento não substitui a nota fiscal.'}</div>`);
  }
  function renderStockHistory(){
    if(!$('#stockHistory'))return;const events=[];
    db.stockLots.filter(l=>l.entryType!=='legacy_auto_purchase').forEach(l=>{events.push({date:l.date,text:(l.entryType==='opening'?'Saldo inicial':'Recebimento por OC')+' · '+l.oc,details:[l.warehouse,l.lotRef,l.nf?'NF '+l.nf:'',l.notes].filter(Boolean).join(' · '),bags:Number(l.bags),stamp:l.createdAt||l.date});if(l.reversedAt)events.push({date:l.reversedAt.slice(0,10),text:(l.deletedAt?'Exclusão de lote':'Estorno de entrada')+' · '+l.oc,details:l.reverseReason,bags:-Number(l.bags),stamp:l.reversedAt});});
    db.sales.forEach(s=>(s.deliveries||[]).forEach(d=>{events.push({date:d.date,text:'Entrega · '+s.ov,details:s.buyer+' · '+saleSource(s.source)+(d.nf?' · NF '+d.nf:''),bags:(d.allocations||[]).length?-d.bags:0,stamp:d.createdAt||d.date});if(d.reversedAt)events.push({date:d.reversedAt.slice(0,10),text:'Estorno de entrega · '+s.ov,details:s.buyer,bags:(d.allocations||[]).length?d.bags:0,stamp:d.reversedAt});}));
    db.stockMovements.forEach(m=>events.push({date:m.date,text:'Transferência de local',details:m.from+' → '+m.to+' · '+num(m.bags)+' sc',bags:0,stamp:m.createdAt}));
    events.sort((a,b)=>String(b.stamp||'').localeCompare(String(a.stamp||'')));$('#stockHistory').innerHTML=events.slice(0,40).map(e=>`<div class="timeline-row"><div><strong>${esc(e.text)}</strong><small>${dateBR(e.date)} · ${esc(e.details||'')}</small></div><strong>${e.bags>0?'+ ':''}${num(e.bags)} sc</strong></div>`).join('')||emptyHTML('Nenhuma movimentação','Recebimentos, entregas e estornos aparecem aqui.');
  }
  function commercialStock(){
    const lots=physicalStockLots(),physical=lots.reduce((v,l)=>v+l.remaining,0),reserved=lots.reduce((v,l)=>v+C.lotReserved(db,l.id,'',commercialPlan),0);
    $('#stockStats').innerHTML=statHTML('Saldo físico',num(physical)+' sc','Café realmente presente no armazém','box')+statHTML('Reservado',num(reserved)+' sc','Ordens de venda ainda não entregues','file')+statHTML('Livre para vender',num(physical-reserved)+' sc','Físico menos as reservas','check');
    const q=normalize($('#stockSearch').value),closed=$('#stockIncludeClosed')?.checked;const rows=lots.filter(l=>(closed||l.remaining>0)&&(!q||normalize(`${l.oc} ${l.sellerName} ${l.drink} ${l.quality||''} ${l.nf||''} ${l.warehouse} ${l.lotRef}`).includes(q)));
    $('#stockLots').innerHTML=rows.slice(0,commercialLimits.stock).map(l=>`<div class="data-card stock-v3-card"><div class="main-info"><strong>Lote ${esc(l.lotRef||l.oc)} · ${esc(l.quality||l.drink)}</strong><small>${esc(l.warehouse||'Local não informado')} · ${esc(l.sellerName)} · ${dateBR(l.date)} · ${esc(l.oc)}${l.nf?' · NF '+esc(l.nf):''}</small></div><div class="data-meta"><label>Físico</label><strong>${num(l.remaining)} sc</strong></div><div class="data-meta"><label>Reservado</label><strong>${num(C.lotReserved(db,l.id,'',commercialPlan))} sc</strong></div><div class="data-meta"><label>Livre</label><strong>${num(C.available(db,l.id,'',commercialPlan))} sc</strong></div><div class="card-actions">${C.available(db,l.id,'',commercialPlan)>0?`<button class="mini-btn primary" data-lot-sell="${esc(l.id)}">Negociar venda</button>`:''}${l.purchaseId?`<button class="mini-btn" data-purchase-open="${esc(l.purchaseId)}">Ver OC</button>`:''}<button class="mini-btn" data-lot-view="${esc(l.id)}">Ver lote</button><button class="mini-btn" data-lot-guide="${esc(l.id)}">Emitir guia</button><button class="mini-btn" data-lot-move="${esc(l.id)}">Mover local</button>${Math.abs(l.bags-l.remaining)<0.000001&&C.lotReserved(db,l.id,'',commercialPlan)===0?`<button class="mini-btn" data-entry-reverse="${esc(l.id)}">Estornar entrada</button>`:''}</div></div>`).join('')||emptyHTML('Nenhum lote neste filtro','Receba uma OC ou informe o estoque inicial quando o café já estiver no armazém.');
    addMoreControl($('#stockLots'),rows.length,'stock');
  }
  function openManualFinance(id=''){const f=db.finance.find(f=>f.id===id);$('#manualFinanceForm').reset();$('#manualFinanceId').value=id;Object.entries({manualFinanceType:f?.type||'payable',manualFinanceCategory:f?.category||'Despesa operacional',manualFinancePerson:f?.person,manualFinanceAmount:f?.amount,manualFinanceDate:f?.date||todayISO(),manualFinanceDue:f?.dueDate,manualFinanceRef:f?.oc,manualFinanceNotes:f?.notes}).forEach(([id,v])=>$('#'+id).value=v??'');$('#cancelManualFinanceBtn').hidden=!f;$('#manualFinanceModal').showModal();$('#manualFinanceModal').scrollTop=0;}
  function addMoreControl(el,total,key){const old=el.querySelector('.more-records');if(old)old.remove();if(total>commercialLimits[key])el.insertAdjacentHTML('beforeend',`<div class="more-records"><span>Mostrando ${commercialLimits[key]} de ${total} registros</span><button class="ghost-btn" data-commercial-more="${key}">Mostrar mais</button></div>`);}
  function commercialFinance(){
    const all=db.finance.filter(f=>!f.cancelledAt),month=$('#financeMonth').value||todayISO().slice(0,7),type=$('#financeType')?.value||'all';
    const pay=all.filter(f=>f.type==='payable'),receive=all.filter(f=>f.type==='receivable');const inMonth=arr=>arr.reduce((v,f)=>v+(f.payments||[]).filter(p=>!p.reversedAt&&p.date?.startsWith(month)).reduce((w,p)=>w+p.amount,0),0);
    $('#financeStats').innerHTML=statHTML('Saldo a pagar',money(pay.reduce((v,f)=>v+pendingFor(f),0)),'Compras em aberto','wallet')+statHTML('Saldo a receber',money(receive.reduce((v,f)=>v+pendingFor(f),0)),'Vendas em aberto','wallet')+statHTML('Pago no mês',money(inMonth(pay)),'Saídas por data de pagamento','check')+statHTML('Recebido no mês',money(inMonth(receive)),'Entradas por data de recebimento','check');
    const q=normalize($('#financeSearch').value),filter=$('#financeFilter').value;const rows=all.filter(f=>(type==='all'||type===f.type)&&(!q||normalize(`${f.oc} ${f.person}`).includes(q))&&(filter==='all'||(filter==='pending'?pendingFor(f)>0:filter==='late'?pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO():f.status===filter))).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    $('#financeList').innerHTML=rows.slice(0,commercialLimits.finance).map(f=>{const r=f.type==='receivable';return `<article class="data-card finance-card"><div class="main-info"><span class="oc-label">${esc(f.oc)} · ${r?'A RECEBER':'A PAGAR'}</span><strong>${esc(f.person)}</strong><small>${f.manual?esc(f.category)+' · ':''}Vencimento ${dateBR(f.dueDate)}${pendingFor(f)>0&&f.dueDate&&f.dueDate<todayISO()?' · <b class="late-text">Vencida</b>':''}</small></div><div class="finance-values"><div><label>Total</label><strong>${money(f.amount)}</strong></div><div><label>${r?'Recebido':'Pago'}</label><strong>${money(paidFor(f))}</strong></div><div><label>Saldo</label><strong>${f.pricePending?'A fixar':money(pendingFor(f))}</strong></div></div><div class="card-actions"><span class="badge ${f.status==='paid'?'green':'amber'}">${f.pricePending?'A fixar':f.status==='paid'?(r?'Recebido':'Pago'):f.status==='partial'?'Parcial':r?'A receber':'A pagar'}</span><button class="mini-btn primary" ${f.pricePending?'disabled':''} data-finance-toggle="${esc(f.id)}">${pendingFor(f)>0?(r?'Registrar recebimento':'Registrar pagamento'):'Ver histórico'}</button>${f.manual?`<button class="mini-btn" data-finance-edit="${esc(f.id)}">Editar conta</button>`:`<button class="mini-btn" ${r?'data-sale-open':'data-purchase-open'}="${esc(r?f.saleId:f.purchaseId)}">Ver ${r?'OV':'OC'}</button>`}</div></article>`;}).join('')||emptyHTML('Nenhuma conta neste filtro','Compras e vendas confirmadas alimentam o financeiro.');
    addMoreControl($('#financeList'),rows.length,'finance');
  }
  function printMonthlyReport(){
    const month=$('#financeMonth').value||todayISO().slice(0,7),f=db.finance.filter(f=>!f.cancelledAt),entries=[];f.forEach(f=>(f.payments||[]).filter(p=>!p.reversedAt&&p.date?.startsWith(month)).forEach(p=>entries.push({f,p})));entries.sort((a,b)=>a.p.date.localeCompare(b.p.date));const incoming=entries.filter(e=>e.f.type==='receivable').reduce((v,e)=>v+e.p.amount,0),outgoing=entries.filter(e=>e.f.type==='payable').reduce((v,e)=>v+e.p.amount,0);const w=openDocumentWindow();if(!w)return;
    writeDocument(w,'Financeiro '+month,documentHeader('FINANCEIRO',todayISO(),companyData(),'RELATÓRIO MENSAL')+`<h2 class="title">MOVIMENTAÇÃO FINANCEIRA · ${esc(month)}</h2>`+printSection('Fluxo de caixa do mês',printBox('Recebido',money(incoming))+printBox('Pago',money(outgoing))+printBox('Saldo de caixa do período',money(incoming-outgoing))+printBox('Contas ainda a receber',money(f.filter(f=>f.type==='receivable').reduce((v,f)=>v+pendingFor(f),0))))+`<p class="muted">Saldo de caixa não representa lucro. O relatório considera as datas dos pagamentos e recebimentos.</p>`+entries.map(({f,p})=>`<div class="box"><span>${dateBR(p.date)} · ${f.type==='receivable'?'RECEBIMENTO':'PAGAMENTO'} · ${esc(f.oc)}</span><strong>${esc(f.person)} · ${money(p.amount)} · ${esc(p.method||'')}</strong></div>`).join(''));
  }
  function exportStockCSV(){const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';const rows=[['OC / saldo inicial','Fornecedor','Qualidade','Local','Número do lote','Nota fiscal','Peso de entrada (kg)','Sacas recebidas','Saldo físico','Reservado','Livre','Data','Estornada','Excluída'],...db.stockLots.filter(l=>l.entryType!=='legacy_auto_purchase').map(l=>[l.oc,l.sellerName,l.quality||l.drink,l.warehouse,l.lotRef,l.nf,l.weight,l.bags,l.remaining,C.lotReserved(db,l.id,'',commercialPlan),C.available(db,l.id,'',commercialPlan),l.date,l.reversedAt?'Sim':'Não',l.deletedAt?'Sim':'Não'])];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bracoffee-estoque-'+todayISO()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  window.BracoffeeWorkspace={
    get data(){return db;},get activeSale(){return activeSaleId;},get activeLot(){return activeLotId;},navigate,openPurchaseDetail,editPurchase,openLotDetail,openSaleDetail,openCommercialSale,openDispatch,openPayment,openInvoice,openStockEntryModal,openWarehouseGuide,openProducerProfile,openCustomerProfile,openUnloadingLocations,
    toast,renderAll,downloadJSON,resetPurchaseForm,
    printGuide:id=>{const g=db.stockGuides.find(g=>g.id===id);if(g){const w=openDocumentWindow();if(w)printWarehouseGuide(g,w);}},
    correct:({type,id,reason,destination})=>commercialTry(()=>{if(!window.BracoffeeSync.canWrite)throw Error('Aguarde a conexão e a sincronização.');const now=new Date().toISOString();if(type==='reverseEntry')C.reverseEntry(db,id,reason,now);if(type==='cancelSale')C.cancel(db,id,reason,now);if(type==='cancelGuide'){const g=db.stockGuides.find(g=>g.id===id);g.cancelledAt=now;g.cancelReason=reason;}if(type==='moveLot'){const l=db.stockLots.find(l=>l.id===id);db.stockMovements.push({id:uid('movement'),lotId:id,kind:'transfer',bags:l.remaining,date:todayISO(),from:l.warehouse||'Não informado',to:destination,createdAt:now});l.warehouse=destination;}saveDB();if($('#saleDetailModal').open)openSaleDetail(activeSaleId,false);return true;})
  };
  init();
})();
