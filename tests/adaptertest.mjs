import { createPlatform } from '../js/firebase-adapter.js';
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

function fakeSdk() {
  const calls = [], subs = {}; let authCb = null;
  const sdk = {
    calls, subs,
    initializeApp: (c) => { calls.push(['initializeApp', c.projectId]); return { app: 1 }; },
    getAuth: () => ({ auth: 1 }),
    initializeFirestore: (app, opts) => { calls.push(['initializeFirestore', !!opts.localCache]); return { db: 1 }; },
    getFirestore: () => ({ db: 2 }),
    persistentLocalCache: (o) => ({ cache: o }),
    persistentMultipleTabManager: () => ({ tabs: 1 }),
    doc: (db, path) => ({ kind: 'doc', path }),
    collection: (db, name) => ({ kind: 'col', name }),
    setDoc: async (ref, data) => { calls.push(['setDoc', ref.path, data]); },
    deleteDoc: async (ref) => { calls.push(['deleteDoc', ref.path]); },
    onSnapshot: (ref, next, err) => { const key = ref.kind === 'doc' ? ref.path : ref.name; subs[key] = { next, err }; return () => { calls.push(['unsub', key]); }; },
    onAuthStateChanged: (auth, cb) => { authCb = cb; return () => {}; },
    signInWithEmailAndPassword: async (auth, e, p) => { calls.push(['signIn', e]); return {}; },
    sendPasswordResetEmail: async (auth, e) => { calls.push(['reset', e]); },
    signOut: async () => { calls.push(['signOut']); },
    terminate: async () => { calls.push(['terminate']); },
    clearIndexedDbPersistence: async () => { calls.push(['clearCache']); },
    emitAuth: (u) => authCb(u)
  };
  return sdk;
}
const cfg = { apiKey: 'k', projectId: 'p', appId: 'a' };

// configuração
let p = createPlatform(null, { apiKey: '' }); check(p.configured === false && p.sdkFailed === false, 'sem chave: não configurado');
p = createPlatform(null, cfg); check(p.configured === false && p.sdkFailed === true, 'SDK não carregou: sdkFailed');
let sdk = fakeSdk(); p = createPlatform(sdk, cfg);
check(p.configured && sdk.calls.some(c => c[0] === 'initializeFirestore' && c[1] === true), 'configurado, com cache local do Firestore (uso sem sinal)');

// login e identidade
let seen = []; p.auth.onChange((u) => seen.push(u));
check(await p.use('db') === null && await p.use('user') === null, 'antes do login: sem banco e sem usuário');
sdk.emitAuth({ uid: 'u1', email: 'eu@exemplo.com', displayName: null });
check(seen[0] && seen[0].email === 'eu@exemplo.com' && seen[0].name === 'eu@exemplo.com', 'onChange entrega e-mail e nome (usa o e-mail se não há nome)');
const u = await p.use('user'); check((await u.me()).name === 'eu@exemplo.com' && (await u.can('data.write')) === true, 'use("user"): quem sou e permissão');
check(await p.use('sample') === null, 'leitura de prints por IA não existe nesta versão');
await p.auth.signIn('a@b.com', 'x'); await p.auth.reset('a@b.com');
check(sdk.calls.some(c => c[0] === 'signIn' && c[1] === 'a@b.com') && sdk.calls.some(c => c[0] === 'reset'), 'signIn e reset chamam o Firebase');

// banco: gravar, apagar e escutar
const db = await p.use('db'); check(!!db, 'depois do login: banco disponível');
await db.doc('sales/abc').set({ cents: 100 }); await db.doc('sales/abc').delete();
check(sdk.calls.some(c => c[0] === 'setDoc' && c[1] === 'sales/abc' && c[2].cents === 100) && sdk.calls.some(c => c[0] === 'deleteDoc' && c[1] === 'sales/abc'), 'set e delete do documento');
let got = null; const unsub = db.doc('settings/main').onSnapshot((s) => { got = s; });
sdk.subs['settings/main'].next({ exists: () => true, id: 'main', data: () => ({ a: 1 }), metadata: { fromCache: true } });
check(got.exists === true && got.id === 'main' && got.data().a === 1 && got.fromCache === true, 'snapshot de documento: exists vira booleano e traz fromCache');
sdk.subs['settings/main'].next({ exists: () => false, id: 'main', data: () => undefined, metadata: { fromCache: false } });
check(got.exists === false && got.fromCache === false, 'documento inexistente');
let col = null; db.collection('sales').onSnapshot((s) => { col = s; });
sdk.subs['sales'].next({ docs: [{ id: 'x1', data: () => ({ n: 1 }) }, { id: 'x2', data: () => ({ n: 2 }) }], metadata: { fromCache: false } });
check(col.docs.length === 2 && col.docs[1].id === 'x2' && col.docs[1].data().n === 2 && col.fromCache === false, 'snapshot de coleção: lista de {id, data()}');
let erro = null; db.collection('days').onSnapshot(() => {}, (e) => { erro = e; }); sdk.subs['days'].err({ code: 'permission-denied' });
check(erro && erro.code === 'permission-denied', 'erros do Firebase chegam ao app com o código original');
unsub(); check(sdk.calls.some(c => c[0] === 'unsub' && c[1] === 'settings/main'), 'cancelar a escuta funciona');

// sair: limpa o cache de dados do aparelho
global.location = { reload: () => { sdk.calls.push(['reload']); } };
await p.auth.signOut();
const ordem = sdk.calls.map(c => c[0]).filter(n => ['signOut', 'terminate', 'clearCache', 'reload'].includes(n)).join(',');
check(ordem === 'signOut,terminate,clearCache,reload', 'sair: encerra login, limpa o cache local e recarrega (' + ordem + ')');

// quando persistência não existe, usa getFirestore
const sdk2 = fakeSdk(); sdk2.initializeFirestore = () => { throw new Error('indisponível'); };
p = createPlatform(sdk2, cfg); sdk2.emitAuth; check(p.configured === true, 'sem cache local disponível: cai para o Firestore simples');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DO ADAPTADOR PASSARAM');
process.exitCode = fails ? 1 : 0;
