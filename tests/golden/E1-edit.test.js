// E1: 편집 명령(추가·삭제·복제·회전·미세 이동·속성·설계 치수·드래그 이동·잠금)을
// 기준본 v2.4.1 결과(fixtures/legacy/edit-cases.json, tools/edit-diff.mjs)와 대조한다.
// 화면 쪽 규칙(정밀 입력 칸 검사, 명령 기록 이름, 선택 갱신)은 main.js와 같은 순서로 재현한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { editCases } from './edit-cases.js';
import { normalizeEditResult } from './edit-normalize.js';
import { diff, formatDiff } from './compare.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import {
  applyCommand, applyMove, addObjectAt, deleteObjects, duplicateObjects, rotateObjects, nudgeObjects,
  fieldValue, setField, setDimension, DIMENSION_COMMAND, COMMAND_DEFAULT, MM_INPUT_FIELDS, isMmInput,
  dragDelta, alignmentGuides, active, resized, applyResize, RESIZE_COMMAND, HANDLE_DIRECTIONS,
  readGroupConfig, calculateGroup, applyGroupPreview, groupCommandName, newSpatialWarnings,
} from '../../src/warehouse/commands.js';

// 기준본 대화상자 칸 ID → 재구축 설정 이름
const GROUP_FIELDS = { mAlignRef: 'reference', mReferenceLine: 'line', mSpaceMode: 'spacing', mGap: 'gap', mAnchor: 'anchor', mOrder: 'order', mCustomOrder: 'custom', mMoveX: 'dx', mMoveY: 'dy', mRotateAngle: 'angle', mReverse: 'reverse' };
import { formatNumber as fmt } from '../../src/core/format.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/edit-cases.json', import.meta.url), 'utf8')).results;
const text = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

function runCase(c) {
  const nextId = createIdGenerator({ seed: 'e1' });
  const now = () => '2026-11-15T00:00:00.000Z';
  let p = validateProject(JSON.parse(text));
  if (c.setup?.scenario) p.settings.scenario = c.setup.scenario;
  if (c.setup?.allowWarnings !== undefined) p.editing.allowWarnings = c.setup.allowWarnings;
  if (c.setup?.snap !== undefined) p.settings.snap = c.setup.snap;
  p.settings.policy = p.editing.allowWarnings ? 'warn' : 'block';
  const racks = active(p).objects.filter((o) => o.kind === 'rack');
  if (c.setup?.lockFirst) racks[c.select[0]].placementMeta.positionLocked = true;
  if (c.setup?.aspect) racks[c.select[0]].resizeConstraints.aspectLocked = true;
  let selected = new Set(c.select.map((i) => racks[i].id));
  p.editing.selectedRackIds = [...selected];
  p.editing.selectionScenario = p.settings.scenario;
  const initial = structuredClone(p);
  const cmd = (mutate, name = COMMAND_DEFAULT) => {
    const r = applyCommand(p, mutate, { command: name, selection: [...selected], nextId, now });
    p = r.project;
    return r;
  };
  for (const s of c.steps) {
    const step = typeof s === 'string' ? { op: s } : s;
    if (step.op === 'add') {
      const add = addObjectAt(p, step.kind, step.point, { nextId });
      if (add && cmd(add.mutate).ok) selected = new Set([add.id]);
    } else if (step.op === 'delete') cmd(deleteObjects([...selected]));
    else if (step.op === 'duplicate') {
      const d = duplicateObjects(active(p).objects.filter((o) => selected.has(o.id)), { nextId });
      if (cmd(d.mutate).ok) selected = new Set(d.ids);
    } else if (step.op === 'rotate') cmd(rotateObjects([...selected]));
    else if (step.op === 'nudge') {
      const n = nudgeObjects(p, [...selected], step.dx, step.dy, step.fast);
      cmd(n.mutate, `키보드 미세 이동 ${fmt(n.step, 3)}m`);
    } else if (step.op === 'field' || step.op === 'dimension') {
      const id = active(p).objects.find((o) => selected.has(o.id)).id;
      if (selected.size === 1 && MM_INPUT_FIELDS.has(step.field) && !isMmInput(step.raw)) continue;
      if (step.op === 'dimension') cmd(setDimension(id, step.field, step.raw), DIMENSION_COMMAND);
      else cmd(setField(id, step.field, fieldValue(step.field, step.raw, step.number)));
    } else if (step.op === 'move') {
      const l = active(p);
      const originals = l.objects.filter((o) => selected.has(o.id));
      let { dx, dy } = dragDelta(p, originals[0], { x: 0, y: 0 }, { x: originals[0].x + step.dx - originals[0].x, y: originals[0].y + step.dy - originals[0].y });
      ({ dx, dy } = alignmentGuides(p, l, originals, dx, dy, 40));
      if (Math.abs(dx) + Math.abs(dy) < 1e-8) continue;
      p = applyMove(p, originals.map((o) => o.id), dx, dy, { cancel: !!step.cancel, nextId, now }).project;
    } else if (step.op === 'resize') {
      const o = active(p).objects.find((x) => selected.has(x.id));
      const [sx, sy] = HANDLE_DIRECTIONS[step.handle];
      const ch = resized(p, o, sx, sy, step.dx, step.dy);
      cmd(applyResize(o.id, { width: ch.width, depth: ch.depth, height: o.height ?? null, x: ch.x, y: ch.y }), RESIZE_COMMAND);
    } else if (step.op === 'group') {
      // 화면 대화상자와 같은 기본값(기준본 M.open)
      const g = p.editing.groupEditing ?? {};
      const raw = { action: step.action, reference: 'group', line: '0', spacing: 'fixed', gap: String(g.gap ?? 0.3), anchor: g.anchor || 'first', order: step.action.endsWith('Y') ? 'y' : g.order || 'x', custom: '', dx: '0', dy: '0', angle: '90', reverse: false };
      const ids = [...selected].filter((id) => active(p).objects.some((o) => o.kind === 'rack' && o.id === id));
      for (const [id, v] of Object.entries(step.fields ?? {})) raw[GROUP_FIELDS[id]] = v === '#CODES' ? active(p).objects.filter((o) => selected.has(o.id)).map((o) => o.code).reverse().join(',') : v;
      const allow = step.allow ?? p.editing.allowWarnings;
      let preview;
      try {
        preview = calculateGroup(active(p), ids, readGroupConfig(raw), { fmt });
      } catch {
        continue; // 미리보기 오류: 적용 단추 비활성
      }
      if (newSpatialWarnings(p, preview.before, preview.layout, preview.targetIds).length && !allow) continue;
      const r = applyCommand(p, applyGroupPreview(preview), { command: groupCommandName(preview.config.action), selection: [...selected], nextId, now, overrideAllow: allow });
      p = r.project;
    }
    // 화면은 지워진 객체를 선택에서 뺀다
    const ids = new Set(active(p).objects.map((o) => o.id));
    selected = new Set([...selected].filter((id) => ids.has(id)));
  }
  return normalizeEditResult(c.name, initial, p, selected);
}

test('E1 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.map((r) => r.name), editCases.map((c) => c.name));
});

for (const c of editCases) {
  test(`E1 ${c.name}`, () => {
    const rows = diff(expected.find((r) => r.name === c.name), runCase(c), 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
