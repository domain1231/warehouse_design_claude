// 정렬 가이드·가까운 거리 표시 대조 자료 생성: 기준본 v2.4.1 scene()의 g.q-guide와 화면 배율(u)을 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/guide-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { guideCases } from '../tests/golden/guide-cases.js';

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
const page = await (await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });
const cases = [];
for (const c of guideCases) {
  cases.push(await page.evaluate(({ text, c }) => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    P.settings.scenario = 'after';
    if (c.guides === false) P.precision.guides = false;
    const racks = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const ids = c.select.map((i) => racks[i].id);
    if (c.isolate) {
      const o = racks[c.select[0]];
      P.scenarios.after.objects = P.scenarios.after.objects.filter((x) => x.id === o.id || x.kind === 'aisle');
      P.scenarios.after.warehouse.width = 40;
      P.scenarios.after.warehouse.height = 40;
      o.x = 20;
      o.y = 20;
    }
    if (c.move) {
      const o = racks[c.select[0]];
      o.x += c.move[0];
      o.y += c.move[1];
    }
    validateProject(P);
    P.editing.selectedRackIds = ids;
    P.editing.selectionScenario = 'after';
    selected = new Set(ids);
    M.gesture = null;
    Q.guides = [];
    renderAll();
    selected = new Set(ids);
    if (c.zoom) zoom(1 / c.zoom);
    const m = $('plan').getScreenCTM(), u = Math.max(0.01, Math.hypot(m?.a || 20, m?.b || 0));
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.innerHTML = scene(display());
    const g = host.querySelector('g.q-guide');
    return { name: c.name, u, selected: [...selected], guide: g ? g.outerHTML : null, layout: c.isolate || c.move ? JSON.parse(JSON.stringify(P.scenarios.after)) : null };
  }, { text: projectText, c }));
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/guide-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/guide-diff.mjs', cases }, null, 1) + '\n');
for (const c of cases) console.log(c.name, '| u', c.u.toFixed(3), '| 거리', (c.guide?.match(/data-distance/g) || []).length, c.guide === null ? '(없음)' : '');
