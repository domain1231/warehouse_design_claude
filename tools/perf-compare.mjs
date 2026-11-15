// Phase 11 성능·결과 비교: 가상 랙 56/200/500개 통합 문서를 기준본 SheetJS로 만들고, 같은 입력으로
// 기준본(브라우저, v2.4.1 일반본)과 재구축(Node)의 자동 배치 후보 생성·도면 그리기·배치 검사 시간을 재고 선택 결과를 비교한다.
// 결과는 docs/PERFORMANCE.md에 쓴다(실행 환경 표기). 시간은 같은 PC에서도 흔들리므로 3회 중앙값을 쓴다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/perf-compare.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { validateProject } from '../src/core/project.js';
import { createIdGenerator } from '../src/core/ids.js';
import { readWorkbook, sheetMatrix } from '../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../src/excel/analyze.js';
import { buildCandidates } from '../src/autolayout/candidates.js';
import { buildScene } from '../src/cad/scene.js';
import { scanLayout, warnings } from '../src/warehouse/constraints.js';
import { setFallbackMeasure } from '../src/cad/labels.js';
import { tableMeasure } from '../tests/golden/label-measure.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
setFallbackMeasure(tableMeasure);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const HEADER = ['No.', '로케이션', '품목코드', '품목명', '규격', 'ROP', 'MAX  Stock', '3개월 평균 입고수량', 'Rack 단수', '혼적수', 'Rack 가로(mm)', 'Rack 세로 (mm)', 'Rack 높이 (mm)', 'Rack 단 높이 (mm)', '자재높이 (mm)', '용적률(%)', '랙 용적률(%)', '사용 면적(㎡)', '유휴 공간', '비고'];
const COLS = 'ABCDEFGHIJ'.split('');
function aoa(n) {
  const rows = [HEADER];
  for (let i = 0; i < n; i++) {
    const col = COLS[i % COLS.length], num = Math.floor(i / COLS.length) + 1;
    rows.push([i + 1, `7F-${col}-${num}-1-1`, `PF-${i}`, '성능 시험 자재', 'SYN', 10, 50, 12.5, 1, 1, 800 + (i % 4) * 200, 600 + (i % 3) * 400, 2000, 400, 120, null, 0, 1.48, '', '']);
  }
  return rows;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const SIZES = [56, 200, 500];
const SCENARIOS = (n) => [
  { mode: 'inside', label: '내부 우선·넓은 창고', width: Math.ceil(Math.sqrt(n * 6)) + 6, depth: Math.ceil(Math.sqrt(n * 6)) },
  { mode: 'inside', label: '내부 우선·좁은 창고', width: Math.ceil(Math.sqrt(n * 2.2)), depth: Math.ceil(Math.sqrt(n * 2.2)) },
  { mode: 'column', label: '열 우선·넓은 창고', width: Math.ceil(Math.sqrt(n * 6)) + 6, depth: Math.ceil(Math.sqrt(n * 6)) },
  { mode: 'column', label: '열 우선·좁은 창고', width: Math.ceil(Math.sqrt(n * 2.2)), depth: Math.ceil(Math.sqrt(n * 2.2)) },
];
const config = (s) => ({
  building: 'SYN', floor: '7F', width: s.width, depth: s.depth, originX: 1, originY: 1, northRotation: 0, columnDirection: 'east', firstRackPosition: 'north',
  columnGap: 0.6, rackGap: 0.2, rotation: 90, wallGap: 0.1, aisleTarget: 1.2, order: '', perColumnSettings: {}, empty: false, emptyW: 1, emptyD: 0.6, emptyH: 2,
  mode: 'new', keep: 'keep', date: '2026-11-15', source: '성능 시험', recordLayout: false, target: 'after', missingPolicy: 'mark', specPolicy: 'keep',
  autoPlacement: { mode: s.mode, keepManual: false, allowRotation: false, allowWarnings: true, preserveStructures: false, allowWrap: false, externalDirection: 'right' },
});

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const page = await (await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const rows = [];
for (const n of SIZES) {
  const bytes = await page.evaluate((data) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), '자재 목록');
    return [...new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))];
  }, aoa(n));
  const wb = await readWorkbook(`perf-${n}.xlsx`, new Uint8Array(bytes).buffer);
  const sheet = wb.sheets[wb.sheetNames[0]], matrix = sheetMatrix(sheet), header = detectHeaderRow(matrix) + 1;
  const analysis = analyzeSheet({ matrix, headerRow1: header, mapping: autoMap(matrix, header), cell: (a) => sheet.cells.get(a) });
  for (const s of SCENARIOS(n)) {
    const c = config(s);
    // 기준본
    const base = await page.evaluate(async ({ text, bytes, c }) => {
      await EX.readFile(new File([new Uint8Array(bytes)], 'perf.xlsx'));
      if ($('excelDialog').open) $('excelDialog').close();
      const times = [];
      let out = null;
      for (let k = 0; k < 3; k++) {
        P = JSON.parse(text);
        M.ensure(P);
        W.ensure(P);
        P.scenarios.after.objects = [];
        validateProject(P);
        EX.resolutions = {};
        EX.analyze();
        R.missingDelete.clear();
        const t = performance.now();
        W.build(c);
        times.push(performance.now() - t);
        const v = W.candidates[W.choice];
        out = { choice: W.choice, name: v.name, validInside: v.result.counts.validInside, total: v.result.counts.total, waiting: v.result.counts.waiting, objects: v.layout.objects.map((o) => [o.excel?.key ?? o.code, o.x, o.y, o.rotation]), stop: W.column?.lastRun?.stopReason ?? '' };
      }
      P.scenarios.after = W.candidates[W.choice].layout;
      validateProject(P);
      const render = [], scan = [], warn = [];
      for (let k = 0; k < 3; k++) {
        let t = performance.now();
        scene(display());
        render.push(performance.now() - t);
        W.cache?.clear?.();
        t = performance.now();
        W.scan(P.scenarios.after);
        scan.push(performance.now() - t);
        t = performance.now();
        warnings(P.scenarios.after);
        warn.push(performance.now() - t);
      }
      return { build: times, render, scan, warn, out };
    }, { text: projectText, bytes, c });
    // 재구축
    const times = [];
    let res = null, project = null;
    for (let k = 0; k < 3; k++) {
      project = validateProject(JSON.parse(projectText));
      project.scenarios.after.objects = [];
      project = validateProject(project);
      const t = performance.now();
      res = buildCandidates(project, analysis, c, { nextId: createIdGenerator({ seed: 'perf' + k }), filename: 'perf.xlsx', sheet: '자재 목록' });
      times.push(performance.now() - t);
    }
    const v = res.candidates[res.choice];
    project.scenarios.after = v.layout;
    project = validateProject(project);
    const render = [], scan = [], warn = [];
    for (let k = 0; k < 3; k++) {
      let t = performance.now();
      buildScene(project.scenarios.after, project, { scope: 'after', selected: new Set(), pixelsPerMeter: 20 });
      render.push(performance.now() - t);
      t = performance.now();
      scanLayout(project.scenarios.after, project);
      scan.push(performance.now() - t);
      t = performance.now();
      warnings(project.scenarios.after, project);
      warn.push(performance.now() - t);
    }
    const mine = { choice: res.choice, name: v.name, validInside: v.result.counts.validInside, total: v.result.counts.total, waiting: v.result.counts.waiting, objects: v.layout.objects.map((o) => [o.excel?.key ?? o.code, o.x, o.y, o.rotation]), stop: res.run?.stopReason ?? '' };
    const sameLayout = JSON.stringify(mine.objects) === JSON.stringify(base.out.objects);
    rows.push({ n, scenario: s.label, size: `${s.width}×${s.depth}`, base: { build: median(base.build), render: median(base.render), scan: median(base.scan), warn: median(base.warn), ...base.out, objects: undefined }, mine: { build: median(times), render: median(render), scan: median(scan), warn: median(warn), ...mine, objects: undefined }, sameChoice: base.out.name === mine.name, sameLayout });
    console.log(`${n}랙 ${s.label}: 기준본 ${median(base.build).toFixed(0)}ms(${base.out.name}, ${base.out.validInside}/${base.out.total}${base.out.stop ? ', ' + base.out.stop : ''}) · 재구축 ${median(times).toFixed(0)}ms(${mine.name}, ${mine.validInside}/${mine.total}${mine.stop ? ', ' + mine.stop : ''}) · 같은 배치 ${sameLayout}`);
  }
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
const f = (x) => (x < 10 ? x.toFixed(1) : x.toFixed(0));
const md = [
  '# 성능·결과 비교 (Phase 11)',
  '',
  `- 생성: \`tools/perf-compare.mjs\` · ${new Date().toISOString().slice(0, 10)} · ${os.type()} ${os.release()} · Node ${process.version} · CPU ${os.cpus()[0]?.model ?? '미확인'} ×${os.cpus().length}`,
  '- 기준본: domain1231/warehouse_design@d7b1e696 일반본(Chromium 안에서 실행). 재구축: Node에서 같은 계산 모듈 실행. 같은 가상 통합 문서(기준본 SheetJS로 생성).',
  '- 시간은 3회 중앙값(ms). 브라우저와 Node의 실행 환경이 달라 절대값 비교는 참고용이며, 규모 증가에 따른 추세와 결과 일치 여부가 핵심이다.',
  '- 열 우선 방식: 기준본은 탐색 시간 상한(1.5초)이 있고 재구축은 탐색 예산만 쓴다(D-023). "중단"이 time-bound면 기준본이 시간 상한에 걸린 것이다.',
  '',
  '| 랙 | 조건 | 창고(m) | 후보 생성 기준본 | 후보 생성 재구축 | 선택 후보(기준본 / 재구축) | 내부 정상 | 중단(기준본 / 재구축) | 같은 배치 | 도면 그리기 기준본 / 재구축 | 배치 검사 기준본 / 재구축 | 공간 경고 기준본 / 재구축 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.n} | ${r.scenario} | ${r.size} | ${f(r.base.build)} | ${f(r.mine.build)} | ${r.base.name} / ${r.mine.name} | ${r.base.validInside}/${r.base.total} · ${r.mine.validInside}/${r.mine.total} | ${r.base.stop || '—'} / ${r.mine.stop || '—'} | ${r.sameLayout ? '예' : '**아니오**'} | ${f(r.base.render)} / ${f(r.mine.render)} | ${f(r.base.scan)} / ${f(r.mine.scan)} | ${f(r.base.warn)} / ${f(r.mine.warn)} |`),
  '',
];
fs.writeFileSync(new URL('../docs/PERFORMANCE.md', import.meta.url), md.join('\n'));
console.log('docs/PERFORMANCE.md 작성');
