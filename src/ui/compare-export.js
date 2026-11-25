// D3(D-080): 비교 화면 '발표용 1장 내보내기' — A4 가로(150dpi, 1754×1240px) 한 장에 결론·KPI·목적 지표·공간 구성 막대·Δ 지도(발표 모드)·각주.
// 배치 계획(presentationLayout)과 PDF 조립(jpegToPdf)은 DOM 없는 순수 함수, 그리기(renderPresentation)만 브라우저 캔버스를 쓴다. 외부 자원 없음.

export const PAGE = Object.freeze({ width: 1754, height: 1240, dpi: 150 });
/** 9pt를 150dpi 픽셀로: 9 / 72 × 150 = 18.75px. 모든 글자는 이 이상. */
export const MIN_TEXT_PX = (9 / 72) * PAGE.dpi;
const C = { bg: '#111821', card: '#17212c', line: '#2c3a49', text: '#e5edf6', sub: '#9fb0c2', better: '#4fd18b', worse: '#ff6b6b', same: '#8d99a6', warn: '#ff9a9a' };
const TREND = { better: ['▲', '개선'], worse: ['▼', '악화'], same: ['—', '변화 없음'] };
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif';

/**
 * @param {{ title: string, headline: string, warning: string|null, kpis: object[], rows: object[], bars: {name: string, segs: {label: string, share: number, color: string, hatch?: boolean}[]}[], legendItems: {label: string, color: string, count: number}[], footnotes: string[] }} d
 * @returns {{ width, height, items: object[], map: {x, y, w, h} }}
 */
export function presentationLayout(d) {
  const W = PAGE.width, H = PAGE.height, M = 56, items = [];
  const text = (x, y, t, size, color = C.text, o = {}) => items.push({ t: 'text', x, y, text: String(t), size, color, weight: o.weight ?? 400, align: o.align ?? 'left', maxWidth: o.maxWidth ?? W - M - x });
  const rect = (x, y, w, h, fill, o = {}) => items.push({ t: 'rect', x, y, w, h, fill, ...o });
  text(M, 70, d.title, 28, C.sub);
  text(M, 128, d.headline, 40, C.text, { weight: 700, maxWidth: W - 2 * M });
  if (d.warning) text(M, 176, `⚠ ${d.warning}`, 26, C.warn, { maxWidth: W - 2 * M });
  // KPI 카드 4개
  const ky = 205, kh = 165, gap = 20, kw = (W - 2 * M - gap * 3) / 4;
  d.kpis.forEach((k, i) => {
    const x = M + i * (kw + gap), tr = TREND[k.trend];
    rect(x, ky, kw, kh, C.card, { stroke: C.line });
    text(x + 20, ky + 42, k.label, 24, C.sub, { maxWidth: kw - 40 });
    text(x + 20, ky + 92, `${k.before} → ${k.after}`, 30, C.text, { maxWidth: kw - 40 });
    text(x + 20, ky + 140, (tr ? `${tr[0]} ` : '') + k.delta + (tr ? `  ${tr[1]}` : ''), 28, tr ? C[k.trend] : C.text, { weight: 700, maxWidth: kw - 40 });
  });
  // 왼쪽: 목적 지표 표 + 공간 구성 막대
  const lx = M, lw = 640, rowH = 38;
  let y = ky + kh + 52;
  text(lx, y, '목적 지표 (BEFORE → AFTER · 차이)', 24, C.sub);
  y += 14;
  for (const r of d.rows) {
    y += rowH;
    const tr = TREND[r.trend];
    text(lx, y, r.label, 22, C.text, { maxWidth: 190 });
    text(lx + 200, y, `${r.before} → ${r.after}`, 22, C.text, { maxWidth: 300 });
    text(lx + lw, y, (tr ? `${tr[0]} ` : '') + r.delta, 22, tr ? C[r.trend] : C.text, { align: 'right', maxWidth: 140 });
  }
  y += 56;
  text(lx, y, '공간 구성 (도면 전체 기준)', 24, C.sub);
  for (const b of d.bars) {
    y += 22;
    text(lx, y + 32, b.name, 22, C.text);
    let x = lx + 110;
    const bw = lw - 110;
    if (!b.segs.length) text(x, y + 32, '배치 없음', 22, C.sub);
    for (const s of b.segs) { // D5(D-082): 4% 이상 구간은 막대 안에 비율
      const w = bw * Math.max(0, s.share ?? 0);
      if (w > 0) rect(x, y, w, 44, s.color, { hatch: !!s.hatch });
      if ((s.share ?? 0) >= 0.04 && w >= 60) text(x + w / 2, y + 30, `${(s.share * 100).toFixed(1)}%`, 20, s.hatch ? '#ffffff' : '#0b1118', { align: 'center', weight: 700, maxWidth: w - 4 });
      x += w;
    }
    y += 44;
  }
  y += 40;
  let lgx = lx;
  for (const s of d.bars.find((b) => b.segs.length)?.segs ?? []) {
    const label = s.label, w = 34 + label.length * 22;
    if (lgx + w > lx + lw) { lgx = lx; y += 32; }
    rect(lgx, y - 18, 20, 20, s.color, { hatch: !!s.hatch });
    text(lgx + 28, y, label, 20, C.sub);
    lgx += w;
  }
  // 오른쪽: Δ 지도(발표 모드) + 범례
  const mx = M + lw + 50, map = { x: mx, y: ky + kh + 30, w: W - M - mx, h: H - 190 - (ky + kh + 30) };
  rect(map.x, map.y, map.w, map.h, '#0d141c', { stroke: C.line });
  let gx = mx, gy = map.y + map.h + 36;
  for (const g of d.legendItems) {
    const label = `${g.label} ${g.count}`, w = 36 + [...label].length * 18;
    if (gx + w > W - M) { gx = mx; gy += 30; }
    rect(gx, gy - 18, 20, 20, g.color);
    text(gx + 28, gy, label, 20, C.sub);
    gx += w;
  }
  // 각주: 출처·면적 기준
  d.footnotes.forEach((f, i) => text(M, H - 30 - (d.footnotes.length - 1 - i) * 28, f, 20, C.sub, { maxWidth: W - 2 * M }));
  return { width: W, height: H, items, map };
}

/** 계획을 캔버스에 그린다. mapSvg는 독립 SVG 문자열(발표 모드 Δ 지도). */
export async function renderPresentation(plan, mapSvg, doc = document) {
  const cv = doc.createElement('canvas');
  cv.width = plan.width;
  cv.height = plan.height;
  const g = cv.getContext('2d');
  g.fillStyle = C.bg;
  g.fillRect(0, 0, cv.width, cv.height);
  const hatch = (() => { const t = doc.createElement('canvas'); t.width = t.height = 10; const h = t.getContext('2d'); h.strokeStyle = 'rgba(17,24,33,.85)'; h.lineWidth = 3; h.beginPath(); h.moveTo(0, 10); h.lineTo(10, 0); h.stroke(); return g.createPattern(t, 'repeat'); })();
  for (const it of plan.items) {
    if (it.t === 'rect') {
      g.fillStyle = it.fill;
      g.fillRect(it.x, it.y, it.w, it.h);
      if (it.hatch) { g.fillStyle = hatch; g.fillRect(it.x, it.y, it.w, it.h); }
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = 2; g.strokeRect(it.x, it.y, it.w, it.h); }
    } else {
      g.fillStyle = it.color;
      g.font = `${it.weight} ${it.size}px ${FONT}`;
      g.textAlign = it.align;
      g.textBaseline = 'alphabetic';
      g.fillText(it.text, it.x, it.y, it.maxWidth);
    }
  }
  if (mapSvg) {
    const url = URL.createObjectURL(new Blob([mapSvg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Δ 지도 그림 변환 실패')); i.src = url; });
      const m = plan.map, s = Math.min((m.w - 20) / img.width, (m.h - 20) / img.height), w = img.width * s, h = img.height * s;
      g.drawImage(img, m.x + (m.w - w) / 2, m.y + (m.h - h) / 2, w, h);
    } finally { URL.revokeObjectURL(url); }
  }
  return cv;
}

/** JPEG 한 장을 A4 가로(842×595pt) 한 페이지 PDF로. 외부 라이브러리 없이 최소 PDF 1.4 구조(객체 5개 + xref). */
export function jpegToPdf(jpeg, wPx, hPx, { pageW = 842, pageH = 595 } = {}) {
  const enc = new TextEncoder(), parts = [], offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push('\nendstream'); });
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len;
  push('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
