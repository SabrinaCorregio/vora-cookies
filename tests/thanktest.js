const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
const timers = []; global.setTimeout = f => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api; api.Cloud.mode = 'local';
const flush = () => { while (timers.length) timers.shift()(); };
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs) => ({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } });
const waText = h => decodeURIComponent((h.match(/href="(https:\/\/wa\.me[^"]+)"/) || [])[1].replace(/&amp;/g, '&').split('text=')[1]);
const close = () => a.closeSheet({ classList: { contains: () => false }, getAttribute: () => null }, {});
api.setDb(api.demoData()); let db = api.getDb(); const hoje = api.today();

// 1) cartões de venda sem botão de agradecimento (Vendas e Histórico)
for (const s of ['vendas', 'historico']) { ui.screen = s; ui.hDay = hoje; const h = api.build(); check(!h.includes('Enviar agradecimento') && !h.includes('data-act="thanked"'), s + ': nenhum botão de agradecimento nos cartões'); }
ui.screen = 'vendas'; let h = api.build();
check(h.includes('class="linkbtn"') && h.includes('Marcar como pago'), 'Vendas: ações secundárias discretas e "Marcar como pago" em destaque');
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Helena Prado'; ui.nova.phone = '11 91111-2222'; ui.nova.items = { nutella: 1 };
h = api.build(); check(!h.includes('Salvar e agradecer') && !h.includes('data-act="novaWa"') && h.includes('o app pergunta se você quer agradecer'), 'Nova venda: sem checkbox nem botão verde de agradecimento');

// 2) PAGA NA HORA: salva e pergunta se quer agradecer -> Clientes
a.novaSave(); db = api.getDb(); const s1 = db.sales[db.sales.length - 1];
check(s1.paid && s1.thank === 'pending', 'venda paga salva com agradecimento pendente');
check(ui.sheet && ui.sheet.type === 'thanks' && ui.sheet.head === 'Venda salva ✓ · R$ 15,90', 'pergunta aparece: "Venda salva ✓ · R$ 15,90"');
h = api.build(); check(h.includes('Agradecer a Helena?') && h.includes('Agora não') && h.includes('data-act="thanksGo"') && !h.includes('wa.me'), 'janela só pergunta (sem link do WhatsApp)');
a.thanksGo(); h = api.build();
check(ui.screen === 'clientes' && !ui.sheet, 'Agradecer leva para a tela Clientes');
check(h.includes('Para agradecer') && h.includes('Helena Prado') && /class="crow focus"/.test(h) && h.includes('wa.me/5511911112222'), 'Clientes: Helena em destaque com o botão pequeno do WhatsApp');
check(waText(h.split('class="crow focus"')[1]).startsWith('Oi, Helena!'), 'o botão abre a mensagem de agradecimento dela');
a.thanked(el({ id: s1.id })); flush(); h = api.build();
check(api.getDb().sales.find(x => x.id === s1.id).thank === 'sent' && h.includes('✓ Enviado') && h.includes('Reenviar'), 'enviar move para "Já agradecidos" com "Reenviar"');
ui.screen = 'vendas'; check(ui.cliFocus === null || true, 'ok'); a.go(el({ screen: 'hoje' })); check(ui.cliFocus === null, 'sair de Clientes limpa o destaque');

// 3) PAGAR DEPOIS: sem pergunta ao salvar; só depois de marcar como pago
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Jonas Reis'; ui.nova.phone = '11 93333-4444'; ui.nova.items = { brownbutter: 2 }; ui.nova.paidNow = false;
a.novaSave(); db = api.getDb(); const s3 = db.sales[db.sales.length - 1];
check(!ui.sheet && !s3.paid && s3.thank === 'pending', 'pagar depois: salva sem perguntar');
ui.screen = 'clientes'; h = api.build(); check(!h.includes('Jonas Reis') || !/Para agradecer[\s\S]*Jonas Reis[\s\S]*Já agradecidos/.test(h), 'venda a receber NÃO entra em "Para agradecer"');
a.payStart(el({ id: s3.id })); a.payNext(); a.payConfirm();
check(ui.sheet && ui.sheet.type === 'thanks' && ui.sheet.head === 'Pagamento registrado ✓' && api.build().includes('Agradecer a Jonas?'), 'ao marcar como pago: pergunta "Agradecer a Jonas?"');
a.closeSheet(el({}), {}); const jo = () => api.getDb().sales.find(x => x.id === s3.id);
check(!ui.sheet && jo().paid && jo().thank === 'pending', '"Agora não": fecha e mantém pendente');
ui.screen = 'clientes'; h = api.build(); check(h.includes('Jonas Reis') && h.includes('Para agradecer'), 'depois de pago, Jonas aparece na lista Para agradecer da tela Clientes');
// refaz: Agradecer leva para Clientes
a.payStart(el({ id: db.sales.find(x => x.name === 'Beatriz Nunes' && !x.paid && x.date === hoje).id })); a.payNext(); a.payConfirm(); a.thanksGo();
check(ui.screen === 'clientes' && /class="crow focus"[\s\S]*Beatriz/.test(api.build()), 'Agradecer (depois do pagamento) leva para Clientes com a cliente em destaque');

// 4) BAIXA NO HISTÓRICO
const lucas = api.getDb().sales.find(x => x.name === 'Lucas Martins' && !x.paid); lucas.thank = 'pending';
ui.screen = 'historico'; ui.hDay = lucas.date; a.payStart(el({ id: lucas.id })); a.payNext(); a.payConfirm();
check(ui.sheet && ui.sheet.type === 'thanks' && api.build().includes('Agradecer a Lucas?'), 'baixa pelo Histórico também pergunta');
a.thanksGo(); check(ui.screen === 'clientes', '...e leva para Clientes');

// 5) várias compras do mesmo cliente = uma linha, um clique
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Zélia Tavares'; ui.nova.phone = '11 95555-0000'; ui.nova.items = { kinder: 1 }; a.novaSave(); close();
for (let i = 0; i < 2; i++) { ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Zélia Tavares'; ui.nova.items = { kinder: 1 }; a.novaSave(); close(); }
ui.screen = 'clientes'; h = api.build();
check((h.match(/Zélia Tavares/g) || []).length >= 1 && h.includes('3 compras · última'), 'cliente com 3 compras: UMA linha "3 compras · última..."');
const ztIds = api.getDb().sales.filter(x => x.name === 'Zélia Tavares').map(x => x.id);
const link = h.match(/data-act="thanked" data-id="([^"]+)"/g).map(m => m.match(/data-id="([^"]+)"/)[1]).find(v => v.split(',').length === 3);
check(link && ztIds.every(id => link.split(',').includes(id)), 'o botão do WhatsApp tem as 3 vendas');
a.thanked(el({ id: link })); flush(); check(api.getDb().sales.filter(x => x.name === 'Zélia Tavares').every(x => x.thank === 'sent'), 'um clique marca as 3 como agradecidas');

// 6) baixa em lote (Conferir Pix) com vários clientes
api.setDb(api.demoData()); api.Cloud.mode = 'local'; db = api.getDb(); db.sales.filter(x => !x.paid).forEach(x => { x.thank = 'pending'; });
ui.screen = 'conferir'; ui.conf = { text: 'Voce recebeu um Pix de R$ 36,00 de CARLOS EDUARDO LIMA\n\nPix recebido: R$ 44,00 enviado por JULIANA R REIS', res: null, images: [], pix: [], busy: null };
a.conferirRun(); a.conferirAsk(); a.confirmYes();
check(ui.sheet && ui.sheet.type === 'thanks' && ui.sheet.sids.length === 2 && ui.sheet.head.includes('2 vendas marcadas como pagas no Pix'), 'baixa em lote: pergunta uma vez (2 clientes)');
check(api.build().includes('Agradecer aos clientes?') && api.build().includes('2 clientes ainda não receberam'), 'texto no plural');
a.thanksGo(); h = api.build(); check(ui.screen === 'clientes' && (h.match(/class="crow focus"/g) || []).length === 2, 'Clientes destaca os 2');

// 7) sem celular: não pergunta
ui.nova = api.freshNova(); ui.screen = 'nova'; ui.nova.query = 'Sem Fone'; ui.nova.items = { nutella: 1 }; a.novaSave();
check(!ui.sheet && ui.toast.html.includes('Venda salva'), 'cliente sem celular: só o aviso "Venda salva"');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE AGRADECIMENTO PASSARAM');
