const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
function boot(ls0) {
  const ls = Object.assign({}, ls0);
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } };
  global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
  global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') }; global.setTimeout = () => 0; global.clearTimeout = () => {};
  eval(src); return window.__VORA_TEST.api;
}
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const OLD = 'Oi, {nome}! Segue o seu pedido na Vora Cookies:\n\n{itens}\n\nTotal: {total}\n\nPara pagar, use o Pix (chave celular):\n{pix}\n\nDepois é só enviar o comprovante por aqui. Qualquer dúvida, é só chamar!';
let api = boot({}); const base = api.defaults();
check(base.settings.orderTemplate.includes('{pendencias}'), 'instalação nova: modelo com {pendencias}');
// dados antigos (versão anterior): modelo do pedido antigo e sem upg2
const old = api.defaults(); old.settings = Object.assign({}, old.settings, { orderTemplate: OLD }); delete old.settings.upg2;
api = boot({ 'vora.cookies.v1': JSON.stringify(old) });
check(api.getDb().settings.orderTemplate.includes('{pendencias}'), 'dados antigos com o modelo padrão antigo: atualizado');
// personalizado: preservado
const cust = api.defaults(); cust.settings = Object.assign({}, cust.settings, { orderTemplate: 'Meu texto {itens} {total}' }); delete cust.settings.upg2;
api = boot({ 'vora.cookies.v1': JSON.stringify(cust) });
check(api.getDb().settings.orderTemplate === 'Meu texto {itens} {total}', 'modelo personalizado: preservado');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE ATUALIZAÇÃO PASSARAM');
