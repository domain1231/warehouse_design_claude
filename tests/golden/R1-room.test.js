// R1: 창고 치수 적용(사유·적용·차단·실행취소)·면적 역산·참고 도면 표시를 기준본 v2.4.1 결과
// (fixtures/legacy/room-cases.json, tools/room-diff.mjs)와 대조한다. 명령 기록 ID는 비교에서 뺀다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roomCases } from './room-cases.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { buildScene } from '../../src/cad/scene.js';
import { roomApplyReason, applyRoom, deriveRoom } from '../../src/warehouse/room.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/room-cases.json', import.meta.url), 'utf8')).cases;
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const noId = (rows) => rows.map(({ id, ...r }) => r);

test('R1 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), roomCases.map((c) => c.name));
});
for (const c of roomCases) {
  test(`R1 ${c.name}`, () => {
    let p = validateProject(JSON.parse(projectText));
    p.settings.scenario = c.scenario || 'after';
    p.settings.policy = c.policy || 'warn';
    p.editing.allowWarnings = p.settings.policy === 'warn';
    if (c.locked) p.scenarioMeta.before.locked = true;
    if (c.background) p.settings.background = c.background;
    p = validateProject(p);
    const exp = expected.find((x) => x.name === c.name);
    // D-052 의도적 차이: 기준본은 0.1m 단위만 받지만 재구축은 1mm(0.001m) 단위를 받는다. 기준본은 이 값을 거부했다.
    if (c.name === '0.1m 단위 아님(12.34)') {
      assert.equal(exp.reason, '가로와 세로는 0.1m 단위로 입력하세요.', '기준본 기록');
      assert.equal(roomApplyReason(c.room), '', '재구축은 12.34 허용');
      assert.equal(roomApplyReason({ width: '12.3456', height: '8' }), '가로와 세로는 0.001m 단위로 입력하세요.');
      return;
    }
    if (c.room) {
      const reason = roomApplyReason(c.room, { locked: c.scenario === 'before' && !!c.locked, history: false, busy: false });
      assert.equal(reason, exp.reason, '적용 불가 사유');
      assert.equal(!!reason, exp.disabled);
      let undo = 0;
      if (!reason) {
        const r = applyRoom(p, c.room, { nextId: createIdGenerator({ seed: 'room' }), now: () => '2026-11-15T00:00:00.000Z' });
        if (r.ok) undo = 1;
        else assert.equal('전체 취소: ' + r.reason, exp.toast, '차단 안내');
        p = r.project;
        assert.deepEqual(noId(p.commandHistory.slice(-1).map(({ time, ...x }) => x)), noId(exp.commands), '명령 기록');
      }
      assert.deepEqual(p.scenarios[p.settings.scenario].warehouse, exp.warehouse, '창고');
      assert.equal(undo, exp.undo);
    }
    if (c.derive) {
      const d = deriveRoom(c.derive.area, c.derive.known, { width: '24', height: '14' }); // 오류 시 현재 입력값(창고 24×14)이 그대로 남는다
      assert.deepEqual([d.inputs, d.message], [exp.inputs, exp.toast]);
    }
    if (c.background) {
      const { svg } = buildScene(p.scenarios.after, p, { scope: 'after', selected: new Set(), pixelsPerMeter: 40 });
      const m = svg.match(/<image\b[^>]*?\/?>(\s*<\/image>)?/);
      assert.equal(m ? m[0].replace(/\s*<\/image>$/, '').replace(/\s*\/?>$/, '') + '></image>' : null, exp.image); // 빈 요소 표기(<x/> ↔ <x></x>)만 맞춘다
    }
  });
}
