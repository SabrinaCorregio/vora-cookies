(function () {
'use strict';

/* =========================================================
   VORA COOKIES — controle de vendas e pagamentos
   Camada de dados isolada em "Store": hoje usa localStorage
   (somente neste aparelho). Na próxima etapa troca-se apenas
   o Store por um banco de dados online compartilhado.
   ========================================================= */

var KEY = 'vora.cookies.v1';
var KEY_CLOUD = 'vora.cloud.cache.v1';
var KEY_DONE = 'vora.legacy.done';
var PAYS = ['Pix', 'Dinheiro', 'Cartão'];
var WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
var WD3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var MON = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- helpers ---------- */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return dstr(new Date()); }
function pdate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }
function addDays(s, n) { var d = pdate(s); d.setDate(d.getDate() + n); return dstr(d); }
function fullDay(s) { var d = pdate(s); return WD[d.getDay()] + ', ' + d.getDate() + ' de ' + MON[d.getMonth()] + (s === today() ? ' (hoje)' : ''); }
function longDay(s) { var d = pdate(s); return d.getDate() + ' de ' + MON[d.getMonth()]; }
function shortDay(s) { var d = pdate(s); return WD3[d.getDay()] + ' ' + d.getDate(); }
function nowTime() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function money(c) {
  var neg = c < 0; c = Math.abs(Math.round(c));
  var s = (c / 100).toFixed(2).split('.');
  return (neg ? '-' : '') + 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
}
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function parseMoney(t) {
  t = String(t || '').replace(/[^\d,.]/g, '');
  var v = t.indexOf(',') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t;
  var n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 100);
}
function fmtInput(c) { return (c / 100).toFixed(2).replace('.', ','); }
function digits(t) { return String(t || '').replace(/\D/g, ''); }
function fmtPhone(t) {
  var d = digits(t);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return t || '';
}
function waLink(phone, text) {
  var d = digits(phone);
  if (d.length <= 11) d = '55' + d;
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
}
function initials(n) {
  var p = String(n || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/* ---------- QR Code (nível de correção M, versões 1–14) e código Pix ---------- */
var QR_EC_M = {
  1: [10, [1, 16], [0, 0]], 2: [16, [1, 28], [0, 0]], 3: [26, [1, 44], [0, 0]], 4: [18, [2, 32], [0, 0]], 5: [24, [2, 43], [0, 0]],
  6: [16, [4, 27], [0, 0]], 7: [18, [4, 31], [0, 0]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]], 10: [26, [4, 43], [1, 44]],
  11: [30, [1, 50], [4, 51]], 12: [22, [6, 36], [2, 37]], 13: [22, [8, 37], [1, 38]], 14: [24, [4, 40], [5, 41]]
};
var QR_EC_L = {
  1: [7, [1, 19], [0, 0]], 2: [10, [1, 34], [0, 0]], 3: [15, [1, 55], [0, 0]], 4: [20, [1, 80], [0, 0]], 5: [26, [1, 108], [0, 0]],
  6: [18, [2, 68], [0, 0]], 7: [20, [2, 78], [0, 0]], 8: [24, [2, 97], [0, 0]], 9: [30, [2, 116], [0, 0]], 10: [18, [2, 68], [2, 69]],
  11: [20, [4, 81], [0, 0]], 12: [24, [2, 92], [2, 93]], 13: [26, [4, 107], [0, 0]], 14: [30, [3, 115], [1, 116]]
};
function qrGfMul(x, y) { var z = 0, i; for (i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
function qrRsDivisor(deg) {
  var r = [], i, j, root = 1;
  for (i = 0; i < deg - 1; i++) r.push(0);
  r.push(1);
  for (i = 0; i < deg; i++) {
    for (j = 0; j < r.length; j++) { r[j] = qrGfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = qrGfMul(root, 2);
  }
  return r;
}
function qrRsRemainder(data, div) {
  var r = div.map(function () { return 0; });
  data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= qrGfMul(c, f); }); });
  return r;
}
function qrAlign(ver) {
  if (ver === 1) return [];
  var n = Math.floor(ver / 7) + 2, size = ver * 4 + 17, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, res = [6], pos;
  for (pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}
function qrBit(x, i) { return ((x >>> i) & 1) !== 0; }
function qrEncode(text, forceMask, level) {
  var TAB = level === 'M' ? QR_EC_M : QR_EC_L, FMT = level === 'M' ? 0 : 1;
  var bytes = Array.prototype.slice.call(new TextEncoder().encode(String(text))), ver, info, dataCw, i, j, k;
  for (ver = 1; ver <= 14; ver++) {
    info = TAB[ver]; dataCw = info[1][0] * info[1][1] + info[2][0] * info[2][1];
    if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCw * 8) break;
  }
  if (ver > 14) return null;
  var bits = [];
  function put(val, len) { for (var q = len - 1; q >= 0; q--) bits.push((val >>> q) & 1); }
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach(function (b) { put(b, 8); });
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (var pad = 0xEC; bits.length < dataCw * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
  var data = [];
  for (i = 0; i < bits.length; i += 8) { var v = 0; for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }
  var ecl = info[0], nb1 = info[1][0], d1 = info[1][1], nb2 = info[2][0], d2 = info[2][1], div = qrRsDivisor(ecl), blocks = [];
  k = 0;
  for (i = 0; i < nb1 + nb2; i++) { var len = i < nb1 ? d1 : d2, dat = data.slice(k, k + len); k += len; blocks.push({ dat: dat, ecc: qrRsRemainder(dat, div) }); }
  var out = [], maxD = nb2 ? Math.max(d1, d2) : d1;
  for (i = 0; i < maxD; i++) blocks.forEach(function (b) { if (i < b.dat.length) out.push(b.dat[i]); });
  for (i = 0; i < ecl; i++) blocks.forEach(function (b) { out.push(b.ecc[i]); });

  var size = ver * 4 + 17, mod = [], isFn = [];
  for (i = 0; i < size; i++) { mod.push([]); isFn.push([]); for (j = 0; j < size; j++) { mod[i].push(false); isFn[i].push(false); } }
  function setFn(x, y, dark) { mod[y][x] = dark; isFn[y][x] = true; }
  for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  function finder(cx, cy) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  var ap = qrAlign(ver), na = ap.length;
  for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (var ddy = -2; ddy <= 2; ddy++) for (var ddx = -2; ddx <= 2; ddx++) setFn(ap[i] + ddx, ap[j] + ddy, Math.max(Math.abs(ddx), Math.abs(ddy)) !== 1);
  }
  function drawFormat(mask) {
    var d = (FMT << 3) | mask, rem = d, q;   // nível L = 01, M = 00
    for (q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var fb = ((d << 10) | rem) ^ 0x5412;
    for (q = 0; q <= 5; q++) setFn(8, q, qrBit(fb, q));
    setFn(8, 7, qrBit(fb, 6)); setFn(8, 8, qrBit(fb, 7)); setFn(7, 8, qrBit(fb, 8));
    for (q = 9; q < 15; q++) setFn(14 - q, 8, qrBit(fb, q));
    for (q = 0; q < 8; q++) setFn(size - 1 - q, 8, qrBit(fb, q));
    for (q = 8; q < 15; q++) setFn(8, size - 15 + q, qrBit(fb, q));
    setFn(8, size - 8, true);
  }
  drawFormat(0);
  if (ver >= 7) {
    var rem2 = ver, q2;
    for (q2 = 0; q2 < 12; q2++) rem2 = (rem2 << 1) ^ ((rem2 >>> 11) * 0x1F25);
    var vb = (ver << 12) | rem2;
    for (q2 = 0; q2 < 18; q2++) { var bt = qrBit(vb, q2), a = size - 11 + q2 % 3, b2 = Math.floor(q2 / 3); setFn(a, b2, bt); setFn(b2, a, bt); }
  }
  var idx = 0, right, vert, jj, x, y, upward;
  for (right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (vert = 0; vert < size; vert++) for (jj = 0; jj < 2; jj++) {
      x = right - jj; upward = ((right + 1) & 2) === 0; y = upward ? size - 1 - vert : vert;
      if (!isFn[y][x] && idx < out.length * 8) { mod[y][x] = qrBit(out[idx >>> 3], 7 - (idx & 7)); idx++; }
    }
  }
  function applyMask(mask) {
    for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
      var inv;
      switch (mask) {
        case 0: inv = (xx + yy) % 2 === 0; break;
        case 1: inv = yy % 2 === 0; break;
        case 2: inv = xx % 3 === 0; break;
        case 3: inv = (xx + yy) % 3 === 0; break;
        case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
        case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
        case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
        default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
      }
      if (!isFn[yy][xx] && inv) mod[yy][xx] = !mod[yy][xx];
    }
  }
  function penalty() {
    var res = 0, r, c, run, dark = 0, line;
    function lineScore(get) {
      var s = '', t, sc = 0, runLen = 1;
      for (t = 0; t < size; t++) s += get(t) ? '1' : '0';
      for (t = 1; t <= size; t++) {
        if (t < size && s[t] === s[t - 1]) runLen++; else { if (runLen >= 5) sc += 3 + (runLen - 5); runLen = 1; }
      }
      var from = 0, pos;
      while ((pos = s.indexOf('10111010000', from)) >= 0) { sc += 40; from = pos + 1; }
      from = 0;
      while ((pos = s.indexOf('00001011101', from)) >= 0) { sc += 40; from = pos + 1; }
      return sc;
    }
    for (r = 0; r < size; r++) res += lineScore(function (t) { return mod[r][t]; });
    for (c = 0; c < size; c++) res += lineScore(function (t) { return mod[t][c]; });
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) { var cv = mod[r][c]; if (cv === mod[r][c + 1] && cv === mod[r + 1][c] && cv === mod[r + 1][c + 1]) res += 3; }
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (mod[r][c]) dark++;
    var total = size * size, kk = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return res + (kk > 0 ? kk * 10 : 0);
  }
  var best = 0, bestScore = Infinity, m;
  if (typeof forceMask === 'number') { applyMask(forceMask); drawFormat(forceMask); return mod; }
  for (m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    var sc2 = penalty();
    if (sc2 < bestScore) { bestScore = sc2; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}
function qrSvg(text) {
  var m = qrEncode(text, undefined, 'L'); if (!m) return '';
  var n = m.length, d = '', r, c;
  for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c]) d += 'M' + (c + 4) + ',' + (r + 4) + 'h1v1h-1z';
  return '<svg viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Code do Pix" shape-rendering="crispEdges" style="display:block;width:100%;height:auto"><rect width="' + (n + 8) + '" height="' + (n + 8) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

function crc16(s) {
  var crc = 0xFFFF, i, j;
  for (i = 0; i < s.length; i++) {
    crc ^= (s.charCodeAt(i) & 0xFF) << 8;
    for (j = 0; j < 8; j++) crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
  }
  var h = crc.toString(16).toUpperCase(); while (h.length < 4) h = '0' + h;
  return h;
}
function tlvParse(p) {
  var out = [], i = 0;
  while (i + 4 <= p.length) {
    var id = p.substr(i, 2), len = parseInt(p.substr(i + 2, 2), 10);
    if (isNaN(len) || i + 4 + len > p.length) return null;
    out.push([id, p.substr(i + 4, len)]); i += 4 + len;
  }
  return i === p.length ? out : null;
}
function tlvMake(id, v) { var l = String(v.length); if (l.length < 2) l = '0' + l; return id + l + v; }
function pixPayloadOk(p) {
  p = String(p || '').trim();
  var f = tlvParse(p);
  if (!f || !f.length || f[0][0] !== '00' || f[f.length - 1][0] !== '63') return false;
  if (!f.some(function (x) { return x[0] === '26' && x[1].indexOf('BR.GOV.BCB.PIX') >= 0; })) return false;
  return crc16(p.slice(0, -4)) === p.slice(-4);
}
/* monta o código Pix (copia e cola / QR) a partir do código base, com o valor da venda */
function pixPayloadFor(base, cents) {
  base = String(base || '').trim();
  if (!pixPayloadOk(base)) return null;
  var f = tlvParse(base), o = '', ins = false;
  f.forEach(function (x) {
    if (x[0] === '63' || x[0] === '54') return;
    if (!ins && cents > 0 && (x[0] === '58' || x[0] === '59' || x[0] === '60' || x[0] === '61' || x[0] === '62')) { o += tlvMake('54', (cents / 100).toFixed(2)); ins = true; }
    o += tlvMake(x[0], x[1]);
  });
  if (!ins && cents > 0) o += tlvMake('54', (cents / 100).toFixed(2));
  o += '6304';
  return o + crc16(o);
}
function pixReceiver(base) {
  var f = tlvParse(String(base || '').trim()); if (!f) return '';
  var n = f.filter(function (x) { return x[0] === '59'; })[0];
  return n ? n[1].trim() : '';
}

/* ---------- Store (trocar na etapa do banco online) ---------- */
var DEF = (typeof window !== 'undefined' && window.__VORA_DEFAULTS) || {};
var PIX_PAYLOAD = DEF.pixPayload || '';
var OLD_ORDER_TEMPLATE = 'Oi, {nome}! Segue o seu pedido na Vora Cookies:\n\n{itens}\n\nTotal: {total}\n\nPara pagar, use o Pix (chave celular):\n{pix}\n\nDepois é só enviar o comprovante por aqui. Qualquer dúvida, é só chamar!';
var ORDER_TEMPLATE = 'Oi, {nome}! Segue o seu pedido na Vora Cookies:\n\n{itens}\n\n{pendencias}Total: {total}\n\nPara pagar, use o Pix (chave celular):\n{pix}\n\nDepois é só enviar o comprovante por aqui. Qualquer dúvida, é só chamar!';
var OLD_TEMPLATE = 'Oi, {nome}! Agradecemos por comprar na Vora Cookies. Esperamos que você goste muito! Se puder, conta pra gente o que achou: {link}';
var NEW_TEMPLATE = 'Oi, {nome}! Agradecemos por comprar na Vora Cookies. Esperamos que você goste muito! Se puder, conta pra gente o que achou: {link}\n\nSiga a gente no Instagram: @voracookies (https://instagram.com/voracookies)';
function defaults() {
  return {
    v: 1,
    flavors: [
      { id: 'nutella', name: 'Nutella', cents: 1590, active: true },
      { id: 'brownbutter', name: 'Brown Butter', cents: 1200, active: true },
      { id: 'triplo', name: 'Triplo Chocolate', cents: 1590, active: true },
      { id: 'doceleite', name: 'Doce de leite', cents: 1590, active: true },
      { id: 'redvelvet', name: 'Red Velvet', cents: 2200, active: true },
      { id: 'kinder', name: 'Kinder Bueno', cents: 2200, active: true }
    ],
    settings: {
      template: NEW_TEMPLATE,
      reviewLink: DEF.reviewLink || '',
      pixKey: DEF.pixKey || '',
      pixPayload: PIX_PAYLOAD,
      orderTemplate: ORDER_TEMPLATE,
      upg1: true,
      upg2: true
    },
    customers: [],
    sales: [],
    days: {}
  };
}
/* atualiza (uma única vez) a mensagem e o link padrão em dados já existentes, sem sobrescrever o que foi personalizado */
function upgradeSettings(d) {
  var b = defaults(), ch = false;
  if (!d.settings) d.settings = {};
  if (!d.settings.upg1) {
    if (!d.settings.reviewLink) d.settings.reviewLink = b.settings.reviewLink;
    if (!d.settings.template || d.settings.template === OLD_TEMPLATE) d.settings.template = b.settings.template;
    d.settings.upg1 = true; ch = true;
  }
  if (!d.settings.upg2) {
    if (!d.settings.orderTemplate || d.settings.orderTemplate === OLD_ORDER_TEMPLATE) d.settings.orderTemplate = b.settings.orderTemplate;
    d.settings.upg2 = true; ch = true;
  }
  return ch;
}
function migrate(d) {
  var b = defaults();
  if (!d || typeof d !== 'object') return b;
  d.flavors = Array.isArray(d.flavors) && d.flavors.length ? d.flavors : b.flavors;
  var hadS = !!(d.settings && typeof d.settings === 'object'), upg = hadS ? !!d.settings.upg1 : true, upg2 = hadS ? !!d.settings.upg2 : true;
  d.settings = Object.assign({}, b.settings, d.settings || {});
  d.settings.upg1 = upg; d.settings.upg2 = upg2;
  d.customers = Array.isArray(d.customers) ? d.customers : [];
  d.sales = Array.isArray(d.sales) ? d.sales : [];
  d.days = d.days && typeof d.days === 'object' ? d.days : {};
  return d;
}
var Store = {
  load: function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {}
    return defaults();
  },
  save: function (data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
};

Store.hasCloud = function () { try { return !!localStorage.getItem(KEY_CLOUD); } catch (e) { return false; } };
Store.loadCloud = function () {
  try { var raw = localStorage.getItem(KEY_CLOUD); if (raw) return migrate(JSON.parse(raw)); } catch (e) {}
  return defaults();
};
Store.saveCloud = function (d) { try { localStorage.setItem(KEY_CLOUD, JSON.stringify(d)); return true; } catch (e) { return false; } };

var db = Store.hasCloud() ? Store.loadCloud() : Store.load();
upgradeSettings(db);

/* ---------- consultas ---------- */
function flv(id) { for (var i = 0; i < db.flavors.length; i++) if (db.flavors[i].id === id) return db.flavors[i]; return null; }
function fname(id) { var f = flv(id); return f ? f.name : 'Sabor removido'; }
function activeFlavors() { return db.flavors.filter(function (f) { return f.active; }); }
function salesOn(d) { return db.sales.filter(function (s) { return s.date === d; }); }
function countItems(items) { var n = 0, k; for (k in items) n += items[k] || 0; return n; }
function centsOf(items, prices) { var c = 0, k; for (k in items) c += (items[k] || 0) * (prices[k] || 0); return c; }
function producedOf(d) { return (db.days[d] && db.days[d].produced) || {}; }
function hasProd(d) { var p = producedOf(d), k; for (k in p) if (p[k] > 0) return true; return false; }
function soldMap(d, exceptId) {
  var m = {};
  salesOn(d).forEach(function (s) {
    if (s.id === exceptId) return;
    var k; for (k in s.items) m[k] = (m[k] || 0) + (s.items[k] || 0);
  });
  return m;
}
function remaining(d, fid, exceptId) {
  if (!hasProd(d)) return null;
  return (producedOf(d)[fid] || 0) - (soldMap(d, exceptId)[fid] || 0);
}
function stats(d) {
  var list = salesOn(d), r = { n: list.length, cookies: 0, cents: 0, paidC: 0, pendC: 0, pendN: 0, byMethod: {} };
  list.forEach(function (s) {
    r.cookies += countItems(s.items); r.cents += s.cents;
    if (s.paid) { r.paidC += s.cents; r.byMethod[s.method] = (r.byMethod[s.method] || 0) + s.cents; }
    else { r.pendC += s.cents; r.pendN++; }
  });
  return r;
}
function customerById(id) { for (var i = 0; i < db.customers.length; i++) if (db.customers[i].id === id) return db.customers[i]; return null; }
function custName(s) { var c = s.customerId && customerById(s.customerId); return c ? c.name : s.name; }
function custPhone(s) { var c = s.customerId && customerById(s.customerId); return c ? c.phone : ''; }
function allPending() { return db.sales.filter(function (s) { return !s.paid; }); }
function pendingOfCustomer(cid) {
  return db.sales.filter(function (s) { return !s.paid && s.customerId === cid; })
    .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
}
function sumCents(list) { return list.reduce(function (a, s) { return a + s.cents; }, 0); }
function itemsText(items) {
  var parts = [];
  db.flavors.forEach(function (f) { if (items[f.id]) parts.push(items[f.id] + ' ' + f.name); });
  return parts.join(' · ');
}
function orderSales(list) {
  var byName = function (a, b) { return custName(a).localeCompare(custName(b), 'pt-BR'); };
  return list.filter(function (s) { return !s.paid; }).sort(byName).concat(list.filter(function (s) { return s.paid; }).sort(byName));
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function dmy(date) { var p = String(date).split('-'); return p[2] + '/' + p[1]; }
function orderText(name, items, prices, cents, extras) {
  extras = extras || [];
  var lines = [];
  db.flavors.forEach(function (f) {
    var q = items[f.id];
    if (q) { var pr = (prices && prices[f.id]) || f.cents; lines.push('• ' + q + 'x ' + f.name + ' — ' + money(q * pr)); }
  });
  var total = cents + extras.reduce(function (a, s) { return a + s.cents; }, 0);
  var pend = extras.length ? 'Pendências anteriores:\n' + extras.map(function (s) { return '• ' + dmy(s.date) + ': ' + itemsText(s.items) + ' — ' + money(s.cents); }).join('\n') + '\n\n' : '';
  var tpl = String(db.settings.orderTemplate || ''), itens = lines.join('\n');
  if (pend && tpl.indexOf('{pendencias}') < 0) { itens += '\n\n' + pend.replace(/\n+$/, ''); pend = ''; }
  return tpl.split('{nome}').join(firstName(name)).split('{itens}').join(itens).split('{pendencias}').join(pend)
    .split('{total}').join(money(total)).split('{pix}').join(db.settings.pixKey || '')
    .split('{copiaecola}').join(pixPayloadFor(db.settings.pixPayload, total) || '').trim();
}
function thankText(name) {
  var link = db.settings.reviewLink || '';
  return String(db.settings.template || '').split('{nome}').join((name || '').split(' ')[0]).split('{link}').join(link).trim();
}

/* ---------- dados de exemplo (para testar) ---------- */
function demoData() {
  var d = defaults(), t = today();
  var F = { n: 'nutella', b: 'brownbutter', t: 'triplo', d: 'doceleite', r: 'redvelvet', k: 'kinder' };
  var phones = {
    'Ana Paula': '(11) 99876-5432', 'Beatriz Nunes': '(11) 95432-1098', 'Camila Rocha': '(11) 91098-7654', 'Carlos Lima': '(11) 91234-5678',
    'Fernanda Costa': '(11) 93210-9876', 'Gabriel Santos': '(11) 96666-3456', 'Juliana Reis': '(11) 96543-2109', 'Larissa Melo': '(11) 95555-4567',
    'Lucas Martins': '(11) 92109-8765', 'Mariana Souza': '(11) 98765-4321', 'Patrícia Dias': '(11) 97777-2345', 'Pedro Alves': '(11) 94321-0987',
    'Rafael Gomes': '(11) 97654-3210', 'Renato Cardoso': '(11) 94444-5678', 'Thiago Ribeiro': '(11) 98888-1234'
  };
  var cust = {};
  Object.keys(phones).forEach(function (n) {
    var c = { id: uid() + Math.random().toString(36).slice(2, 4), name: n, phone: phones[n] };
    cust[n] = c; d.customers.push(c);
  });
  var rows = [
    [['Fernanda Costa', 'n2 b2', 'P'], ['Lucas Martins', 'b3 d1', 'D'], ['Camila Rocha', 't2 r1', 'C'], ['Mariana Souza', 'n3', 'P'], ['Pedro Alves', 'b3 d1', 'P'], ['Ana Paula', 'd2', 'D'], ['Rafael Gomes', 't2', 'C'], ['Beatriz Nunes', 'k2', 'P']],
    [['Carlos Lima', 'b4 n1', 'P'], ['Juliana Reis', 'n2 d2', 'C'], ['Thiago Ribeiro', 'b3 t2', 'P'], ['Patrícia Dias', 'n2 r1', 'D'], ['Gabriel Santos', 'b2 d1', 'P'], ['Larissa Melo', 'd2 t2', 'C'], ['Renato Cardoso', 'r1 k2', 'P']],
    [['Beatriz Nunes', 'n2 k1', 'P'], ['Rafael Gomes', 'b3 t1', 'C'], ['Mariana Souza', 'd2 r1', 'P'], ['Ana Paula', 'n2 b3', 'D'], ['Camila Rocha', 't2 d1', 'P'], ['Lucas Martins', 'd1 k2', '-'], ['Pedro Alves', 'r1', 'D']],
    [['Fernanda Costa', 'n3 k1', 'P'], ['Carlos Lima', 'b4 t1', '-'], ['Patrícia Dias', 'n3 d2', 'C'], ['Juliana Reis', 't2 r1', 'P'], ['Gabriel Santos', 'b3 d1', 'D'], ['Thiago Ribeiro', 'd2 t2', 'P'], ['Larissa Melo', 'r2 k3', 'P']],
    [['Mariana Souza', 'n3 r1 k1', 'P'], ['Rafael Gomes', 'b4 t2', 'C'], ['Camila Rocha', 'n2 d3', 'P'], ['Pedro Alves', 'b4 k2', 'P'], ['Ana Paula', 'n2 r2', 'D'], ['Beatriz Nunes', 't2 d1 r1', 'P'], ['Renato Cardoso', 't2 d2 r1 k2', 'C'], ['Lucas Martins', 'k1', 'P']],
    [['Fernanda Costa', 'n3 k2', 'P'], ['Lucas Martins', 'n2 b3 d1', 'P'], ['Juliana Reis', 'n4 r1', 'C'], ['Carlos Lima', 'b4 t2', 'D'], ['Patrícia Dias', 'd3 k2', 'P'], ['Gabriel Santos', 't2 d2 r2', 'P'], ['Thiago Ribeiro', 't2 r2 k2', '-'], ['Larissa Melo', 'd1 k2', 'P']],
    [['Mariana Souza', 'n2 r1', 'P'], ['Carlos Lima', 'b3', '-'], ['Ana Paula', 'k2', 'D'], ['Rafael Gomes', 't2 d1', 'C'], ['Juliana Reis', 'r1 k1', '-'], ['Beatriz Nunes', 'd2', '-'], ['Pedro Alves', 'b4', 'P']]
  ];
  var times = ['10:10', '11:00', '12:15', '13:05', '14:20', '15:30', '16:10', '17:00'];
  var M = { P: 'Pix', D: 'Dinheiro', C: 'Cartão' };
  var priceMap = {}; d.flavors.forEach(function (f) { priceMap[f.id] = f.cents; });
  rows.forEach(function (day, di) {
    var date = addDays(t, di - 6), sold = {}, isToday = di === 6;
    day.forEach(function (r, i) {
      var items = {};
      r[1].split(' ').forEach(function (tok) { items[F[tok[0]]] = parseInt(tok.slice(1), 10); });
      Object.keys(items).forEach(function (k) { sold[k] = (sold[k] || 0) + items[k]; });
      var thank = isToday ? (i < 3 ? 'pending' : (i < 5 ? 'sent' : null)) : 'sent';
      d.sales.push({
        id: uid() + di + i, date: date, time: times[i], customerId: cust[r[0]].id, name: r[0], items: items, prices: Object.assign({}, priceMap),
        cents: centsOf(items, priceMap), paid: r[2] !== '-', method: M[r[2]] || null, thank: thank, createdAt: date + ' ' + times[i]
      });
    });
    var produced = {};
    if (isToday) { produced = { nutella: 6, brownbutter: 10, triplo: 6, doceleite: 6, redvelvet: 4, kinder: 6 }; }
    else { d.flavors.forEach(function (f) { produced[f.id] = (sold[f.id] || 0) + 2; }); }
    d.days[date] = { produced: produced };
    if (!isToday) d.days[date].closed = { at: '18:30', leftover: 12, note: '' };
  });
  return d;
}

/* =========================================================
   INTERFACE
   ========================================================= */
var LOGO = (typeof window !== 'undefined' && window.__VORA_LOGO) || '';

function freshNova() { return { query: '', customerId: null, phone: '', items: {}, paidNow: true, method: 'Pix', wa: true, inclPend: true }; }
var ui = {
  screen: 'hoje', sheet: null, vFilter: 'todas', hDay: today(), rPeriod: '7d', rFrom: addDays(today(), -13), rTo: today(),
  rDay: null, nova: freshNova(), cliQuery: '', toast: null, closeNote: '', backup: '', importText: '', cliFocus: null, login: { email: '', pass: '' }, conf: { text: '', res: null, images: [], pix: [], busy: null }
};

var P = {
  home: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5a3.5 3.5 0 010 6.5M18 14.3c2 .7 3.5 2.6 3.5 5.7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
  userplus: '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.6 3-6 7-6M18 9v6M15 12h6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
function ic(n, size, sw) {
  return '<svg width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';
}
var NAV = [['hoje', 'Hoje', 'home'], ['vendas', 'Vendas', 'list'], ['historico', 'Histórico', 'cal'], ['clientes', 'Clientes', 'users'], ['relatorios', 'Relatórios', 'chart']];
function navHtml() {
  return '<nav class="nav"><img class="side-logo" src="' + LOGO + '" alt="Vora Cookies">' + NAV.map(function (n) {
    return '<button type="button" class="' + (ui.screen === n[0] ? 'on' : '') + '" data-act="go" data-screen="' + n[0] + '">' + ic(n[2]) + n[1] + '</button>';
  }).join('') + '</nav>';
}
function topSimple(title, back) {
  return '<div class="topbar simple"><button type="button" class="iconbtn" aria-label="Voltar" data-act="go" data-screen="' + back + '">' + ic('back', 24, 2.2) + '</button><h1 style="font-size:26px">' + title + '</h1></div>';
}
function dueOf(s) {
  var ex = [];
  if (s && !s.paid && Array.isArray(s.incl)) s.incl.forEach(function (id) { var x = saleById(id); if (x && !x.paid && x.id !== s.id) ex.push(x); });
  var ec = sumCents(ex);
  return { extras: ex, extraC: ec, total: s ? s.cents + ec : 0 };
}
function saleById(id) { for (var i = 0; i < db.sales.length; i++) if (db.sales[i].id === id) return db.sales[i]; return null; }

function saleCard(s) {
  var paid = s.paid, due = dueOf(s), ph = custPhone(s);
  var links = '<button type="button" class="linkbtn" data-act="editStart" data-id="' + s.id + '">Editar</button>' +
    (!paid && ph ? '<a class="linkbtn" href="' + esc(waLink(ph, orderText(custName(s), s.items, s.prices, s.cents, due.extras))) + '" target="_blank" rel="noopener" data-act="chargeSale" data-id="' + s.id + '">Cobrar Pix</a>' : '') +
    (!paid ? '<button type="button" class="linkbtn" data-act="qrOpen" data-id="' + s.id + '">QR Pix</button>' : '') +
    (paid ? '<button type="button" class="linkbtn warn" data-act="unpayStart" data-id="' + s.id + '">Desfazer pago</button>' : '');
  var chip = '<span class="chip ' + (paid ? 'chip-ok' : 'chip-warn') + '">' + (paid ? 'Pago · ' + esc(s.method || '') : 'A receber') + '</span>';
  return '<div class="scard' + (paid ? '' : ' pend') + '">' +
    '<div class="row between"><span class="sname">' + esc(custName(s)) + '</span><span class="smoney">' + money(s.cents) + '</span></div>' +
    '<div class="row between small muted" style="align-items:flex-start"><span>' + esc(itemsText(s.items)) + '</span><span class="nowrap">' + esc(s.time || '') + '</span></div>' +
    (!paid && s.charge === 'sent' ? '<div class="tiny bold" style="color:var(--warn-ink)">Cobrança enviada' + (s.chargeAt ? ' às ' + esc(s.chargeAt) : '') + '</div>' : '') +
    (!paid && due.extras.length ? '<div class="tiny bold" style="color:var(--warn-ink)">Inclui ' + due.extras.length + (due.extras.length === 1 ? ' pendência anterior' : ' pendências anteriores') + ' (' + money(due.extraC) + ') · total a receber ' + money(due.total) + '</div>' : '') +
    (paid
      ? '<div class="row between sactions">' + chip + '<div class="row" style="gap:0">' + links + '</div></div>'
      : '<div class="row between sactions">' + chip + '<button type="button" class="btn btn-green btn-sm" data-act="payStart" data-id="' + s.id + '">Marcar como pago</button></div>' +
        '<div class="row wrap" style="gap:0 2px;margin:-2px -8px -6px">' + links + '</div>') +
    '</div>';
}
function flavorBars(rows, total) {
  if (!rows.length) return '<div class="empty">Nenhum cookie vendido neste período.</div>';
  var top = rows[0].qty || 1;
  return '<div class="col" style="gap:12px">' + rows.map(function (r) {
    return '<div><div class="row between" style="align-items:baseline;font-size:13px"><span class="bold" style="font-weight:600">' + esc(r.name) + '</span>' +
      '<span class="small muted"><b style="font-size:15px;color:var(--ink)">' + r.qty + '</b> · ' + Math.round(r.qty / (total || 1) * 100) + '%</span></div>' +
      '<div class="bar"><i style="width:' + Math.round(r.qty / top * 100) + '%"></i></div></div>';
  }).join('') + '</div>';
}
function flavorRowsOf(map) {
  var rows = [], k;
  for (k in map) if (map[k] > 0) rows.push({ name: fname(k), qty: map[k] });
  return rows.sort(function (a, b) { return b.qty - a.qty; });
}

/* ---------- HOJE ---------- */
function viewHoje() {
  var t = today(), prod = producedOf(t), sold = soldMap(t), st = stats(t), closed = (db.days[t] || {}).closed;
  var made = 0, k; for (k in prod) made += prod[k] || 0;
  var left = Math.max(0, made - st.cookies);
  var pct = made > 0 ? Math.min(100, Math.round(st.cookies / made * 100)) : 0;
  var rows = db.flavors.filter(function (f) { return f.active || prod[f.id] > 0 || sold[f.id] > 0; });
  var prev = allPending().filter(function (s) { return s.date < t; }), prevC = sumCents(prev);

  var top = '<div class="topbar"><img class="logo top-logo" src="' + LOGO + '" alt="Vora Cookies">' +
    '<div style="text-align:right;margin-left:auto"><div class="sub" style="margin:0">' + esc(fullDay(t).replace(' (hoje)', '')) + '</div>' +
    '<div class="row" style="justify-content:flex-end;margin-top:6px"><span class="chip ' + (closed ? 'chip-warn' : 'chip-ok') + '">' + (closed ? 'Caixa fechado' : 'Caixa aberto') + '</span>' +
    '<button type="button" class="iconbtn soft" style="width:40px;height:40px" aria-label="Ajustes" data-act="go" data-screen="ajustes">' + ic('sliders', 20) + '</button></div><div style="margin-top:6px">' + syncChip() + '</div></div></div>';

  var body = '<h1>Hoje</h1>';
  if (!(made > 0)) {
    body += '<div class="card col"><div class="bold" style="font-size:15px">Quantos cookies você tem para vender hoje?</div>' +
      '<div class="small muted" style="line-height:1.45">Informe a produção do dia para acompanhar quantos já foram vendidos e quantos restam.</div>' +
      '<button type="button" class="btn btn-primary btn-block" data-act="openProd">Definir produção do dia</button></div>';
  }
  body += '<div class="split"><div class="col" style="gap:14px"><div class="hero"><div class="grid3">' +
    '<div><div class="n">' + made + '</div><div class="l">Prontos</div></div>' +
    '<div><div class="n">' + st.cookies + '</div><div class="l">Vendidos</div></div>' +
    '<div><div class="n">' + left + '</div><div class="l">Restam</div></div></div>' +
    '<div class="track"><i style="width:' + pct + '%"></i></div>' +
    '<div class="l" style="margin-top:8px">' + pct + '% dos cookies de hoje já foram vendidos</div></div>';
  body += '<div class="grid2">' +
    '<div class="stat"><div class="t">Recebido</div><div class="v" style="color:var(--green)">' + money(st.paidC) + '</div>' +
    '<div class="small muted" style="margin-top:2px">' + (st.n - st.pendN) + ' vendas pagas</div></div>' +
    '<button type="button" class="stat warn" data-act="goReceber"><div class="t">A receber</div><div class="v" style="color:var(--warn-ink)">' + money(st.pendC) + '</div>' +
    '<div class="small bold" style="margin-top:2px;color:var(--warn-ink)">' + st.pendN + (st.pendN === 1 ? ' venda' : ' vendas') + ' · ver quais →</div></button></div>';
  if (prev.length) {
    body += '<button type="button" class="alert" style="text-align:left;width:100%" data-act="go" data-screen="historico"><div class="bold" style="font-size:13px">Dias anteriores ainda a receber</div>' +
      '<div class="small" style="margin-top:2px">' + prev.length + (prev.length === 1 ? ' venda' : ' vendas') + ' · ' + money(prevC) + ' · ver no histórico →</div></button>';
  }
  body += '</div><div class="card"><div class="row between wrap" style="margin-bottom:10px;gap:8px"><div class="bold" style="font-size:14px">Por sabor</div>' +
    '<button type="button" class="btn btn-ghost btn-sm" style="color:var(--warn-ink)" data-act="openProd">Ajustar produção</button></div>';
  if (!rows.length || (!(made > 0) && !st.cookies)) {
    body += '<div class="empty" style="padding:10px 0">Defina a produção do dia para ver quantos cookies restam de cada sabor.</div>';
  } else {
    body += '<div class="col" style="gap:10px">' + rows.map(function (f) {
      var m = prod[f.id] || 0, s = sold[f.id] || 0, p = m > 0 ? Math.min(100, Math.round(s / m * 100)) : (s > 0 ? 100 : 0);
      return '<div><div class="row between" style="align-items:baseline;font-size:13px"><span style="font-weight:600">' + esc(f.name) + '</span>' +
        '<span class="small muted">' + s + ' de ' + m + ' · restam <b style="color:var(--ink)">' + Math.max(0, m - s) + '</b></span></div>' +
        '<div class="bar"><i style="width:' + p + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  body += '</div></div>';

  var bottom = closed
    ? '<div style="padding:10px var(--px) 12px"><button type="button" class="btn btn-outline btn-lg btn-block" data-act="go" data-screen="fechar">Ver fechamento do caixa</button></div>'
    : '<div style="display:flex;gap:10px;padding:10px var(--px) 12px"><button type="button" class="btn btn-primary btn-lg" style="flex:1" data-act="toNova">' + ic('plus', 22, 2.4) + 'Nova venda</button>' +
      '<button type="button" class="btn btn-outline btn-lg" data-act="go" data-screen="fechar">Fechar caixa</button></div>';
  return top + '<div class="scroll">' + body + '</div>' + bottom;
}

/* ---------- QR DO PIX ---------- */
function qrCard(cents, own, extra) {
  var payload = pixPayloadFor(db.settings.pixPayload, cents), svg = payload ? qrSvg(payload) : '';
  if (!svg) return '<div class="card small muted">QR do Pix indisponível: confira o código do QR em Ajustes.</div>';
  return '<div class="card col" style="align-items:center;gap:8px"><div class="bold" style="font-size:14px">QR Code do Pix · ' + money(cents) + '</div>' +
    '<div class="qrbox">' + svg + '</div>' +
    (extra ? '<div class="small bold" style="text-align:center">Compra ' + money(own) + ' + pendências ' + money(extra) + '</div>' : '') +
    '<div class="small muted" style="text-align:center;line-height:1.4">Peça para o cliente ler com o app do banco. Confira o recebimento no seu banco antes de salvar como pago.</div>' +
    '<div class="tiny muted">Recebedor: ' + esc(pixReceiver(db.settings.pixPayload)) + '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="qrBig" data-c="' + cents + '" data-note="' + esc(extra ? 'Compra ' + money(own) + ' + pendências ' + money(extra) : '') + '">Ampliar o QR</button></div>';
}

/* ---------- NOVA VENDA ---------- */
function viewNova() {
  var n = ui.nova, t = today(), q = norm(n.query), cust = n.customerId ? customerById(n.customerId) : null;
  var matches = [];
  if (!cust && q.length) {
    matches = db.customers.filter(function (c) {
      var nm = norm(c.name);
      return nm.indexOf(q) === 0 || nm.split(' ').some(function (w) { return w.indexOf(q) === 0; }) || nm.indexOf(' ' + q) >= 0;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); }).slice(0, 5);
  }
  var cnt = countItems(n.items), cents = 0, f;
  var fl = activeFlavors();
  fl.forEach(function (x) { cents += (n.items[x.id] || 0) * x.cents; });
  var nameOk = cust || n.query.trim().length > 0;
  var pendAll = cust ? pendingOfCustomer(cust.id) : [], pendC = sumCents(pendAll), incl = pendAll.length > 0 && n.inclPend !== false;
  var extras = incl ? pendAll : [], payTotal = cents + (incl ? pendC : 0);

  var cb = '<div><div class="label">Cliente</div>';
  if (!cust) {
    cb += '<div class="card col" style="padding:12px 14px"><label class="field"><span>Nome (digite para buscar)</span>' +
      '<input class="inp" id="nome" type="text" autocomplete="off" value="' + esc(n.query) + '" data-in="novaQuery"></label>';
    if (matches.length) {
      cb += '<div class="col" style="gap:6px"><div class="tiny bold muted">Clientes cadastrados</div>' + matches.map(function (c) {
        var pc = sumCents(pendingOfCustomer(c.id));
        return '<button type="button" class="sugg' + (pc ? ' pend' : '') + '" data-act="novaPick" data-cid="' + c.id + '"><span><b>' + esc(c.name) + '</b><span class="s">' + esc(c.phone || 'sem celular') + '</span></span>' +
          (pc ? '<span class="chip chip-solid">' + money(pc) + ' a receber</span>' : '') + '</button>';
      }).join('') + '</div>';
    } else if (q.length >= 2) {
      cb += '<div class="note">Nenhum cliente com esse nome. Ele será cadastrado ao salvar a venda: informe o celular abaixo.</div>';
    }
    cb += '<label class="field"><span>Celular (WhatsApp)</span><input class="inp" id="cel" type="tel" inputmode="tel" placeholder="(11) 90000-0000" value="' + esc(n.phone) + '" data-in="novaPhone"></label></div>';
  } else {
    var pend = pendingOfCustomer(cust.id), pc2 = sumCents(pend);
    cb += '<div class="col"><div class="card row between" style="padding:12px 14px"><div><div class="bold" style="font-size:16px">' + esc(cust.name) + '</div>' +
      '<div class="muted" style="font-size:13px">' + esc(cust.phone || 'sem celular cadastrado') + '</div><div class="small bold" style="color:var(--green);margin-top:2px">Cliente já cadastrado</div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" style="min-height:44px" data-act="novaChange">Trocar</button></div>';
    if (!cust.phone) {
      cb += '<label class="field card" style="padding:10px 14px"><span>Adicionar celular (WhatsApp)</span><input class="inp" id="cel" type="tel" inputmode="tel" placeholder="(11) 90000-0000" value="' + esc(n.phone) + '" data-in="novaPhone"></label>';
    }
    if (pend.length) {
      cb += '<div class="alert"><div class="bold" style="font-size:14px">Pendência: ' + money(pc2) + ' a receber</div><div class="col" style="gap:2px;margin-top:6px;font-size:13px">' +
        pend.map(function (s) { return '<div>' + esc(shortDay(s.date)) + ' · ' + money(s.cents) + '</div>'; }).join('') + '</div>' +
        '<label class="check" style="margin-top:8px"><input type="checkbox" data-act="novaIncl"' + (incl ? ' checked' : '') + '>Incluir a pendência no pagamento desta venda</label>' +
        (incl ? '<div class="small bold" style="margin-top:2px">Esta compra ' + money(cents) + ' + pendência ' + money(pc2) + ' = ' + money(payTotal) + '</div>' : '') +
        '<div class="row between" style="margin-top:10px;gap:10px"><span class="small" style="font-weight:500">' + (incl ? 'O Pix e o QR já saem com o total.' : 'A pendência continua separada desta venda.') + '</span>' +
        '<button type="button" class="btn btn-warn btn-sm" data-act="goHistDay" data-d="' + pend[0].date + '">Ver no histórico</button></div></div>';
    }
    cb += '</div>';
  }
  cb += '</div>';

  var fb = '<div><div class="label">Sabores</div><div class="card" style="padding:4px 14px">' + fl.map(function (x) {
    var q2 = n.items[x.id] || 0, rem = remaining(t, x.id), left = rem === null ? null : rem - q2;
    var sub = esc(money(x.cents)) + (left === null ? '' : (left >= 0 ? ' · restam ' + left : ' · <b style="color:var(--warn-ink)">' + Math.abs(left) + ' acima da produção</b>'));
    return '<div class="frow"><div><div style="font-size:15px;font-weight:600">' + esc(x.name) + '</div><div class="small muted">' + sub + '</div></div>' +
      '<div class="step"><button type="button" aria-label="Diminuir ' + esc(x.name) + '" data-act="novaDec" data-id="' + x.id + '"' + (q2 <= 0 ? ' disabled' : '') + '>−</button>' +
      '<div class="q' + (q2 > 0 ? ' on' : '') + '">' + q2 + '</div>' +
      '<button type="button" class="plus" aria-label="Aumentar ' + esc(x.name) + '" data-act="novaInc" data-id="' + x.id + '">+</button></div></div>';
  }).join('') + '</div>' + (hasProd(t) ? '' : '<div class="small muted" style="margin-top:8px">A produção de hoje ainda não foi definida, então não há limite de estoque.</div>') +
    '<div class="row wrap" style="margin-top:8px;gap:8px"><button type="button" class="btn btn-ghost btn-sm" data-act="openProd">Ajustar produção</button><button type="button" class="btn btn-ghost btn-sm" data-act="openProdNew">+ Novo sabor</button></div></div>';

  var pb = '<div><div class="label">Pagamento</div><div class="seg"><button type="button" class="' + (n.paidNow ? 'on g' : '') + '" data-act="novaPaid" data-v="1">Pago agora</button>' +
    '<button type="button" class="' + (!n.paidNow ? 'on w' : '') + '" data-act="novaPaid" data-v="0">Pagar depois</button></div>';
  if (n.paidNow) {
    pb += '<div class="row wrap" style="margin-top:12px">' + PAYS.map(function (m) { return '<button type="button" class="pill' + (n.method === m ? ' on' : '') + '" data-act="novaMethod" data-m="' + m + '">' + m + '</button>'; }).join('') + '</div>';
  } else {
    pb += '<div class="small muted" style="margin-top:10px">A venda fica em "A receber" até você marcar como paga.</div>';
  }
  pb += '</div>';

  var phoneUse = cust ? (cust.phone || n.phone) : n.phone;
  var itm = {}, prc = {};
  fl.forEach(function (x) { if (n.items[x.id] > 0) { itm[x.id] = n.items[x.id]; prc[x.id] = x.cents; } });
  var disabled = (!nameOk || cnt === 0);
  var phoneOk = digits(phoneUse).length >= 10, nm = cust ? cust.name : n.query.trim();
  var canCharge = !n.paidNow && !disabled && phoneOk;
  var hint = !nameOk ? 'Informe o cliente' : (cnt === 0 ? 'Escolha ao menos 1 cookie' : (!n.paidNow && !phoneOk ? 'Informe o celular para enviar o pedido e o Pix' : ''));
  var second = canCharge
    ? '<a class="btn btn-green btn-lg" style="padding:0 18px" href="' + esc(waLink(phoneUse, orderText(nm, itm, prc, cents, extras))) + '" target="_blank" rel="noopener" data-act="novaCharge">Salvar e enviar Pix</a>'
    : '';
  var foot = '<div class="footer" style="flex-wrap:wrap"><div style="min-width:110px"><div class="small bold muted">' + cnt + (cnt === 1 ? ' cookie' : ' cookies') + '</div><div class="num" style="font-size:28px;line-height:1.1">' + money(payTotal) + '</div>' +
    (incl ? '<div class="tiny bold" style="color:var(--warn-ink)">inclui ' + money(pendC) + ' de pendências</div>' : '') +
    (hint ? '<div class="tiny muted">' + hint + '</div>' : '') + '</div>' +
    '<div class="row" style="flex:1 1 230px;justify-content:flex-end"><button type="button" class="btn ' + (second ? 'btn-outline' : 'btn-primary') + ' btn-lg" style="padding:0 20px" data-act="novaSave"' + (disabled ? ' disabled' : '') + '>Salvar venda</button>' + second + '</div></div>';
  var thanksNote = '<div class="small muted" style="line-height:1.45">' + (n.paidNow ? 'Ao salvar, o app pergunta se você quer agradecer o cliente (você envia pela tela Clientes).' : 'Quando você marcar como pago, o app pergunta se você quer agradecer o cliente.') + '</div>';
  return topSimple('Nova venda', 'hoje') + '<div class="scroll"><div class="split nova"><div class="ar-a">' + cb + '</div><div class="ar-b">' + fb + '</div><div class="ar-c col" style="gap:18px">' + pb + ((n.paidNow && n.method === 'Pix' && cnt > 0) ? qrCard(payTotal, cents, incl ? pendC : 0) : '') + thanksNote + '</div></div></div>' + foot;
}

/* ---------- VENDAS ---------- */
function viewVendas() {
  var t = today(), list = salesOn(t), pend = list.filter(function (s) { return !s.paid; }), paid = list.filter(function (s) { return s.paid; });
  var tabs = [['todas', 'Todas', list.length], ['receber', 'A receber', pend.length], ['pagas', 'Pagas', paid.length]];
  var top = '<div class="topbar"><div><h1>Vendas de hoje</h1><div class="sub">' + esc(fullDay(t).replace(' (hoje)', '')) + '</div></div>' +
    '<div class="row"><button type="button" class="btn btn-ghost btn-sm" data-act="go" data-screen="conferir">Conferir Pix</button><button type="button" class="iconbtn solid" aria-label="Nova venda" data-act="toNova">' + ic('plus', 24, 2.4) + '</button></div></div>' +
    '<div class="tabs">' + tabs.map(function (x) { return '<button type="button" class="tab' + (ui.vFilter === x[0] ? ' on' : '') + '" data-act="setFilter" data-f="' + x[0] + '">' + x[1] + ' · ' + x[2] + '</button>'; }).join('') + '</div>';
  var body = '';
  if (ui.vFilter !== 'pagas' && pend.length) body += '<div class="sect">A receber · ' + pend.length + '</div>' + '<div class="cards">' + orderSales(pend).map(saleCard).join('') + '</div>';
  if (ui.vFilter !== 'receber' && paid.length) body += '<div class="sect">Pagas · ' + paid.length + '</div>' + '<div class="cards">' + orderSales(paid).map(saleCard).join('') + '</div>';
  if (!body) body = '<div class="empty">' + (list.length ? 'Nenhuma venda nesta aba.' : 'Ainda não há vendas hoje.<br>Toque em + para registrar a primeira.') + '</div>';
  return top + '<div class="scroll">' + body + '</div>';
}

/* ---------- HISTÓRICO ---------- */
function viewHistorico() {
  var t = today(), sel = ui.hDay > t ? t : ui.hDay, pend = allPending();
  var floor = addDays(t, -59), start = addDays(t, -13);
  pend.forEach(function (s) { if (s.date < start && s.date >= floor) start = s.date; });
  if (sel < start && sel >= floor) start = sel;
  var days = [], d = start; while (d <= t) { days.push(d); d = addDays(d, 1); }
  var prev = pend.filter(function (s) { return s.date < t; });
  var prevDates = []; prev.forEach(function (s) { if (prevDates.indexOf(s.date) < 0) prevDates.push(s.date); }); prevDates.sort();

  var top = '<div class="topbar" style="display:block"><h1>Histórico</h1><div class="sub">Cada dia separado, com quem comprou e quem pagou</div></div>';
  var ban = '';
  if (prev.length) {
    ban = '<div style="margin:6px var(--px) 0" class="alert"><div class="bold" style="font-size:13px">Dias anteriores com pagamento pendente</div>' +
      '<div class="small" style="margin-top:2px">' + prev.length + (prev.length === 1 ? ' venda' : ' vendas') + ' · ' + money(sumCents(prev)) + ' a receber</div>' +
      '<div class="row wrap" style="margin-top:8px">' + prevDates.map(function (x) { return '<button type="button" class="btn btn-warn btn-sm" data-act="histDay" data-d="' + x + '">' + esc(shortDay(x)) + '</button>'; }).join('') + '</div></div>';
  }
  var strip = '<div class="strip" id="strip">' + days.map(function (x) {
    var s = stats(x), mk = s.pendN ? '<span class="mark warn">!</span>' : (s.n ? '<span class="mark ok">✓</span>' : '<span class="mark none">–</span>');
    var dd = pdate(x);
    return '<button type="button" class="day' + (x === sel ? ' on' : '') + '" data-act="histDay" data-d="' + x + '" aria-label="' + esc(fullDay(x)) + '"><span class="w">' + WD3[dd.getDay()] + '</span><span class="d">' + dd.getDate() + '</span>' + mk + '</button>';
  }).join('') + '</div>' +
  '<div class="row tiny bold muted" style="gap:14px;padding:8px var(--px) 0"><span class="row" style="gap:6px"><span class="mark ok" style="width:16px;height:16px;font-size:10px">✓</span>todos pagaram</span><span class="row" style="gap:6px"><span class="mark warn" style="width:16px;height:16px;font-size:10px">!</span>tem pendência</span></div>';

  var s = stats(sel), list = salesOn(sel), day = db.days[sel] || {}, fm = {};
  list.forEach(function (x) { var k; for (k in x.items) fm[k] = (fm[k] || 0) + x.items[k]; });
  var body = '<div class="row between" style="align-items:flex-start"><h2>' + esc(fullDay(sel)) + '</h2>' +
    '<span class="chip ' + (s.n === 0 ? 'chip-plain' : (s.pendN ? 'chip-warn' : 'chip-ok')) + '">' + (s.n === 0 ? 'Sem vendas' : (s.pendN ? s.pendN + ' sem pagar' : 'Todos pagaram')) + '</span></div>';
  if (!s.n) {
    body += '<div class="empty">Nenhuma venda registrada neste dia.</div>';
  } else {
    body += '<div class="grid3"><div class="mini"><div class="t">Cookies</div><div class="v" style="font-size:24px">' + s.cookies + '</div></div>' +
      '<div class="mini"><div class="t">Vendas</div><div class="v" style="font-size:24px">' + s.n + '</div></div>' +
      '<div class="mini"><div class="t">Total</div><div class="v" style="font-size:16px;line-height:1.9">' + money(s.cents) + '</div></div></div>' +
      '<div class="grid2" style="gap:8px"><div class="mini ok"><div class="t">Recebido</div><div class="v">' + money(s.paidC) + '</div></div>' +
      '<div class="mini ' + (s.pendN ? 'warn' : '') + '"><div class="t">A receber</div><div class="v">' + money(s.pendC) + '</div></div></div>';
    if (day.closed) body += '<div class="small muted">Caixa fechado às ' + esc(day.closed.at) + (day.closed.note ? ' · ' + esc(day.closed.note) : '') + '</div>';
    body += '<div><div class="label">O que foi vendido</div><div class="row wrap">' + flavorRowsOf(fm).map(function (r) {
      return '<span class="chip chip-plain">' + esc(r.name) + ' <b style="font-size:14px;color:var(--primary)">' + r.qty + '</b></span>';
    }).join('') + '</div></div>' +
      '<div><div class="label">Para quem foi · sem pagamento primeiro</div><div class="cards">' + orderSales(list).map(saleCard).join('') + '</div></div>';
  }
  return top + ban + strip + '<div class="scroll" style="padding-top:14px">' + body + '</div>';
}

/* ---------- FECHAR CAIXA ---------- */
function viewFechar() {
  var t = today(), prod = producedOf(t), sold = soldMap(t), st = stats(t), day = db.days[t] || {}, closed = day.closed;
  var rows = db.flavors.filter(function (f) { return prod[f.id] > 0 || sold[f.id] > 0; });
  var made = 0, k; for (k in prod) made += prod[k] || 0;
  var left = Math.max(0, made - st.cookies), allSold = made > 0 && left === 0;
  var body = '<div class="sub" style="margin:0 0 -4px">' + esc(fullDay(t).replace(' (hoje)', '')) + '</div>';
  body += '<div class="split"><div class="card"><div class="bold" style="font-size:14px;margin-bottom:8px">1. Conferir os cookies</div>';
  if (!rows.length) {
    body += '<div class="empty" style="padding:10px 0">Sem produção nem vendas hoje.</div>';
  } else {
    body += '<div class="tbl h"><span>Sabor</span><span>Feitos</span><span>Vendidos</span><span>Sobram</span></div>' + rows.map(function (f) {
      var m = prod[f.id] || 0, s = sold[f.id] || 0;
      return '<div class="tbl r"><span style="font-weight:600;font-size:13px">' + esc(f.name) + '</span><span>' + m + '</span><span>' + s + '</span><span class="bold" style="color:var(--warn-ink)">' + Math.max(0, m - s) + '</span></div>';
    }).join('') + '<div class="tbl r bold" style="border-bottom:0"><span style="font-size:13px">Total</span><span>' + made + '</span><span>' + st.cookies + '</span><span style="color:var(--warn-ink)">' + left + '</span></div>';
  }
  body += '<label class="check" style="margin-top:6px;padding:0 12px;border-radius:12px;background:var(--soft)"><input type="checkbox" disabled' + (allSold ? ' checked' : '') + '>Todos os cookies foram vendidos</label>' +
    '<div class="small muted" style="margin-top:8px">' + (allSold ? 'Tudo vendido. O check foi marcado automaticamente.' : (made > 0 ? 'Ainda sobram ' + left + '. Venda o que falta ou anote o destino das sobras.' : 'Defina a produção do dia na tela Hoje.')) + '</div>';
  if (!closed && left > 0) {
    body += '<label class="field" style="margin-top:10px"><span>Destino das sobras (opcional)</span><input class="inp" id="obs" type="text" placeholder="Ex.: guardei para amanhã" value="' + esc(ui.closeNote) + '" data-in="closeNote"></label>';
  }
  body += '</div>';
  var methods = PAYS.map(function (m) { return '<div class="row between" style="min-height:40px;border-bottom:1px solid var(--line2)"><span style="font-weight:600">' + m + '</span><span class="bold">' + money(st.byMethod[m] || 0) + '</span></div>'; }).join('');
  body += '<div class="card"><div class="bold" style="font-size:14px;margin-bottom:4px">2. Conferir os pagamentos</div>' + methods +
    '<div class="row between bold" style="min-height:44px;color:var(--green)"><span>Total recebido</span><span>' + money(st.paidC) + '</span></div>' +
    '<div class="alert row between" style="padding:10px 12px;border:0"><div><div class="bold" style="font-size:13px">A receber · ' + money(st.pendC) + '</div><div class="small" style="font-weight:500">' + st.pendN + (st.pendN === 1 ? ' venda ainda sem pagamento' : ' vendas ainda sem pagamento') + '</div></div>' +
    (st.pendN ? '<button type="button" class="btn btn-warn btn-sm" data-act="goReceber">Ver pendências</button>' : '') + '</div></div></div>';
  var foot = closed
    ? '<div style="padding:12px var(--px) 18px"><div class="small muted" style="text-align:center;margin-bottom:8px">Caixa fechado às ' + esc(closed.at) + '</div><button type="button" class="btn btn-outline btn-lg btn-block" data-act="fecharReopen">Reabrir caixa</button></div>'
    : '<div style="padding:12px var(--px) 18px"><button type="button" class="btn btn-primary btn-lg btn-block" data-act="fecharConfirm">Fechar caixa de hoje</button><div class="small muted" style="text-align:center;margin-top:8px">As vendas a receber continuam abertas nos próximos dias.</div></div>';
  return topSimple('Fechar caixa', 'hoje') + '<div class="scroll">' + body + '</div>' + foot;
}

/* ---------- CLIENTES ---------- */
function thankGroups(list) {
  var order = [], map = {};
  list.forEach(function (s) {
    var key = s.customerId || ('n:' + norm(s.name));
    if (!map[key]) { map[key] = { sales: [], name: custName(s), phone: custPhone(s), cid: s.customerId }; order.push(map[key]); }
    map[key].sales.push(s);
  });
  return order;
}
function viewClientes() {
  var q = norm(ui.cliQuery);
  var byRecent = function (a, b) { return (a.date + a.time) < (b.date + b.time) ? 1 : -1; };
  var focus = ui.cliFocus || [];
  var queue = thankGroups(db.sales.filter(function (s) { return s.paid && s.thank === 'pending'; }).sort(byRecent));
  queue.sort(function (x, y) {
    var fx = x.sales.some(function (s) { return focus.indexOf(s.id) >= 0; }) ? 0 : 1, fy = y.sales.some(function (s) { return focus.indexOf(s.id) >= 0; }) ? 0 : 1;
    return fx - fy;
  });
  var sent = thankGroups(db.sales.filter(function (s) { return s.thank === 'sent'; }).sort(byRecent)).slice(0, 5);
  var cl = db.customers.filter(function (c) { return !q || norm(c.name).indexOf(q) >= 0 || digits(c.phone).indexOf(digits(ui.cliQuery)) >= 0 && digits(ui.cliQuery).length > 2; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
  var top = '<div class="topbar"><h1>Clientes</h1><button type="button" class="iconbtn solid" aria-label="Cadastrar cliente" data-act="cliNew">' + ic('userplus', 24, 2.2) + '</button></div>';
  var body = '<input class="box" id="cbusca" type="search" placeholder="Buscar por nome ou celular" value="' + esc(ui.cliQuery) + '" data-in="cliQuery">';
  body += '<div class="card"><div class="bold" style="font-size:14px;margin-bottom:8px">Mensagem de agradecimento</div>' +
    '<div class="wa">' + esc(thankText('Maria')) + '</div>' +
    (db.settings.reviewLink ? '' : '<div class="small" style="margin-top:8px;color:var(--warn-ink);font-weight:600">Falta o link de avaliação. Cole em Ajustes para ele entrar na mensagem.</div>') +
    '<div class="small muted" style="margin-top:8px">O nome é trocado pelo de cada cliente na hora de enviar. Para mudar o texto, use Ajustes (ícone de controles no topo da tela Hoje).</div></div>';
  body += '<div><div class="label">Para agradecer · ' + queue.length + '</div><div class="cards">' + (queue.length ? queue.map(function (g) {
    var last = g.sales[0], n = g.sales.length, ids = g.sales.map(function (x) { return x.id; }).join(','), foc = g.sales.some(function (x) { return focus.indexOf(x.id) >= 0; });
    return '<div class="crow' + (foc ? ' focus' : '') + '"><div class="avatar">' + esc(initials(g.name)) + '</div><div style="flex:1;min-width:0"><div class="bold" style="font-size:14px">' + esc(g.name) + '</div>' +
      '<div class="small muted">' + esc(g.phone || 'sem celular') + ' · ' + (n === 1 ? 'comprou ' + esc(shortDay(last.date)) + ' ' + esc(last.time || '') : n + ' compras · última ' + esc(shortDay(last.date)) + ' ' + esc(last.time || '')) + '</div></div>' +
      (g.phone ? '<a class="btn btn-green btn-sm" href="' + esc(waLink(g.phone, thankText(g.name))) + '" target="_blank" rel="noopener" data-act="thanked" data-id="' + ids + '">' + ic('arrow', 16, 2.2) + 'WhatsApp</a>'
               : '<button type="button" class="btn btn-ghost btn-sm" data-act="cliOpen" data-cid="' + (g.cid || '') + '">Add celular</button>') + '</div>';
  }).join('') : '<div class="empty" style="padding:12px 0">Ninguém aguardando agradecimento.</div>') + '</div></div>';
  if (sent.length) {
    body += '<div><div class="label">Já agradecidos · últimos</div><div class="cards">' + sent.map(function (g) {
      var last = g.sales[0], ids = g.sales.map(function (x) { return x.id; }).join(',');
      return '<div class="crow"><div class="avatar" style="background:var(--line2);color:var(--muted)">' + esc(initials(g.name)) + '</div><div style="flex:1;min-width:0"><div class="bold" style="font-size:14px">' + esc(g.name) + '</div>' +
        '<div class="small muted">' + esc(g.phone || '') + ' · ' + esc(shortDay(last.date)) + '</div></div>' +
        '<div class="row" style="gap:2px"><span class="chip chip-ok">✓ Enviado</span>' + (g.phone ? '<a class="linkbtn" href="' + esc(waLink(g.phone, thankText(g.name))) + '" target="_blank" rel="noopener" data-act="thanked" data-id="' + ids + '">Reenviar</a>' : '') + '</div></div>';
    }).join('') + '</div></div>';
  }
  body += '<div><div class="label">Todos os clientes · ' + cl.length + '</div><div class="cards">' + (cl.length ? cl.map(function (c) {
    var pc = sumCents(pendingOfCustomer(c.id)), nb = db.sales.filter(function (s) { return s.customerId === c.id; }).length;
    return '<button type="button" class="crow' + (pc ? ' pend' : '') + '" data-act="cliOpen" data-cid="' + c.id + '"><div class="avatar">' + esc(initials(c.name)) + '</div>' +
      '<div style="flex:1;min-width:0"><div class="bold" style="font-size:14px">' + esc(c.name) + '</div><div class="small muted">' + esc(c.phone || 'sem celular') + ' · ' + nb + (nb === 1 ? ' compra' : ' compras') + '</div></div>' +
      (pc ? '<span class="chip chip-warn">' + money(pc) + '</span>' : '') + '</button>';
  }).join('') : '<div class="empty" style="padding:12px 0">' + (db.customers.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.<br>Eles são cadastrados ao registrar uma venda ou pelo botão acima.') + '</div>') + '</div></div>';
  return top + '<div class="scroll">' + body + '</div>';
}

/* ---------- RELATÓRIOS ---------- */
function rangeFor() {
  var t = today(), from, to;
  if (ui.rPeriod === 'hoje') { from = to = t; }
  else if (ui.rPeriod === '7d') { from = addDays(t, -6); to = t; }
  else if (ui.rPeriod === 'mes') { from = t.slice(0, 8) + '01'; to = t; }
  else { from = ui.rFrom; to = ui.rTo; if (from > to) { var x = from; from = to; to = x; } }
  var list = [], d = from, g = 0; while (d <= to && g < 92) { list.push(d); d = addDays(d, 1); g++; }
  return { from: from, to: to, days: list };
}
function viewRelatorios() {
  var r = rangeFor(), set = {}; r.days.forEach(function (d) { set[d] = 1; });
  var cookies = 0, cents = 0, pendC = 0, per = {}, fm = {}, fmDay = {};
  db.sales.forEach(function (s) {
    if (!set[s.date]) return;
    var c = countItems(s.items); cookies += c; cents += s.cents; if (!s.paid) pendC += s.cents; per[s.date] = (per[s.date] || 0) + c;
    var k; for (k in s.items) { fm[k] = (fm[k] || 0) + s.items[k]; if (ui.rDay === s.date) fmDay[k] = (fmDay[k] || 0) + s.items[k]; }
  });
  if (ui.rDay && !set[ui.rDay]) ui.rDay = null;
  var scope = ui.rDay ? fmDay : fm, rows = flavorRowsOf(scope), total = rows.reduce(function (a, x) { return a + x.qty; }, 0);
  var periods = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês'], ['outro', 'Outro']];
  var label = r.from === r.to ? longDay(r.from) : longDay(r.from) + ' a ' + longDay(r.to);
  var top = '<div class="topbar" style="display:block"><h1>Relatórios</h1><div class="sub">' + esc(label) + '</div></div>' +
    '<div class="tabs">' + periods.map(function (p) { return '<button type="button" class="tab' + (ui.rPeriod === p[0] ? ' on' : '') + '" data-act="repPeriod" data-p="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>';
  var body = '';
  if (ui.rPeriod === 'outro') {
    body += '<div class="grid2" style="gap:10px"><label class="field"><span>De</span><input class="box" type="date" value="' + esc(ui.rFrom) + '" data-ch="rFrom"></label>' +
      '<label class="field"><span>Até</span><input class="box" type="date" value="' + esc(ui.rTo) + '" data-ch="rTo"></label></div>';
  }
  body += '<div class="grid2" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)"><div class="hero" style="padding:14px 16px"><div class="l" style="margin:0">Cookies vendidos</div><div class="n" style="font-size:44px;line-height:1.1">' + cookies + '</div></div>' +
    '<div class="cards"><div class="mini"><div class="t">Faturamento</div><div class="v" style="font-size:18px">' + money(cents) + '</div></div>' +
    '<div class="mini"><div class="t">A receber</div><div class="v" style="font-size:18px;color:var(--warn-ink)">' + money(pendC) + '</div></div></div></div>';
  var chartHtml = '';
  if (r.days.length > 1) {
    var max = 1; r.days.forEach(function (d) { if ((per[d] || 0) > max) max = per[d]; });
    chartHtml = '<div class="card" style="padding:14px 10px 10px"><div style="padding:0 6px;margin-bottom:10px"><div class="bold" style="font-size:14px">Cookies vendidos por dia</div><div class="small muted" style="margin-top:2px">Toque em um dia para ver os sabores</div></div>' +
      '<div class="chart">' + r.days.map(function (d) {
        var v = per[d] || 0, on = ui.rDay === d, dd = pdate(d);
        return '<button type="button" class="cbar' + (on ? ' on' : (ui.rDay ? ' dim' : '')) + '" data-act="repDay" data-d="' + d + '" aria-label="' + esc(fullDay(d)) + ': ' + v + ' cookies vendidos"><span class="v">' + v + '</span><span class="b" style="height:' + Math.round(v / max * 80) + 'px"></span><span class="w">' + WD3[dd.getDay()] + '<br>' + dd.getDate() + '</span></button>';
      }).join('') + '</div></div>';
  }
  var flHtml = '<div class="card"><div class="row between" style="align-items:flex-start;margin-bottom:6px"><div><div class="bold" style="font-size:14px">Sabores vendidos</div><div class="small bold muted" style="margin-top:2px">' + esc(ui.rDay ? fullDay(ui.rDay) : (r.days.length > 1 ? 'Período todo' : fullDay(r.from))) + '</div></div>' +
    '<div style="text-align:right"><div class="num" style="font-size:26px;line-height:1;color:var(--primary)">' + total + '</div><div class="tiny bold muted">cookies</div></div></div>' +
    (ui.rDay ? '<button type="button" class="btn btn-ghost btn-sm" style="margin:6px 0 4px" data-act="repAll">Ver período todo</button>' : '') +
    '<div style="margin-top:10px">' + flavorBars(rows, total) + '</div></div>';
  body += chartHtml ? '<div class="split wl">' + chartHtml + flHtml + '</div>' : flHtml;
  return top + '<div class="scroll" style="padding-top:14px">' + body + '</div>';
}

/* ---------- AJUSTES ---------- */
function syncInfo() {
  var m = Cloud.mode, busy = Object.keys(Cloud.ops).length > 0;
  if (m === 'connecting') return { t: 'Conectando…', c: 'chip-plain' };
  if (m === 'online') return busy ? { t: 'Sincronizando…', c: 'chip-plain' } : { t: 'Online · sincronizado', c: 'chip-ok' };
  if (m === 'readonly') return { t: 'Somente leitura', c: 'chip-warn' };
  if (m === 'offline') return { t: 'Sem conexão · leitura', c: 'chip-warn' };
  return { t: 'Só neste aparelho', c: 'chip-warn' };
}
function syncChip() { var i = syncInfo(); return '<span class="chip ' + i.c + ' syncchip">' + esc(i.t) + '</span>'; }
function syncCard() {
  var m = Cloud.mode, who = Cloud.me && Cloud.me.name ? Cloud.me.name : '';
  var txt = {
    connecting: 'Conectando à nuvem…',
    online: 'Os dados ficam salvos na nuvem e aparecem ao vivo em todos os aparelhos que têm acesso a este app.',
    readonly: 'Sua conta consegue ver os dados, mas não alterar. Peça ao dono do app para liberar o seu e-mail.',
    offline: 'Sem conexão com a nuvem. Mostrando os últimos dados salvos neste aparelho, somente para leitura. Volte a ficar online para sincronizar.',
    local: 'Os dados estão salvos só neste aparelho.'
  }[m];
  var h = '<div class="card col"><div class="row between"><div class="bold" style="font-size:14px">Sincronização</div>' + syncChip() + '</div>' +
    '<div class="small muted" style="line-height:1.45">' + txt + '</div>' +
    (who ? '<div class="small">Conectado como <b>' + esc(who) + '</b></div>' : '');
  if (m === 'online' && legacyDiff()) h += '<button type="button" class="btn btn-outline btn-block" data-act="migrateAsk">Enviar dados antigos deste aparelho para a nuvem</button>';
  if (Auth.required) h += '<button type="button" class="btn btn-outline btn-block" data-act="logout">Sair da conta</button>';
  return h + '</div>';
}
function pixOkText() {
  var p = db.settings.pixPayload;
  return pixPayloadOk(p) ? '✓ Código válido · recebedor: ' + esc(pixReceiver(p)) : 'Código inválido: cole o "Pix copia e cola" completo.';
}
function viewAjustes() {
  var body = '<div class="split">' + syncCard() + '<div class="card"><div class="bold" style="font-size:14px;margin-bottom:4px">Sabores e preços</div>' + db.flavors.map(function (f) {
    return '<div class="frow" style="min-height:64px"><input class="box" style="min-height:44px;font-size:16px;flex:1;min-width:0" value="' + esc(f.name) + '" data-in="flName" data-id="' + f.id + '" aria-label="Nome do sabor">' +
      '<div class="pricebox"><span class="small muted">R$</span><input class="box" style="min-height:44px;font-size:16px;padding:0 10px" inputmode="decimal" value="' + fmtInput(f.cents) + '" data-in="flPrice" data-id="' + f.id + '" aria-label="Preço de ' + esc(f.name) + '"></div>' +
      '<button type="button" class="btn btn-sm ' + (f.active ? 'btn-green' : 'btn-ghost') + '" style="width:76px" data-act="flToggle" data-id="' + f.id + '">' + (f.active ? 'Ativo' : 'Inativo') + '</button></div>';
  }).join('') + '<button type="button" class="btn btn-ghost btn-block" style="margin-top:10px" data-act="flAdd">+ Adicionar sabor</button>' +
    '<div class="small muted" style="margin-top:8px;line-height:1.4">Mudar um preço vale para as próximas vendas. As vendas já feitas mantêm o preço da época. Sabores inativos somem da venda, mas continuam no histórico.</div></div>';
  body += '<div class="card col"><div class="bold" style="font-size:14px">Pix e cobrança (WhatsApp)</div>' +
    '<label class="field"><span>Chave Pix que aparece na mensagem</span><input class="box" id="pixkey" type="text" inputmode="text" value="' + esc(db.settings.pixKey) + '" data-in="pixKey"></label>' +
    '<textarea class="box" id="ordtpl" data-in="ordTpl" aria-label="Mensagem do pedido">' + esc(db.settings.orderTemplate) + '</textarea>' +
    '<div class="small muted" style="line-height:1.45">Use <b>{nome}</b>, <b>{itens}</b> (sabores e valores), <b>{pendencias}</b> (pendências anteriores incluídas), <b>{total}</b> (já com as pendências), <b>{pix}</b> e <b>{copiaecola}</b> (código Pix copia e cola, já com o valor da venda). Esta mensagem é enviada no botão "Salvar e enviar Pix" e em "Cobrar Pix".</div>' +
    '<label class="field"><span>Código do QR Pix (copia e cola, sem valor)</span><textarea class="box" id="pixpay" data-in="pixPayload" style="min-height:96px;font-size:16px;word-break:break-all">' + esc(db.settings.pixPayload) + '</textarea></label>' +
    '<div id="pixok" class="small bold">' + pixOkText() + '</div>' +
    '<div class="small muted" style="line-height:1.45">É o código do QR que aparece na tela de pagamento. Para trocar de conta, gere no app do banco um QR sem valor, copie o "Pix copia e cola" e cole aqui. O app coloca o valor de cada venda sozinho.</div></div>';
  body += '<div class="card col"><div class="bold" style="font-size:14px">Mensagem de agradecimento (WhatsApp)</div>' +
    '<textarea class="box" id="tpl" data-in="tpl" aria-label="Mensagem de agradecimento">' + esc(db.settings.template) + '</textarea>' +
    '<div class="small muted">Use <b>{nome}</b> para o primeiro nome do cliente e <b>{link}</b> para o link de avaliação.</div>' +
    '<label class="field"><span>Link de avaliação (Google, Instagram, formulário...)</span><input class="box" id="lnk" type="url" inputmode="url" placeholder="https://..." value="' + esc(db.settings.reviewLink) + '" data-in="lnk"></label></div>';
  body += '<div class="card col"><div class="bold" style="font-size:14px">Dados</div>' +
    '<div class="small muted" style="line-height:1.45">' + (Cloud.mode === 'online' ? 'Os dados estão na nuvem. Carregar exemplos, importar ou apagar afeta todos os aparelhos.' : 'Os dados deste aparelho não estão sincronizados com a nuvem.') + '</div>' +
    '<button type="button" class="btn btn-outline btn-block" data-act="demoAsk">Carregar dados de exemplo</button>' +
    '<button type="button" class="btn btn-outline btn-block" data-act="exportData">Exportar backup</button>' +
    (ui.backup ? '<textarea class="box" id="bk" readonly style="min-height:120px" data-act="selectAll">' + esc(ui.backup) + '</textarea><div class="small muted">Copie este texto e guarde. Para restaurar, cole abaixo.</div>' : '') +
    '<textarea class="box" id="imp" placeholder="Cole aqui um backup para importar" style="min-height:80px" data-in="importText">' + esc(ui.importText) + '</textarea>' +
    '<button type="button" class="btn btn-outline btn-block" data-act="importAsk"' + '>Importar backup</button>' +
    '<button type="button" class="btn btn-outline-warn btn-block" data-act="wipeAsk">Apagar todos os dados</button></div></div>';
  return topSimple('Ajustes', 'hoje') + '<div class="scroll">' + body + '</div>';
}

/* ---------- FOLHAS (sheets) ---------- */
function sheetHtml() {
  var sh = ui.sheet; if (!sh) return '';
  var h = '';
  var s = sh.sid ? saleById(sh.sid) : null;
  var due = s ? dueOf(s) : { extras: [], extraC: 0, total: 0 };
  if (sh.type === 'prod') {
    var t = today(), sold = soldMap(t), total = 0, k;
    var fl = activeFlavors().concat(db.flavors.filter(function (f) { return !f.active && (sold[f.id] > 0 || sh.draft[f.id] > 0); }));
    fl.forEach(function (f) { total += sh.draft[f.id] || 0; });
    var cur = 0; var pr = producedOf(t); for (k in pr) cur += pr[k] || 0;
    var diff = total - cur;
    var rowsHtml = fl.map(function (f) {
      var q = sh.draft[f.id] || 0, sd = sold[f.id] || 0;
      if (sh.editId === f.id) {
        return '<div class="frow" style="flex-wrap:wrap;padding:8px 0"><input class="box" style="min-height:44px;font-size:16px;flex:1 1 150px" value="' + esc(f.name) + '" data-in="flName" data-id="' + f.id + '" aria-label="Nome do sabor">' +
          '<div class="pricebox" style="width:120px"><span class="small muted">R$</span><input class="box" style="min-height:44px;font-size:16px;padding:0 10px" inputmode="decimal" value="' + fmtInput(f.cents) + '" data-in="flPrice" data-id="' + f.id + '" aria-label="Preço"></div>' +
          '<button type="button" class="btn btn-green btn-sm" data-act="prodEditDone">Pronto</button></div>';
      }
      return '<div class="frow"><div><div style="font-size:15px;font-weight:600">' + esc(f.name) + ' <button type="button" class="btn btn-ghost btn-sm" style="min-height:32px;padding:0 10px;font-size:12px;margin-left:4px" data-act="prodEdit" data-id="' + f.id + '" aria-label="Editar ' + esc(f.name) + '">Editar</button></div>' +
        '<div class="small muted">' + esc(money(f.cents)) + ' · já vendidos ' + sd + ' · sobram ' + (q - sd) + '</div></div>' +
        '<div class="step"><button type="button" aria-label="Diminuir ' + esc(f.name) + '" data-act="prodDec" data-id="' + f.id + '"' + (q <= sd ? ' disabled' : '') + '>−</button><div class="q on">' + q + '</div>' +
        '<button type="button" class="plus" aria-label="Aumentar ' + esc(f.name) + '" data-act="prodInc" data-id="' + f.id + '">+</button></div></div>';
    }).join('');
    var nq = sh.newQty || 0;
    var newBlock = sh.adding
      ? '<div class="card col" style="margin-top:10px;padding:12px 14px"><div class="bold" style="font-size:14px">Novo sabor</div>' +
        '<label class="field"><span>Nome do sabor</span><input class="inp" id="pnn" type="text" placeholder="Ex.: Ovomaltine" value="' + esc(sh.newName || '') + '" data-in="prodNewName"></label>' +
        '<label class="field"><span>Preço (R$)</span><input class="inp" id="pnp" type="text" inputmode="decimal" placeholder="15,90" value="' + esc(sh.newPrice || '') + '" data-in="prodNewPrice"></label>' +
        '<div class="row between"><span class="small bold muted">Quantidade para hoje</span><div class="step"><button type="button" aria-label="Diminuir" data-act="prodNewDec"' + (nq <= 0 ? ' disabled' : '') + '>−</button><div class="q on">' + nq + '</div><button type="button" class="plus" aria-label="Aumentar" data-act="prodNewInc">+</button></div></div>' +
        '<div class="two" style="margin-top:6px"><button type="button" class="btn btn-outline" data-act="prodNewCancel">Cancelar</button><button type="button" class="btn btn-primary" data-act="prodNewSave">Adicionar sabor</button></div></div>'
      : '<button type="button" class="btn btn-ghost btn-block" style="margin-top:10px" data-act="prodNew">+ Novo sabor</button>';
    h = '<h2>Produção e sabores</h2><div class="small muted" style="line-height:1.4">Quantos cookies de cada sabor você tem hoje para vender. Aqui você também edita nome e preço e inclui sabores novos do cardápio.</div><div style="margin-top:8px">' + rowsHtml + '</div>' + newBlock +
      '<div class="row between" style="margin-top:14px;align-items:baseline"><div><div class="small bold muted">Total para vender hoje</div><div class="small muted">' +
      (diff === 0 ? 'sem alteração' : (diff > 0 ? '+' : '−') + Math.abs(diff) + ' em relação ao salvo') + '</div></div><div class="num" style="font-size:30px;line-height:1">' + total + '</div></div>' +
      '<div class="two" style="margin-top:18px"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="prodSave">Salvar produção</button></div>';
  } else if (sh.type === 'pay1' && s) {
    h = '<div class="small bold muted">Passo 1 de 2</div><h2>Marcar como pago</h2><div style="font-size:14px"><b>' + esc(custName(s)) + '</b> · ' + money(due.total) + '</div>' +
      (due.extras.length ? '<div class="small bold" style="margin-top:2px;color:var(--warn-ink)">Inclui ' + due.extras.length + (due.extras.length === 1 ? ' pendência anterior' : ' pendências anteriores') + ': ' + money(due.extraC) + '. Todas serão baixadas juntas.</div>' : '') +
      '<div class="small muted" style="margin-top:2px">' + esc(fullDay(s.date)) + ' · ' + esc(itemsText(s.items)) + '</div><div class="label" style="margin:18px 0 8px">Como foi pago?</div>' +
      '<div class="row wrap">' + PAYS.map(function (m) { return '<button type="button" class="pill' + (sh.method === m ? ' on' : '') + '" data-act="payMethod" data-m="' + m + '">' + m + '</button>'; }).join('') + '</div>' +
      '<div class="two" style="margin-top:22px"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="payNext">Continuar</button></div>';
  } else if (sh.type === 'pay2' && s) {
    h = '<div class="small bold muted">Passo 2 de 2</div><h2>Confirme o recebimento</h2><div class="big ok"><div class="n">' + money(due.total) + '</div><div style="font-size:14px;font-weight:600;margin-top:6px">' + esc(custName(s)) + ' · ' + esc(sh.method) + '</div><div class="small" style="margin-top:2px">Venda de ' + esc(fullDay(s.date)) + '</div>' + (due.extras.length ? '<div class="small" style="margin-top:4px">Inclui ' + due.extras.length + (due.extras.length === 1 ? ' pendência anterior' : ' pendências anteriores') + ' (' + money(due.extraC) + '): ' + due.extras.map(function (x) { return esc(shortDay(x.date)); }).join(', ') + '</div>' : '') + '</div>' +
      '<div style="font-size:14px;line-height:1.45;margin-top:14px">Você realmente recebeu esse valor? Depois você ainda pode desfazer, também com confirmação.</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="payBack">Voltar</button><button type="button" class="btn btn-green btn-lg" style="min-height:52px;font-size:15px" data-act="payConfirm">Sim, recebi</button></div>';
  } else if (sh.type === 'unpay1' && s) {
    h = '<div class="small bold muted">Passo 1 de 2</div><h2>Desfazer pagamento?</h2><div style="font-size:14px;line-height:1.45"><b>' + esc(custName(s)) + '</b> (' + esc(fullDay(s.date)) + ') está marcada como <b>paga</b> (' + esc(s.method || '') + ', ' + money(s.cents) + '). Ao desfazer, a venda volta para <b>A receber</b>.</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="unpayNext">Continuar</button></div>';
  } else if (sh.type === 'unpay2' && s) {
    h = '<div class="small bold muted">Passo 2 de 2</div><h2>Confirme de novo</h2><div class="big warn"><div class="n">' + money(s.cents) + '</div><div style="font-size:14px;font-weight:600;margin-top:6px">' + esc(custName(s)) + ' · ' + esc(fullDay(s.date)) + '</div></div>' +
      '<div style="font-size:14px;line-height:1.45;margin-top:14px">Esta venda <b>não foi paga</b>?</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="unpayBack">Voltar</button><button type="button" class="btn btn-warn btn-lg" style="min-height:52px;font-size:15px" data-act="unpayConfirm">Sim, não foi paga</button></div>';
  } else if (sh.type === 'edit' && s) {
    var sd2 = soldMap(s.date, s.id);
    var fl2 = db.flavors.filter(function (f) { return f.active || sh.items[f.id] > 0 || (s.items[f.id] || 0) > 0; });
    var cnt = 0, cents = 0;
    fl2.forEach(function (f) { var q = sh.items[f.id] || 0; cnt += q; cents += q * ((s.prices && s.prices[f.id]) || f.cents); });
    h = '<h2>Editar venda</h2><div class="small muted">' + esc(custName(s)) + ' · ' + esc(fullDay(s.date)) + '</div><div class="label" style="margin:14px 0 2px">Sabores e quantidades</div><div>' + fl2.map(function (f) {
      var q = sh.items[f.id] || 0, rem = remaining(s.date, f.id, s.id), cap = rem === null ? 999 : Math.max(rem, 0), pr2 = (s.prices && s.prices[f.id]) || f.cents;
      return '<div class="frow"><div><div style="font-size:14px;font-weight:600">' + esc(f.name) + '</div><div class="small muted">' + money(pr2) + '</div></div>' +
        '<div class="step"><button type="button" aria-label="Diminuir ' + esc(f.name) + '" data-act="editDec" data-id="' + f.id + '"' + (q <= 0 ? ' disabled' : '') + '>−</button><div class="q' + (q > 0 ? ' on' : '') + '">' + q + '</div>' +
        '<button type="button" class="plus" aria-label="Aumentar ' + esc(f.name) + '" data-act="editInc" data-id="' + f.id + '">+</button></div></div>';
    }).join('') + '</div><div class="row between" style="margin-top:12px;align-items:baseline"><span class="small bold muted">' + cnt + ' cookies</span><span class="num" style="font-size:26px">' + money(cents) + '</span></div>' +
      '<div class="small muted" style="margin-top:6px">Para corrigir o pagamento, use "Marcar como pago" ou "Desfazer pago" na lista.</div>' +
      '<div class="two" style="margin-top:16px"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="editSave"' + (cnt === 0 ? ' disabled' : '') + '>Salvar alterações</button></div>' +
      '<button type="button" class="btn btn-outline-warn btn-block" style="margin-top:10px" data-act="delAsk">Excluir esta venda</button>';
  } else if (sh.type === 'del' && s) {
    h = '<h2>Excluir venda?</h2><div style="font-size:14px;line-height:1.45">Vai apagar a venda de <b>' + esc(custName(s)) + '</b> (' + money(s.cents) + ', ' + esc(fullDay(s.date)) + '). Isso não pode ser desfeito.</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-warn btn-lg" style="min-height:52px;font-size:15px" data-act="delConfirm">Sim, excluir</button></div>';
  } else if (sh.type === 'cust') {
    var c = sh.cid ? customerById(sh.cid) : null, pend = c ? pendingOfCustomer(c.id) : [];
    var hist = c ? db.sales.filter(function (x) { return x.customerId === c.id; }) : [];
    var ck = hist.reduce(function (a, x) { return a + countItems(x.items); }, 0);
    h = '<h2>' + (c ? 'Cliente' : 'Novo cliente') + '</h2><div class="col"><label class="field"><span>Nome</span><input class="inp" id="cuName" type="text" value="' + esc(sh.name) + '" data-in="cuName"></label>' +
      '<label class="field"><span>Celular (WhatsApp)</span><input class="inp" id="cuPhone" type="tel" inputmode="tel" placeholder="(11) 90000-0000" value="' + esc(sh.phone) + '" data-in="cuPhone"></label></div>';
    if (c) {
      h += '<div class="grid3" style="margin-top:14px"><div class="mini"><div class="t">Compras</div><div class="v">' + hist.length + '</div></div><div class="mini"><div class="t">Cookies</div><div class="v">' + ck + '</div></div>' +
        '<div class="mini ' + (pend.length ? 'warn' : '') + '"><div class="t">A receber</div><div class="v" style="font-size:15px;line-height:2">' + money(sumCents(pend)) + '</div></div></div>';
      if (pend.length) h += '<div class="alert" style="margin-top:10px;font-size:13px">' + pend.map(function (x) { return '<div>' + esc(shortDay(x.date)) + ' · ' + money(x.cents) + '</div>'; }).join('') + '</div>';
    }
    h += '<div class="two" style="margin-top:18px"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="cliSave">Salvar</button></div>' +
      (c ? '<button type="button" class="btn btn-outline btn-block" style="margin-top:10px" data-act="cliVenda" data-cid="' + c.id + '">Nova venda para ' + esc(c.name.split(' ')[0]) + '</button>' : '');
  } else if (sh.type === 'thanks') {
    var tsales = (sh.sids || []).map(saleById).filter(Boolean), tseen = {}, tnames = [];
    tsales.forEach(function (x) { var k = x.customerId || x.name; if (!tseen[k]) { tseen[k] = 1; tnames.push(firstName(custName(x))); } });
    var one = tnames.length === 1;
    h = '<div class="small bold" style="color:var(--green)">' + esc(sh.head || 'Pagamento registrado ✓') + '</div>' +
      '<h2>' + (one ? 'Agradecer a ' + esc(tnames[0]) + '?' : 'Agradecer aos clientes?') + '</h2>' +
      '<div style="font-size:14px;line-height:1.45">' + (one ? 'Quer enviar o agradecimento pela compra, com o pedido de avaliação?' : tnames.length + ' clientes ainda não receberam o agradecimento.') + ' Você envia pela tela Clientes.</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Agora não</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="thanksGo">Agradecer</button></div>';
  } else if (sh.type === 'qr') {
    var qp = pixPayloadFor(db.settings.pixPayload, sh.cents), qsvg = qp ? qrSvg(qp) : '';
    h = '<h2 style="text-align:center">Pagar com Pix</h2>' +
      (qsvg ? '<div class="qrbox" style="width:min(330px,100%);margin:6px auto 0">' + qsvg + '</div>' : '<div class="empty">QR do Pix indisponível. Confira o código do QR em Ajustes.</div>') +
      '<div class="num" style="font-size:36px;text-align:center;margin-top:10px">' + money(sh.cents) + '</div>' +
      (sh.name ? '<div class="small muted" style="text-align:center">' + esc(sh.name) + '</div>' : '') +
      (sh.note ? '<div class="small bold" style="text-align:center;margin-top:2px">' + esc(sh.note) + '</div>' : '') +
      '<div class="small muted" style="text-align:center;margin-top:4px">Recebedor: ' + esc(pixReceiver(db.settings.pixPayload)) + '</div>' +
      (sh.sid ? '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Fechar</button><button type="button" class="btn btn-green btn-lg" style="min-height:52px;font-size:15px" data-act="qrPaid">Recebi o Pix</button></div>'
                : '<button type="button" class="btn btn-outline btn-lg btn-block" style="margin-top:16px;min-height:52px;font-size:15px" data-act="closeSheet">Fechar</button>');
  } else if (sh.type === 'migrate') {
    h = '<h2>Enviar dados para a nuvem?</h2><div style="font-size:14px;line-height:1.45">Encontramos neste aparelho dados que ainda não estão na nuvem: <b>' + sh.nC + (sh.nC === 1 ? ' cliente' : ' clientes') + '</b>, <b>' + sh.nS + (sh.nS === 1 ? ' venda' : ' vendas') + '</b> e <b>' + sh.nD + (sh.nD === 1 ? ' dia' : ' dias') + '</b> de produção. Eles passam a aparecer em todos os aparelhos com acesso.</div>' +
      '<div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Agora não</button><button type="button" class="btn btn-primary btn-lg" style="min-height:52px;font-size:15px" data-act="migrateYes">Enviar para a nuvem</button></div>';
  } else if (sh.type === 'confirm') {
    h = '<h2>' + esc(sh.title) + '</h2><div style="font-size:14px;line-height:1.45">' + esc(sh.text) + '</div><div class="two"><button type="button" class="btn btn-outline btn-lg" style="min-height:52px;font-size:15px" data-act="closeSheet">Cancelar</button><button type="button" class="btn btn-warn btn-lg" style="min-height:52px;font-size:15px" data-act="confirmYes">' + esc(sh.label) + '</button></div>';
  } else {
    return '';
  }
  return '<div class="overlay" data-act="closeSheet"><div class="sheet" role="dialog" aria-modal="true">' + h + '</div></div>';
}


/* ---------- CONFERIR PIX ---------- */
function viewConferir() {
  var c = ui.conf, res = c.res, pend = allPending(), imgs = c.images || [], pixl = c.pix || [];
  var hasUnread = imgs.some(function (i) { return !i.done; });
  var imgSection = '';
  if (Sample.fn) {
    imgSection = '<label class="btn btn-ghost btn-block" style="cursor:pointer">Anexar prints de Pix recebidos (imagens)<input type="file" accept="' + esc(Sample.limits && Sample.limits.mediaTypes ? Sample.limits.mediaTypes.join(',') : 'image/*') + '" multiple data-ch="pixImages" style="display:none"></label>' +
      (imgs.length ? '<div class="row wrap" style="gap:8px">' + imgs.map(function (im, i) {
        return '<div style="position:relative;width:68px;height:68px;border-radius:10px;overflow:hidden;border:1px solid var(--field);background:var(--soft)">' +
          (im.thumb ? '<img src="' + im.thumb + '" alt="Print ' + (i + 1) + '" style="width:100%;height:100%;object-fit:cover">' : '<div class="tiny muted" style="padding:6px">' + esc(String(im.name || 'print').slice(0, 14)) + '</div>') +
          (im.done ? '<span class="mark ok" style="position:absolute;left:3px;bottom:3px;width:18px;height:18px">✓</span>' : '') +
          '<button type="button" aria-label="Remover print" data-act="removeImg" data-i="' + i + '" style="position:absolute;right:2px;top:2px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:16px;line-height:1">×</button></div>';
      }).join('') + '</div>' : '') +
      '<div class="small muted" style="line-height:1.45">Os prints são lidos pelo Claude, com a sua conta, na hora de analisar. Confira os dados lidos antes de dar baixa.</div>';
  }
  var pixList = pixl.length ? '<div><div class="small bold muted" style="margin:2px 0 6px">Lido dos prints · confira e remova o que estiver errado</div><div class="col" style="gap:6px">' + pixl.map(function (p, i) {
    return '<div class="row between" style="background:var(--soft);border-radius:10px;padding:6px 10px;gap:8px"><span class="small"><b>' + esc(p.nome || '(nome não lido)') + '</b> · ' + money(p.cents) + (p.data ? ' · ' + esc(p.data) : '') + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" style="min-height:36px;padding:0 12px" data-act="removePix" data-i="' + i + '" aria-label="Remover leitura">×</button></div>';
  }).join('') + '</div></div>' : '';
  var body = '<div class="card col"><div class="bold" style="font-size:14px">Dê baixa nos Pix recebidos de uma vez</div>' +
    '<div class="small muted" style="line-height:1.5">Cole abaixo o texto das mensagens ou notificações de Pix recebido, ou o extrato do banco (texto, CSV ou OFX). O app acha os valores e os nomes e sugere quais vendas em aberto foram pagas. Você revisa e confirma.</div>' +
    '<textarea class="box" id="pixtxt" placeholder="Ex.: Você recebeu um Pix de R$ 37,90 de MARIA SILVA" data-in="pixText" style="min-height:140px">' + esc(c.text) + '</textarea>' +
    imgSection + pixList + '<label class="btn btn-ghost btn-block" style="cursor:pointer">Escolher arquivo do extrato (.ofx, .csv, .txt)<input type="file" accept=".ofx,.csv,.txt,text/plain" data-ch="pixFile" style="display:none"></label>' +
    '<button type="button" class="btn btn-primary btn-lg btn-block" data-act="conferirRun"' + (c.busy ? ' disabled' : '') + '>' + esc(c.busy || (hasUnread ? 'Ler prints e sugerir baixas' : 'Analisar e sugerir baixas')) + '</button>' +
    '<div class="small muted">' + pend.length + (pend.length === 1 ? ' venda em aberto' : ' vendas em aberto') + ' · ' + money(sumCents(pend)) + ' a receber</div></div>';
  var foot = '';
  if (res) {
    var sel = res.matches.filter(function (m) { return m.checked && m.sid; });
    body += '<div><div class="label">' + res.matches.length + (res.matches.length === 1 ? ' sugestão' : ' sugestões') + ' · confira antes de confirmar</div><div class="col">';
    if (!res.matches.length) body += '<div class="empty" style="padding:14px 0">Nenhum pagamento do texto bate com uma venda em aberto.</div>';
    res.matches.forEach(function (m, i) {
      var u = res.units[m.unit], lvl = m.level === 'alta' ? ['Nome e valor batem', 'chip-ok'] : (m.level === 'valor' ? ['Só o valor bate: confira o nome', 'chip-warn'] : ['Vários com o mesmo valor: escolha', 'chip-warn']);
      body += '<div class="card" style="padding:12px 14px"><label class="check" style="align-items:flex-start"><input type="checkbox" data-act="toggleMatch" data-i="' + i + '"' + (m.checked ? ' checked' : '') + ' style="margin-top:2px">' +
        '<span><b>' + esc(u ? u.label : '') + '</b> · ' + money(m.cents) + '<br><span class="small muted" style="font-weight:500">“' + esc(m.text.slice(0, 110)) + '”</span></span></label>' +
        '<div style="margin:6px 0 0 34px"><span class="chip ' + lvl[1] + '">' + lvl[0] + '</span></div>' +
        (m.cands.length > 1 ? '<select class="box" style="margin-top:8px" data-ch="pickMatch" data-i="' + i + '" aria-label="Escolher a venda">' + m.cands.map(function (x) {
          var xu = res.units[x]; return '<option value="' + x + '"' + (x === m.unit ? ' selected' : '') + '>' + esc(xu ? xu.label + ' · ' + money(xu.cents) : x) + '</option>'; }).join('') + '</select>' : '') + '</div>';
    });
    body += '</div></div>';
    if (res.unmatched.length) {
      body += '<div><div class="label">Sem venda correspondente · ' + res.unmatched.length + '</div><div class="col" style="gap:6px">' + res.unmatched.slice(0, 20).map(function (e) {
        return '<div class="small muted">' + money(e.amounts[0]) + ' — “' + esc(e.text.slice(0, 90)) + '”</div>'; }).join('') + '</div></div>';
    }
    var tot = sel.reduce(function (a, m) { return a + m.cents; }, 0), idset = {};
    sel.forEach(function (m) { m.ids.forEach(function (id) { idset[id] = 1; }); });
    var nSales = Object.keys(idset).length;
    foot = '<div style="padding:12px var(--px) 18px"><button type="button" class="btn btn-green btn-lg btn-block" data-act="conferirAsk"' + (sel.length ? '' : ' disabled') + '>Marcar ' + nSales + (nSales === 1 ? ' venda' : ' vendas') + ' como paga' + (nSales === 1 ? '' : 's') + ' no Pix · ' + money(tot) + '</button></div>';
  }
  return topSimple('Conferir Pix', 'vendas') + '<div class="scroll">' + body + '</div>' + foot;
}

/* ---------- LOGIN ---------- */
function viewLogin() {
  var P = (typeof window !== 'undefined' && window.__voraPlatform) || null, inner;
  var logo = LOGO ? '<div style="text-align:center"><img class="logo" style="margin:0 auto;height:64px" src="' + LOGO + '" alt="Vora Cookies"></div>' : '<h1 style="text-align:center">Vora Cookies</h1>';
  if (Auth.status === 'loading') {
    inner = '<div class="empty">Carregando…</div>';
  } else if (P && P.sdkFailed) {
    inner = '<div class="card col"><div class="bold">Sem conexão</div><div class="small muted" style="line-height:1.5">Não foi possível carregar o app. Conecte à internet e abra de novo. Depois do primeiro acesso ele passa a abrir mesmo sem sinal.</div>' +
      '<button type="button" class="btn btn-primary btn-block" data-act="reloadApp">Tentar de novo</button></div>';
  } else if (P && P.configured === false) {
    inner = '<div class="card col"><div class="bold">Falta configurar o Firebase</div><div class="small muted" style="line-height:1.5">Abra o arquivo <b>js/firebase-config.js</b>, cole os dados do seu projeto Firebase e publique de novo. O passo a passo está no README.</div></div>';
  } else {
    inner = '<div class="card col" style="padding:16px"><div class="bold" style="font-size:16px">Entrar</div>' +
      '<label class="field"><span>E-mail</span><input class="inp" id="lemail" type="email" inputmode="email" autocomplete="username" autocapitalize="none" value="' + esc(ui.login.email) + '" data-in="loginEmail"></label>' +
      '<label class="field"><span>Senha</span><input class="inp" id="lpass" type="password" autocomplete="current-password" value="' + esc(ui.login.pass) + '" data-in="loginPass"></label>' +
      (Auth.error ? '<div class="small bold" style="color:var(--warn-ink)">' + esc(Auth.error) + '</div>' : '') +
      (Auth.info ? '<div class="small bold" style="color:var(--green)">' + esc(Auth.info) + '</div>' : '') +
      '<button type="button" class="btn btn-primary btn-lg btn-block" data-act="login"' + (Auth.busy ? ' disabled' : '') + '>' + (Auth.busy ? 'Entrando…' : 'Entrar') + '</button>' +
      '<button type="button" class="linkbtn" style="align-self:center" data-act="resetPass">Esqueci a senha</button></div>';
  }
  return '<div class="main solo"><div class="scroll" style="justify-content:center;gap:18px;padding-top:24px">' + logo + inner + '</div></div>';
}

function build() {
  if (Auth.required && Auth.status !== 'in') return viewLogin();
  var v = ui.screen, html;
  if (v === 'nova') html = viewNova();
  else if (v === 'vendas') html = viewVendas();
  else if (v === 'historico') html = viewHistorico();
  else if (v === 'fechar') html = viewFechar();
  else if (v === 'clientes') html = viewClientes();
  else if (v === 'relatorios') html = viewRelatorios();
  else if (v === 'ajustes') html = viewAjustes();
  else if (v === 'conferir') html = viewConferir();
  else html = viewHoje();
  var noNav = (v === 'nova' || v === 'fechar' || v === 'ajustes' || v === 'conferir');
  var toast = ui.toast ? '<div class="toast' + (noNav ? ' noNav' : '') + '" role="status">' + ui.toast.html + '</div>' : '';
  var main = '<div class="main' + (noNav ? ' solo' : '') + '">' + html + '</div>';
  return main + (noNav ? '' : navHtml()) + sheetHtml() + toast;
}

/* =========================================================
   AÇÕES
   ========================================================= */
var Cloud = {
  api: null, user: null, me: null, mode: 'connecting', remote: {}, remoteStr: {}, ops: {}, inflight: {}, running: 0,
  loaded: {}, ready: false, unsubs: [], blockedAt: 0, userCanWrite: null, renderTimer: null, legacyAsked: false, serverSeen: false
};
var Auth = { required: false, status: 'in', user: null, error: '', info: '', busy: false };
var Sample = { fn: null, limits: null };
var tt = null;
function toast(text, extra) {
  if (Date.now() - Cloud.blockedAt < 400) return;
  ui.toast = { html: '<span>' + esc(text) + '</span>' + (extra || '') };
  clearTimeout(tt);
  tt = setTimeout(function () { ui.toast = null; render(); }, 8000);
}
function canWrite() { return Cloud.mode === 'local' || Cloud.mode === 'online'; }
function blocked() {
  var m = Cloud.mode;
  toast(m === 'connecting' ? 'Conectando à nuvem… tente de novo em instantes.'
    : m === 'readonly' ? 'Você está em modo somente leitura. Peça ao dono do app para liberar o seu e-mail.'
    : 'Sem conexão com a nuvem: somente leitura. Volte a ficar online para sincronizar.');
  Cloud.blockedAt = Date.now();
  render();
}
function persist() {
  if (Cloud.mode === 'online') { Store.saveCloud(db); cloudPush(); return; }
  if (!Store.save(db)) toast('Não foi possível salvar neste aparelho. Exporte um backup em Ajustes.');
}
function commit(fn) { if (!canWrite()) { blocked(); return false; } fn(db); persist(); render(); return true; }
function commitQuiet(fn) { if (!canWrite()) { blocked(); return false; } fn(db); persist(); return true; }
function cloudNote() { return Cloud.mode === 'online' ? ' Como os dados estão na nuvem, isso vale para todos os aparelhos.' : ''; }

var lastScreen = null;
function render() {
  var app = document.getElementById('app');
  var sc = app.querySelector('.scroll'), top = sc ? sc.scrollTop : 0;
  var sh = app.querySelector('.sheet'), shTop = sh ? sh.scrollTop : 0;
  var ae = document.activeElement, fid = null, pos = null, tag = ae && ae.tagName;
  if (ae && ae.id && (tag === 'INPUT' || tag === 'TEXTAREA') && app.contains(ae)) {
    fid = ae.id; try { pos = ae.selectionStart; } catch (e) { pos = null; }
  }
  var html;
  try { html = build(); }
  catch (err) {
    try { console.error(err); } catch (e0) {}
    html = '<div class="scroll"><div class="empty">Algo deu errado ao montar esta tela.<br><b>' + esc(err && err.message ? err.message : String(err)) + '</b></div>' +
      '<button type="button" class="btn btn-primary btn-lg btn-block" data-act="go" data-screen="hoje">Voltar ao início</button></div>';
  }
  app.innerHTML = html;
  var sc2 = app.querySelector('.scroll');
  if (sc2 && lastScreen === ui.screen) sc2.scrollTop = top;
  var sh2 = app.querySelector('.sheet');
  if (sh2 && sh) sh2.scrollTop = shTop;
  lastScreen = ui.screen;
  if (fid) {
    var el = document.getElementById(fid);
    if (el) { el.focus(); if (pos !== null) { try { el.setSelectionRange(pos, pos); } catch (e) {} } }
  }
  var strip = document.getElementById('strip');
  if (strip) {
    var on = strip.querySelector('.on');
    if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2;
  }
}

var a = {};   // ações disparadas por clique (data-act)
var inp = {}; // campos que atualizam enquanto digita (data-in)
var chg = {}; // campos que atualizam ao confirmar (data-ch)
function attr(el, n) { return el.getAttribute('data-' + n); }

/* ---- navegação ---- */
a.go = function (el) {
  var s = attr(el, 'screen');
  if (ui.screen === 'nova' && s !== 'nova') ui.nova = freshNova();
  if (s === 'vendas') ui.vFilter = 'todas';
  if (s === 'ajustes') { ui.backup = ''; }
  if (s !== 'clientes') ui.cliFocus = null;
  ui.screen = s; ui.sheet = null; render();
};
a.toNova = function () { ui.nova = freshNova(); ui.screen = 'nova'; ui.sheet = null; render(); };
a.goReceber = function () { ui.vFilter = 'receber'; ui.screen = 'vendas'; ui.sheet = null; render(); };
a.goHistDay = function (el) { ui.hDay = attr(el, 'd'); ui.screen = 'historico'; ui.nova = freshNova(); ui.sheet = null; render(); };
a.histDay = function (el) { ui.hDay = attr(el, 'd'); render(); };
a.setFilter = function (el) { ui.vFilter = attr(el, 'f'); render(); };
a.closeSheet = function (el, ev) {
  if (el.classList.contains('overlay') && ev.target !== el) return;
  ui.sheet = null; render();
};

/* ---- produção do dia ---- */
a.openProd = function () {
  var t = today(), pr = producedOf(t), sold = soldMap(t), draft = {};
  db.flavors.forEach(function (f) { draft[f.id] = Math.max(pr[f.id] || 0, sold[f.id] || 0); });
  ui.sheet = { type: 'prod', draft: draft, editId: null, adding: false, newName: '', newPrice: '', newQty: 0 }; render();
};
a.openProdNew = function () { a.openProd(); ui.sheet.adding = true; render(); };
a.prodEdit = function (el) { ui.sheet.editId = attr(el, 'id'); render(); };
a.prodEditDone = function () { ui.sheet.editId = null; render(); };
a.prodNew = function () { ui.sheet.adding = true; render(); };
a.prodNewCancel = function () { var s = ui.sheet; s.adding = false; s.newName = ''; s.newPrice = ''; s.newQty = 0; render(); };
a.prodNewInc = function () { ui.sheet.newQty = Math.min(999, (ui.sheet.newQty || 0) + 1); render(); };
a.prodNewDec = function () { ui.sheet.newQty = Math.max(0, (ui.sheet.newQty || 0) - 1); render(); };
a.prodNewSave = function () {
  var s = ui.sheet, name = String(s.newName || '').trim(), cents = parseMoney(s.newPrice);
  if (!name) { toast('Informe o nome do sabor.'); render(); return; }
  if (!(cents > 0)) { toast('Informe o preço do sabor, por exemplo 15,90.'); render(); return; }
  if (db.flavors.some(function (f) { return norm(f.name) === norm(name); })) { toast('Já existe um sabor com esse nome.'); render(); return; }
  var id = uid();
  var ok = commit(function (d) { d.flavors.push({ id: id, name: name, cents: cents, active: true }); });
  if (!ok) return;
  s.draft[id] = s.newQty || 0; s.adding = false; s.newName = ''; s.newPrice = ''; s.newQty = 0;
  toast('Sabor "' + name + '" adicionado.'); render();
};
inp.prodNewName = function (el) { if (ui.sheet) ui.sheet.newName = el.value; };
inp.prodNewPrice = function (el) { if (ui.sheet) ui.sheet.newPrice = el.value; };
a.prodInc = function (el) { var id = attr(el, 'id'), d = ui.sheet.draft; d[id] = Math.min(999, (d[id] || 0) + 1); render(); };
a.prodDec = function (el) { var id = attr(el, 'id'), d = ui.sheet.draft, min = soldMap(today())[id] || 0; d[id] = Math.max(min, (d[id] || 0) - 1); render(); };
a.prodSave = function () {
  var draft = ui.sheet.draft, t = today();
  ui.sheet = null;
  commit(function (d) {
    d.days[t] = d.days[t] || {};
    var p = {}, k; for (k in draft) if (draft[k] > 0) p[k] = draft[k];
    d.days[t].produced = p;
  });
};

/* ---- pagamento (dupla confirmação) ---- */
a.payStart = function (el) { ui.sheet = { type: 'pay1', sid: attr(el, 'id'), method: 'Pix' }; render(); };
a.payMethod = function (el) { ui.sheet.method = attr(el, 'm'); render(); };
a.payNext = function () { ui.sheet.type = 'pay2'; render(); };
a.payBack = function () { ui.sheet.type = 'pay1'; render(); };
a.payConfirm = function () {
  var sid = ui.sheet.sid, m = ui.sheet.method; ui.sheet = null;
  var base = saleById(sid), ids = [sid].concat(base ? dueOf(base).extras.map(function (x) { return x.id; }) : []);
  var ok = commit(function (d) {
    d.sales.forEach(function (s) {
      if (ids.indexOf(s.id) >= 0 && !s.paid) { s.paid = true; s.method = m; s.paidAt = today() + ' ' + nowTime(); if (s.id !== sid) s.paidVia = 'junto:' + sid; }
    });
  });
  if (!ok) return;
  var thankIds = ids.filter(function (id) { var x = saleById(id); return x && custPhone(x) && x.thank !== 'sent'; });
  if (thankIds.length) { ui.sheet = { type: 'thanks', sids: thankIds, head: ids.length > 1 ? 'Pagamento registrado em ' + ids.length + ' vendas ✓' : 'Pagamento registrado ✓' }; render(); }
  else toast(ids.length > 1 ? 'Pagamento registrado em ' + ids.length + ' vendas.' : 'Pagamento registrado.');
};
a.unpayStart = function (el) { ui.sheet = { type: 'unpay1', sid: attr(el, 'id') }; render(); };
a.unpayNext = function () { ui.sheet.type = 'unpay2'; render(); };
a.unpayBack = function () { ui.sheet.type = 'unpay1'; render(); };
a.unpayConfirm = function () {
  var sid = ui.sheet.sid; ui.sheet = null;
  commit(function (d) { d.sales.forEach(function (s) { if (s.id === sid) { s.paid = false; s.method = null; s.paidAt = null; } }); });
  toast('Venda voltou para "A receber".');
};

/* ---- editar / excluir venda ---- */
a.editStart = function (el) {
  var s = saleById(attr(el, 'id')); if (!s) return;
  ui.sheet = { type: 'edit', sid: s.id, items: Object.assign({}, s.items) }; render();
};
a.editInc = function (el) {
  var id = attr(el, 'id'), sh = ui.sheet, s = saleById(sh.sid), rem = remaining(s.date, id, s.id), cur = sh.items[id] || 0;
  sh.items[id] = cur + 1;
  if (rem !== null && cur + 1 > rem && cur <= rem) toast('Acima da produção de ' + fname(id) + '.');
  render();
};
a.editDec = function (el) { var id = attr(el, 'id'), sh = ui.sheet; sh.items[id] = Math.max(0, (sh.items[id] || 0) - 1); render(); };
a.editSave = function () {
  var sh = ui.sheet, clean = {}, k;
  for (k in sh.items) if (sh.items[k] > 0) clean[k] = sh.items[k];
  if (!countItems(clean)) return;
  ui.sheet = null;
  commit(function (d) {
    d.sales.forEach(function (s) {
      if (s.id !== sh.sid) return;
      s.prices = s.prices || {};
      var kk; for (kk in clean) if (!s.prices[kk]) { var f = flv(kk); s.prices[kk] = f ? f.cents : 0; }
      s.items = clean; s.cents = centsOf(clean, s.prices);
    });
  });
  toast('Venda atualizada.');
};
a.delAsk = function () { ui.sheet = { type: 'del', sid: ui.sheet.sid }; render(); };
a.delConfirm = function () {
  var sid = ui.sheet.sid; ui.sheet = null;
  commit(function (d) { d.sales = d.sales.filter(function (s) { return s.id !== sid; }); });
  toast('Venda excluída.');
};

/* ---- nova venda ---- */
a.novaPick = function (el) {
  var c = customerById(attr(el, 'cid')); if (!c) return;
  ui.nova.customerId = c.id; ui.nova.query = c.name; ui.nova.phone = ''; render();
};
a.novaChange = function () { ui.nova.customerId = null; ui.nova.query = ''; ui.nova.phone = ''; render(); };
a.novaInc = function (el) {
  var id = attr(el, 'id'), n = ui.nova, rem = remaining(today(), id), cur = n.items[id] || 0;
  n.items[id] = cur + 1;
  if (rem !== null && cur + 1 > rem && cur <= rem) toast('Acima da produção de ' + fname(id) + '. Se fez mais, ajuste em "Ajustar produção".');
  render();
};
a.novaDec = function (el) { var id = attr(el, 'id'), n = ui.nova; n.items[id] = Math.max(0, (n.items[id] || 0) - 1); render(); };
a.novaPaid = function (el) { ui.nova.paidNow = attr(el, 'v') === '1'; render(); };
a.novaMethod = function (el) { ui.nova.method = attr(el, 'm'); render(); };
a.novaIncl = function (el) { ui.nova.inclPend = !!el.checked; render(); };
a.novaSave = function (el, ev, charged) {
  if (!canWrite()) { blocked(); return; }
  var n = ui.nova, t = today(), cnt = countItems(n.items);
  var cust = n.customerId ? customerById(n.customerId) : null;
  var name = cust ? cust.name : n.query.trim();
  if (!name || !cnt) return;
  var items = {}, prices = {};
  activeFlavors().forEach(function (f) { if (n.items[f.id] > 0) { items[f.id] = n.items[f.id]; prices[f.id] = f.cents; } });
  if (!countItems(items)) return;
  var phone = n.phone.trim() ? fmtPhone(n.phone.trim()) : '', sale = null, reopened = false;
  var pendAll = cust ? pendingOfCustomer(cust.id) : [], incl = pendAll.length > 0 && n.inclPend !== false;
  var extraIds = incl ? pendAll.map(function (x) { return x.id; }) : [], extraC = incl ? sumCents(pendAll) : 0;
  commitQuiet(function (d) {
    if (!cust) {
      var ex = d.customers.filter(function (c) { return norm(c.name) === norm(name); })[0];
      if (ex) cust = ex; else { cust = { id: uid(), name: name, phone: phone }; d.customers.push(cust); }
    }
    if (phone && !cust.phone) cust.phone = phone;
    var tm = nowTime();
    sale = {
      id: uid(), date: t, time: tm, customerId: cust.id, name: cust.name, items: items, prices: prices, cents: centsOf(items, prices),
      paid: n.paidNow, method: n.paidNow ? n.method : null, paidAt: n.paidNow ? t + ' ' + tm : null,
      thank: cust.phone ? 'pending' : null, createdAt: t + ' ' + tm
    };
    if (charged) { sale.charge = 'sent'; sale.chargeAt = tm; }
    d.sales.push(sale);
    if (extraIds.length) {
      if (n.paidNow) d.sales.forEach(function (x) { if (extraIds.indexOf(x.id) >= 0 && !x.paid) { x.paid = true; x.method = n.method; x.paidAt = t + ' ' + tm; x.paidVia = 'junto:' + sale.id; } });
      else sale.incl = extraIds;
    }
    if (d.days[t] && d.days[t].closed) { delete d.days[t].closed; reopened = true; }
  });
  var wasPaid = n.paidNow;
  ui.nova = freshNova(); ui.screen = 'hoje'; ui.sheet = null;
  var extraTxt = extraC ? (wasPaid ? ' · pendências anteriores baixadas junto' : ' · inclui ' + money(extraC) + ' de pendências') : '';
  if (wasPaid && sale.thank === 'pending') {
    ui.sheet = { type: 'thanks', sids: [sale.id], head: 'Venda salva ✓ · ' + money(sale.cents + extraC) + extraTxt + (reopened ? ' · caixa reaberto' : '') };
  } else {
    toast('Venda salva · ' + money(sale.cents + extraC) + extraTxt + (charged ? ' · pedido aberto no WhatsApp (toque em Enviar)' : '') + (reopened ? ' · caixa reaberto' : ''));
  }
  render();
};

/* ---- fechar caixa ---- */
a.fecharConfirm = function () {
  var t = today(), made = 0, k, pr = producedOf(t); for (k in pr) made += pr[k] || 0;
  var left = Math.max(0, made - stats(t).cookies), note = ui.closeNote.trim();
  commit(function (d) { d.days[t] = d.days[t] || {}; d.days[t].closed = { at: nowTime(), leftover: left, note: note }; });
  ui.closeNote = ''; ui.screen = 'hoje'; toast('Caixa fechado.'); render();
};
a.fecharReopen = function () {
  var t = today();
  commit(function (d) { if (d.days[t]) delete d.days[t].closed; });
  toast('Caixa reaberto.');
};

/* ---- clientes e WhatsApp ---- */
a.thanked = function (el) {
  var ids = String(attr(el, 'id') || '').split(',');
  commitQuiet(function (d) { d.sales.forEach(function (s) { if (ids.indexOf(s.id) >= 0) { s.thank = 'sent'; s.thankAt = nowTime(); } }); });
  setTimeout(function () { render(); }, 600);
};
a.thanksGo = function () {
  var sids = (ui.sheet && ui.sheet.sids) || [];
  commitQuiet(function (d) { d.sales.forEach(function (s) { if (sids.indexOf(s.id) >= 0 && s.paid && s.thank !== 'sent') s.thank = 'pending'; }); });
  ui.cliFocus = sids; ui.cliQuery = ''; ui.sheet = null; ui.screen = 'clientes'; render();
};
a.cliOpen = function (el) {
  var c = customerById(attr(el, 'cid')); if (!c) return;
  ui.sheet = { type: 'cust', cid: c.id, name: c.name, phone: c.phone || '' }; render();
};
a.cliNew = function () { ui.sheet = { type: 'cust', cid: null, name: '', phone: '' }; render(); };
a.cliSave = function () {
  var sh = ui.sheet, name = sh.name.trim(), phone = sh.phone.trim() ? fmtPhone(sh.phone.trim()) : '';
  if (!name) { toast('Informe o nome do cliente.'); render(); return; }
  ui.sheet = null;
  commit(function (d) {
    var c = sh.cid ? customerById(sh.cid) : d.customers.filter(function (x) { return norm(x.name) === norm(name); })[0];
    if (c) { c.name = name; c.phone = phone; }
    else d.customers.push({ id: uid(), name: name, phone: phone });
  });
  toast('Cliente salvo.');
};
a.cliVenda = function (el) {
  var c = customerById(attr(el, 'cid')); if (!c) return;
  ui.nova = freshNova(); ui.nova.customerId = c.id; ui.nova.query = c.name; ui.screen = 'nova'; ui.sheet = null; render();
};

/* ---- relatórios ---- */
a.repPeriod = function (el) { ui.rPeriod = attr(el, 'p'); ui.rDay = null; render(); };
a.repDay = function (el) { var d = attr(el, 'd'); ui.rDay = ui.rDay === d ? null : d; render(); };
a.repAll = function () { ui.rDay = null; render(); };
chg.rFrom = function (el) { if (el.value) { ui.rFrom = el.value; ui.rDay = null; render(); } };
chg.rTo = function (el) { if (el.value) { ui.rTo = el.value; ui.rDay = null; render(); } };

/* ---- ajustes ---- */
a.flToggle = function (el) { var id = attr(el, 'id'); commit(function (d) { d.flavors.forEach(function (f) { if (f.id === id) f.active = !f.active; }); }); };
a.flAdd = function () { commit(function (d) { d.flavors.push({ id: uid(), name: 'Novo sabor', cents: 1500, active: true }); }); };
a.demoAsk = function () { ui.sheet = { type: 'confirm', title: 'Carregar dados de exemplo?', text: 'Isso substitui todos os dados atuais por uma semana de vendas fictícias, para você testar o app.' + cloudNote(), label: 'Sim, carregar', yes: 'demoYes' }; render(); };
a.demoYes = function () { if (!canWrite()) { blocked(); return; } db = demoData(); persist(); ui.sheet = null; ui.screen = 'hoje'; toast('Dados de exemplo carregados.'); render(); };
a.wipeAsk = function () { ui.sheet = { type: 'confirm', title: 'Apagar todos os dados?', text: 'Vai apagar clientes, vendas, produção e ajustes. Não dá para desfazer.' + cloudNote(), label: 'Sim, apagar', yes: 'wipeYes' }; render(); };
a.wipeYes = function () { if (!canWrite()) { blocked(); return; } db = defaults(); persist(); ui.sheet = null; ui.screen = 'hoje'; toast('Dados apagados.'); render(); };
a.exportData = function () { ui.backup = JSON.stringify(db); render(); };
a.selectAll = function (el) { try { el.select(); } catch (e) {} };
a.importAsk = function () {
  var obj = null;
  try { obj = JSON.parse(ui.importText); } catch (e) { obj = null; }
  if (!obj || !Array.isArray(obj.sales) || !Array.isArray(obj.flavors)) { toast('Backup inválido. Cole o texto completo exportado.'); render(); return; }
  ui.sheet = { type: 'confirm', title: 'Importar backup?', text: 'Isso substitui todos os dados atuais pelos do backup.' + cloudNote(), label: 'Sim, importar', yes: 'importYes', payload: obj }; render();
};
a.importYes = function () { if (!canWrite()) { blocked(); return; } db = migrate(ui.sheet.payload); persist(); ui.sheet = null; ui.importText = ''; ui.screen = 'hoje'; toast('Backup importado.'); render(); };
a.confirmYes = function () { var fn = a[ui.sheet.yes]; if (fn) fn(); };

/* ---- campos de texto ---- */
inp.novaQuery = function (el) { ui.nova.query = el.value; ui.nova.customerId = null; render(); };
inp.novaPhone = function (el) { ui.nova.phone = el.value; };
inp.cliQuery = function (el) { ui.cliQuery = el.value; render(); };
inp.cuName = function (el) { ui.sheet.name = el.value; };
inp.cuPhone = function (el) { ui.sheet.phone = el.value; };
inp.closeNote = function (el) { ui.closeNote = el.value; };
inp.importText = function (el) { ui.importText = el.value; };
inp.flName = function (el) { var id = attr(el, 'id'), v = el.value.trim(); if (!v) return; commitQuiet(function (d) { d.flavors.forEach(function (f) { if (f.id === id) f.name = v; }); }); };
inp.flPrice = function (el) { var id = attr(el, 'id'), c = parseMoney(el.value); commitQuiet(function (d) { d.flavors.forEach(function (f) { if (f.id === id) f.cents = c; }); }); };
inp.tpl = function (el) { commitQuiet(function (d) { d.settings.template = el.value; }); };
inp.lnk = function (el) { commitQuiet(function (d) { d.settings.reviewLink = el.value.trim(); }); };


/* ---- cobrança por WhatsApp (pedido + chave Pix) ---- */
a.novaCharge = function (el, ev) {
  if (!canWrite()) { ev.preventDefault(); blocked(); return; }
  setTimeout(function () { a.novaSave(null, null, true); }, 80);
};
a.chargeSale = function (el) {
  var id = attr(el, 'id');
  if (!canWrite()) return;
  commitQuiet(function (d) { d.sales.forEach(function (s) { if (s.id === id) { s.charge = 'sent'; s.chargeAt = nowTime(); } }); });
  setTimeout(function () { render(); }, 600);
};

/* ---- QR do Pix ---- */
a.qrBig = function (el) {
  var n = ui.nova, c = n.customerId ? customerById(n.customerId) : null;
  ui.sheet = { type: 'qr', cents: +attr(el, 'c'), sid: null, name: c ? c.name : n.query.trim(), note: attr(el, 'note') || '' }; render();
};
a.qrOpen = function (el) {
  var s = saleById(attr(el, 'id')); if (!s) return;
  var due = dueOf(s);
  ui.sheet = { type: 'qr', cents: due.total, sid: s.id, name: custName(s) + ' · ' + fullDay(s.date), note: due.extras.length ? 'Inclui ' + due.extras.length + (due.extras.length === 1 ? ' pendência anterior' : ' pendências anteriores') + ': ' + money(due.extraC) : '' }; render();
};
a.qrPaid = function () { var sid = ui.sheet.sid; ui.sheet = { type: 'pay1', sid: sid, method: 'Pix' }; render(); };
function paintPixOk() {
  if (!document.getElementById) return;
  var e = document.getElementById('pixok'); if (e) e.innerHTML = pixOkText();
}
inp.pixPayload = function (el) { var v = el.value.trim(); commitQuiet(function (d) { d.settings.pixPayload = v; }); paintPixOk(); };

/* ---- conferir Pix recebido (colar SMS/notificações ou extrato) ---- */
function toCents(str) { return Math.round(parseFloat(String(str).replace(/\./g, '').replace(',', '.')) * 100); }
function parseBank(text) {
  var entries = [];
  if (/<STMTTRN>/i.test(text)) {
    text.split(/<STMTTRN>/i).slice(1).forEach(function (b) {
      var amt = (b.match(/<TRNAMT>\s*([-+]?[\d.,]+)/i) || [])[1];
      if (!amt) return;
      var n = parseFloat(amt.replace(',', '.'));
      if (!(n > 0)) return;
      var memo = ((b.match(/<MEMO>\s*([^<\r\n]*)/i) || [])[1] || '') + ' ' + ((b.match(/<NAME>\s*([^<\r\n]*)/i) || [])[1] || '');
      entries.push({ text: memo.trim(), amounts: [Math.round(n * 100)] });
    });
    return entries;
  }
  var chunks = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split(/\n/);
  chunks.forEach(function (c) {
    c = c.replace(/\s+/g, ' ').trim();
    if (!c) return;
    if (/(enviad|enviou|pagamento\s+efetuad|d[eé]bito|compra\b|saque|tarifa)/i.test(c) && !/(recebid|recebeu|cr[eé]dito)/i.test(c)) return;
    var re = /(-?)\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/g, m, amts = [];
    while ((m = re.exec(c)) !== null) { if (m[1] !== '-') amts.push(toCents(m[2])); }
    if (amts.length) entries.push({ text: c, amounts: amts });
  });
  return entries;
}
function nameScore(name, text) {
  var toks = norm(name).split(/\s+/).filter(function (t) { return t.length >= 3; });
  if (!toks.length) return 0;
  var nt = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  var hit = toks.filter(function (t) { return nt.indexOf(' ' + t + ' ') >= 0; }).length;
  return hit / toks.length;
}
function buildUnits() {
  var pend = allPending().sort(function (x, y) { return (x.date + x.time) < (y.date + y.time) ? -1 : 1; }), units = [], seen = {}, byC = {};
  function add(u) { var sig = u.ids.slice().sort().join(','); if (seen[sig]) return; seen[sig] = 1; units.push(u); }
  pend.forEach(function (s) {
    add({ key: 's' + s.id, ids: [s.id], cents: s.cents, name: custName(s), label: custName(s) + ' · ' + shortDay(s.date) });
    var d = dueOf(s);
    if (d.extras.length) add({ key: 'b' + s.id, ids: [s.id].concat(d.extras.map(function (x) { return x.id; })), cents: d.total, name: custName(s), label: custName(s) + ' · ' + shortDay(s.date) + ' + ' + d.extras.length + (d.extras.length === 1 ? ' pendência anterior' : ' pendências anteriores') });
    if (s.customerId) (byC[s.customerId] = byC[s.customerId] || []).push(s);
  });
  Object.keys(byC).forEach(function (cid) {
    var l = byC[cid];
    if (l.length >= 2) add({ key: 'c' + cid, ids: l.map(function (x) { return x.id; }), cents: sumCents(l), name: custName(l[0]), label: custName(l[0]) + ' · todas as ' + l.length + ' pendências' });
  });
  return units;
}
function matchEntries(entries) {
  var units = buildUnits(), used = {}, res = { matches: [], unmatched: [], units: {} };
  units.forEach(function (u) { res.units[u.key] = u; });
  entries.forEach(function (e) {
    var cands = units.filter(function (u) { return e.amounts.indexOf(u.cents) >= 0 && !u.ids.some(function (id) { return used[id]; }); });
    if (!cands.length) { res.unmatched.push(e); return; }
    var scored = cands.map(function (u) { return { u: u, score: nameScore(u.name, e.text) }; });
    scored.sort(function (x, y) { return (y.score - x.score) || (x.u.ids.length - y.u.ids.length); });
    var top = scored[0], tie = scored.length > 1 && scored[1].score === top.score;
    var level = top.score > 0 && !tie ? 'alta' : (scored.length === 1 ? 'valor' : 'ambigua');
    top.u.ids.forEach(function (id) { used[id] = 1; });
    res.matches.push({ text: e.text, cents: top.u.cents, unit: top.u.key, sid: top.u.ids[0], ids: top.u.ids, cands: scored.map(function (x) { return x.u.key; }), level: level, checked: level !== 'ambigua' });
  });
  return res;
}
function runMatch() {
  var entries = parseBank(ui.conf.text || '');
  (ui.conf.pix || []).forEach(function (p) { entries.push({ text: 'Pix recebido de ' + (p.nome || '') + ' ' + (p.data || ''), amounts: [p.cents] }); });
  if (!entries.length) { ui.conf.res = { matches: [], unmatched: [] }; toast('Não achei valores de Pix. Cole as mensagens ou o extrato, ou anexe prints.'); render(); return; }
  ui.conf.res = matchEntries(entries); render();
}
var IMG_PROMPT = 'Você recebe prints de celular com Pix recebidos: telas de aplicativo de banco (extrato, comprovante) ou notificações. ' +
  'Extraia SOMENTE os Pix RECEBIDOS (dinheiro que entrou na conta). Ignore Pix enviados, pagamentos, compras, saldo e qualquer valor que não seja um Pix recebido. ' +
  'Para cada Pix recebido informe: "nome" (o nome do pagador, exatamente como aparece), "valor" (número em reais com ponto decimal, ex.: 36.9) e "data" (data e hora como aparecem, ou texto vazio se não aparecerem). ' +
  'Não invente nada: se não conseguir ler um valor com certeza, deixe-o de fora. Responda apenas com um array JSON, sem texto extra, no formato: ' +
  '[{"nome":"MARIA SILVA","valor":36.9,"data":"12/10/2026 14:20"}]. Se não houver nenhum Pix recebido, responda [].';
function addPixFromAi(arr) {
  var n = 0; if (!Array.isArray(arr)) return 0;
  ui.conf.pix = ui.conf.pix || [];
  arr.forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var v = Number(String(it.valor).replace(',', '.'));
    if (!isFinite(v) || !(v > 0)) return;
    var item = { nome: String(it.nome || '').trim(), cents: Math.round(v * 100), data: String(it.data || '').trim() };
    var dup = ui.conf.pix.some(function (p) { return p.nome === item.nome && p.cents === item.cents && p.data === item.data; });
    if (!dup) { ui.conf.pix.push(item); n++; }
  });
  return n;
}
function imgErrorText(e) {
  var c = e && e.code;
  if (c === 'not_granted') return 'Você não permitiu o uso do Claude para ler os prints. Cole o texto das mensagens no lugar.';
  if (c === 'rate_limited') return 'Limite de leituras atingido por agora. Tente de novo mais tarde.';
  if (c === 'image_rejected') return 'Um dos prints não foi aceito (tipo ou tamanho). Tente outro.';
  if (c === 'invalid_json' || c === 'empty_completion' || c === 'refused') return 'Não consegui ler esses prints. Tente um print mais nítido ou cole o texto.';
  if (c === 'session_expired') return 'Sua sessão expirou. Entre de novo no Claude.';
  return 'Não foi possível ler os prints agora. Tente de novo.';
}
a.conferirRun = function () {
  if (ui.conf.busy) return;
  var todo = (ui.conf.images || []).filter(function (i) { return !i.done; });
  if (!todo.length || !Sample.fn) { runMatch(); return; }
  ui.conf.busy = 'Lendo prints…'; render();
  var per = (Sample.limits && Sample.limits.maxCount) || 4, batches = [], i;
  for (i = 0; i < todo.length; i += per) batches.push(todo.slice(i, i + per));
  var chain = Promise.resolve(), found = 0;
  batches.forEach(function (b) {
    chain = chain.then(function () {
      return Sample.fn.json(IMG_PROMPT, { images: b.map(function (x) { return x.file; }), modelTier: 'default' }).then(function (arr) {
        found += addPixFromAi(arr); b.forEach(function (x) { x.done = true; }); render();
      });
    });
  });
  chain.then(function () {
    ui.conf.busy = null;
    if (!found && !(ui.conf.pix || []).length && !parseBank(ui.conf.text || '').length) { toast('Não encontrei Pix recebido nos prints. Tente um print mais nítido ou cole o texto.'); render(); return; }
    runMatch();
  }, function (e) { ui.conf.busy = null; toast(imgErrorText(e)); render(); });
};
a.removeImg = function (el) { var i = +attr(el, 'i'); if (ui.conf.images[i]) { ui.conf.images.splice(i, 1); render(); } };
a.removePix = function (el) { var i = +attr(el, 'i'); if (ui.conf.pix[i]) { ui.conf.pix.splice(i, 1); ui.conf.res = null; render(); } };
function makeThumb(file, cb) {
  try {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'), s = 120 / Math.max(img.width, img.height, 1);
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          cb(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { cb(''); }
      };
      img.onerror = function () { cb(''); };
      img.src = r.result;
    };
    r.onerror = function () { cb(''); };
    r.readAsDataURL(file);
  } catch (e) { cb(''); }
}
chg.pixImages = function (el) {
  var files = Array.prototype.slice.call(el.files || []);
  try { el.value = ''; } catch (e) {}
  if (!files.length) return;
  var lim = Sample.limits || {};
  files.forEach(function (f) {
    if (lim.maxInputBytes && f.size > lim.maxInputBytes) { toast('O print "' + f.name + '" é grande demais.'); return; }
    if (lim.mediaTypes && lim.mediaTypes.indexOf(f.type) < 0) { toast('Formato não aceito: ' + (f.type || f.name) + '. Use PNG, JPG ou WebP.'); return; }
    if (ui.conf.images.length >= 12) { toast('Máximo de 12 prints por vez.'); return; }
    var item = { id: uid(), name: f.name, file: f, thumb: '', done: false };
    ui.conf.images.push(item);
    makeThumb(f, function (t) { item.thumb = t; scheduleRender(); });
  });
  ui.conf.res = null; render();
};
a.toggleMatch = function (el) { var m = ui.conf.res.matches[+attr(el, 'i')]; if (m) { m.checked = !!el.checked; render(); } };
chg.pickMatch = function (el) {
  var m = ui.conf.res.matches[+attr(el, 'i')]; if (!m) return;
  var u = ui.conf.res.units[el.value]; if (!u) return;
  m.unit = u.key; m.sid = u.ids[0]; m.ids = u.ids; m.cents = u.cents; m.checked = true; render();
};
chg.pixFile = function (el) {
  var f = el.files && el.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () { ui.conf.text = String(r.result || ''); ui.conf.res = null; render(); };
  r.readAsText(f);
};
inp.pixText = function (el) { ui.conf.text = el.value; };
a.conferirAsk = function () {
  var sel = ui.conf.res.matches.filter(function (m) { return m.checked && m.sid; });
  if (!sel.length) return;
  var tot = sel.reduce(function (acc, m) { return acc + m.cents; }, 0), idset = {};
  sel.forEach(function (m) { m.ids.forEach(function (id) { idset[id] = 1; }); });
  var n = Object.keys(idset).length;
  ui.sheet = { type: 'confirm', title: 'Confirmar baixas no Pix?', text: 'Vai marcar ' + n + (n === 1 ? ' venda' : ' vendas') + ' como paga' + (n === 1 ? '' : 's') + ' no Pix, somando ' + money(tot) + '. Você ainda pode desfazer cada uma depois.', label: 'Sim, dar baixa', yes: 'conferirYes' };
  render();
};
a.conferirYes = function () {
  var sel = ui.conf.res.matches.filter(function (m) { return m.checked && m.sid; }), ids = {};
  sel.forEach(function (m) { m.ids.forEach(function (id) { ids[id] = 1; }); });
  var n = Object.keys(ids).length;
  ui.sheet = null;
  var ok = commit(function (d) {
    d.sales.forEach(function (s) { if (ids[s.id] && !s.paid) { s.paid = true; s.method = 'Pix'; s.paidAt = today() + ' ' + nowTime(); s.paidVia = 'conferencia'; } });
  });
  if (!ok) return;
  ui.conf = { text: '', res: null, images: [], pix: [], busy: null }; ui.screen = 'vendas'; ui.vFilter = 'todas';
  var thankIds2 = Object.keys(ids).filter(function (id) { var x = saleById(id); return x && custPhone(x) && x.thank !== 'sent'; });
  var done = n + (n === 1 ? ' venda marcada como paga no Pix' : ' vendas marcadas como pagas no Pix');
  if (thankIds2.length) ui.sheet = { type: 'thanks', sids: thankIds2, head: done + ' ✓' };
  else toast(done + '.');
  render();
};
inp.pixKey = function (el) { var v = el.value.trim(); commitQuiet(function (d) { d.settings.pixKey = v; }); };
inp.ordTpl = function (el) { var v = el.value; commitQuiet(function (d) { d.settings.orderTemplate = v; }); };

/* =========================================================
   NUVEM — banco online compartilhado (capability "db")
   Documentos: settings/main, customers/{id}, sales/{id}, days/{AAAA-MM-DD}
   ========================================================= */
function stable(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(o[k]); }).join(',') + '}';
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function desiredDocs(d) {
  var out = {};
  out['settings/main'] = clone({ v: 1, flavors: d.flavors, settings: d.settings });
  d.customers.forEach(function (c) { out['customers/' + c.id] = clone(c); });
  d.sales.forEach(function (s) { out['sales/' + s.id] = clone(s); });
  Object.keys(d.days).forEach(function (k) {
    var day = d.days[k], has = false, p;
    if (day) { if (day.closed) has = true; if (day.produced) for (p in day.produced) if (day.produced[p] > 0) has = true; }
    if (has) out['days/' + k] = clone(day);
  });
  return out;
}
function effStr(p) {
  var op = Cloud.ops[p];
  if (op) return op.type === 'del' ? null : op.s;
  return Cloud.remoteStr[p] !== undefined ? Cloud.remoteStr[p] : null;
}
function composeFromRemote() {
  var d = { v: 1, flavors: null, settings: null, customers: [], sales: [], days: {} }, paths = {};
  Object.keys(Cloud.remote).forEach(function (k) { paths[k] = 1; });
  Object.keys(Cloud.ops).forEach(function (k) { paths[k] = 1; });
  Object.keys(paths).forEach(function (p) {
    var op = Cloud.ops[p], data = op ? (op.type === 'del' ? null : op.data) : Cloud.remote[p];
    if (!data) return;
    data = clone(data);
    if (p === 'settings/main') { d.flavors = data.flavors; d.settings = data.settings; }
    else if (p.indexOf('customers/') === 0) d.customers.push(data);
    else if (p.indexOf('sales/') === 0) d.sales.push(data);
    else if (p.indexOf('days/') === 0) d.days[p.slice(5)] = data;
  });
  var b = defaults();
  if (!d.flavors || !d.flavors.length) d.flavors = b.flavors;
  var hadS = !!d.settings, upg = hadS ? !!d.settings.upg1 : true, upg2 = hadS ? !!d.settings.upg2 : true;
  d.settings = Object.assign({}, b.settings, d.settings || {});
  d.settings.upg1 = upg; d.settings.upg2 = upg2;
  return d;
}

function cloudPush() {
  if (!Cloud.api || Cloud.mode !== 'online') return;
  var want = desiredDocs(db), p, changed = false;
  for (p in want) {
    var s = stable(want[p]);
    if (effStr(p) !== s) { Cloud.ops[p] = { type: 'set', data: want[p], s: s, tries: 0, sent: false }; changed = true; }
  }
  Object.keys(Cloud.remoteStr).concat(Object.keys(Cloud.ops)).forEach(function (q) {
    if (!(q in want) && effStr(q) !== null) { Cloud.ops[q] = { type: 'del', tries: 0, sent: false }; changed = true; }
  });
  if (changed) pump();
  paintSync();
}
function pump() {
  var p;
  for (p in Cloud.ops) {
    if (Cloud.running >= 4) break;
    var op = Cloud.ops[p];
    if (op.sent || Cloud.inflight[p]) continue;
    runOp(p, op);
  }
}
function runOp(p, op) {
  op.sent = true; Cloud.inflight[p] = op; Cloud.running++;
  var pr;
  try {
    var ref = Cloud.api.doc(p);
    pr = op.type === 'set' ? ref.set(op.data) : ref['delete']();
  } catch (e) { finishOp(p, op, e); return; }
  pr.then(function () { finishOp(p, op, null); }, function (e) { finishOp(p, op, e); });
}
function finishOp(p, op, err) {
  Cloud.running--; delete Cloud.inflight[p];
  if (!err) {
    if (Cloud.ops[p] === op) delete Cloud.ops[p];
    if (op.type === 'set') { Cloud.remote[p] = op.data; Cloud.remoteStr[p] = op.s; }
    else { delete Cloud.remote[p]; delete Cloud.remoteStr[p]; }
  } else {
    var code = err && err.code;
    if (Cloud.ops[p] === op) delete Cloud.ops[p];
    if (code === 'invalid_argument' || code === 'permission-denied') {
      Cloud.mode = 'readonly';
      db = composeFromRemote(); Store.saveCloud(db);
      toast('Sem permissão para salvar. Peça ao dono do app para liberar o seu e-mail.');
      scheduleRender();
    } else if (code === 'quota_exceeded' || code === 'resource-exhausted') {
      toast('O banco de dados da nuvem está cheio. Apague dados antigos ou fale comigo para arquivar.');
      db = composeFromRemote(); scheduleRender();
    } else {
      op.tries++;
      if (op.tries < 4) {
        op.sent = false; if (!Cloud.ops[p]) Cloud.ops[p] = op;
        setTimeout(pump, 800 + Math.random() * 800);
      } else {
        toast('Não foi possível sincronizar uma alteração. Confira a conexão e tente de novo.');
        db = composeFromRemote(); scheduleRender();
      }
    }
  }
  pump(); paintSync();
}

function paintSync() {
  if (!document.querySelectorAll) return;
  var i = syncInfo(), els = document.querySelectorAll('.syncchip');
  for (var k = 0; k < els.length; k++) { els[k].className = 'chip ' + i.c + ' syncchip'; els[k].textContent = i.t; }
}
function scheduleRender() {
  if (Cloud.renderTimer) return;
  Cloud.renderTimer = setTimeout(function () { Cloud.renderTimer = null; render(); }, 60);
}

function setNs(prefix, snap) {
  var seen = {}, k;
  snap.docs.forEach(function (d) {
    var p = prefix + '/' + d.id, data = clone(d.data()); seen[p] = 1;
    Cloud.remote[p] = data; Cloud.remoteStr[p] = stable(data);
  });
  for (k in Cloud.remote) if (k.indexOf(prefix + '/') === 0 && !seen[k]) { delete Cloud.remote[k]; delete Cloud.remoteStr[k]; }
}
function onRemote(name) {
  Cloud.loaded[name] = true;
  if (!Cloud.ready) {
    if (Cloud.loaded.settings && Cloud.loaded.customers && Cloud.loaded.sales && Cloud.loaded.days && (Cloud.serverSeen || Object.keys(Cloud.remote).length > 0)) onFirstLoad();
    return;
  }
  db = composeFromRemote(); Store.saveCloud(db); scheduleRender(); paintSync();
}
function onCloudError(e) {
  if (e && (e.code === 'revoked' || e.code === 'permission-denied')) { Cloud.mode = 'offline'; toast('Sem permissão para ler os dados. Confira se você entrou com o e-mail autorizado.'); }
  else toast('Erro ao ler da nuvem' + (e && e.message ? ': ' + e.message : '.'));
  scheduleRender();
}
function subscribeAll() {
  var api = Cloud.api;
  Cloud.unsubs.push(api.doc('settings/main').onSnapshot(function (snap) {
    if (snap.fromCache !== true) Cloud.serverSeen = true;
    if (snap.exists) { var data = clone(snap.data()); Cloud.remote['settings/main'] = data; Cloud.remoteStr['settings/main'] = stable(data); }
    else { delete Cloud.remote['settings/main']; delete Cloud.remoteStr['settings/main']; }
    onRemote('settings');
  }, onCloudError));
  ['customers', 'sales', 'days'].forEach(function (name) {
    Cloud.unsubs.push(api.collection(name).onSnapshot(function (snap) { if (snap.fromCache !== true) Cloud.serverSeen = true; setNs(name, snap); onRemote(name); }, onCloudError));
  });
}
function onFirstLoad() {
  Cloud.ready = true;
  db = composeFromRemote();
  upgradeSettings(db);
  Cloud.mode = Cloud.userCanWrite === false ? 'readonly' : 'online';
  Store.saveCloud(db);
  if (Cloud.mode === 'online') cloudPush();
  render();
  if (Cloud.mode === 'online' && !Cloud.legacyAsked) {
    Cloud.legacyAsked = true;
    var df = legacyDiff();
    if (df) { ui.sheet = { type: 'migrate', nC: df.newC.length, nS: df.newS.length, nD: Object.keys(df.newD).length }; render(); }
  }
}
function sampleInit() {
  try {
    if (typeof window === 'undefined' || !window.__voraPlatform || !window.__voraPlatform.use) return;
    Promise.resolve(window.__voraPlatform.use('sample')).then(function (fn) {
      if (!fn || !fn.limits || !fn.json) return;
      return fn.limits().then(function (l) {
        if (l && l.images) { Sample.fn = fn; Sample.limits = l.images; scheduleRender(); }
      });
    })['catch'](function () {});
  } catch (e) {}
}
function cloudInit() {
  sampleInit();
  var fallback = function () { Cloud.mode = Store.hasCloud() ? 'offline' : 'local'; scheduleRender(); };
  if (typeof window === 'undefined' || !window.__voraPlatform || !window.__voraPlatform.use) { fallback(); return; }
  Promise.all([window.__voraPlatform.use('db'), window.__voraPlatform.use('user')]).then(function (r) {
    var api = r[0], user = r[1];
    if (!api) { fallback(); return; }
    Cloud.api = api; Cloud.user = user;
    var info = user ? Promise.all([user.me(), user.can('data.write')]) : Promise.resolve([null, null]);
    return info.then(function (x) {
      Cloud.me = x[0]; Cloud.userCanWrite = x[1];
      subscribeAll();
    });
  })['catch'](function () { fallback(); });
}

/* ---- dados antigos deste aparelho (versão anterior, sem nuvem) ---- */
function legacyRaw() {
  try {
    if (localStorage.getItem(KEY_DONE)) return null;
    var raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}
function legacyDiff() {
  var L = legacyRaw(); if (!L) return null;
  var have = {}, byName = {}, map = {}, newC = [], haveS = {}, newD = {};
  db.customers.forEach(function (c) { have[c.id] = 1; byName[norm(c.name)] = c.id; });
  L.customers.forEach(function (c) {
    if (have[c.id]) { map[c.id] = c.id; return; }
    var ex = byName[norm(c.name)];
    if (ex) { map[c.id] = ex; return; }
    map[c.id] = c.id; newC.push(c);
  });
  db.sales.forEach(function (s) { haveS[s.id] = 1; });
  var newS = L.sales.filter(function (s) { return !haveS[s.id]; }).map(function (s) {
    var o = Object.assign({}, s); if (o.customerId && map[o.customerId]) o.customerId = map[o.customerId]; return o;
  });
  Object.keys(L.days).forEach(function (k) { if (!db.days[k]) newD[k] = L.days[k]; });
  if (!newC.length && !newS.length && !Object.keys(newD).length) return null;
  return { L: L, newC: newC, newS: newS, newD: newD };
}
a.migrateAsk = function () {
  var df = legacyDiff();
  if (!df) { toast('Não há dados antigos novos para enviar.'); render(); return; }
  ui.sheet = { type: 'migrate', nC: df.newC.length, nS: df.newS.length, nD: Object.keys(df.newD).length }; render();
};
a.migrateYes = function () {
  var df = legacyDiff();
  if (!df) { ui.sheet = null; render(); return; }
  if (!canWrite()) { blocked(); return; }
  var hadSettings = !!Cloud.remote['settings/main'];
  ui.sheet = null;
  commit(function (d) {
    if (!hadSettings) { d.flavors = df.L.flavors; d.settings = df.L.settings; }
    else df.L.flavors.forEach(function (f) { if (!flv(f.id)) d.flavors.push(Object.assign({}, f, { active: false })); });
    df.newC.forEach(function (c) { d.customers.push(c); });
    df.newS.forEach(function (s) { d.sales.push(s); });
    Object.keys(df.newD).forEach(function (k) { d.days[k] = df.newD[k]; });
  });
  try { localStorage.setItem(KEY_DONE, '1'); } catch (e) {}
  toast('Dados enviados para a nuvem.'); render();
};

/* =========================================================
   CONTA (login) E PLATAFORMA
   ========================================================= */
function platformObj() { return (typeof window !== 'undefined' && window.__voraPlatform) || null; }
function resetCloudState() {
  Cloud.unsubs.forEach(function (u) { try { u(); } catch (e) {} });
  Cloud.unsubs = []; Cloud.api = null; Cloud.user = null; Cloud.me = null; Cloud.mode = 'connecting';
  Cloud.remote = {}; Cloud.remoteStr = {}; Cloud.ops = {}; Cloud.inflight = {}; Cloud.running = 0; Cloud.loaded = {};
  Cloud.ready = false; Cloud.serverSeen = false; Cloud.userCanWrite = null; Cloud.legacyAsked = false;
}
function authErrorText(err) {
  var c = err && err.code ? String(err.code) : '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return 'E-mail ou senha incorretos.';
  if (c === 'auth/invalid-email') return 'Esse e-mail não parece válido.';
  if (c === 'auth/too-many-requests') return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (c === 'auth/network-request-failed') return 'Sem conexão. Verifique a internet e tente de novo.';
  if (c === 'auth/user-disabled') return 'Esta conta está desativada.';
  return 'Não foi possível entrar. Tente de novo.';
}
a.login = function () {
  var P = platformObj(), email = String(ui.login.email || '').trim(), pass = ui.login.pass || '';
  if (!P || !P.auth) return;
  if (!email || !pass) { Auth.error = 'Informe o e-mail e a senha.'; Auth.info = ''; render(); return; }
  Auth.busy = true; Auth.error = ''; Auth.info = ''; render();
  P.auth.signIn(email, pass).then(function () { ui.login.pass = ''; }, function (err) { Auth.busy = false; Auth.error = authErrorText(err); render(); });
};
a.resetPass = function () {
  var P = platformObj(), email = String(ui.login.email || '').trim();
  if (!P || !P.auth) return;
  if (!email) { Auth.error = 'Digite seu e-mail para receber o link de nova senha.'; Auth.info = ''; render(); return; }
  P.auth.reset(email).then(function () { Auth.error = ''; Auth.info = 'Enviamos um e-mail com o link para criar uma nova senha.'; render(); },
    function (err) { Auth.info = ''; Auth.error = authErrorText(err); render(); });
};
a.logout = function () { var P = platformObj(); if (P && P.auth) P.auth.signOut(); };
a.reloadApp = function () { if (typeof location !== 'undefined') location.reload(); };
inp.loginEmail = function (el) { ui.login.email = el.value; };
inp.loginPass = function (el) { ui.login.pass = el.value; };
function startPlatform() {
  var P = platformObj();
  if (P && P.auth) {
    Auth.required = true; Auth.status = 'loading';
    P.auth.onChange(function (user) {
      Auth.user = user; Auth.busy = false;
      resetCloudState();
      if (user) { Auth.status = 'in'; Auth.error = ''; cloudInit(); }
      else {
        Auth.status = 'out';
        try { localStorage.removeItem(KEY_CLOUD); localStorage.removeItem(KEY); } catch (e) {}
        db = defaults(); ui.screen = 'hoje'; ui.sheet = null; ui.nova = freshNova();
      }
      render();
    });
  } else { cloudInit(); }
}

function reportError(err) {
  try { console.error(err); toast('Erro no app: ' + (err && err.message ? err.message : String(err))); render(); } catch (e2) {}
}
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el) return;
  var fn = a[el.getAttribute('data-act')];
  if (!fn) return;
  try { fn(el, e); } catch (err) { reportError(err); }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && (e.target.id === 'lemail' || e.target.id === 'lpass')) { e.preventDefault(); try { a.login(); } catch (err) { reportError(err); } }
});
document.addEventListener('input', function (e) {
  var el = e.target, k = el && el.getAttribute ? el.getAttribute('data-in') : null;
  if (k && inp[k]) { try { inp[k](el); } catch (err) { reportError(err); } }
});
document.addEventListener('change', function (e) {
  var el = e.target, k = el && el.getAttribute ? el.getAttribute('data-ch') : null;
  if (k && chg[k]) { try { chg[k](el); } catch (err) { reportError(err); } }
});

if (typeof window !== 'undefined' && window.__VORA_TEST) {
  window.__VORA_TEST.api = {
    build: build, ui: ui, a: a, inp: inp, chg: chg, render: render, freshNova: freshNova,
    getDb: function () { return db; }, setDb: function (d) { db = d; }, demoData: demoData, today: today, defaults: defaults,
    qrSvg: qrSvg, pixPayloadFor: pixPayloadFor, pixPayloadOk: pixPayloadOk, parseBank: parseBank, matchEntries: matchEntries, Sample: Sample, runMatch: runMatch, addPixFromAi: addPixFromAi, Cloud: Cloud, Auth: Auth, startPlatform: startPlatform, cloudInit: cloudInit, cloudPush: cloudPush, stable: stable, legacyDiff: legacyDiff, composeFromRemote: composeFromRemote
  };
}

render();
startPlatform();
})();
