# Warehouse Layout Designer — Greenfield 재구축

Warehouse Layout Designer v2.4.1을 기능 기준본으로 삼아, 독립적으로 유지보수 가능한 새 아키텍처로 다시 구축하는 저장소입니다.

- 기준본 저장소: `domain1231/warehouse_design` (v2.4.1, 커밋 `d7b1e696`, 프로젝트 스키마 2.3.6)
- 기준본은 이 저장소에서 수정하지 않습니다. v2.4.x 유지보수는 기준본 저장소에서 진행합니다.
- 최종 산출물: 서버·인터넷 없이 실행되는 단일 오프라인 HTML

개발 규칙은 `AGENTS.md`, 진행 상황은 `docs/AI_HANDOFF.md`를 참고하세요.

## 명령

- `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm check`(단위 → Golden → 빌드 → 오프라인 검증 → E2E)
- `pnpm golden:refresh`: 기준본 대조 자료를 모두 재생성(`tools/*-diff.mjs` 12종)하고 Golden Master를 재검증한 뒤 `git diff --stat fixtures/`를 보여줍니다. `BASELINE_REPO=<기준본 경로>`와 `WAREHOUSE_BROWSER_PATH`가 필요합니다. 기본은 확인 모드로, 대조 검사가 통과하면 다시 만든 자료를 되돌립니다(기준본이 매번 새 UUID·시각을 내기 때문). 기준본이 바뀌어 자료를 새로 기록할 때만 `pnpm golden:write`를 씁니다. 재구축 JSON이 v2.4.1에서 열리는지(`tools/legacy-json-compat.mjs`)도 함께 확인합니다.

## 문서

- 기존 v2.4.1 사용자 이전 안내: `docs/MIGRATION.md`
