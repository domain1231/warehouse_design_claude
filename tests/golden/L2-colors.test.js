// L2: 색 표시 모드(vizMode 4종·높이 집계 정책)·임계값/색 적용·사용자 지정 색·기본 색 복원·실행취소를
// 기준본 v2.4.1 결과(fixtures/legacy/color-cases.json, tools/color-diff.mjs)와 대조한다.
// 화면 조작 대신 같은 의미의 순수 함수를 차례로 적용한다. 기준본 commit·V.appearanceEdit처럼
// 변경마다 검증하고, 실패하면 이전 상태를 유지하며 '색상·표시 설정 취소: <사유>'를 기록한다. 성공한 변경만 실행취소 단계가 된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { colorFixture, colorCases, FIXTURE_RACKS } from './color-cases.js';
import { tableMeasure } from './label-measure.js';
import { validateProject } from '../../src/core/project.js';
import { buildScene } from '../../src/cad/scene.js';
import { viewBox } from '../../src/cad/camera.js';
import { setFallbackMeasure } from '../../src/cad/labels.js';
import { legend } from '../../src/warehouse/racklist.js';
import { heightUtilization, applyThresholdColors, setObjectColor, setColorMode, resetColors } from '../../src/warehouse/appearance.js';

setFallbackMeasure(tableMeasure);
const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/color-cases.json', import.meta.url), 'utf8')).cases;
const norm = (s) => s.replace(/<([a-zA-Z]+)((?:\s[^<>]*?)?)\s*\/>/g, '<$1$2></$1>');

function load() {
  const p = validateProject(JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));
  p.settings.scenario = 'after';
  const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
  const fx = colorFixture(FIXTURE_RACKS.map((i) => rk[i].id));
  for (const o of rk) if (fx.excel[o.id]) o.excel = fx.excel[o.id];
  p.inventoryHistory = fx.inventory;
  return validateProject(p);
}

function replay(steps) {
  let p = load();
  const undo = [], errors = [];
  const edit = (mutate) => {
    const d = structuredClone(p);
    try {
      mutate(d);
      validateProject(d);
      undo.push(p);
      p = d;
    } catch (e) {
      errors.push('색상·표시 설정 취소: ' + e.message);
    }
  };
  for (const s of steps) {
    const objects = p.scenarios.after.objects;
    if (s.viz) edit((d) => { d.settings.vizMode = s.viz; });
    else if (s.heightPolicy) edit((d) => { d.settings.heightPolicy = s.heightPolicy; });
    else if (s.colors) edit((d) => applyThresholdColors(d, s.colors));
    else if (s.colorMode) edit((d) => setColorMode(d, s.colorMode));
    else if (s.objectColor) {
      const pool = s.objectColor.rack !== undefined ? objects.filter((o) => o.kind === 'rack') : objects.filter((o) => o.kind !== 'rack');
      const o = pool[s.objectColor.rack ?? s.objectColor.object];
      edit((d) => setObjectColor(d, o.id, s.objectColor.color));
    } else if (s.reset) edit((d) => resetColors(d, s.reset));
    else if (s.undo) p = undo.pop();
  }
  return { p, undoDepth: undo.length, errors };
}

test('L2 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), colorCases.map((c) => c.name));
});

for (const c of expected) {
  test(`L2 ${c.name}`, () => {
    const steps = colorCases.find((x) => x.name === c.name).steps;
    const { p, undoDepth, errors } = replay(steps);
    const { vizMode, heightPolicy, low, high, colors } = p.settings;
    assert.deepEqual({ vizMode, heightPolicy, low, high, colors }, c.settings, '설정');
    assert.deepEqual(p.theme, c.theme, '테마');
    assert.equal(undoDepth, c.undoDepth, '실행취소 단계 수');
    assert.deepEqual(errors, c.errors, '거부 안내');
    const layout = p.scenarios.after;
    const racks = layout.objects.filter((o) => o.kind === 'rack');
    for (const policy of ['weightedMax', 'meanMax', 'max']) assert.deepEqual(racks.map((o) => heightUtilization(o, policy)), c.heights[policy], `높이 활용률 ${policy}`);
    const l = legend(p.settings);
    assert.deepEqual([l.title, ...l.items.map((i) => i.text), ...(l.note ? [l.note] : [])], c.legendText, '범례');
    p.viewport = structuredClone(c.viewport);
    const size = { w: 1400, h: 900 };
    const { svg } = buildScene(layout, p, { scope: 'after', selected: new Set(), pixelsPerMeter: size.w / viewBox(p.viewport, layout.warehouse, size).w, size });
    const fills = [...svg.matchAll(/<g\b[^>]*\bdata-id="([^"]+)"[^>]*>\s*(?:<title>[^<]*<\/title>\s*)?<(?:rect|polygon)\b[^>]*?\bfill="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(fills, c.fills, '도형 채움색');
    assert.deepEqual((svg.match(/<g class="v-labels"[\s\S]*?<\/g>/g) || []).map(norm), c.labels.map(norm), '라벨(글자색 포함)');
  });
}
