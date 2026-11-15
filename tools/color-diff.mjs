// 색 표시 모드·사용자 지정 색 대조 자료 생성(Phase 5c-2): 기준본 v2.4.1 일반본에서 실제 화면 조작으로 상태를 만들고
// 도형 채움색(객체별)·라벨(g.v-labels)·범례 글자·EX.height(3정책)·관련 설정을 fixtures/legacy/color-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/color-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { colorFixture, colorCases, FIXTURE_RACKS } from '../tests/golden/color-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const cases = [];
for (const c of colorCases) {
  const r = await page.evaluate(({ text, c, fixtureSrc, fixtureRacks }) => {
    const makeFixture = new Function('return ' + fixtureSrc)();
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    P.settings.scenario = 'after';
    const rk = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const fx = makeFixture(fixtureRacks.map((i) => rk[i].id));
    for (const o of rk) if (fx.excel[o.id]) o.excel = fx.excel[o.id];
    P.inventoryHistory = fx.inventory;
    validateProject(P);
    undoStack.length = 0;
    selected = new Set();
    renderAll();
    const errs = [];
    const toast = document.querySelector('#toast');
    if (toast) toast.textContent = '';
    const objects = () => display().objects;
    for (const s of c.steps) {
      if (s.viz) { $('exViz').value = s.viz; $('exViz').onchange(); }
      else if (s.heightPolicy) { $('exHeightPolicy').value = s.heightPolicy; $('exHeightPolicy').onchange(); }
      else if (s.colors) {
        $('thresholdLow').value = s.colors.low;
        $('thresholdHigh').value = s.colors.high;
        for (const [k, v] of Object.entries(s.colors.colors)) $('color' + k[0].toUpperCase() + k.slice(1)).value = v;
        $('applyColors').click();
      } else if (s.colorMode) { $('vColorMode').value = s.colorMode; $('vColorMode').onchange(); }
      else if (s.objectColor) {
        const pool = s.objectColor.rack !== undefined ? objects().filter((o) => o.kind === 'rack') : objects().filter((o) => o.kind !== 'rack');
        const o = pool[s.objectColor.rack ?? s.objectColor.object];
        selected = new Set([o.id]);
        renderAll();
        if (s.objectColor.color === null) $('vObjectColorClear').click();
        else { $('vObjectColor').value = s.objectColor.color; $('vObjectColorApply').click(); }
        selected = new Set();
        renderAll();
      } else if (s.reset) { $('vResetScope').value = s.reset; $('vResetApply').click(); }
      else if (s.undo) undo();
      if (toast?.textContent) errs.push(toast.textContent);
      if (toast) toast.textContent = '';
    }
    selected = new Set();
    M.size = () => ({ w: 1400, h: 900 });
    M.center(true);
    renderAll();
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.innerHTML = scene(display());
    const fills = [...host.querySelectorAll(':scope > g[data-id]')].map((g) => [g.dataset.id, g.querySelector('rect,polygon').getAttribute('fill')]);
    const racks = objects().filter((o) => o.kind === 'rack');
    const heights = {};
    for (const policy of ['weightedMax', 'meanMax', 'max']) {
      const keep = P.settings.heightPolicy;
      P.settings.heightPolicy = policy;
      heights[policy] = racks.map((o) => EX.height(o));
      P.settings.heightPolicy = keep;
    }
    return {
      name: c.name,
      viewport: { ...P.viewport },
      settings: JSON.parse(JSON.stringify({ vizMode: P.settings.vizMode, heightPolicy: P.settings.heightPolicy, low: P.settings.low, high: P.settings.high, colors: P.settings.colors })),
      theme: JSON.parse(JSON.stringify(P.theme)),
      undoDepth: undoStack.length,
      errors: errs,
      fills,
      labels: [...host.querySelectorAll('g.v-labels')].map((g) => g.outerHTML),
      legendText: [...$('legend').children].map((e) => e.textContent),
      heights,
    };
  }, { text: projectText, c, fixtureSrc: colorFixture.toString(), fixtureRacks: FIXTURE_RACKS });
  cases.push(r);
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/color-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/color-diff.mjs', cases }, null, 2) + '\n');
for (const c of cases) console.log(`${c.name}: 채움색 ${new Set(c.fills.map((f) => f[1])).size}종 · undo ${c.undoDepth} · colorMode ${c.theme.colorMode} · 오류 ${c.errors.length}`);
