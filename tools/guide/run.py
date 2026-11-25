#!/usr/bin/env python3
"""사용자 설명서(Warehouse Studio 사용자 설명서) 촬영·빌드 파이프라인.

사용 예:
  pnpm build
  python3 tools/guide/run.py --work /tmp/guide-work --app dist/warehouse_layout_designer_v2_5_0-alpha_13.html

src/ 의 경로 토큰(@@W@@ = 작업 폴더, @@CHROME@@ = Chrome 실행 파일, @@REPO@@ = 이 저장소)을 실제 값으로 바꿔
<work>/scripts 에 복사한 뒤 순서대로 실행한다. 결과물은 <work>/out 에 남는다.
"""
import argparse, os, shutil, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent

# 촬영 순서: 뒤 단계가 앞 단계의 상태 파일(work/*.json, work/cp/*)을 읽으므로 순서를 바꾸지 않는다.
CAPTURE = ['c1_probe', 'shoot_all', 'shoot_apply', 'c1_final', 'c1_map13', 'c3_probe', 'c3_shoot', 'c3_aisle',
           'c4_shoot', 'c4b', 'c5_probe', 'c5_after', 'c6_probe', 'c6b', 'c7', 'c8', 'v_modes', 'fixrec13',
           'sum_shoot', 'door13', 'mark_shoot', 'fix_bk', 'exam']
BUILD = ['build']
VERIFY = ['verify13', 'ftest', 'cp_test']
PUBLISH = ['quickcard', 'booklets', 'user_ed']
STEPS = {'capture': CAPTURE, 'build': BUILD, 'verify': VERIFY, 'publish': PUBLISH}


def stage(work: Path, app: Path, chrome: str):
    for d in ['scripts', 'shots/g', 'shots/anim', 'work/edu', 'work/edu/sum', 'work/cp', 'dl', 'out']:
        (work / d).mkdir(parents=True, exist_ok=True)
    w = str(work).rstrip('/')
    for f in (HERE / 'src').iterdir():
        t = f.read_text(encoding='utf-8').replace('@@W@@', w).replace('@@CHROME@@', chrome).replace('@@REPO@@', str(REPO))
        (work / 'scripts' / f.name).write_text(t, encoding='utf-8')
    for x in sorted((REPO / 'fixtures' / 'guide').glob('*.*')):
        shutil.copy(x, work / 'work' / 'edu' / x.name)
    shutil.copy(app, work / 'dl' / 'app.html')


def run(work: Path, names, timeout):
    res = []
    for n in names:
        p = work / 'scripts' / f'{n}.py'
        t0 = time.time()
        with open(work / 'out' / f'log_{n}.txt', 'w', encoding='utf-8') as log:
            try:
                rc = subprocess.run([sys.executable, str(p)], cwd=work, stdout=log, stderr=subprocess.STDOUT, timeout=timeout).returncode
            except subprocess.TimeoutExpired:
                rc = 'timeout'
        errs = (work / 'out' / f'log_{n}.txt').read_text(encoding='utf-8', errors='replace').count('"ERR')
        res.append((n, rc, errs, round(time.time() - t0)))
        print(f'{n:12s} rc={rc} ERR={errs} {res[-1][3]}s', flush=True)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True, help='작업 폴더 (저장소 밖 권장)')
    ap.add_argument('--app', required=True, help='pnpm build 결과 단일 HTML')
    ap.add_argument('--chrome', default=os.environ.get('WAREHOUSE_BROWSER_PATH', '/usr/bin/google-chrome'))
    ap.add_argument('--steps', default='capture,build,verify,publish')
    ap.add_argument('--timeout', type=int, default=600)
    a = ap.parse_args()
    work = Path(a.work).resolve()
    stage(work, Path(a.app).resolve(), a.chrome)
    allres = []
    for s in a.steps.split(','):
        allres += run(work, STEPS[s], a.timeout)
    bad = [r for r in allres if r[1] != 0]
    print('FAILED:' if bad else 'ALL rc=0', bad if bad else '', '· ERR 줄은 일부 탐색 단계의 정상 기록일 수 있음(로그 확인)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
