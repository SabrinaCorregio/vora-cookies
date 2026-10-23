const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
const timers = []; global.setTimeout = f => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api;
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});
const waText = h => decodeURIComponent((h.match(/href="(https:\/\/wa\.me[^"]+)"/) || [])[1].replace(/&amp;/g, '&').split('text=')[1]);
const svgOf = h => (h.match(/<svg[^>]*aria-label="QR Code do Pix"[\s\S]*?<\/svg>/) || [''])[0];
api.setDb(api.demoData()); api.Cloud.mode = 'local';
let db = api.getDb(); const hoje = api.today();
const carlos = db.customers.find(c => c.name === 'Carlos Lima');
const pendDe = () => api.getDb().sales.filter(s => s.customerId === carlos.id && !s.paid);
check(pendDe().length === 2 && pendDe().reduce((a, s) => a + s.cents, 0) === 9990, 'Carlos tem 2 pendências somando R$ 99,90');

// 1) Nova venda: pendência entra no total, no QR e no rodapé
ui.nova = api.freshNova(); ui.screen = 'nova'; a.novaPick(el({ cid: carlos.id })); ui.nova.items = { brownbutter: 1 };
let h = api.build();
check(h.includes('Incluir a pendência no pagamento desta venda') && /data-act="novaIncl" checked/.test(h), 'caixa "Incluir a pendência" marcada por padrão');
check(h.includes('Esta compra R$ 12,00 + pendência R$ 99,90 = R$ 111,90'), 'mostra compra + pendência = total');
check(h.includes('QR Code do Pix · R$ 111,90') && h.includes('Compra R$ 12,00 + pendências R$ 99,90'), 'QR do Pix sai com o total (R$ 111,90)');
check(h.includes('>R$ 111,90</div>') && h.includes('inclui R$ 99,90 de pendências'), 'rodapé: total R$ 111,90 "inclui R$ 99,90 de pendências"');
fs.writeFileSync('/tmp/pend_qr.svg', svgOf(h));
// desmarcar
a.novaIncl(el({}, { checked: false })); h = api.build();
check(h.includes('QR Code do Pix · R$ 12,00') && !h.includes('inclui R$ 99,90 de pendências'), 'desmarcando: total volta para R$ 12,00');
a.novaIncl(el({}, { checked: true }));
// cliente sem pendência não mostra a caixa
ui.nova = api.freshNova(); a.novaPick(el({ cid: db.customers.find(c => c.name === 'Mariana Souza').id })); ui.nova.items = { nutella: 1 };
h = api.build(); check(!h.includes('Incluir a pendência') && h.includes('QR Code do Pix · R$ 15,90'), 'sem pendência: nada muda');

// 2) PAGO AGORA: salva a venda e dá baixa nas pendências juntas
ui.nova = api.freshNova(); ui.screen = 'nova'; a.novaPick(el({ cid: carlos.id })); ui.nova.items = { brownbutter: 1 }; ui.nova.method = 'Pix';
a.novaSave(); db = api.getDb(); const nv = db.sales[db.sales.length - 1];
check(nv.paid && nv.cents === 1200 && nv.method === 'Pix', 'nova venda (R$ 12,00) salva como paga');
check(pendDe().length === 0, 'pendências do Carlos baixadas junto');
const antigas = db.sales.filter(s => s.customerId === carlos.id && s.paidVia === 'junto:' + nv.id);
check(antigas.length === 2 && antigas.every(s => s.paid && s.method === 'Pix'), 'as 2 antigas ficam pagas no Pix, ligadas à nova venda');
check(ui.sheet && ui.sheet.type === 'thanks' && ui.sheet.head.includes('R$ 111,90') && ui.sheet.head.includes('baixadas junto'), 'aviso: R$ 111,90 e pendências baixadas junto');

// 3) PAGAR DEPOIS: a venda guarda as pendências incluídas; cobrança e QR com o total
api.setDb(api.demoData()); api.Cloud.mode = 'local'; db = api.getDb();
const carlos2 = db.customers.find(c => c.name === 'Carlos Lima');
ui.nova = api.freshNova(); ui.screen = 'nova'; a.novaPick(el({ cid: carlos2.id })); ui.nova.items = { brownbutter: 1 }; ui.nova.paidNow = false;
h = api.build(); check(h.includes('Salvar e enviar Pix'), 'pagar depois: "Salvar e enviar Pix"');
const msg = waText(h);
console.log('--- mensagem ---\n' + msg + '\n---------------');
check(msg.includes('• 1x Brown Butter — R$ 12,00') && msg.includes('Pendências anteriores:') && msg.includes('Total: R$ 111,90'), 'mensagem lista a compra, as pendências e o total R$ 111,90');
check(/• 09\/\d\d: .*— R\$ 63,90/.test(msg) || msg.includes('R$ 63,90'), 'pendência de sexta (R$ 63,90) aparece na mensagem');
a.novaCharge(el({}), { preventDefault() {} }); timers.pop()(); db = api.getDb();
const nv2 = db.sales[db.sales.length - 1];
check(!nv2.paid && nv2.incl && nv2.incl.length === 2 && nv2.charge === 'sent', 'venda pendente guarda as 2 pendências incluídas');
check(db.sales.filter(s => s.customerId === carlos2.id && !s.paid).length === 3, 'nenhuma pendência baixada ainda (3 abertas)');
ui.screen = 'vendas'; h = api.build();
check(h.includes('Inclui 2 pendências anteriores (R$ 99,90) · total a receber R$ 111,90'), 'cartão mostra "Inclui 2 pendências ... total a receber R$ 111,90"');
const card = h.split('class="scard').find(c => c.includes('R$ 12,00') && c.includes('Inclui 2'));
check(card && waText(card).includes('Total: R$ 111,90'), 'botão "Cobrar Pix" do cartão cobra o total');
a.qrOpen(el({ id: nv2.id })); h = api.build();
check(ui.sheet.cents === 11190 && h.includes('R$ 111,90') && h.includes('Inclui 2 pendências anteriores: R$ 99,90'), 'QR do cartão: R$ 111,90 com a nota das pendências');
a.qrPaid(); h = api.build(); check(h.includes('R$ 111,90') && h.includes('Todas serão baixadas juntas'), 'baixa: mostra o total e avisa que baixa tudo junto');
a.payNext(); h = api.build(); check(h.includes('<div class="n">R$ 111,90</div>') && h.includes('Inclui 2 pendências anteriores'), 'confirmação 2: R$ 111,90 e as pendências');
a.payConfirm(); db = api.getDb();
check(db.sales.filter(s => s.customerId === carlos2.id && !s.paid).length === 0, 'confirmar baixa dá baixa nas 3 vendas');
check(ui.sheet && ui.sheet.type === 'thanks' ? true : ui.toast.html.includes('3 vendas'), 'oferece agradecimento / avisa 3 vendas');

// 4) CONFERIR PIX: um Pix de R$ 111,90 baixa a venda e as pendências juntas
api.setDb(api.demoData()); api.Cloud.mode = 'local'; db = api.getDb();
const c3 = db.customers.find(c => c.name === 'Carlos Lima');
ui.nova = api.freshNova(); a.novaPick(el({ cid: c3.id })); ui.nova.items = { brownbutter: 1 }; ui.nova.paidNow = false; a.novaSave();
let res = api.matchEntries(api.parseBank('Voce recebeu um Pix de R$ 111,90 de CARLOS EDUARDO LIMA'));
check(res.matches.length === 1 && res.matches[0].ids.length === 3 && res.matches[0].level === 'alta', 'Pix de R$ 111,90 -> venda + 2 pendências ("Nome e valor batem")');
ui.screen = 'conferir'; ui.conf = { text: 'Voce recebeu um Pix de R$ 111,90 de CARLOS EDUARDO LIMA', res: null, images: [], pix: [], busy: null };
a.conferirRun(); h = api.build(); check(h.includes('+ 2 pendências anteriores') && h.includes('Marcar 3 vendas como pagas no Pix'), 'tela: "Marcar 3 vendas como pagas no Pix"');
a.conferirAsk(); check(ui.sheet.text.includes('3 vendas') && ui.sheet.text.includes('R$ 111,90'), 'confirmação: 3 vendas, R$ 111,90'); a.confirmYes();
check(api.getDb().sales.filter(s => s.customerId === c3.id && !s.paid).length === 0, 'baixa em lote concluída');
// pagamento só das pendências antigas (R$ 99,90) sem a venda nova
api.setDb(api.demoData()); api.Cloud.mode = 'local';
res = api.matchEntries(api.parseBank('Pix recebido R$ 99,90 de CARLOS LIMA'));
check(res.matches.length === 1 && res.matches[0].ids.length === 2, 'Pix de R$ 99,90 = todas as pendências do cliente (2)');

// 5) modelos personalizados sem {pendencias} continuam coerentes
api.setDb(api.demoData()); api.Cloud.mode = 'local'; db = api.getDb();
db.settings.orderTemplate = 'Pedido:\n{itens}\nTotal {total}';
const c4 = db.customers.find(c => c.name === 'Thiago Ribeiro');
ui.nova = api.freshNova(); ui.screen = 'nova'; a.novaPick(el({ cid: c4.id })); ui.nova.items = { kinder: 1 }; ui.nova.paidNow = false; ui.nova.method = 'Pix';
const m2 = waText(api.build());
check(m2.includes('Pendências anteriores:') && m2.includes('Total R$ 141,80'), 'modelo antigo: pendências entram junto dos itens e o total é R$ 141,80 (22,00 + 119,80)');
// 6) atualização do modelo padrão em dados antigos
const vel = api.defaults(); vel.settings = { template: vel.settings.template, reviewLink: 'x', pixKey: '1', pixPayload: vel.settings.pixPayload, upg1: true, orderTemplate: 'Oi, {nome}! Segue o seu pedido na Vora Cookies:\n\n{itens}\n\nTotal: {total}\n\nPara pagar, use o Pix (chave celular):\n{pix}\n\nDepois é só enviar o comprovante por aqui. Qualquer dúvida, é só chamar!' };
const mig = api.migrateSettingsForTest ? null : null;
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE PENDÊNCIA PASSARAM');
