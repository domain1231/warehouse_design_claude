// P1: 도면 보기(카메라 계산과 객체 도형)를 기준본 v2.4.1 결과(fixtures/legacy/plan-cases.json, tools/plan-diff.mjs)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cameraCases } from './plan-cases.js';
import { validateProject } from '../../src/core/project.js';
import { viewBox, zoomBy, centerView, focusBox, withFitScale } from '../../src/cad/camera.js';
import { buildScene, selectionBox } from '../../src/cad/scene.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/plan-cases.json', import.meta.url), 'utf8'));
const loadProject = () => validateProject(JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));

test('P1 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.camera.map((r) => r.name), cameraCases.map((c) => c.name));
});

for (const c of cameraCases) {
  test(`P1 카메라 ${c.name}`, () => {
    const p = loadProject();
    const l = p.scenarios[p.settings.scenario];
    const W = l.warehouse;
    let v = withFitScale({ ...c.viewport }, W, c.size);
    for (const step of c.steps) {
      if (step.op === 'zoom') v = zoomBy(v, step.f, step.anchor ?? null, W, c.size);
      else if (step.op === 'center') v = centerView(v, step.reset, W, c.size);
      else if (step.op === 'focus') v = focusBox(v, selectionBox(l.objects.filter((o) => o.kind === 'rack').slice(0, step.count)), W, c.size);
    }
    const exp = expected.camera.find((r) => r.name === c.name);
    assert.deepEqual(v, exp.viewport);
    assert.deepEqual(viewBox(v, W, c.size), exp.viewBox);
  });
}

/** 재구축본 SVG 문자열에서 객체별 도형 속성을 뽑는다(기준본 자료와 같은 형식). */
function shapesOf(svg) {
  const out = [];
  const re = /<g data-id="([^"]*)" opacity="[^"]*" transform="([^"]*)"[^>]*><title>[^<]*<\/title><(rect|polygon) ([^>]*?)\/>/g;
  for (const m of svg.matchAll(re)) {
    const attrs = Object.fromEntries([...m[4].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const a = (k) => attrs[k] ?? null;
    out.push({ id: m[1], transform: m[2], tag: m[3], x: a('x'), y: a('y'), width: a('width'), height: a('height'), points: a('points'), rx: a('rx'), strokeWidth: a('stroke-width'), dash: a('stroke-dasharray') });
  }
  return out;
}
/** 겹침 표시 조각: 기준본은 DOM 직렬화(빈 요소를 열고 닫는 태그로)라 같은 형식으로 맞춘다. */
function overlaysOf(svg) {
  const parts = svg.match(/<g class="m-overlay".*?<\/g>|<rect id="mSelectionBox"[^>]*\/>/g) ?? [];
  return parts.map((s) => s.replace(/<(rect|path|polygon)([^>]*?)\/>/g, '<$1$2></$1>'));
}

test('P1 도면: 객체 순서·회전·도형 좌표·선 굵기가 기준본과 같다', () => {
  const p = loadProject();
  const l = p.scenarios[p.settings.scenario];
  const { svg } = buildScene(l, p, { selected: new Set(expected.scene.selected) });
  assert.deepEqual(shapesOf(svg), expected.scene.shapes);
});

test('P1 도면: 통로 유효 폭 선·다중 선택 상자가 기준본과 같다', () => {
  const p = loadProject();
  const l = p.scenarios[p.settings.scenario];
  const { svg } = buildScene(l, p, { selected: new Set(expected.scene.selected) });
  assert.deepEqual(overlaysOf(svg), expected.scene.overlays);
});
