// Excel 대조 자료 생성: tests/golden/excel-cases.js의 가상 통합 문서를 기준본 페이지의 SheetJS로 만들어 fixtures/excel/에 저장하고,
// 기준본 EX.readFile → (선택) 매핑 변경·규격 선택 → EX.analyze 결과(행렬·머리글 행·매핑·분석)를 fixtures/legacy/excel-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/excel-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { excelCases } from '../tests/golden/excel-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const outDir = new URL('../fixtures/excel/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
const results = [];
const written = new Set(); // 같은 파일을 쓰는 사례는 처음 만든 바이트만 저장
for (const c of excelCases) {
  const r = await page.evaluate(async (c) => {
    let bytes;
    if (c.csv !== undefined) bytes = new TextEncoder().encode(c.csv);
    else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(c.aoa), '자재 목록');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['참고 시트']]), '참고');
      bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', bookSST: !!c.sst, compression: true }));
    }
    await EX.readFile(new File([bytes], c.file));
    if (c.remap) {
      for (const [k, v] of Object.entries(c.remap)) EX.mapping[k] = v;
      EX.analyze();
    }
    if (c.resolutions) {
      EX.resolutions = c.resolutions;
      EX.analyze();
    }
    if ($('excelDialog').open) $('excelDialog').close();
    return { bytes: [...bytes], sheetNames: EX.book.SheetNames, matrix: EX.matrix, headerRow1: Number($('exHeader').value), mapping: EX.mapping, analysis: JSON.parse(JSON.stringify(EX.analysis)) };
  }, c);
  if (!written.has(c.file)) fs.writeFileSync(new URL(c.file, outDir), Buffer.from(r.bytes));
  written.add(c.file);
  delete r.bytes;
  results.push({ name: c.name, ...r });
}
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
fs.writeFileSync(new URL('../fixtures/legacy/excel-cases.json', import.meta.url), JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/excel-diff.mjs when cases change', results }, null, 1) + '\n');
console.log(results.map((r) => `${r.name}: header ${r.headerRow1}, rows ${r.analysis.rows.length}, racks ${r.analysis.racks.length}, issues ${r.analysis.issues.length}`).join('\n'));
