const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
const handlers = {};
const appEl = { innerHTML: '', querySelector: () => null, contains: () => false };
global.document = {
  getElementById: id => (id === 'app' ? appEl : null),
  querySelector: () => null,
  activeElement: null,
  addEventListener: (t, f) => { handlers[t] = f; }
};
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
global.setTimeout = (f) => 0; global.clearTimeout = () => {};
eval(src);
const api = window.__VORA_TEST.api;
const { ui, a } = api;
function el(attrs, extra) { return Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {}); }
function check(cond, msg) { if (!cond) { console.log('FAIL:', msg); process.exitCode = 1; } else console.log('ok  :', msg); }

// 1) telas com banco vazio
for (const s of ['hoje', 'nova', 'vendas', 'historico', 'fechar', 'clientes', 'relatorios', 'ajustes']) {
  ui.screen = s; let h = api.build(); check(h.length > 200, 'tela vazia ' + s);
}
// 2) dados de exemplo
api.setDb(api.demoData());
for (const s of ['hoje', 'nova', 'vendas', 'historico', 'fechar', 'clientes', 'relatorios', 'ajustes']) {
  ui.screen = s; let h = api.build(); check(h.length > 500 && !h.includes('undefined') && !h.includes('NaN'), 'tela demo ' + s + ' (' + h.length + ')');
}
ui.screen = 'hoje'; let h = api.build();
check(h.includes('R$ 193,50') && h.includes('R$ 111,80'), 'Hoje: recebido 193,50 e a receber 111,80');
check(/<div class="n">38<\/div><div class="l">Prontos/.test(h) && /<div class="n">19<\/div><div class="l">Vendidos/.test(h), 'Hoje: 38 prontos / 19 vendidos');
check(h.includes('R$ 243,60'), 'Hoje: pendências de dias anteriores 243,60');
// 3) vendas: ordem pendentes primeiro alfabética
ui.screen = 'vendas'; h = api.build();
const iB = h.indexOf('Beatriz Nunes'), iC = h.indexOf('Carlos Lima'), iJ = h.indexOf('Juliana Reis'), iA = h.indexOf('Ana Paula');
check(iB < iC && iC < iJ && iJ < iA, 'Vendas: pendentes (Beatriz, Carlos, Juliana) antes das pagas');
// 4) pagar com dupla confirmação
let db = api.getDb();
const carlos = db.sales.find(s => s.date === api.today() && s.name === 'Carlos Lima');
a.payStart(el({ id: carlos.id })); check(ui.sheet.type === 'pay1', 'pay1 aberto');
a.payMethod(el({ m: 'Dinheiro' })); a.payNext(); check(ui.sheet.type === 'pay2', 'pay2 aberto');
h = api.build(); check(h.includes('Confirme o recebimento'), 'texto de confirmação 2');
a.payConfirm(); db = api.getDb();
check(db.sales.find(s => s.id === carlos.id).paid === true && db.sales.find(s => s.id === carlos.id).method === 'Dinheiro', 'pagamento gravado');
// 5) desfazer
a.unpayStart(el({ id: carlos.id })); a.unpayNext(); h = api.build(); check(h.includes('Confirme de novo'), 'unpay2');
a.unpayConfirm(); check(api.getDb().sales.find(s => s.id === carlos.id).paid === false, 'desfeito');
// 6) editar venda
const beatriz = api.getDb().sales.find(s => s.date === api.today() && s.name === 'Beatriz Nunes');
a.editStart(el({ id: beatriz.id })); a.editInc(el({ id: 'doceleite' })); h = api.build();
a.editSave(); const b2 = api.getDb().sales.find(s => s.id === beatriz.id);
check(b2.items.doceleite === 3 && b2.cents === 3 * 1590, 'edição: 3 doce de leite = 47,70 (' + b2.cents + ')');
// 7) estoque cap: doce de leite produzido 6, vendido 3+2.. verificar cap
ui.nova = api.freshNova(); ui.screen = 'nova';
for (let i = 0; i < 10; i++) a.novaInc(el({ id: 'redvelvet' }));
check(ui.nova.items.redvelvet === 10 && api.build().includes('acima da produção'), 'sem bloqueio de estoque: 10 Red Velvet, avisa "acima da produção"');
// 8) nova venda com cliente existente e pendência
ui.nova = api.freshNova(); a.novaPick(el({ cid: api.getDb().customers.find(c => c.name === 'Thiago Ribeiro').id }));
h = api.build(); check(h.includes('Pendência: R$ 119,80'), 'aviso pendência Thiago 119,80');
a.novaInc(el({ id: 'brownbutter' })); a.novaInc(el({ id: 'brownbutter' })); a.novaPaid(el({ v: '0' }));
const n0 = api.getDb().sales.length; a.novaSave(); const db2 = api.getDb();
check(db2.sales.length === n0 + 1, 'venda salva'); const ns = db2.sales[db2.sales.length - 1];
check(ns.cents === 2400 && ns.paid === false && ns.thank === 'pending', 'venda nova 24,00 a receber, agradecimento pendente');
check(ui.screen === 'hoje' && ui.toast && !ui.toast.html.includes('wa.me'), 'pagar depois: sem link de agradecimento no aviso (fica na lista de vendas)');
// 9) cliente novo
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Roberta Alves'; ui.nova.phone = '11977776666'; ui.nova.items = { kinder: 1 };
h = api.build(); check(h.includes('Nenhum cliente com esse nome'), 'aviso cliente novo');
a.novaSave(); const rc = api.getDb().customers.find(c => c.name === 'Roberta Alves'); check(rc && rc.phone === '(11) 97777-6666', 'cliente cadastrado com telefone formatado');
// 10) produção
a.openProd(); a.prodInc(el({ id: 'redvelvet' })); a.prodInc(el({ id: 'redvelvet' })); a.prodSave();
check(api.getDb().days[api.today()].produced.redvelvet === 6, 'produção red velvet 4 -> 6');
a.openProd(); for (let i = 0; i < 30; i++) a.prodDec(el({ id: 'brownbutter' })); const soldBB = 7 + 2;
check(ui.sheet.draft.brownbutter === soldBB, 'produção não desce abaixo do vendido (' + ui.sheet.draft.brownbutter + ')'); a.closeSheet(el({}, { classList: { contains: () => false } }), {}); 
// 11) fechar caixa
ui.screen = 'fechar'; h = api.build(); check(h.includes('Fechar caixa de hoje'), 'fechar view');
a.fecharConfirm(); check(!!api.getDb().days[api.today()].closed, 'caixa fechado'); ui.screen = 'hoje'; h = api.build(); check(h.includes('Caixa fechado'), 'chip caixa fechado');
// 12) histórico dia com pendência + pagar dia anterior
const lucas = api.getDb().sales.find(s => s.name === 'Lucas Martins' && !s.paid);
ui.screen = 'historico'; ui.hDay = lucas.date; h = api.build(); check(h.includes('1 sem pagar') && h.includes('Marcar como pago'), 'histórico mostra pendência do dia ' + lucas.date);
a.payStart(el({ id: lucas.id })); a.payNext(); a.payConfirm(); ui.hDay = lucas.date; h = api.build(); check(h.includes('Todos pagaram'), 'histórico: dia passa a Todos pagaram');
// 13) relatórios
ui.screen = 'relatorios'; ui.rPeriod = '7d'; h = api.build(); check(h.includes('cbar'), 'relatórios com gráfico');
a.repDay(el({ d: api.today() })); h = api.build(); check(h.includes('Sabores vendidos'), 'relatórios por dia');
ui.rPeriod = 'outro'; h = api.build(); check(h.includes('type="date"'), 'relatórios período outro');
// 14) clientes
ui.screen = 'clientes'; h = api.build(); check(h.includes('Para agradecer') && h.includes('wa.me'), 'clientes com fila e wa.me');
// 15) ajustes inputs
ui.screen = 'ajustes'; api.inp.flPrice(el({ id: 'nutella' }, { value: '17,50' })); check(api.getDb().flavors[0].cents === 1750, 'preço editado 17,50');
api.inp.lnk(el({}, { value: 'https://g.page/r/abc' })); h = api.build(); ui.screen = 'clientes'; h = api.build(); check(h.includes('https://g.page/r/abc'), 'link de avaliação na mensagem');
// 16) exportar/importar
a.exportData(); check(ui.backup.length > 1000, 'exportação'); ui.importText = ui.backup; a.importAsk(); check(ui.sheet && ui.sheet.type === 'confirm', 'importar pede confirmação'); a.confirmYes();
check(api.getDb().sales.length > 40, 'importado');
console.log('done, exit', process.exitCode || 0);
