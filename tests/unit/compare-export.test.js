// D3(D-079): 발표용 1장 배치 계획(글자 9pt 이상·페이지 안)과 최소 PDF 구조.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentationLayout, jpegToPdf, PAGE, MIN_TEXT_PX } from '../../src/ui/compare-export.js';
import { purposeCompare, compareSummary } from '../../src/metrics/space.js';
import { syntheticEmpty } from './helpers/space-synthetic.js';

const layoutOf = ({ racks }) => ({ warehouse: { width: 20, height: 12, ceiling: 2.7 }, objects: racks.map((r, i) => ({ id: `R-${r.col}${r.no}`, kind: 'rack', code: `${r.col}${r.no}`, x: (i % 10) * 1.8, y: Math.floor(i / 10) * 1.6, width: r.w / 1000, depth: r.d / 1000, rotation: 0, height: 2, excel: { key: `7F-${r.col}-${r.no}`, shelves: [{ level: 1, items: r.rows }] } })) });
const input = (warning = null) => {
  const p = { scenarios: { before: layoutOf(syntheticEmpty({ before: true })), after: layoutOf(syntheticEmpty()) }, scenarioMeta: { before: {}, after: {} } };
  const rows = purposeCompare(p), sm = compareSummary(p, rows);
  return { title: 'BEFORE / AFTER 개선 효과', headline: sm.headline, warning: warning ?? sm.warning, kpis: sm.kpis, rows: rows.filter((r) => r.id !== 'M7'),
    bars: ['BEFORE', 'AFTER'].map((name) => ({ name, segs: [{ label: '랙', share: 0.3, color: '#4a90d9' }, { label: '빈 랙', share: 0.05, color: '#4a90d9', hatch: true }, { label: '보관 불가', share: 0.05, color: '#c0504d' }, { label: '통로', share: 0.3, color: '#8a96a3' }, { label: '보관 가능 잔여', share: 0.3, color: '#5fae5f' }] })),
    legendItems: [['+40%p 이상', 3], ['+20~40%p', 40], ['+1~20%p', 1], ['변화 없음', 0], ['악화', 0], ['비움(이전 완료)', 12], ['? Excel 미연결', 0]].map(([label, count]) => ({ label, color: '#888888', count })),
    footnotes: ['BEFORE · 출처', 'AFTER · 출처', '면적 기준: 도면 전체 (양쪽 모두 Excel 면적 없음)'] };
};

test('A4 가로 150dpi 한 장 · 모든 글자 9pt(18.75px) 이상 · 모든 요소가 페이지 안 · 결론·KPI 4개·각주 포함', () => {
  assert.deepEqual([PAGE.width, PAGE.height], [1754, 1240]);
  assert.ok(Math.abs(PAGE.width / PAGE.height - 842 / 595) < 0.002, 'A4 가로 비율');
  for (const warn of [null, '주의: 80% 미만 로케이션 5개 증가']) {
    const plan = presentationLayout(input(warn)), texts = plan.items.filter((i) => i.t === 'text');
    assert.ok(texts.every((t) => t.size >= MIN_TEXT_PX), `최소 글자 ${Math.min(...texts.map((t) => t.size))}px`);
    for (const it of plan.items) {
      const x0 = it.t === 'rect' ? it.x : it.align === 'right' ? it.x - it.maxWidth : it.x, x1 = it.t === 'rect' ? it.x + it.w : it.align === 'right' ? it.x : it.x + it.maxWidth;
      const y0 = it.t === 'rect' ? it.y : it.y - it.size, y1 = it.t === 'rect' ? it.y + it.h : it.y;
      assert.ok(x0 >= 0 && x1 <= plan.width + 1e-9 && y0 >= 0 && y1 <= plan.height, `페이지 밖: ${JSON.stringify(it).slice(0, 80)}`);
    }
    const all = texts.map((t) => t.text).join('\n');
    assert.ok(all.includes(input().headline));
    for (const k of ['평균 용적률', '80% 미만 로케이션', '빈 랙', '보관 가능 합계']) assert.ok(all.includes(k), k);
    assert.ok(all.includes('면적 기준: 도면 전체'), '각주에 면적 기준');
    if (warn) assert.ok(all.includes(warn));
    const m = plan.map, lastTextAboveFoot = Math.max(...texts.filter((t) => !t.text.startsWith('BEFORE ·') && !t.text.startsWith('AFTER ·') && !t.text.startsWith('면적')).map((t) => t.y));
    assert.ok(m.w > 900 && m.h > 600, `지도 영역 ${m.w}×${m.h}`);
    assert.ok(lastTextAboveFoot < plan.height - 30 - 2 * 28 - 20, '본문이 각주와 겹치지 않음');
  }
});

test('최소 PDF: 헤더·객체 5개·xref 오프셋·startxref·이미지 길이가 맞음', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 1754, 1240), txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4\n'));
  assert.ok(txt.endsWith('%%EOF\n'));
  const xref = Number(txt.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(txt.slice(xref, xref + 4), 'xref');
  const entries = txt.slice(xref).split('\n').slice(3, 8);
  entries.forEach((e, i) => { assert.equal(e.length + 1, 20, 'xref 항목 20바이트'); const off = Number(e.slice(0, 10)); assert.equal(txt.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`); });
  assert.match(txt, /\/MediaBox \[0 0 842 595\]/);
  assert.match(txt, /\/Width 1754 \/Height 1240 .*\/Filter \/DCTDecode \/Length 10 >>/);
  const st = txt.indexOf('stream\n', txt.indexOf('/DCTDecode')) + 7;
  assert.deepEqual([...pdf.slice(st, st + jpeg.length)], [...jpeg], '이미지 바이트 그대로');
});
