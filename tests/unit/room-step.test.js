// D-052: 창고 가로·세로 1mm 단위.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomApplyReason } from '../../src/warehouse/room.js';

test('1mm 단위 허용, 1mm 미만 거부, 범위는 그대로', () => {
  assert.equal(roomApplyReason({ width: '18.44', height: '8.5' }), '');
  assert.equal(roomApplyReason({ width: '18.441', height: '8.505' }), '');
  assert.equal(roomApplyReason({ width: '18.4405', height: '8.5' }), '가로와 세로는 0.001m 단위로 입력하세요.');
  assert.equal(roomApplyReason({ width: '0.9', height: '8.5' }), '가로와 세로에 1~500m의 숫자를 입력하세요.');
  assert.equal(roomApplyReason({ width: '500.001', height: '8.5' }), '가로와 세로에 1~500m의 숫자를 입력하세요.');
});
