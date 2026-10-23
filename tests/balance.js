const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
const appEl = { innerHTML: '', querySelector: () => null, contains: () => false };
global.document = { getElementById: id => (id === 'app' ? appEl : null), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
global.setTimeout = () => 0; global.clearTimeout = () => {};
eval(src);
const api = window.__VORA_TEST.api, ui = api.ui;
function bal(h) { return [(h.match(/<div[\s>]/g) || []).length, (h.match(/<\/div>/g) || []).length, (h.match(/<button[\s>]/g) || []).length, (h.match(/<\/button>/g) || []).length]; }
let bad = 0;
for (const demo of [false, true]) {
  api.setDb(demo ? api.demoData() : api.defaults());
  for (const s of ['hoje', 'nova', 'vendas', 'historico', 'fechar', 'clientes', 'relatorios', 'ajustes']) {
    for (const extra of [null, 'prod', 'cust']) {
      ui.screen = s; ui.sheet = extra === 'prod' ? { type: 'prod', draft: {} } : extra === 'cust' ? { type: 'cust', cid: null, name: '', phone: '' } : null;
      if (s === 'relatorios') ui.rPeriod = '7d';
      const h = api.build(); const b = bal(h);
      const ok = b[0] === b[1] && b[2] === b[3];
      if (!ok) { bad++; console.log('DESBALANCEADO', demo, s, extra, b); }
    }
  }
}
ui.sheet = null; ui.screen = 'relatorios'; ui.rPeriod = 'hoje'; api.setDb(api.demoData()); let b = bal(api.build()); console.log('relatorios hoje', b);
ui.rPeriod = 'outro'; b = bal(api.build()); console.log('relatorios outro', b);
console.log(bad ? 'PROBLEMAS: ' + bad : 'TODAS AS TELAS BALANCEADAS');
