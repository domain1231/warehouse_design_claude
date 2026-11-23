// JSON 불러오기 파일 읽기: 브라우저가 읽기를 중단하면 FileReader로 한 번 더 시도하고, 실패 단계·종류를 알린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileText, importErrorText } from '../../src/ui/storage-dialogs.js';

const err = (name, message = 'The operation was aborted.') => Object.assign(new Error(message), { name });

test('f.text()가 AbortError면 FileReader로 다시 읽는다', async () => {
  const prev = globalThis.FileReader;
  globalThis.FileReader = class { readAsText() { this.result = '{"ok":1}'; queueMicrotask(() => this.onload()); } };
  try {
    assert.equal(await readFileText({ text: () => Promise.reject(err('AbortError')) }), '{"ok":1}');
  } finally { globalThis.FileReader = prev; }
});

test('다시 읽기도 실패하면 오류를 넘긴다, 그 밖의 오류는 그대로', async () => {
  const prev = globalThis.FileReader;
  globalThis.FileReader = class { readAsText() { this.error = err('NotReadableError', 'cannot read'); queueMicrotask(() => this.onerror()); } };
  try {
    await assert.rejects(readFileText({ text: () => Promise.reject(err('AbortError')) }), /cannot read/);
    await assert.rejects(readFileText({ text: () => Promise.reject(new TypeError('boom')) }), /boom/);
  } finally { globalThis.FileReader = prev; }
});

test('실패 문구에 단계·오류 종류, 읽기 중단이면 해결 안내', () => {
  const t = importErrorText('읽기', err('AbortError'));
  assert.match(t, /^파일 처리 실패: The operation was aborted\. \(읽기 단계 · AbortError\)/);
  assert.match(t, /로컬 폴더로 복사/);
  assert.equal(importErrorText('검증', new Error('스키마 오류')), '파일 처리 실패: 스키마 오류', '일반 오류는 기준본 문구 그대로');
});
