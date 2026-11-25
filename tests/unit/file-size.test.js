// E3(D-088): 파일 크기 초과 문구 형식 고정 — 종류 · 실제 크기 · 상한(MB 십진 + 탐색기 KB) · 해결 방법 한 줄.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explorerKb, sizeText, tooLargeText, SIZE_HINTS } from '../../src/core/file-size.js';
import { readProjectFile, projectKind } from '../../src/persistence/project-file.js';
import { readBackgroundFile } from '../../src/ui/room-panel.js';
import { readWorkbook } from '../../src/excel/xlsx.js';

test('크기 표기: MB는 십진(소수 한 자리, 정수면 그대로), KB는 탐색기와 같이 1024 나눔 올림 + 천 단위 쉼표', () => {
  assert.equal(explorerKb(13370938), '13,058KB'); // 사용자 11/25 파일
  assert.equal(explorerKb(1), '1KB');
  assert.equal(explorerKb(1024), '1KB');
  assert.equal(explorerKb(1025), '2KB');
  assert.equal(sizeText(13370938), '13.4MB(탐색기 13,058KB)');
  assert.equal(sizeText(24e6), '24MB(탐색기 23,438KB)');
  assert.equal(sizeText(4e6), '4MB(탐색기 3,907KB)');
  assert.equal(sizeText(12e6), '12MB(탐색기 11,719KB)');
});

test('문구 형식: <종류> <크기> · 상한 <크기> 초과 — <해결 방법>', () => {
  assert.equal(tooLargeText('재고 CSV', 12.5e6, 12e6, SIZE_HINTS.inventory), '재고 CSV 12.5MB(탐색기 12,208KB) · 상한 12MB(탐색기 11,719KB) 초과 — 기간을 나눠 여러 파일로 불러오세요.');
  for (const h of Object.values(SIZE_HINTS)) assert.ok(h.endsWith('.') && !h.includes('\n'));
});

const blob = (n, name, type) => Object.assign(new Blob([new Uint8Array(n)], { type }), { name });
const io = { readText: (f) => f.text(), readBytes: async (f) => new Uint8Array(await f.arrayBuffer()), parse: JSON.parse };

test('입력별 문구: 프로젝트 JSON·ZIP · 참고 도면 이미지 · Excel·CSV', async () => {
  await assert.rejects(readProjectFile(blob(25e6, 'a.json'), io), { message: `프로젝트 JSON 25MB(탐색기 24,415KB) · 상한 24MB(탐색기 23,438KB) 초과 — ${SIZE_HINTS.project}` });
  await assert.rejects(readProjectFile(blob(25e6, 'a.ZIP'), io), { message: /^프로젝트 ZIP 25MB/ });
  assert.equal(projectKind({}), '프로젝트 JSON');
  await assert.rejects(readBackgroundFile(blob(5e6, 'p.png', 'image/png')), { message: `참고 도면 이미지 5MB(탐색기 4,883KB) · 상한 4MB(탐색기 3,907KB) 초과 — ${SIZE_HINTS.image}` });
  await assert.rejects(readBackgroundFile(blob(13e6, 'p.pdf', 'application/pdf')), { message: /^참고 도면 이미지 13MB\(탐색기 12,696KB\) · 상한 4MB/ });
  await assert.rejects(readBackgroundFile(blob(3e6, 'p.pdf', 'application/pdf')), { message: 'PNG/JPEG/WebP 이미지만 지원합니다.' });
  await assert.rejects(readWorkbook('a.xlsx', new Uint8Array(12e6 + 1)), { message: `Excel 파일 12.0MB(탐색기 11,719KB) · 상한 12MB(탐색기 11,719KB) 초과 — ${SIZE_HINTS.workbook}` });
  await assert.rejects(readWorkbook('a.csv', new Uint8Array(13e6)), { message: /^CSV 파일 13MB\(탐색기 12,696KB\) · 상한 12MB/ });
});
