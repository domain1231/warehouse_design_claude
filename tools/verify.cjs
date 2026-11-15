// 빌드 결과 정적 검증: 단일 파일, 외부 자원 참조 없음, 스크립트 문법, 메타데이터 해시 일치.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const metaPath = path.join(root, 'dist/build-metadata.json');
if (!fs.existsSync(metaPath)) throw new Error('dist/build-metadata.json이 없습니다. 먼저 pnpm build를 실행하세요.');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const html = fs.readFileSync(path.join(root, 'dist', meta.file), 'utf8');
const failures = [];

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
if (sha256 !== meta.sha256) failures.push('build-metadata.json의 해시가 실제 파일과 다릅니다.');

// 외부 스크립트·스타일·이미지 참조 금지 (오프라인 단일 파일)
const externalRef = /<(script|link|img|iframe|source)\b[^>]*\b(src|href)\s*=\s*["']?(?!data:|blob:|#)/i;
if (externalRef.test(html)) failures.push('외부 파일 참조(src/href)가 있습니다.');
if (/\bimport\s*\(|\bimportScripts\s*\(/.test(html)) failures.push('동적 import 또는 importScripts가 있습니다.');
for (const match of html.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
  failures.push(`네트워크 URL이 포함되어 있습니다: ${match[0]}`);
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) failures.push(`인라인 스크립트는 1개여야 합니다 (현재 ${scripts.length}개).`);
for (const code of scripts) {
  try {
    new Function(code);
  } catch (error) {
    failures.push(`스크립트 문법 오류: ${error.message}`);
  }
}

if (!html.includes(`앱 v`) && !html.includes(meta.appVersion)) failures.push('앱 버전 표시가 없습니다.');

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join('\n'));
  process.exit(1);
}
console.log(`PASS ${meta.file} · ${meta.bytes} bytes · sha256 ${meta.sha256}`);
