const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
global.localStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; } }; })();
global.setTimeout = () => 0; global.clearTimeout = () => {};
global.document = { getElementById: () => ({ innerHTML: '', querySelector: () => null, contains: () => false }), querySelector: () => null, activeElement: null, addEventListener: () => {} };
global.window = { __VORA_TEST: {}, __VORA_DEFAULTS: require('./defaults.cjs') };
eval(src);
const api = window.__VORA_TEST.api, { ui, a } = api;
const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const el = (attrs) => ({ getAttribute: n => attrs[n.replace('data-', '')] !== undefined ? attrs[n.replace('data-', '')] : null, classList: { contains: () => false } });

(async () => {
  api.setDb(api.demoData()); api.Cloud.mode = 'local';
  ui.screen = 'conferir'; ui.conf = { text: '', res: null, images: [], pix: [], busy: null };
  let h = api.build();
  check(!h.includes('Anexar prints'), 'sem o recurso de imagens: botão de prints escondido');

  const calls = [];
  api.Sample.limits = { maxCount: 2, maxInputBytes: 20e6, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] };
  api.Sample.fn = { json: async (prompt, opts) => {
    calls.push({ prompt, n: opts.images.length });
    const out = { p1: [{ nome: 'CARLOS EDUARDO LIMA', valor: 36, data: '12/10/2026 13:58' }, { nome: 'JULIANA R REIS', valor: '44,00', data: '' }],
                  p2: [{ nome: 'THIAGO RIBEIRO', valor: 119.8, data: '11/10' }, { nome: 'Lixo', valor: 'abc' }],
                  p3: [{ nome: 'CARLOS EDUARDO LIMA', valor: 36, data: '12/10/2026 13:58' }, { nome: 'ALGUEM SEM VENDA', valor: 7.5, data: '' }] };
    return opts.images.flatMap(f => out[f.tag]);
  } };
  ui.conf.images = [{ id: 1, name: 'a.png', file: { tag: 'p1' }, thumb: '', done: false }, { id: 2, name: 'b.png', file: { tag: 'p2' }, thumb: '', done: false }, { id: 3, name: 'c.png', file: { tag: 'p3' }, thumb: '', done: false }];
  h = api.build();
  check(h.includes('Anexar prints de Pix recebidos') && h.includes('Ler prints e sugerir baixas'), 'com o recurso: botão de prints e ação "Ler prints"');
  a.conferirRun(); h = api.build();
  check(ui.conf.busy === 'Lendo prints…' && h.includes('Lendo prints…') && /disabled>Lendo prints/.test(h), 'mostra "Lendo prints…" e desabilita o botão');
  a.conferirRun(); await tick(15);   // 2º clique durante a leitura é ignorado
  check(calls.length === 2 && calls[0].n === 2 && calls[1].n === 1, 'enviou os 3 prints em 2 lotes (2+1)');
  check(calls[0].prompt.includes('SOMENTE os Pix RECEBIDOS'), 'instrução pede só Pix recebidos');
  check(ui.conf.images.every(i => i.done) && !ui.conf.busy, 'prints marcados como lidos');
  check(ui.conf.pix.length === 4, 'leituras: 4 (sem duplicado e sem lixo) -> ' + ui.conf.pix.length);
  check(ui.conf.res && ui.conf.res.matches.length === 3 && ui.conf.res.unmatched.length === 1, 'cruzou com vendas: 3 sugestões, 1 sem correspondência');
  const nomes = ui.conf.res.matches.map(m => api.getDb().sales.find(s => s.id === m.sid).name).sort().join(',');
  check(nomes === 'Carlos Lima,Juliana Reis,Thiago Ribeiro', 'sugestões: ' + nomes);
  h = api.build(); check(h.includes('Lido dos prints') && h.includes('CARLOS EDUARDO LIMA') && h.includes('Marcar 3 vendas'), 'tela lista o que foi lido e o botão de baixa');

  // corrigir leitura errada: remover e reanalisar
  const idx = ui.conf.pix.findIndex(p => p.nome === 'THIAGO RIBEIRO'); a.removePix(el({ i: String(idx) }));
  check(ui.conf.pix.length === 3 && ui.conf.res === null, 'remover leitura errada limpa as sugestões');
  a.conferirRun(); await tick(5);
  check(calls.length === 2 && ui.conf.res.matches.length === 2, 'reanalisar não gasta nova leitura (prints já lidos)');
  // texto colado + prints juntos
  ui.conf.text = 'Voce recebeu um Pix de R$ 31,80 de BEATRIZ NUNES'; a.conferirRun(); await tick(5);
  check(ui.conf.res.matches.length === 3, 'texto colado + prints são combinados');

  // erro: não permitiu
  ui.conf = { text: '', res: null, images: [{ id: 9, name: 'z.png', file: { tag: 'p1' }, thumb: '', done: false }], pix: [], busy: null };
  api.Sample.fn = { json: async () => { throw { code: 'not_granted', message: 'x' }; } };
  a.conferirRun(); await tick(8);
  check(!ui.conf.busy && ui.toast && ui.toast.html.includes('não permitiu'), 'erro not_granted: avisa e volta ao normal');
  check(!ui.conf.images[0].done, 'print não lido continua pendente');
  // resposta inválida
  api.Sample.fn = { json: async () => ({ erro: 'x' }) };
  a.conferirRun(); await tick(8);
  check(!ui.conf.busy && ui.toast.html.includes('Não encontrei Pix recebido'), 'resposta sem lista: avisa que não achou Pix');
  console.log(fails ? 'FALHAS ' + fails : 'TODOS OS TESTES DE IMAGEM PASSARAM');
})();
