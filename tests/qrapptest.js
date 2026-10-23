const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
global.setTimeout = () => 0; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api;
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});
const BASE = '00020126330014BR.GOV.BCB.PIX0111119999900005204000053039865802BR5910LOJA TESTE6009SAO PAULO62070503***63047FB0';
const svgOf = h => (h.match(/<svg[^>]*aria-label="QR Code do Pix"[\s\S]*?<\/svg>/) || [''])[0];
api.setDb(api.demoData()); api.Cloud.mode = 'local';
check(api.getDb().settings.pixPayload === BASE, 'código do QR padrão = o do seu QR');

// Nova venda, pago agora + Pix: QR com o valor
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Helena'; ui.nova.items = { nutella: 2, redvelvet: 1 };
let h = api.build();
check(h.includes('QR Code do Pix · R$ 53,80') && h.includes('aria-label="QR Code do Pix"') && h.includes('Recebedor: LOJA TESTE'), 'Nova venda: QR do Pix de R$ 53,80 com o recebedor');
fs.writeFileSync('/tmp/app_qr_5380.svg', svgOf(h));
// sem itens, pagar depois ou outra forma: sem QR
ui.nova.items = {}; check(!api.build().includes('QR Code do Pix'), 'sem itens: sem QR');
ui.nova.items = { nutella: 1 }; ui.nova.paidNow = false; check(!api.build().includes('QR Code do Pix'), 'pagar depois: sem QR');
ui.nova.paidNow = true; ui.nova.method = 'Dinheiro'; check(!api.build().includes('QR Code do Pix'), 'dinheiro: sem QR');
ui.nova.method = 'Pix'; check(api.build().includes('QR Code do Pix · R$ 15,90'), 'QR acompanha o valor (R$ 15,90)');
// ampliar
a.qrBig(el({ c: '1590' })); h = api.build(); check(ui.sheet.type === 'qr' && h.includes('Pagar com Pix') && h.includes('R$ 15,90'), 'ampliar o QR');
a.closeSheet(el({}, { classList: { contains: () => false } }), {});
// venda pendente: botão QR Pix -> folha -> Recebi o Pix -> confirmação
ui.screen = 'vendas'; h = api.build(); check(h.includes('data-act="qrOpen"'), 'venda pendente tem botão "QR Pix"');
const carlos = api.getDb().sales.find(s => s.name === 'Carlos Lima' && !s.paid && s.date === api.today());
a.qrOpen(el({ id: carlos.id })); h = api.build(); check(ui.sheet.cents === 3600 && h.includes('R$ 36,00') && h.includes('Recebi o Pix'), 'QR da venda pendente (R$ 36,00) com "Recebi o Pix"');
fs.writeFileSync('/tmp/app_qr_3600.svg', svgOf(h));
a.qrPaid(); check(ui.sheet.type === 'pay1' && ui.sheet.method === 'Pix', '"Recebi o Pix" abre a confirmação com Pix selecionado');
a.payNext(); a.payConfirm(); check(api.getDb().sales.find(s => s.id === carlos.id).paid, 'dupla confirmação conclui a baixa');
// Ajustes
ui.screen = 'ajustes'; h = api.build(); check(h.includes('Código do QR Pix') && h.includes('Código válido'), 'Ajustes mostra o código e valida');
api.inp.pixPayload(el({}, { value: 'codigo-errado' })); h = api.build(); check(h.includes('Código inválido') && !api.pixPayloadOk(api.getDb().settings.pixPayload), 'código inválido é apontado');
ui.screen = 'nova'; ui.nova.items = { nutella: 1 }; h = api.build(); check(h.includes('QR do Pix indisponível'), 'com código inválido o QR some com aviso (sem quebrar)');
api.inp.pixPayload(el({}, { value: BASE })); check(api.pixPayloadOk(api.getDb().settings.pixPayload), 'código restaurado');
// {copiaecola} na mensagem
api.getDb().settings.orderTemplate = 'Pix: {copiaecola}'; ui.nova = api.freshNova(); ui.nova.query = 'Teste'; ui.nova.phone = '11 90000-1111'; ui.nova.items = { nutella: 1 }; ui.nova.paidNow = false; ui.screen = 'nova';
h = api.build(); const msg = decodeURIComponent((h.match(/href="(https:\/\/wa\.me[^"]+)"/) || [])[1].replace(/&amp;/g, '&').split('text=')[1]);
check(msg.startsWith('Pix: 000201') && msg.includes('540515.90') && api.pixPayloadOk(msg.slice(5)), '{copiaecola} entrega código com valor 15,90 e CRC válido');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DO QR NO APP PASSARAM');
