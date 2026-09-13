# Orbit Defender 실제 검증 결과

## 1. 판정과 기록 원칙

판정은 pass / fail / unverified다. 실행하지 않음·환경 차단·관찰 주체는 별도로 기록한다. 과거 실행의 실패나 미확인은 뒤 실행이 해결해도 지우지 않는다. 사용자 위임으로 에이전트가 계획 검토·자동 실행을 수행했으며 사람이 직접 플레이하거나 각 단계를 개별 승인했다고 기록하지 않는다.

## 2. R1 — 05-01 최초 전체 검증

- 실행: 2026-09-14 02:54~02:56 KST.
- 코드 기준: 759e064711e0702b29b305929a8a406a3e59c436. 실행 시작 때 미커밋 변경은 TEST_PLAN.md 하나였고 제품·테스트 코드는 변경하지 않았다.
- 환경: Windows, Node 24.14.1, npm 10.8.3, Playwright 1.58.2, Chromium 145.0.7632.6, Vite 7.3.6.
- 계획 순서: 관련 문서·실제 assertion 검토 → TEST_PLAN.md 작성·전체 읽기·표 점검 → 아래 명령과 preview 실행 → 이 결과 작성.
- 이미 설치된 잠금 버전의 의존성과 Chromium을 사용했다. 새 의존성 설치·npm ci 복원은 실행하지 않았고, manifest/lock 버전과 integrity 일치는 Node 검사로 확인했다. 깨끗한 환경의 npm ci 실행 증거는 아직 없으며 06 CI와 구분한다.

| 명령·조작 | 종료·응답 | 실제 결과 |
|---|---|---|
| npm test | 0 | Node 22/22, 실패·skip 없음. tests/*.test.js 전체 선택자 확인 |
| npm run test:e2e | 0 | Chromium 14/14, 2 workers. 개발 5173 및 빌드 preview 4173 관리 서버 |
| npm run build | 0 | dist/index.html, 상대 JS/CSS 생성. 소스 문서·테스트 제외 |
| npm run preview -- --host 127.0.0.1 --port 4173 --strictPort | HTTP 200 | 별도 루트 preview의 제목 확인 후 실제 브라우저 탐색 |
| 브라우저 버튼 시작 → Space 1.8초 유지 | 진행 상태, 점수 50 | 사용자 입력 자동화로 실행. Canvas width800 확인 |
| 브라우저 콘솔 조회 | favicon.ico HTTP 404 | E2E 14개는 통과했지만 일반 preview 브라우저에서 별도 리소스 누락 발견 |
| preview 종료 | 세션 소유 프로세스 종료 | 다른 프로세스를 종료하지 않음 |

## 3. R1 요구사항별 증거

| TC | 판정 | 실행상태·실제 증거 | 남은 범위·이유 |
|---|---|---|---|
| TC-01 | pass | Node title/start와 브라우저 Enter/시작 버튼 수행 | 사람 직접 시작 관찰은 TC-21 |
| TC-02 | pass | title 입력 무시·반복/held key 시작 누출 방지 assertion | 없음 |
| TC-03 | pass | Node 속도·고정 y, 브라우저 방향키/A/D의 래스터 위치 변화 | 브라우저 오차는 320/120+1px 허용, 모델 숫자는 정확히 확인 |
| TC-04 | pass | x0/760 경계와 동시 방향 입력 정지 | 없음 |
| TC-05 | pass | 합성 blur/hidden 이벤트 후 키 해제·긴 프레임 상한 | 실제 OS 창 전환은 unverified. 자동 브라우저 이벤트와 동일시하지 않음 |
| TC-06 | pass | (398,538) 즉시 생성과 위쪽 600px/s assertion | 없음 |
| TC-07 | pass | 0.2초 전/경계·반복 발사, 브라우저 held Space와 repeat | 없음 |
| TC-08 | pass | 탄환 하단 양수/0/음수의 유지·제거 | 없음 |
| TC-09 | pass | 3×8 모든 좌표·크기·속도·객체 독립성 | 없음 |
| TC-10 | pass | 좌우 경계 직전/도달/초과·24px 한 번 하강·생존 적 외곽 | 없음 |
| TC-11 | pass | 네 변 접촉과 빗나감 비충돌·겹침 명중, 실제 Space 점수 증가 | 없음 |
| TC-12 | pass | 순수 Node fixture에서 한 탄환/여러 적·여러 탄환/한 적·240점 상한 | 브라우저 상태를 바꾼 fixture가 아님 |
| TC-13 | pass | 520 직전/정확히/이후 및 충돌 후 생존 적으로 lost 우선 판정 | 없음 |
| TC-14 | pass | 자연 무발사 55초 패배, 실제 Space·좌우 조작으로 240점 승리 | 자동 Chromium/제어 시간이지 사람 플레이 아님 |
| TC-15 | pass | 양쪽 종료의 모델 전체 동결 및 브라우저 입력·시간 후 화면/점수 고정 | 없음 |
| TC-16 | pass | won/lost 각각 R/버튼 네 경로, 전체 초기화와 첫 발사 | 반복 누적 안정성은 별도 TC-18 |
| TC-17 | pass | playing의 Enter/R 후 상태/위치 유지 assertion | 없음 |
| TC-18 | unverified | 미실행: 전용 10회 연속 재시작 자동화 없음 | 05-02 자동화 누락 보완. 현재 개별 재시작 통과를 반복 안정성 증거로 확대하지 않음 |
| TC-19 | fail | 하위 경로 E2E의 JS/CSS·게임 조작·상대 경로는 pass. 일반 루트 preview 브라우저는 favicon.ico 404 | 05-02에서 재현·최소 수정·회귀. root 응답만으로 하위 경로 성공이라 하지 않음 |
| TC-20 | pass | 반응형·네이티브 키보드·Canvas 실패 알림과 입력 차단 | 실패 주입 검사는 의도한 환경 오류이며 정상 게임 오류와 구분 |
| TC-21 | unverified | 미실행: 사람이 직접 관찰한 보고 없음 | 체감·실제 OS 포커스·다른 브라우저는 자동 Chromium 결과와 분리 |
| TC-22 | unverified | 미실행: 아직 Pages 설정/배포 전 | 06에서 실제 배포 SHA·URL·브라우저 결과로 확인 예정 |

## 4. 차이·후속 처리

현재 01-01~04-03의 11/25 단계는 조정자가 수락했다. 예전 스타일/포트/개발 상태 주입 이력은 보존하고, 2bfaee1의 정렬과 759e064의 통합 기준으로 이번 실행을 수행했다. 현재 src/styles.css·dev/E2E5173·preview4173이며 브라우저 게임 상태 변경 API는 없다.

05-01에서 제품 결함을 고치지 않았다. favicon 404는 로컬 공개 리소스 검사에서 발견한 정상 개발 수정 루프, TC-18은 자동화 누락이다. 둘 다 초기화나 원본 안내 결함이 아니다. 05-02에서 해결하고 필수 로컬 검사를 통과하기 전 06으로 진행하지 않는다. 사람 직접 플레이·OS 포커스·공개 Pages는 그에 맞는 미확인 범위를 유지한다.

## 5. R2 — 05-02 BUG-01 리소스 누락 수정

05-02 원문 전체·현재 지침·요구/설계·계획·실제 코드를 읽고 후보를 분류했다. BUG-01은 REQ-08/TC-19의 favicon 미선언으로 인한 공개 리소스 오류, GAP-01은 TC-18의 자동화 누락이다. 인증·환경 차단은 없고 사람 관찰은 단순 미확인이다. 먼저 재현 근거가 있는 BUG-01 하나만 수정하는 안을 사용자 위임으로 채택했다.

2026-09-14 02:58~03:00 KST, 기준 5ec4dea814d48e9f9bef579d05e579b9d74c76a3에 e2e/game.spec.js만 수정한 상태에서 회귀 검사를 추가했다. `npm run test:e2e -- --grep 'built game runs'`는 아이콘 요소 없음으로 실제 1 fail/종료1을 재현했다. index.html에 직접 만든 삼각형의 인라인 SVG favicon 하나를 추가한 뒤 동일 검사 1/1 pass, npm test 22/22, 전체 E2E 14/14, npm run build 모두 종료0이었다. 게임 소스·규칙·수치·의존성은 바꾸지 않았다.

원래 경로인 127.0.0.1:4173/를 일반 자동 브라우저로 다시 열었다. HTML/JS/CSS 3개 요청 모두 HTTP200, 콘솔 error/warning 0, favicon.ico 요청 없음이었다. 이는 하위 경로 E2E의 실제 SVG decode·상대 에셋 검사와 별도 증거다. TC-19의 현재 판정은 pass이며 R1의 fail은 그대로 보존한다.

R2 실행 당시 변경은 index.html/e2e/game.spec.js, 실행 뒤 기록 변경은 TEST_PLAN.md/TEST_RESULTS.md다. TC-18 반복 재시작은 아직 unverified로 남겨 다음 작은 작업에서 보완한다. TC-21 사람/OS 관찰과 TC-22 Pages도 계속 unverified다.

## 6. R3 — 05-02 GAP-01 반복 재시작 검증

기준 d97a6d11b0a008ba45dcbdd29000a18781cc0092, 2026-09-14의 같은 환경에서 e2e/game.spec.js에 전용 10회 반복 검사를 추가했다. 제품 코드 수정은 없다. 각 판 초기에 512ms 이동량과 첫 탄환·224ms 후 두 탄환, 점수0·위치 초기화를 확인하고 입력을 놓은 뒤 정상 하강으로 패배를 기다렸다. R/버튼을 번갈아 총 10회 재시작한 뒤 11번째 판도 같은 검사를 수행했다.

첫 추가 검사에서는 Playwright가 첫 조작 뒤 지연 설치하는 pointer/click 등 자체 관찰 리스너까지 비교해 1 fail이었다. 이는 게임 결함이 아닌 테스트 관찰 대상 오류였다. 게임의 window keydown/keyup/blur, document focusin/visibilitychange, 시작·재시작 버튼 click으로 범위를 명시하자 각 종류 정확히 하나와 반복 전후 동일함을 확인했다. 기대 이동 속도·발사 수·반복 횟수는 완화하지 않았다. CDP는 이벤트 리스너 정보의 읽기 전용 관찰이며 게임 모델이나 전역 치트가 아니다.

`npm run test:e2e -- --grep 'ten real restarts'` 1/1 pass(약 3분), 이어서 npm test 22/22, 전체 npm run test:e2e 15/15(약 3.2분), npm run build 모두 종료0이었다. 즉 전용 10회 검사를 개별 실행과 전체 회귀에서 각각 수행했다. src/main.js도 읽어 초기 RAF 하나와 같은 frame의 다음 예약 하나뿐이며 act 안에 RAF/리스너 추가가 없음을 확인했다. 실제 픽셀 이동량과 발사 간격 회귀는 누적 가속이 없음을 확인하며 브라우저 내부 RAF 큐를 직접 계수한 검사라고 주장하지 않는다.

R3 실행 시 미커밋 변경은 e2e/game.spec.js였고, 실행 뒤 TEST_PLAN.md/TEST_RESULTS.md/IMPLEMENTATION_PLAN.md를 갱신했다. 원래 R1의 TC-18 unverified와 BUG-01 fail, 새 테스트 관찰 오류도 보존한다.

| 현재 요구사항 | 판정 | 최신 근거 |
|---|---|---|
| REQ-01 시작 | pass | TC-01/02, R3 Node·E2E 전체 회귀 |
| REQ-02 이동 | pass | TC-03~05, 경계·동시 입력·합성 blur와 실제 512ms 이동 |
| REQ-03 발사 | pass | TC-06~08, 정확한 모델 수치와 반복 재시작 후 실제 발사 |
| REQ-04 편대 | pass | TC-09/10, 모든 좌표·속도·양 경계·자연 하강 |
| REQ-05 충돌·점수 | pass | TC-11/12, 다중 충돌 순수 fixture·실제 조작 점수 |
| REQ-06 승패 | pass | TC-13~15, 520 경계·충돌 우선순위·실제 240점 승리와 패배 |
| REQ-07 재시작 | pass | TC-16~18, 양쪽 종료의 두 경로와 10회 반복·이벤트 수 안정성 |
| REQ-08 로컬 실행·표시·빌드 | pass | TC-19/20, 실제 하위 경로·아이콘 decode·일반 preview 콘솔0·전체 빌드 |
| 사람·실제 OS 관찰 | unverified | TC-21. 자동 Chromium·합성 브라우저 이벤트와 분리 |
| 공개 Pages 배포 | unverified | TC-22. 06에서 실제 설정·Action·배포 SHA·URL로 확인 예정 |

05-02의 필수 로컬 수용 기준에 열린 실패·차단은 없다. 일반 완료 판단은 사용자 위임으로 채택했고 06으로 진행한다. 이는 아직 공개 배포 완료를 뜻하지 않는다.

## 7. R4 — 06-03 최초 실제 Pages 배포

06-01에서 실제 Public demo01/관리 권한/기본 main/공통 이력과 공개 내용을 점검했다. 인증된 gh REST API로 Pages 게시 소스를 workflow로 설정하고 github-pages 환경은 main 브랜치 규칙 하나만 허용했다. 기존 보호·승인자를 제거하지 않았으며 사람의 GitHub 웹 버튼 조작을 대행한 도구 실행이다. 06-02에는 사용자 위임에 따른 일반 main 게시로 배포를 시작했다. 원문의 PR 생성·검토·병합 UI 경로는 이번 사용자 운영 예외로 수행하지 않았다.

| 증거 | 실제 값·판정 |
|---|---|
| 배포 코드 SHA | e73fc721847396180e27056a9e7f3d460934c5a6 |
| Actions | https://github.com/hahaysh/space-Invaders-demo01/actions/runs/34774220285 |
| 실제 실행 시간 | 2026-09-13 18:18:31~18:21:55 UTC (09-14 03:18~03:21 KST) |
| build / deploy | 둘 다 success. npm ci → Node → Chromium 설치 → E2E → build → dist 업로드 → deploy 실제 단계 모두 success |
| CI 환경·검사 | Ubuntu, Node24.20.0, npm11.19.0, npm ci 설치 성공, Node22/22, Chromium15/15. 로컬24.14.1/npm10.8.3과 패치/npm 환경 차이를 구분하며 같은 Node24 LTS 계열 |
| 성공 deployment | 6424863793, SHA 일치, environment_url=https://hahaysh.github.io/space-Invaders-demo01/ |
| 공개 주소 | https://hahaysh.github.io/space-Invaders-demo01/ |
| 실제 아티팩트 | 다운로드한 github-pages의 tar 목록은 index.html과 assets의 JS/CSS 두 개뿐. 문서·소스·테스트·node_modules 없음 |
| 공개 바이트 | 실제 HTTPS HTML/JS/CSS의 바이트가 위 성공 실행의 아티팩트와 각각 완전히 일치 |
| 공개 브라우저 | 2026-09-13 18:24:22 UTC 완료, Windows Chromium145.0.7632.6 자동화·제어 시간 |

공개 브라우저에서 새 페이지와 반복 새로고침, title의 금지 입력, Enter/버튼 시작, A/D·양쪽 방향키·x 경계·양방향 정지, 첫 탄환·발사 간격·10의 배수 점수 증가를 확인했다. 실제 Space·좌우 조작으로 240점 승리, 별도 무발사 정상 하강으로 패배를 각각 두 번 확인하고 양쪽 종료에서 R/버튼 네 경로의 완전한 재시작·입력 해제·첫 발사를 확인했다. 종료 후 방향·Space·Enter·P와 시간 경과에도 Canvas가 고정되었다.

800×600 논리 크기와 좁은 화면의 가로 넘침 없음도 확인했다. 네트워크는 위 공개 저장소 경로의 HTML/JS/CSS 세 종류만 요청했고 404·콘솔 오류·외부 에셋·개발 상태 API는 없었다. 픽셀은 읽기 전용으로 관찰했으며 게임 상태 주입은 하지 않았다. 정확한 520 경계/충돌 fixture는 R3의 순수 모델 근거, 공개 실행의 자연 승패는 R4의 실제 UI 근거로 구분한다.

TC-22의 현재 판정은 pass다. 사람이 직접 플레이한 결과·OS 포커스·Firefox/WebKit은 여전히 unverified다. PR 및 다른 브랜치 수동 실행의 원격 수행 증거는 없으며, 해당 업로드/배포 금지는 06-02 YAML 구조와 로컬 이벤트 조건표로 확인했다. Pages 설정 API의 status는 null이었지만 성공 deployment·실제 공개 응답을 별도로 확인했으므로 설정 필드만으로 성공을 추정한 것이 아니다.

이 기록은 배포 SHA 이후의 TEST_RESULTS.md 전용 기록 커밋으로 보존한다. 사용자 정책상 이 문서의 main 게시도 같은 게임을 다시 배포할 수 있다. 기록 커밋 SHA와 검증된 배포 SHA를 혼동하거나, 기록 커밋의 재배포를 적기 위해 다시 기록 커밋을 만드는 반복을 하지 않는다.

## 8. CHG-01 검증 예정 영역 (07-02)

07-02에서 요청 영향 분석과 문서 설계만 채택했다. 기준은 최초 배포 e73fc721847396180e27056a9e7f3d460934c5a6와 보존된 R1~R4다. 제품·테스트 코드·의존성·워크플로는 변경하지 않았으며 아래는 실행 결과가 아닌 미실행 상태 기록이다.

| 기준·연결 TC | 판정 | 실행상태·다음 확인 |
|---|---|---|
| CHG-01-AC1/AC8 · TC-P01 | unverified | 미실행: 모델/실제 키 전환·금지 상태·기존 규칙 |
| CHG-01-AC2 · TC-P02 | unverified | 미실행: P 반복과 네이티브 입력 |
| CHG-01-AC3 · TC-P03 | unverified | 미실행: 모델 전체·쿨다운 동결 및 재개 경계 |
| CHG-01-AC3/AC4/AC5/AC6 · TC-P04 | unverified | 미실행: 안내·60초 정지·입력 누출·시간 점프 |
| CHG-01-AC5 · TC-P05 | unverified | 미실행: blur/hidden에서 자동 pause 없음 |
| CHG-01-AC7/AC8 · TC-P06 | unverified | 미실행: 10회 전환·단일 루프·기존 전체 회귀 |
| CHG-01 공개 재배포 | unverified | 미실행: 07-05의 실제 Actions/공개 URL |

## 9. R5 — 07-03 일시정지 A/B 구현 검증

기준 c7934ab49556563a78f53fd87dbe94c06922727b에서 실제 07-03 원문 전체와 관련 문서·코드를 확인했다. A는 src/game.js/tests/game.test.js만 수정하고 Node25/25 및 diff를 검토한 뒤 종료했다. 이어 B에서 src/main.js/index.html/e2e/game.spec.js를 수정했다. 기존 스타일·입력 해제·시간 기준 초기화·단일 RAF를 재사용했으며 게임 수치·의존성·워크플로는 변경하지 않았다.

| 실행 순서·명령 | 판정 | 실제 결과 |
|---|---|---|
| A: npm test | pass | Node25/25, 기존22개와 CHG-01 모델·시계3개. 실패·skip 없음 |
| B: npm run test:e2e -- --grep 'CHG-01\|native button\|real direction\|semantic title\|blur /' | pass | 직접 영향 Chromium6/6, 새 P 검사2개 포함 |
| A/B 통합: npm test | pass | Node25/25 |
| A/B 통합: npm run test:e2e | pass | Chromium17/17, 약3.3분. 개발5173·하위 경로 preview4173 |
| A/B 통합: npm run build | pass | dist의 HTML/JS/CSS만 생성, 상대 경로 유지 |

순수 모델은 title/won/lost의 P 무시, paused의 start/restart 금지, 점수10·남은 적23·탄환·쿨다운을 포함한 전체 상태의 60초 동결을 확인했다. 유효한 dt 상한을 지킨 반복 검사이며 큰 벽시계 차이는 별도 순수 시계와 실제 브라우저에서 확인했다. 재개 후 23/120초에는 두 번째 탄환이 없고 24/120초 경계에서 생성되었다. 10회 60초 간격 뒤 시계의 첫 advance는 기준만 설정하고 이후50ms만6스텝으로 진행했다.

실제 Chromium은 P 유지/repeat와 새 P의 구분, 정지 중 Enter/R·새 이동 입력 무시, 한국어 안내·P 재개 표시·새 버튼 없음, 60초 Canvas/점수 고정, 기존 held 입력 누출 없음과 발사 대기 보존을 확인했다. 별도 10회 pause/resume에서 매번512ms 이동량과 입력 해제·게임 이벤트 리스너 수를 비교했다. CDP는 리스너 정보를 읽었을 뿐 게임 상태를 읽거나 변경하지 않았다. blur/hidden은 진행 중 자동 pause를 만들지 않았고 paused에서 blur도 계속 paused였다.

playing에서 P 무시하던 옛 assertion은 변경 요청에 따라 대체했다. title/won/lost의 금지 입력, Enter/R 제한, 24적·10점·240점·520 경계와 양쪽 종료/재시작, 기존10회 재시작, 상대 에셋·favicon·오류 알림 검사는 유지되어 통과했다. RAF 예약 구조는 변경하지 않았고 누적 가속은 픽셀 이동량으로 검증했다. 브라우저 내부 RAF 큐를 직접 계수했다고 주장하지 않는다.

이 실행에 실패·차단은 없었다. 실행 뒤 이 문서와 IMPLEMENTATION_PLAN.md의 P1/P2 상태를 기록했다. 8절의 미실행 표는 07-02 당시 기록으로 보존하며 07-04에서 수용 기준별 최신 판정을 별도로 정리한다. 실제 공개 P 동작과 성공 배포 SHA는 아직 unverified이며 07-05에서 확인한다. 이번 main 게시도 배포를 유발하지만 로컬 통과만으로 공개 성공이라 하지 않는다. 사람 직접 플레이·실제 OS 포커스·다른 브라우저도 별도 unverified다.

## 10. R6 — 07-04 변경·기존 전체 회귀

고정 원문 07-04 전체와 지침·요청·PRD·계획·이전 결과를 읽고 기준별 검사 연결을 검토했다. 사용자 위임으로 실행 계획을 채택했으며 사람이 개별 승인하거나 직접 플레이한 결과는 없다. 기준은 b6939e28319e6ab5331b444189e394f6d6f0e2ce, 실행 중 변경은 tests/game.test.js의 쿨다운 사례 보강뿐이었다. 0초뿐 아니라 발사 후 12스텝(0.1초)이 지난 상태도 정지해 남은 0.1초의 경계 전/도달을 검사했다. 이는 정상 검증 보강이며 제품 결함 수정·수치 완화가 아니다.

2026-09-14, R5와 같은 Windows/Node24/Chromium 환경에서 npm test 25/25, npm run test:e2e 17/17(약3.3분), npm run build 모두 종료0이었다. 실패·skip·추가 설치는 없다. 이어 별도 `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /space-Invaders-demo01/`를 실행하고 http://127.0.0.1:4173/space-Invaders-demo01/ 의 실제 HTTP200을 확인했다.

이 preview에서 자동 Chromium으로 P와 전체 게임을 다시 조작했다. HTML/JS/CSS는 실제 dist 바이트와 일치했고 60초 정지·키 반복·잔류 입력 방지·쿨다운·10회 정지/재개를 확인했다. 별도 새 판에서 실제 240점 승리와 자연 패배 각각 두 번, 종료 후 R/버튼 네 경로를 확인했다. 좁은 화면과 한국어 안내를 확인했으며 favicon은 추가 요청 없는 인라인 SVG다. 네트워크 요청은 동일 하위 경로 3종뿐이며 오류 0이었다. 완료 시각은 2026-09-13 18:47:50 UTC다. 화면 캡처와 기계 판정 기록은 저장소 밖 세션 증거로 보존했다. 이 세션 preview를 종료하고 5173/4173 잔여 수신자 0을 확인했다.

| 기준·TC | 기대값 | 판정 | 실제 증거 |
|---|---|---|---|
| CHG-01-AC1 · TC-P01 | playing↔paused만 전환, 나머지 상태 무시 | pass | Node 전환·금지 action, 실제 P 및 title/won/lost의 P 검사 |
| CHG-01-AC2 · TC-P02 | P repeat 무시·네이티브 입력 보존 | pass | held P 후 한 번 정지, 새 P로 재개, E2E 네이티브 select의 P 무효 |
| CHG-01-AC3 · TC-P03/04 | 모든 모델 값·시간·남은 쿨다운 보존 | pass | 점수10·23적·탄환 전체 deep 비교, 남은0.2/0.1초 각각 경계 전/도달 검사, preview60초 화면·점수 고정 |
| CHG-01-AC4 · TC-P04 | 한국어 정지/P 재개 안내 | pass | 의미 있는 상태·제목·안내 DOM assertion과 실제 preview 캡처 확인 |
| CHG-01-AC5 · TC-P04/05 | 상태 전환·blur 후 held 입력 해제 | pass | 정지 전/중 키가 재개에 누출되지 않음, 합성 blur/hidden 후 새 입력만 처리. 실제 OS 포커스와 구분 |
| CHG-01-AC6 · TC-P04 | 긴 정지의 dt·쿨다운 점프 없음 | pass | 순수 시계의 첫 advance 기준 설정, 실제60초 후 위치·발사 경계 확인 |
| CHG-01-AC7 · TC-P06 | 재개마다 RAF/리스너 추가 없음 | pass | 소스에 초기 예약1곳·frame 내 후속 예약1곳만 유지. E2E10회 속도·리스너 수와 별도 preview10회 조작 |
| CHG-01-AC8 · TC-P06 | 기존 REQ01~08 유지 | pass | 아래 전체 회귀 및 Node25/E2E17/build. 공개판 확인은 별도 미확인 |
| REQ-01 · TC-01/02 | title, Enter/버튼 시작·금지 입력 | pass | Node와 E2E, preview의 새로고침·두 시작 경로 |
| REQ-02 · TC-03~05 | 800×600,40×20,y550,320속도·양 경계 | pass | 모델 수치·동시 입력, 실제 방향키/A/D/512ms·blur 검증 |
| REQ-03 · TC-06~08 | 즉시 첫 발사·0.2초·화면 밖 제거 | pass | 정확한 생성/속도/제거 Node, E2E와 preview held Space 및 재개 쿨다운 |
| REQ-04 · TC-09/10 | 24적·64속도·양 경계24하강 | pass | 모든 초기 좌표·경계 직전/도달/초과·생존 외곽 Node, 실제 자연 하강 |
| REQ-05 · TC-11/12 | 엄격한 면적 충돌·10점·중복 없음 | pass | 순수 다중 충돌 fixture, 실제 점수 증가·240점 완주 |
| REQ-06 · TC-13~15 | 충돌 후 생존 적520부터 lost, 전멸 won | pass | 정확한 경계·우선순위 Node, E2E와 preview 양쪽 종료·동결 |
| REQ-07 · TC-16~18 | R/버튼 완전 초기화·누적 없음 | pass | 종료 네 경로 및 E2E10회 재시작·11번째 판 검사 |
| REQ-08 · TC-19/20 | 정적 상대 에셋·DOM·빌드·오류 처리 | pass | 개발5173/하위 경로4173·아이콘 decode·외부 요청/상태 훅 부재·Canvas 오류 알림 |
| 사람·OS 관찰 · TC-21 | 실제 사람 플레이·창 전환 | unverified | 미실행: 자동 Chromium/합성 이벤트/에이전트 캡처 검토와 구분 |
| 개선 공개판 · TC-22 | 성공 SHA와 실제 Pages의 P/회귀 | unverified | 아직07-05에서 확인 전. 로컬 preview 성공으로 대체하지 않음 |

필수 로컬 변경·회귀 검사에는 열린 실패·환경 차단이 없다. P3를 완료하고07-05의 실제 재배포 확인으로 진행한다. 이 기록 게시 역시 사용자 정책에 따라 main의 재배포를 유발하며, 원문의 PR·수동 승인 흐름과는 구분한다.
