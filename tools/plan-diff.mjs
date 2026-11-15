// 도면 보기 대조 자료 생성: 기준본 v2.4.1 일반본에서
//  1) 카메라(viewBox·zoom·focusSelection·M.center) 계산 결과
//  2) 도면 SVG의 객체별 도형(순서, data-id, 회전 transform, rect/polygon 좌표, 선 굵기)
// 를 받아 fixtures/legacy/plan-cases.json에 기록한다. 화면 크기는 M.size를 고정값으로 바꿔 결정적으로 만든다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/plan-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cameraCases } from '../tests/golden/plan-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
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
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const out = await page.evaluate(({ text, cases }) => {
  const load = () => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    validateProject(P);
    selected = new Set();
  };
  const camera = cases.map((c) => {
    load();
    M.size = () => ({ w: Math.max(1, c.size.w), h: Math.max(1, c.size.h) });
    P.viewport = { ...c.viewport };
    for (const step of c.steps) {
      if (step.op === 'zoom') zoom(step.f, step.anchor ?? undefined);
      else if (step.op === 'center') M.center(step.reset);
      else if (step.op === 'focus') {
        selected = new Set(display().objects.filter((o) => o.kind === 'rack').slice(0, step.count).map((o) => o.id));
        focusSelection();
      }
    }
    const v = viewBox();
    return { name: c.name, viewport: { ...P.viewport }, viewBox: { x: v.x, y: v.y, w: v.w, h: v.h } };
  });
  // 도면 도형: 선택 2개(다중 선택 상자 포함)로 그린다.
  load();
  const racks = display().objects.filter((o) => o.kind === 'rack');
  selected = new Set(racks.slice(0, 2).map((o) => o.id));
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.innerHTML = scene(display());
  const shapes = [...host.querySelectorAll(':scope > g[data-id]')].map((g) => {
    const s = g.querySelector(':scope > rect, :scope > polygon');
    const a = (k) => s.getAttribute(k);
    return { id: g.dataset.id, transform: g.getAttribute('transform'), tag: s.tagName, x: a('x'), y: a('y'), width: a('width'), height: a('height'), points: a('points'), rx: a('rx'), strokeWidth: a('stroke-width'), dash: a('stroke-dasharray') };
  });
  const overlays = [...host.querySelectorAll('.m-overlay')].map((g) => g.outerHTML);
  return { camera, scene: { selected: [...selected], shapes, overlays } };
}, { text: projectText, cases: cameraCases });
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
fs.writeFileSync(new URL('../fixtures/legacy/plan-cases.json', import.meta.url), JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/plan-diff.mjs when cases change', ...out }, null, 1) + '\n');
console.log(`camera ${out.camera.length} cases, scene ${out.scene.shapes.length} shapes, ${out.scene.overlays.length} overlays`);
