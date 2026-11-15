// 앱 진입점. 현재는 재구축 골격 단계이며 편집 기능은 Phase 1 이후 추가한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
// 앱 배포 버전과 프로젝트 데이터 스키마 버전은 항상 분리해서 표시한다.

export const APP_VERSION = __APP_VERSION__;
export const SCHEMA_VERSION = __SCHEMA_VERSION__;

function renderShell(root) {
  const shell = document.createElement('section');
  shell.className = 'shell';

  const title = document.createElement('h1');
  title.textContent = 'Warehouse Layout Designer';

  const versions = document.createElement('p');
  versions.className = 'versions';
  versions.dataset.testid = 'versions';
  versions.textContent = `앱 v${APP_VERSION} · 프로젝트 스키마 ${SCHEMA_VERSION}`;

  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = '재구축 골격 단계입니다. 편집 기능은 아직 포함되지 않았습니다.';

  shell.append(title, versions, status);
  root.replaceChildren(shell);
}

renderShell(document.getElementById('app'));
