// Excel 대조 자료 생성: tests/golden/excel-cases.js의 가상 통합 문서를 기준본 페이지의 SheetJS로 만들어 fixtures/excel/에 저장하고,
// 기준본 EX.readFile → (선택) 매핑 변경·규격 선택 → EX.analyze 결과(행렬·머리글 행·매핑·분석)를 fixtures/legacy/excel-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/excel-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { excelCases, proposalCases } from '../tests/golden/excel-cases.js';
import { normalizeLikeHarness } from '../tests/golden/compare.js';

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
// 배치안(70 EX.proposal → 90 W.base). 사례마다 기준 프로젝트를 다시 불러온다.
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const workbookBytes = (name) => [...fs.readFileSync(new URL(name, outDir))];
const proposals = [];
for (const c of proposalCases) {
  const r = await page.evaluate(async ({ c, text, bytes }) => {
    await EX.readFile(new File([new Uint8Array(bytes)], c.file ?? 'synthetic-basic.xlsx'));
    if ($('excelDialog').open) $('excelDialog').close();
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    validateProject(P);
    let last = null;
    const out = [];
    for (const step of c.steps) {
      if (step === 'commit') {
        P.scenarios[last.config.target] = JSON.parse(JSON.stringify(last.layout));
        validateProject(P); // 실제 적용처럼 기본값 보정(규격·크기 제한 등)
        continue;
      }
      if (step === 'apply') {
        // 70 EX.apply 본문(wApply) + 90 R.transaction 래퍼. 화면 확인·후보 일치 검사만 대체한다.
        last.warnings = warnings(last.layout);
        last.applyContext = { filename: 'synthetic-basic.xlsx', sheet: EX.sheetName, analysis: JSON.parse(JSON.stringify(EX.analysis)) };
        W.pending = { settings: JSON.parse(JSON.stringify(last.config.autoPlacement)), acknowledged: true, fingerprint: W.scan(last.layout).fingerprint, candidate: '기존 배치 규칙' };
        const matches = W.matches;
        W.matches = () => true;
        window.confirm = () => true;
        const ok = wApply(last);
        W.matches = matches;
        W.pending = null;
        const pick = ({ scenarios, scenarioMeta, locationLayout, layoutBackups, layoutRevisions, importHistory, excelSnapshots, layoutSnapshots, editing, settings, metadata, autoPlacement }) => ({ scenarios, scenarioMeta, locationLayout, layoutBackups, layoutRevisions, importHistory, excelSnapshots, layoutSnapshots, selection: [editing.selectedRackIds, editing.selectionScenario], scenario: settings.scenario, sample: metadata.sample, autoSettings: autoPlacement.settings, autoHistory: autoPlacement.history.map((h) => ({ ...h, fingerprint: h.fingerprint === W.scan(h.layout).fingerprint })) }); // 지문은 객체 ID를 포함하므로 일치 여부만 비교
        out.push({ applied: ok, project: pick(JSON.parse(JSON.stringify(P))) });
        continue;
      }
      EX.resolutions = step.resolutions ?? c.resolutions;
      EX.analyze();
      if (step.dropRack) EX.analysis.racks = EX.analysis.racks.filter((x) => x.key !== step.dropRack);
      if (step.onlyRacks) EX.analysis.racks = EX.analysis.racks.filter((x) => step.onlyRacks.includes(x.key) || x.key === step.dropRack);
      if (step.editItem) EX.analysis.racks[0].shelves[0].items[0].itemName = '변경된 품목명';
      R.missingDelete.clear();
      if (step.deleteMissing) for (const o of P.scenarios[step.c.target].objects) if (o.excel?.key === step.dropRack) R.missingDelete.add(o.id);
      try {
        last = W.base(step.c);
        out.push({ layout: last.layout, changes: last.changes, missing: last.missing.map((o) => o.id), generatedKeys: last.generatedKeys });
        if (step.build) {
          // 90 W.build: 후보 0(W.base) + W.pack 재배치 후보, 방식별 점수로 선택(Phase 6a)
          W.build(step.c);
          out.push({ choice: W.choice, candidates: W.candidates.map((v) => ({ name: v.name, objects: v.layout.objects.map((o) => [o.id, o.x, o.y, o.rotation, o.placementMeta?.waiting ?? null]), counts: v.result.counts, moved: v.moved, manualMoved: v.manualMoved, orderLoss: v.orderLoss })) });
          // 재최적화(90 wOptimize 본문을 기준본 W.pack·W.candidate·W.compare로 재현, Phase 6b). 결과 후보를 추가하고 선택한다.
          for (const ro of step.reopt || []) {
            const prior = W.candidates[W.choice], c = step.c;
            W.previewSelected.clear();
            const racks = prior.layout.objects.filter((o) => o.kind === 'rack');
            for (const i of ro.select || []) W.previewSelected.add(racks[i].id);
            if (ro.scope === 'selected' && !W.previewSelected.size) {
              out.push({ reopt: ro.scope, error: '아래 목록에서 재최적화할 랙을 선택하세요.' });
              continue;
            }
            const variants = ['row', 'reverse', 'column', 'area', ...(c.autoPlacement.allowRotation ? ['rotate'] : [])].map((s) => W.candidate('재최적화 · ' + ro.scope + ' · ' + s, W.pack(prior.layout, { ...c, keep: 'reflow' }, s, ro.scope), c, P.scenarios[c.target]));
            variants.sort((a, b) => W.compare(a, b, c));
            const next = variants[0];
            W.candidates.push(next);
            W.choice = W.candidates.length - 1;
            out.push({ reopt: ro.scope, name: next.name, worse: W.compare(next, prior, c) > 0, summary: W.summary(next.result), priorSummary: W.summary(prior.result), objects: next.layout.objects.map((o) => [o.id, o.x, o.y, o.rotation, o.placementMeta?.waiting ?? null]), movedFromPrior: W.moved(next.layout, prior.layout), freeArea: next.result.warehouseArea - next.result.footprint });
          }
        }
      } catch (e) {
        out.push({ error: e.message });
      }
    }
    return JSON.parse(JSON.stringify(out));
  }, { c, text: projectText, bytes: workbookBytes(c.file ?? 'synthetic-basic.xlsx') });
  proposals.push({ name: c.name, steps: r });
}
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
fs.writeFileSync(new URL('../fixtures/legacy/excel-cases.json', import.meta.url), JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/excel-diff.mjs when cases change', results, proposals }, null, 1) + '\n');
console.log(results.map((r) => `${r.name}: header ${r.headerRow1}, rows ${r.analysis.rows.length}, racks ${r.analysis.racks.length}, issues ${r.analysis.issues.length}`).join('\n'));
