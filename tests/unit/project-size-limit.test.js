// E1(D-086): 프로젝트 크기 상한 단일화 — 앱이 내려받은 JSON·압축 백업 JSON·ZIP이 상한까지 다시 열리는지(왕복).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizedProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { PROJECT_MAX_BYTES, PROJECT_WARN_BYTES, projectSizeNotice, projectFile, readProjectFile } from '../../src/persistence/project-file.js';
import { MAX_CONTENT_BYTES, packProject, unpackStored } from '../../src/persistence/zip.js';
import { parseJsonText } from '../../src/ui/storage-dialogs.js';

const io = { readText: (f) => f.text(), readBytes: async (f) => new Uint8Array(await f.arrayBuffer()), parse: parseJsonText };
const zipOf = (packed) => Buffer.from(JSON.parse(packed).data, 'base64');
const roundTrip = async (blob) => projectValidator(await readProjectFile(blob, io));

test('상한 상수 하나: 압축 백업 상한 = 프로젝트 상한 24MB, 경고는 50%', () => {
  assert.equal(PROJECT_MAX_BYTES, 24e6);
  assert.equal(MAX_CONTENT_BYTES, PROJECT_MAX_BYTES);
  assert.equal(PROJECT_WARN_BYTES, 12e6);
});

test('저장 크기 안내: 12MB 이하 없음 · 12MB 초과 경고 · 24MB 초과 다시 열 수 없음 + 이력 정리 안내', () => {
  assert.equal(projectSizeNotice(12e6), null);
  assert.match(projectSizeNotice(12e6 + 1), /^JSON 파일 12\.0MB\(탐색기 11,719KB\) · 불러오기 상한 24MB의 50%를 넘었습니다\. 이력\(/);
  assert.equal(projectSizeNotice(24e6).includes('50%'), true);
  assert.match(projectSizeNotice(24e6 + 1), /불러오기 상한 24MB\(탐색기 23,438KB\)를 넘어 앱에서 다시 열 수 없습니다\. 이력\(배치·Excel 스냅샷, 자동 배치 이력\)을 정리한 뒤 저장하세요\.$/);
});

for (const target of [11.9e6, 12.1e6, 23.9e6]) {
  test(`왕복 ${target / 1e6}MB: 앱 JSON · 압축 백업 JSON · ZIP 모두 다시 열림(내용 동일)`, async () => {
    const { project, text } = sizedProject(target);
    const file = projectFile(project, 'legacy');
    assert.equal(file.text, text);
    assert.equal(file.bytes, target);
    assert.equal(!!file.notice, target > 12e6);
    const expected = JSON.parse(text);
    assert.deepEqual(JSON.parse(JSON.stringify(await roundTrip(new Blob([text])))), expected, 'JSON');
    const packed = await packProject(JSON.stringify(project));
    assert.deepEqual(JSON.parse(JSON.stringify(await roundTrip(new Blob([packed])))), expected, '압축 백업 JSON');
    assert.deepEqual(JSON.parse(JSON.stringify(await roundTrip(new Blob([zipOf(packed)])))), expected, 'ZIP');
    assert.equal(await unpackStored(packed), JSON.stringify(project)); // localStorage 저장 경로도 같은 상한
  });
}

test('상한 초과 파일은 읽기 전에 거부, ZIP 안 project.json이 상한을 넘어도 거부', async () => {
  await assert.rejects(readProjectFile(new Blob([Buffer.alloc(24e6 + 1, 32)]), io), { message: /^프로젝트 JSON 24\.0MB\(탐색기 23,438KB\) · 상한 24MB\(탐색기 23,438KB\) 초과 — 앱에서 작은 JSON으로/ });
  await assert.rejects(packProject(' '.repeat(24e6 + 1)), /저장 크기 상한 24MB를 넘습니다\. 이력\(/);
  // 압축률이 높아 파일은 작지만 풀면 24MB를 넘는 zip
  const big = '"' + ' '.repeat(24e6) + '"';
  const { deflateRawSync } = await import('node:zlib');
  const { crc32 } = await import('../../src/persistence/zip.js');
  const content = Buffer.from(big), data = deflateRawSync(content), name = Buffer.from('project.json');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc32(content), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(content), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28);
  const off = 30 + name.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(off, 16);
  const zip = Buffer.concat([local, name, data, central, name, end]);
  assert.ok(zip.length < 1e6);
  await assert.rejects(readProjectFile(new Blob([zip]), io), /크기 상한 초과/);
});

test('기존 들여쓰기 JSON·압축하지 않은 JSON은 그대로 읽힘(v2.4.1 회귀)', async () => {
  const { project, text } = sizedProject(1e6, { racks: 40 });
  const compact = JSON.stringify(project);
  assert.deepEqual(await readProjectFile(new Blob(['﻿' + text]), io), JSON.parse(text));
  assert.deepEqual(await readProjectFile(new Blob([compact]), io), JSON.parse(compact));
  await assert.rejects(readProjectFile(new Blob(['{not json']), io), /JSON 형식이 아닙니다/);
});
