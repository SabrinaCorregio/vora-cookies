const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const clone = o => JSON.parse(JSON.stringify(o));

function makeFake() {
  const store = {}, listeners = []; let fromCache = false;
  const snapDoc = p => ({ id: p.split('/').pop(), exists: store[p] !== undefined, data: () => clone(store[p]), fromCache });
  const snapCol = c => ({ docs: Object.keys(store).filter(k => k.startsWith(c + '/')).map(k => ({ id: k.split('/')[1], data: () => clone(store[k]) })), fromCache });
  const notify = () => listeners.forEach(l => l.next(l.type === 'doc' ? snapDoc(l.p) : snapCol(l.p)));
  let writes = 0;
  const api = {
    doc: p => ({ set: async d => { writes++; store[p] = clone(d); notify(); }, delete: async () => { writes++; delete store[p]; notify(); },
      onSnapshot: next => { const l = { type: 'doc', p, next }; listeners.push(l); Promise.resolve().then(() => next(snapDoc(p))); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; } }),
    collection: c => ({ onSnapshot: next => { const l = { type: 'col', p: c, next }; listeners.push(l); Promise.resolve().then(() => next(snapCol(c))); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; } })
  };
  return { api, store, notify, writes: () => writes, setCache: v => { fromCache = v; }, listenerCount: () => listeners.length };
}

async function boot(opts = {}) {
  const ls = {};
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; }, removeItem: k => { delete ls[k]; } };
  global.setTimeout = f => { return 0; }; global.clearTimeout = () => {};
  global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
  const fake = makeFake(); let authCb = null, user = null;
  const P = {
    configured: opts.configured !== false, sdkFailed: !!opts.sdkFailed,
    auth: {
      onChange: cb => { authCb = cb; return () => {}; },
      signIn: async (e, p) => { if (p !== 'segredo') throw { code: 'auth/invalid-credential' }; user = { email: e, name: 'Gustavo' }; authCb(user); },
      reset: async e => { if (e === 'x@y.com') throw { code: 'auth/user-not-found' }; },
      signOut: async () => { user = null; authCb(null); }
    },
    use: async name => name === 'db' ? (user ? fake.api : null) : name === 'user' ? (user ? { me: async () => ({ name: user.name }), can: async () => true } : null) : null
  };
  global.window = { __VORA_TEST: {}, __voraPlatform: P };
  eval(src);
  const api = window.__VORA_TEST.api;
  return { api, ls, fake, emit: u => { user = u; authCb(u); }, P };
}
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});

(async () => {
  // 1) começa carregando, depois mostra o login (sem dados do app)
  let t = await boot(); let { api } = t; const { ui, a, inp } = api;
  check(api.Auth.required && api.Auth.status === 'loading' && api.build().includes('Carregando'), 'abre em "Carregando…" até saber se há login');
  t.emit(null); await tick();
  let h = api.build();
  check(api.Auth.status === 'out' && h.includes('id="lemail"') && h.includes('id="lpass"') && h.includes('Entrar') && !h.includes('Nova venda'), 'sem login: só a tela de entrada');
  // 2) erros de login
  a.login(); check(api.Auth.error === 'Informe o e-mail e a senha.', 'campos vazios: pede e-mail e senha');
  inp.loginEmail(el({}, { value: 'eu@exemplo.com' })); inp.loginPass(el({}, { value: 'errada' })); a.login(); await tick();
  check(api.Auth.error === 'E-mail ou senha incorretos.' && !api.Auth.busy && api.build().includes('E-mail ou senha incorretos.'), 'senha errada: mensagem clara');
  a.resetPass(); inp.loginEmail(el({}, { value: '' })); a.resetPass(); check(api.Auth.error.includes('Digite seu e-mail'), 'esqueci a senha sem e-mail: pede o e-mail');
  inp.loginEmail(el({}, { value: 'x@y.com' })); a.resetPass(); await tick(); check(api.Auth.error === 'E-mail ou senha incorretos.', 'conta inexistente: não revela se existe (mensagem genérica)');
  inp.loginEmail(el({}, { value: 'eu@exemplo.com' })); a.resetPass(); await tick(); check(api.Auth.info.includes('Enviamos um e-mail'), 'esqueci a senha: confirma o envio');
  // 3) login correto abre o app e conecta ao banco
  inp.loginPass(el({}, { value: 'segredo' })); a.login(); await tick(20);
  check(api.Auth.status === 'in' && api.Cloud.mode === 'online', 'login correto: entra e conecta ao banco');
  ui.screen = 'hoje'; h = api.build(); check(h.includes('Hoje') && h.includes('Online · sincronizado') && !h.includes('id="lemail"'), 'mostra o app já sincronizado');
  check(!!t.fake.store['settings/main'], 'cria os ajustes na nuvem na primeira vez');
  // 4) conta e sair
  ui.screen = 'ajustes'; h = api.build(); check(h.includes('Conectado como <b>Gustavo</b>') && h.includes('Sair da conta'), 'Ajustes mostra a conta e o botão "Sair da conta"');
  t.ls['vora.cloud.cache.v1'] = '{"x":1}';
  a.logout(); await tick(10);
  check(api.Auth.status === 'out' && api.build().includes('id="lemail"') && !t.ls['vora.cloud.cache.v1'] && api.getDb().sales.length === 0, 'sair: volta ao login e apaga o cache local');
  check(t.fake.listenerCount() === 0, 'sair: encerra a escuta do banco');
  // 5) outra pessoa entra no mesmo aparelho: não vê nada da anterior até o banco responder
  t.fake.store['sales/s1'] = { id: 's1', date: api.today(), time: '10:00', customerId: null, name: 'Fulana', items: { nutella: 1 }, prices: { nutella: 1590 }, cents: 1590, paid: true, method: 'Pix' };
  inp.loginEmail(el({}, { value: 'sabrina@exemplo.com' })); inp.loginPass(el({}, { value: 'segredo' })); a.login(); await tick(20);
  check(api.Cloud.mode === 'online' && api.getDb().sales.length === 1, 'novo login carrega os dados da nuvem');

  // 6) sem configuração / sem SDK
  t = await boot({ configured: false }); t.emit(null); await tick();
  check(t.api.build().includes('Falta configurar o Firebase') && !t.api.build().includes('id="lemail"'), 'Firebase não configurado: avisa o que fazer');
  t = await boot({ sdkFailed: true }); t.emit(null); await tick();
  check(t.api.build().includes('Sem conexão') && t.api.build().includes('Tentar de novo'), 'SDK não carregou (sem internet): mensagem e botão');

  // 7) SEGURANÇA: cache vazio sem servidor não pode sobrescrever os dados reais
  t = await boot(); t.fake.setCache(true); t.fake.store = t.fake.store; t.emit({ email: 'a@b.com', name: 'A' }); await tick(20);
  check(t.api.Cloud.mode === 'connecting' && !t.api.Cloud.ready && t.fake.writes() === 0, 'aparelho novo sem internet (cache vazio): fica "conectando" e NÃO grava nada');
  t.fake.setCache(false); t.fake.store['settings/main'] = { v: 1, flavors: t.api.defaults().flavors, settings: { template: 'x', reviewLink: 'real', pixKey: 'real', orderTemplate: t.api.defaults().settings.orderTemplate, upg1: true, upg2: true } };
  t.fake.notify(); await tick(20);
  check(t.api.Cloud.mode === 'online' && t.api.getDb().settings.pixKey === 'real', 'quando o servidor responde, usa os dados reais (sem sobrescrever)');
  // cache com dados + sem servidor: abre com os dados guardados
  t = await boot(); t.fake.setCache(true); t.fake.store['settings/main'] = { v: 1, flavors: t.api.defaults().flavors, settings: { template: 'x', reviewLink: '', pixKey: 'cache', orderTemplate: 'y', upg1: true, upg2: true } };
  t.emit({ email: 'a@b.com', name: 'A' }); await tick(20);
  check(t.api.Cloud.mode === 'online' && t.api.getDb().settings.pixKey === 'cache', 'offline com cache: abre com os últimos dados');
  console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE LOGIN PASSARAM');
  process.exitCode = fails ? 1 : 0;
})();
