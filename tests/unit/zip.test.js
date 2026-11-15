import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { packProject, unpackStored, crc32, PACK_FORMAT } from '../../src/persistence/zip.js';

const root = path.resolve(import.meta.dirname, '../..');
const legacyRaw = fs.readFileSync(path.join(root, 'fixtures/legacy/v2.4.1-primary.txt'), 'utf8');
const legacyText = fs.readFileSync(path.join(root, 'fixtures/legacy/v2.4.1-primary.project.json'), 'utf8');

test('crc32 표준값', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('기준본 v2.4.1이 저장한 압축 원문을 읽는다', async () => {
  const text = await unpackStored(legacyRaw);
  assert.equal(text, legacyText);
  assert.equal(JSON.parse(text).version, '2.3.6');
});

test('압축하지 않은 프로젝트 JSON 원문은 그대로 반환한다', async () => {
  assert.equal(await unpackStored(legacyText), legacyText);
});

test('쓰기→읽기 왕복이 바이트 동일하고 출력이 결정적이다', async () => {
  const a = await packProject(legacyText);
  const b = await packProject(legacyText);
  assert.equal(a, b);
  assert.equal(JSON.parse(a).format, PACK_FORMAT);
  assert.equal(await unpackStored(a), legacyText);
});

test('한글·이모지 포함 UTF-8 왕복', async () => {
  const text = JSON.stringify({ name: '7층 C열 자재창고 📦', note: 'ZONE A·N02' });
  assert.equal(await unpackStored(await packProject(text)), text);
});

test('손상된 데이터는 거부한다', async () => {
  const packed = JSON.parse(await packProject(legacyText));
  const bytes = Uint8Array.from(atob(packed.data), (c) => c.charCodeAt(0));
  // 압축 데이터 한가운데 1바이트 변조 → 압축 해제 실패 또는 CRC 불일치
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const corrupted = JSON.stringify({ format: PACK_FORMAT, data: btoa(binary) });
  await assert.rejects(() => unpackStored(corrupted));
  await assert.rejects(() => unpackStored(JSON.stringify({ format: PACK_FORMAT, data: 'AAAA' })), /zip 끝 레코드/);
  await assert.rejects(() => unpackStored(JSON.stringify({ format: PACK_FORMAT, data: 7 })), /크기 오류/);
});
