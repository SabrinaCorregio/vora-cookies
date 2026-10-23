// Roda todos os testes automáticos: node tests/run-all.cjs   (ou: npm test)
const { spawnSync } = require('child_process');
const path = require('path');
const arquivos = ['adaptertest.mjs', 'smoke', 'balance', 'upgtest', 'navtest', 'stocktest', 'pixtest', 'imgtest', 'qrapptest', 'thanktest', 'pendtest', 'cloudtest', 'authtest'];
let falhas = 0;
for (const nome of arquivos) {
  const r = spawnSync('node', [path.join(__dirname, nome.endsWith('.mjs') ? nome : nome + '.js')], { encoding: 'utf8' });
  const saida = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && !/^FAIL:/m.test(saida) && !/Error/.test(saida.split('\n').filter(l => !l.startsWith('ok')).join('\n'));
  const oks = (saida.match(/^ok /gm) || []).length;
  console.log((ok ? 'OK    ' : 'FALHA ') + nome + (oks ? '  (' + oks + ' verificações)' : ''));
  if (!ok) { falhas++; console.log(saida.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 6).join('\n')); }
}
console.log(falhas ? '\n' + falhas + ' arquivo(s) com falha' : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
