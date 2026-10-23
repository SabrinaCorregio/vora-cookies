const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
const timers = []; global.setTimeout = f => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api; api.Cloud.mode = 'local';
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs, extra) => Object.assign({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } }, extra || {});
const plusDisabled = h => (h.match(/data-act="novaInc" data-id="[^"]+"( disabled)?/g) || []).filter(m => /disabled/.test(m)).length;
const hoje = api.today();

// 1) O PROBLEMA: sabor sem estoque não pode bloquear a venda
api.getDb().days[hoje] = { produced: { nutella: 6, brownbutter: 4 } };
ui.nova = api.freshNova(); ui.screen = 'nova';
check(plusDisabled(api.build()) === 0, 'nenhum botão "+" desabilitado (mesmo sabores sem produção)');
for (let i = 0; i < 6; i++) a.novaInc(el({ id: 'brownbutter' }));
check(ui.nova.items.brownbutter === 6, 'Brown Butter (produção 4): consegue lançar 6');
let h = api.build(); check(h.includes('2 acima da produção') && plusDisabled(h) === 0, 'mostra "2 acima da produção" e o + continua ativo');
a.novaInc(el({ id: 'triplo' })); check(ui.nova.items.triplo === 1 && ui.toast.html.includes('Acima da produção de Triplo Chocolate'), 'sabor sem produção: lança e avisa');
ui.nova.query = 'Cliente Teste'; a.novaSave(); const sale = api.getDb().sales[api.getDb().sales.length - 1];
check(sale.items.brownbutter === 6 && sale.items.triplo === 1, 'a venda é salva normalmente com as quantidades');
ui.screen = 'hoje'; h = api.build(); check(h.includes('Ajustar produção') && !h.includes('Sabores e preços'), 'Hoje: quadro Por sabor só com "Ajustar produção"');

// 2) PRODUÇÃO E SABORES: editar nome e preço, incluir sabor novo
a.openProd(); h = api.build();
check(h.includes('Produção e sabores') && h.includes('+ Novo sabor') && h.includes('data-act="prodEdit"'), 'janela de produção mostra "Editar" e "+ Novo sabor"');
a.prodEdit(el({ id: 'nutella' })); h = api.build(); check(h.includes('data-in="flName" data-id="nutella"') && h.includes('value="15,90"'), 'Editar abre nome e preço do sabor');
api.inp.flName(el({ id: 'nutella' }, { value: 'Nutella Premium' })); api.inp.flPrice(el({ id: 'nutella' }, { value: '17,50' })); a.prodEditDone(); h = api.build();
check(api.getDb().flavors[0].name === 'Nutella Premium' && api.getDb().flavors[0].cents === 1750 && h.includes('Nutella Premium') && h.includes('R$ 17,50'), 'nome e preço editados (Nutella Premium, R$ 17,50)');
a.prodNew(); h = api.build(); check(h.includes('Novo sabor') && h.includes('Adicionar sabor'), '"+ Novo sabor" abre o formulário');
a.prodNewSave(); check(ui.toast.html.includes('Informe o nome'), 'exige o nome');
api.inp.prodNewName(el({}, { value: 'Ovomaltine' })); a.prodNewSave(); check(ui.toast.html.includes('Informe o preço'), 'exige o preço');
api.inp.prodNewPrice(el({}, { value: '18,00' })); a.prodNewInc(); a.prodNewInc(); a.prodNewInc();
a.prodNewSave(); const ov = api.getDb().flavors.find(f => f.name === 'Ovomaltine');
check(ov && ov.cents === 1800 && ov.active && ui.sheet.draft[ov.id] === 3 && !ui.sheet.adding, 'sabor novo criado (R$ 18,00) com 3 para hoje');
h = api.build(); check(h.includes('Ovomaltine'), 'aparece na lista da produção');
api.inp.prodNewName(el({}, { value: 'ovomaltine' })); a.prodNew(); api.inp.prodNewName(el({}, { value: 'ovomaltine' })); api.inp.prodNewPrice(el({}, { value: '1' })); a.prodNewSave();
check(ui.toast.html.includes('Já existe'), 'bloqueia sabor repetido');
a.prodNewCancel(); a.prodSave(); check(api.getDb().days[hoje].produced[ov.id] === 3, 'salvar produção grava o sabor novo');
// aparece na Nova venda e funciona
ui.nova = api.freshNova(); ui.screen = 'nova'; h = api.build();
check(h.includes('Ovomaltine') && h.includes('R$ 18,00 · restam 3') && h.includes('Nutella Premium'), 'Nova venda: sabor novo (R$ 18,00, restam 3) e nome editado');
a.novaInc(el({ id: ov.id })); a.novaInc(el({ id: ov.id })); a.novaInc(el({ id: ov.id })); a.novaInc(el({ id: ov.id }));
h = api.build(); check(ui.nova.items[ov.id] === 4 && h.includes('1 acima da produção'), 'Ovomaltine: 4 lançados, "1 acima da produção"');
check(h.includes('Ajustar produção') && h.includes('+ Novo sabor') && h.includes('data-act="openProdNew"'), 'Nova venda tem atalhos "Ajustar produção" e "+ Novo sabor"');
a.openProdNew(); check(ui.sheet.type === 'prod' && ui.sheet.adding === true, '"+ Novo sabor" na Nova venda abre a janela já no formulário');
// editar venda também não bloqueia
const s2 = api.getDb().sales.find(x => x.name === 'Cliente Teste'); a.closeSheet(el({}, { classList: { contains: () => false } }), {});
a.editStart(el({ id: s2.id })); for (let i = 0; i < 3; i++) a.editInc(el({ id: 'brownbutter' }));
check(ui.sheet.items.brownbutter === 9 && !api.build().includes('data-act="editInc" data-id="brownbutter" disabled'), 'editar venda: + sem bloqueio');

// 3) erro nunca fica silencioso: render com problema mostra mensagem
ui.sheet = null; ui.screen = 'hoje'; api.getDb().flavors = null;
let html = ''; try { html = api.build(); } catch (e) { html = 'EXCEÇÃO'; }
check(html === 'EXCEÇÃO', '(build direto lança erro com dados corrompidos; render() captura e mostra "Algo deu errado")');
console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE ESTOQUE E SABORES PASSARAM');
