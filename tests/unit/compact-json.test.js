// E2(D-087): 작은 JSON(들여쓰기 없음) 저장 — 기본값, 두 형식 내용 동일, 크기 감소.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizedProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { JSON_FORMATS, DEFAULT_JSON_FORMAT, jsonFormatOf, projectJsonText, projectFile, projectSizeNotice, readProjectFile } from '../../src/persistence/project-file.js';
import { parseJsonText } from '../../src/ui/storage-dialogs.js';

const io = { readText: (f) => f.text(), readBytes: async (f) => new Uint8Array(await f.arrayBuffer()), parse: parseJsonText };
const norm = (v) => JSON.parse(JSON.stringify(projectValidator(v)));

test('형식: 기본 작은 JSON, 알 수 없는 값은 작은 JSON', () => {
  assert.deepEqual(JSON_FORMATS, ['compact', 'pretty', 'legacy']);
  assert.equal(DEFAULT_JSON_FORMAT, 'compact');
  assert.equal(jsonFormatOf('pretty'), 'pretty');
  for (const v of [null, undefined, '', 'PRETTY', 2]) assert.equal(jsonFormatOf(v), 'compact');
  const p = { a: [1, { b: '가' }] };
  assert.equal(projectJsonText(p), '{"a":[1,{"b":"가"}]}');
  assert.equal(projectJsonText(p, 'pretty'), JSON.stringify(p, null, 2));
});

test('앱 저장본 형태(배치·배치 이력·검사 결과) 2MB: 작은 JSON이 40% 이상 작고, 두 형식 왕복 결과 동일(정규화 후 깊은 비교)', async () => {
  const { project, text } = sizedProject(2e6, { racks: 150 });
  const pretty = projectFile(project, 'legacy'), compact = projectFile(project, 'compact'); // 기준본 호환(들여쓰기·펼침) 대비
  assert.equal(pretty.text, text);
  const cut = 1 - compact.bytes / pretty.bytes;
  assert.ok(cut >= 0.4, `감소율 ${(cut * 100).toFixed(1)}%`); // D-094 차분 저장 후에는 더 줄어든다
  const a = norm(await readProjectFile(new Blob([pretty.text]), io)), b = norm(await readProjectFile(new Blob([compact.text]), io));
  assert.deepEqual(a, b);
  assert.deepEqual(b, norm(project));
});

test('크기 안내: 읽기 쉬운 JSON일 때만 작은 JSON 권유를 덧붙임', () => {
  assert.ok(!projectSizeNotice(13e6).includes('작은 JSON'));
  assert.ok(projectSizeNotice(13e6, 'pretty').endsWith('작은 JSON을 고르면 크기가 약 절반으로 줄어듭니다.'));
  assert.equal(projectSizeNotice(1e6, 'pretty'), null);
});
