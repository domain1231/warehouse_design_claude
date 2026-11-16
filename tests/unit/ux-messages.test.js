// D-040: 입력·파일 오류 문구.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonText } from '../../src/ui/storage-dialogs.js';
import { mmInputMessage } from '../../src/warehouse/commands.js';

test('JSON 형식 오류는 위치만 알리고 내용을 노출하지 않는다', () => {
  assert.throws(() => parseJsonText('{"secretMarker":1,,}'), (e) => /JSON 형식이 아닙니다 \(\d+번째 글자 근처\)/.test(e.message) && !e.message.includes('secretMarker'));
  assert.throws(() => parseJsonText('   '), /빈 파일/);
  assert.deepEqual(parseJsonText('﻿{"a":1}'), { a: 1 });
});

test('정밀 입력 오류 문구에 칸 이름을 붙인다', () => {
  assert.equal(mmInputMessage('x', ''), 'X 값을 입력하세요 · 0.001m 단위. 기존 위치·규격을 유지합니다.');
  assert.equal(mmInputMessage('width', '1.0005'), '폭 값을 입력하세요 · 0.001m 단위. 기존 위치·규격을 유지합니다.');
});
