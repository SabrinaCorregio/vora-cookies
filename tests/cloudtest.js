const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); }
const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const clone = o => JSON.parse(JSON.stringify(o));
function deepFreeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; }

function makeFake(opts = {}) {
  const store = {}, listeners = [];
  const snapDoc = p => { const d = store[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => d === undefined ? undefined : deepFreeze(clone(d)), metadata: {} }; };
  const snapCol = c => { const docs = Object.keys(store).filter(k => k.startsWith(c + '/') && k.split('/').length === 2).map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const notify = () => listeners.forEach(l => l.next(l.type === 'doc' ? snapDoc(l.p) : snapCol(l.p)));
  let writes = 0;
  const api = {
    doc: p => ({ path: p, id: p.split('/').pop(),
      set: async d => { if (opts.deny) throw { code: 'invalid_argument', message: 'denied' }; writes++; store[p] = clone(d); notify(); },
      delete: async () => { if (opts.deny) throw { code: 'invalid_argument', message: 'denied' }; writes++; delete store[p]; notify(); },
      onSnapshot: (next) => { const l = { type: 'doc', p, next }; listeners.push(l); Promise.resolve().then(() => next(snapDoc(p))); return () => {}; } }),
    collection: p => ({ onSnapshot: (next) => { const l = { type: 'col', p, next }; listeners.push(l); Promise.resolve().then(() => next(snapCol(p))); return () => {}; } })
  };
  return { api, store, notify, writes: () => writes };
}

async function boot({ legacy = null, cloudCache = null, fake, canWrite = true, noClaude = false }) {
  const ls = {};
  if (legacy) ls['vora.cookies.v1'] = JSON.stringify(legacy);
  if (cloudCache) ls['vora.cloud.cache.v1'] = JSON.stringify(cloudCache);
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } };
  const timers = [];
  global.setTimeout = f => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
  const appEl = { innerHTML: '', querySelector: () => null, contains: () => false };
  global.document = { getElementById: id => (id === 'app' ? appEl : null), querySelector: () => null, activeElement: null, addEventListener: () => {} };
  global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
  if (!noClaude) {
    window.__voraPlatform = { use: async name => name === 'db' ? fake.api : name === 'user' ? { me: async () => ({ name: 'Gustavo', id: 'u_1' }), can: async () => canWrite ? true : false } : null };
  }
  eval(src);
  await tick();
  const api = window.__VORA_TEST.api;
  return { api, ls, flush: async () => { while (timers.length) timers.shift()(); await tick(); } };
}
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});
const demo = (() => { global.localStorage = { getItem: () => null, setItem: () => {} }; global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} }; global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') }; global.setTimeout = () => 0; eval(src); return window.__VORA_TEST.api.demoData(); })();

(async () => {
  // 1) migração: nuvem vazia + dados antigos neste aparelho
  let fake = makeFake();
  let app = await boot({ legacy: demo, fake });
  let { api, ls } = app;
  check(api.Cloud.mode === 'online', 'conectou: modo online');
  check(api.ui.sheet && api.ui.sheet.type === 'migrate' && api.ui.sheet.nS === demo.sales.length, 'oferece migrar ' + (api.ui.sheet && api.ui.sheet.nS) + ' vendas');
  check(!!fake.store['settings/main'], 'criou settings/main na nuvem');
  api.a.migrateYes(); await app.flush(); await tick(30);
  const cnt = p => Object.keys(fake.store).filter(k => k.startsWith(p)).length;
  check(cnt('customers/') === demo.customers.length, 'clientes na nuvem: ' + cnt('customers/'));
  check(cnt('sales/') === demo.sales.length, 'vendas na nuvem: ' + cnt('sales/'));
  check(cnt('days/') === Object.keys(demo.days).length, 'dias na nuvem: ' + cnt('days/'));
  check(ls['vora.legacy.done'] === '1', 'marcou migração concluída');
  check(Object.keys(api.Cloud.ops).length === 0, 'sem operações pendentes');
  api.ui.sheet = null; api.ui.screen = 'hoje';
  check(api.build().includes('Online · sincronizado'), 'chip: Online · sincronizado');

  // 2) nova venda grava na nuvem
  const nSales = cnt('sales/');
  api.ui.nova = api.freshNova(); api.ui.screen = 'nova'; api.ui.nova.query = 'Roberta Dias'; api.ui.nova.phone = '11955554444'; api.ui.nova.items = { kinder: 1, nutella: 1 };
  api.a.novaSave(); await app.flush(); await tick(10);
  check(cnt('sales/') === nSales + 1, 'venda nova foi para a nuvem');
  check(Object.keys(fake.store).some(k => k.startsWith('customers/') && fake.store[k].name === 'Roberta Dias'), 'cliente novo foi para a nuvem');
  const newSale = Object.values(fake.store).find(d => d && d.name === 'Roberta Dias' && d.items);
  check(newSale && newSale.cents === 1590 + 2200, 'valor da venda 37,90 (' + (newSale && newSale.cents) + ')');

  // 3) outro aparelho marca como pago: app recebe ao vivo
  const carlosPath = Object.keys(fake.store).find(k => k.startsWith('sales/') && fake.store[k].name === 'Carlos Lima' && !fake.store[k].paid && fake.store[k].date === api.today());
  fake.store[carlosPath] = Object.assign(clone(fake.store[carlosPath]), { paid: true, method: 'Pix' }); fake.notify(); await app.flush();
  check(api.getDb().sales.find(s => s.id === carlosPath.slice(6)).paid === true, 'mudança de outro aparelho apareceu no app');

  // 4) pagar pelo app grava na nuvem
  const beatrizId = Object.keys(fake.store).find(k => k.startsWith('sales/') && fake.store[k].name === 'Beatriz Nunes' && !fake.store[k].paid && fake.store[k].date === api.today()).slice(6);
  api.a.payStart(el({ id: beatrizId })); api.a.payMethod(el({ m: 'Cartão' })); api.a.payNext(); api.a.payConfirm(); await app.flush(); await tick(10);
  check(fake.store['sales/' + beatrizId].paid === true && fake.store['sales/' + beatrizId].method === 'Cartão', 'pagamento gravado na nuvem');

  // 5) ajustar produção e fechar caixa
  api.a.openProd(); api.a.prodInc(el({ id: 'redvelvet' })); api.a.prodSave(); await app.flush(); await tick(10);
  check(fake.store['days/' + api.today()].produced.redvelvet === 5, 'produção na nuvem: red velvet 5');
  api.a.fecharConfirm(); await app.flush(); await tick(10);
  check(!!fake.store['days/' + api.today()].closed, 'caixa fechado gravado na nuvem');

  // 6) excluir venda remove na nuvem; preço editado
  api.a.editStart(el({ id: beatrizId })); api.a.delAsk(); api.a.delConfirm(); await app.flush(); await tick(10);
  check(!fake.store['sales/' + beatrizId], 'venda excluída some da nuvem');
  api.inp.flPrice(el({ id: 'nutella' }, { value: '18,00' })); await tick(10);
  check(fake.store['settings/main'].flavors.find(f => f.id === 'nutella').cents === 1800, 'preço novo na nuvem');

  // 7) segundo aparelho abre: vê tudo da nuvem
  const app2 = await boot({ fake });
  check(app2.api.getDb().sales.length === cnt('sales/') && app2.api.getDb().customers.length === cnt('customers/'), '2º aparelho carregou vendas e clientes da nuvem');
  check(app2.api.getDb().flavors.find(f => f.id === 'nutella').cents === 1800, '2º aparelho vê o preço novo');
  check(!app2.api.ui.sheet, '2º aparelho sem pergunta de migração');

  // 8) apagar tudo na nuvem
  api.a.wipeYes(); await app.flush(); await tick(30);
  check(cnt('sales/') === 0 && cnt('customers/') === 0 && cnt('days/') === 0 && !!fake.store['settings/main'], 'apagar tudo limpa a nuvem (mantém ajustes)');

  // 9) somente leitura (sem permissão declarada)
  fake = makeFake(); fake.store['settings/main'] = { v: 1, flavors: demo.flavors, settings: demo.settings }; demo.sales.slice(0, 3).forEach(s => fake.store['sales/' + s.id] = clone(s));
  app = await boot({ fake, canWrite: false });
  check(app.api.Cloud.mode === 'readonly', 'sem permissão: modo somente leitura');
  const before = fake.writes();
  app.api.ui.nova = app.api.freshNova(); app.api.ui.nova.query = 'Teste'; app.api.ui.nova.items = { kinder: 1 }; app.api.a.novaSave(); await tick(10);
  check(fake.writes() === before && app.api.getDb().sales.length === 3, 'somente leitura bloqueia nova venda');
  check(app.api.build().includes('Somente leitura'), 'chip somente leitura');

  // 10) permissão recusada pelo servidor vira somente leitura
  fake = makeFake({ deny: true }); app = await boot({ fake });
  check(app.api.Cloud.mode === 'readonly', 'servidor recusa a primeira gravação -> somente leitura');
  app.api.ui.nova = app.api.freshNova(); app.api.ui.nova.query = 'Teste'; app.api.ui.nova.items = { kinder: 1 }; app.api.a.novaSave(); await tick(10);
  check(app.api.Cloud.mode === 'readonly', 'escrita recusada -> somente leitura');
  check(app.api.getDb().sales.length === 0, 'venda recusada é revertida na tela');

  // 11) sem nuvem: modo local com dados antigos
  app = await boot({ legacy: demo, noClaude: true, fake: null });
  check(app.api.Cloud.mode === 'local' && app.api.getDb().sales.length === demo.sales.length, 'sem nuvem: modo local com dados locais');
  check(app.api.build().includes('Só neste aparelho'), 'chip só neste aparelho');
  // 12) cache de nuvem sem conexão -> leitura
  app = await boot({ cloudCache: demo, noClaude: true, fake: null });
  check(app.api.Cloud.mode === 'offline', 'sem conexão com cache: somente leitura');


  // 13) ajustes antigos na nuvem (mensagem antiga, sem link) são atualizados uma única vez
  fake = makeFake();
  fake.store['settings/main'] = { v: 1, flavors: demo.flavors, settings: { template: 'Oi, {nome}! Agradecemos por comprar na Vora Cookies. Esperamos que você goste muito! Se puder, conta pra gente o que achou: {link}', reviewLink: '' } };
  app = await boot({ fake }); await tick(10);
  check(fake.store['settings/main'].settings.reviewLink === 'https://g.page/r/TESTE/review', 'nuvem: link de avaliação preenchido');
  check(fake.store['settings/main'].settings.template.includes('@voracookies'), 'nuvem: mensagem com Instagram');
  app.api.inp.lnk(el({}, { value: '' })); await tick(10);
  const app3 = await boot({ fake }); await tick(10);
  check(fake.store['settings/main'].settings.reviewLink === '', 'link apagado de propósito não volta sozinho');
  console.log(fails ? 'FALHAS: ' + fails : 'TODOS OS TESTES DA NUVEM PASSARAM');
})();
