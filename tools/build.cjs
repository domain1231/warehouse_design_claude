// 단일 오프라인 HTML 빌드.
// src/main.js(ES 모듈)를 esbuild로 하나의 IIFE로 묶고, CSS와 함께 src/index.html에 인라인한다.
// 버전은 package.json이 단일 출처다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVersion = pkg.version;
const schemaVersion = pkg.warehouse.projectSchemaVersion;

const result = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  write: false,
  legalComments: 'none',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __SCHEMA_VERSION__: JSON.stringify(schemaVersion),
  },
});
const script = result.outputFiles[0].text;
const css = fs.readFileSync(path.join(root, 'styles/app.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

for (const marker of ['<!-- APP_STYLE -->', '<!-- APP_SCRIPT -->']) {
  if (template.split(marker).length !== 2) throw new Error(`템플릿 표식이 정확히 하나여야 합니다: ${marker}`);
}
// </script 문자열이 스크립트 블록을 조기에 닫지 않도록 이스케이프한다.
const safeScript = script.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('<!-- APP_STYLE -->', () => `<style>\n${css}</style>`)
  .replace('<!-- APP_SCRIPT -->', () => `<script>\n${safeScript}</script>`);

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const fileName = `warehouse_layout_designer_v${appVersion.replace(/[^0-9A-Za-z.-]/g, '_').replace(/\./g, '_')}.html`;
const outPath = path.join(distDir, fileName);
fs.writeFileSync(outPath, html);

const bytes = Buffer.byteLength(html);
const sha256 = crypto.createHash('sha256').update(html).digest('hex');
const metadata = { appVersion, schemaVersion, file: fileName, bytes, sha256 };
fs.writeFileSync(path.join(distDir, 'build-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('빌드 완료', metadata);
