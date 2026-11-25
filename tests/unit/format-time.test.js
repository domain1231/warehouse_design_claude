// D-077: 시각 표시는 한국 시각(저장 값 ISO·UTC는 그대로). 실행 PC의 시간대와 무관해야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, timeHtml } from '../../src/core/format.js';

test('D-077: ISO(UTC) 시각을 한국 시각으로 표시한다', () => {
  const t = formatTime('2026-11-25T01:15:17.307Z');
  assert.match(t, /2026\. 11\. 25\./);
  assert.match(t, /10:15:17/);
  assert.equal(formatTime('2026-12-31T15:30:00.000Z').startsWith('2027. 1. 1.'), true);
});
test('D-077: 값이 없으면 대체 문구, 해석 불가 값은 원문 그대로', () => {
  assert.equal(formatTime(undefined), '미확인');
  assert.equal(formatTime('', '시각 미기록'), '시각 미기록');
  assert.equal(formatTime('기록 없음(이전 형식)'), '기록 없음(이전 형식)');
});
test('D-077: timeHtml은 원래 ISO를 title로 남기고 이스케이프한다', () => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const h = timeHtml('2026-11-25T01:15:17.307Z', '미기록', esc);
  assert.match(h, /^<span title="2026-11-25T01:15:17\.307Z">2026\. 11\. 25\. .*10:15:17<\/span>$/);
  assert.equal(timeHtml(null, '원래 저장 시각 미기록', esc), '원래 저장 시각 미기록');
  assert.equal(timeHtml('<x>', '미기록', esc), '<span title="&lt;x>">&lt;x></span>');
});
