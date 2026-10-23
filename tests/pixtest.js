const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
const timers = [];
global.setTimeout = f => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api;
const flush = () => { while (timers.length) timers.shift()(); };
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});
const dec = h => decodeURIComponent((h.match(/text=([^"]+)/) || [])[1] || '');

api.setDb(api.demoData()); api.Cloud.mode = 'local';
let db = api.getDb();
check(db.settings.pixKey === '11999990000', 'chave Pix padrão = 11999990000');

// 1) Nova venda "pagar depois" com celular: aparece "Salvar e enviar Pix" com a mensagem do pedido
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Helena Prado'; ui.nova.phone = '11 91111-2222'; ui.nova.items = { nutella: 2, redvelvet: 1 }; ui.nova.paidNow = false;
let h = api.build();
check(h.includes('Salvar e enviar Pix') && h.includes('wa.me/5511911112222'), 'botão "Salvar e enviar Pix" com link do WhatsApp');
const msg = dec(h.match(/href="(https:\/\/wa\.me[^"]+)"/)[1].replace(/&amp;/g, '&'));
console.log('--- mensagem enviada ---\n' + msg + '\n------------------------');
check(msg.includes('Oi, Helena!') && msg.includes('2x Nutella — R$ 31,80') && msg.includes('1x Red Velvet — R$ 22,00') && msg.includes('Total: R$ 53,80') && msg.includes('11999990000'), 'mensagem tem nome, itens, total e chave Pix');
// pago agora: não oferece cobrança
ui.nova.paidNow = true; h = api.build(); check(!h.includes('Salvar e enviar Pix'), 'pago agora: sem botão de cobrança');
ui.nova.paidNow = false; ui.nova.phone = ''; h = api.build(); check(!h.includes('Salvar e enviar Pix') && h.includes('Informe o celular para enviar o pedido e o Pix'), 'sem celular: pede o celular');
ui.nova.phone = '11 91111-2222';
// clicar na âncora: salva a venda com marca de cobrança
const n0 = db.sales.length; let prevented = false;
a.novaCharge(el({}), { preventDefault: () => { prevented = true; } }); flush(); db = api.getDb();
check(!prevented && db.sales.length === n0 + 1, 'clique salva a venda sem bloquear o link');
const s1 = db.sales[db.sales.length - 1];
check(s1.charge === 'sent' && s1.paid === false && s1.cents === 5380, 'venda: cobrança enviada, a receber, R$ 53,80');
ui.screen = 'vendas'; h = api.build(); check(h.includes('Cobrança enviada') && h.includes('Cobrar Pix'), 'Vendas mostra "Cobrança enviada" e botão "Cobrar Pix"');
// reenviar cobrança em venda pendente de outro dia (Histórico)
const lucas = db.sales.find(s => s.name === 'Lucas Martins' && !s.paid);
a.chargeSale(el({ id: lucas.id })); flush(); check(api.getDb().sales.find(s => s.id === lucas.id).charge === 'sent', '"Cobrar Pix" marca cobrança enviada');

// 2) Conferir Pix
const pend = () => api.getDb().sales.filter(s => !s.paid);
const carlos = pend().find(s => s.name === 'Carlos Lima' && s.date === api.today());      // R$ 36,00
const juliana = pend().find(s => s.name === 'Juliana Reis' && s.date === api.today());    // R$ 44,00
const thiago = pend().find(s => s.name === 'Thiago Ribeiro');                              // R$ 119,80
const helena = pend().find(s => s.name === 'Helena Prado');                                // R$ 53,80
console.log('pendentes:', pend().map(s => s.name + ' ' + s.cents).join(' | '));
const sms = `Voce recebeu um Pix de R$ 36,00 de CARLOS EDUARDO LIMA em 12/10.

Pix recebido: R$ 44,00 enviado por JULIANA R REIS

Voce recebeu um Pix de R$ 99,99 de FULANO TAL

Pix enviado R$ 12,00 para PADARIA XYZ`;
let entries = api.parseBank(sms);
check(entries.length === 3, 'SMS: 3 recebimentos (ignora Pix enviado) -> ' + entries.length);
let res = api.matchEntries(entries);
check(res.matches.length === 2 && res.unmatched.length === 1, 'SMS: 2 sugestões e 1 sem correspondência');
check(res.matches.every(m => m.level === 'alta' && m.checked), 'SMS: nome e valor batem');
check(res.matches.find(m => m.sid === carlos.id) && res.matches.find(m => m.sid === juliana.id), 'SMS: Carlos e Juliana sugeridos');
// CSV
const csv = `Data;Descrição;Valor;Saldo
12/10/2026;PIX RECEBIDO THIAGO RIBEIRO;119,80;1.350,22
12/10/2026;PIX ENVIADO FORNECEDOR;-80,00;1.270,22
12/10/2026;COMPRA CARTAO MERCADO;-45,10;1.225,12`;
entries = api.parseBank(csv); res = api.matchEntries(entries);
check(entries.length === 1 && res.matches.length === 1 && res.matches[0].sid === thiago.id, 'CSV: só crédito, bate com Thiago 119,80');
// OFX
const ofx = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261012<TRNAMT>53.80<MEMO>PIX RECEBIDO HELENA PRADO</STMTTRN><STMTTRN><TRNTYPE>DEBIT<TRNAMT>-20.00<MEMO>PIX ENVIADO</STMTTRN></BANKTRANLIST></OFX>`;
entries = api.parseBank(ofx); res = api.matchEntries(entries);
check(entries.length === 1 && res.matches[0].sid === helena.id && res.matches[0].level === 'alta', 'OFX: crédito 53,80 -> Helena');
// valor igual, nome não confere -> pede conferência; mesmo valor em dois -> ambígua
res = api.matchEntries(api.parseBank('Pix recebido R$ 36,00 de ZEZINHO'));
check(res.matches[0].level === 'valor' && res.matches[0].checked, 'só o valor bate: sugere, pede conferir o nome');
db = api.getDb(); const dup = Object.assign({}, db.sales.find(s => s.id === carlos.id), { id: 'dupX', customerId: null, name: 'Outra Pessoa' }); db.sales.push(dup);
res = api.matchEntries(api.parseBank('Pix recebido R$ 36,00 de ZEZINHO'));
check(res.matches[0].level === 'ambigua' && !res.matches[0].checked && res.matches[0].cands.length === 2, 'mesmo valor em duas vendas: ambígua, não marca sozinha');
db.sales = db.sales.filter(s => s.id !== 'dupX');

// 3) tela + fluxo de baixa
ui.screen = 'conferir'; ui.conf = { text: sms, res: null }; h = api.build(); check(h.includes('Analisar e sugerir baixas'), 'tela Conferir Pix');
a.conferirRun(); h = api.build(); check(h.includes('Nome e valor batem') && h.includes('Marcar 2 vendas como pagas no Pix'), 'sugestões na tela');
a.conferirAsk(); check(ui.sheet && ui.sheet.type === 'confirm' && ui.sheet.text.includes('R$ 80,00'), 'pede confirmação (2 vendas, R$ 80,00)');
a.confirmYes(); db = api.getDb();
check(db.sales.find(s => s.id === carlos.id).paid && db.sales.find(s => s.id === carlos.id).method === 'Pix' && db.sales.find(s => s.id === juliana.id).paid, 'vendas baixadas como Pix');
check(ui.screen === 'vendas', 'volta para Vendas');
// nada mudou nas outras vendas pendentes
check(!db.sales.find(s => s.id === thiago.id).paid, 'outras pendências intactas');
// ajustes
ui.screen = 'ajustes'; h = api.build(); check(h.includes('Pix e cobrança') && h.includes('11999990000'), 'Ajustes mostra chave Pix e modelo do pedido');
api.inp.pixKey(el({}, { value: 'chave@exemplo.com' })); check(api.getDb().settings.pixKey === 'chave@exemplo.com', 'chave Pix editável');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES PIX PASSARAM');
