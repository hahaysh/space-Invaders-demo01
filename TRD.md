# Orbit Defender 기술 설계

## 1. 기준과 기술 선택

02-03에서 PRD의 REQ-01~08과 D-01~08을 기준으로 사용자의 위임에 따라 다음 설계를 채택한다. HTML/CSS/JavaScript, Canvas 2D, Vite, Node 내장 테스트, Playwright를 사용한다. 게임 엔진·외부 에셋·CDN 없이 자체 도형을 그린다.

02-03 문서 설계 당시 아래 파일·명령은 구현 예정이었으며 미구현·미검증 상태였다. 현재 상태를 미구현으로 설명하는 문장이 아니다. 이후 M1~M3 구현·로컬 자동 검증과 설치 버전·잠금 파일의 실제 근거는 AGENTS.md와 IMPLEMENTATION_PLAN.md에 기록되어 있다.

## 2. 파일과 책임

| 예정 파일 | 책임 | 요구사항 |
|---|---|---|
| index.html, src/styles.css | 제목·안내·DOM 상태·점수·버튼, Canvas와 반응형 표시 | REQ-01/08 |
| src/game.js | DOM·실시간 API와 분리된 상태 생성, 입력별 전환, 규칙 갱신과 명시적 시간 누적 | REQ-01~07 |
| src/main.js | 키·버튼 입력, RAF 시간 관리, 모델 호출, Canvas·DOM 렌더링 | REQ-01~08 |
| tests/game.test.js | 명시적 입력·시간·경계 상태를 주는 결정적 모델 테스트 | REQ-01~07 |
| e2e/game.spec.js | 실제 브라우저 키·버튼·DOM·Canvas·오류 및 초기화 검증 | REQ-01~08 |
| vite.config.js, playwright.config.js | 상대 배포 경로, 로컬 및 브라우저 테스트 서버 설정 | REQ-08 |

게임 상수는 모델에 모으며 숫자의 제품 기준은 PRD다. 렌더링 도형과 충돌 사각형은 같은 좌표·크기를 사용한다. 존재하지 않는 파일을 현재 명령의 근거로 삼지 않는다.

## 3. 상태와 입력

모델은 상태, 플레이어, 적 배열, 탄환 배열, 점수, 편대 방향, 발사 대기시간을 가진다. CHG-01은 playing↔paused, CHG-02는 선택/현재 난이도를 추가했다. CHG-03은 lives와 retry를 추가하며 새 게임과 같은 게임의 재도전은 11절에서 구분한다.

| 입력 | 허용 상태 | 처리 |
|---|---|---|
| Enter·시작 버튼 | title | 초기화 후 playing |
| 반복이 아닌 Enter·재도전 버튼 | retry | 남은 목숨·현재 난이도 유지, 해당 시도 초기화 후 playing |
| 좌우·A/D | playing | 방향별 활성 입력을 합쳐 양쪽 동시 입력은 0 |
| Space | playing | 키 유지 상태와 시뮬레이션 발사 대기시간 사용 |
| R·재시작 버튼 | won/lost | 전체 한 판 상태 초기화 후 playing |
| 반복이 아닌 P | playing/paused | togglePause 전환, clearInput으로 입력·시계 기준 초기화 |
| blur·문서 숨김 | 모든 상태 | 눌린 키 제거와 시간 기준 초기화, 추가 제품 상태를 만들지 않음 |

event.code를 사용하고 게임 조작키의 기본 스크롤을 방지한다. 버튼·선택 같은 네이티브 컨트롤의 키보드 기본 동작은 침범하지 않는다. 상태 변경 시 입력과 시간 기준을 정리해 이전 판의 키가 이어지지 않게 한다.

## 4. 시간과 규칙 갱신

RAF 루프는 하나만 생성한다. 고정 간격 1/120초로 누적 시간을 소비하고, 한 렌더 프레임의 경과 시간은 최대 0.1초로 제한해 탭 전환 뒤 큰 점프를 방지한다. 모델은 전달받은 시뮬레이션 시간만 사용하며 Date.now, setInterval 같은 별도 게임 시계를 사용하지 않는다.

발사 대기시간은 playing의 시뮬레이션 시간으로만 줄인다. 첫 대기시간은 0이며 Space 유지와 함께 첫 발사를 허용하고 이후 최소 0.2초를 보장한다. 시간 비교의 부동소수점 오차는 테스트로 관리한다.

한 갱신에서는 플레이어·발사·탄환·적 이동을 반영하고, 엄격한 사각형 면적 겹침으로 탄환별 최대 한 적을 제거한다. 제거된 적을 재처리하지 않아 중복 득점을 막는다. CHG-03은 이어서 생존 적 하단>=520이면 목숨1 감소 후 retry/lost, 그렇지 않고 적이 없으면 won으로 바꾼다. playing 밖에서는 기존 가드로 시뮬레이션과 점수 갱신을 하지 않는다.

생존 적의 외곽으로 경계를 판단하고 이동량을 화면 안으로 제한한다. 한 번의 경계 도달에 방향 반전과 24px 하강을 한 번만 적용한다. 탄환 생성 위치는 PRD의 x+18,y538이며 하단 <= 0인 탄환은 제거한다.

잘못된 모델 입력·음수/비유한 시간 등은 명확한 오류로 드러내며 조용히 정상값으로 바꾸지 않는다.

## 5. 렌더링과 검증 설계

Canvas 논리 크기는 800×600으로 유지하며 CSS 표시는 화면 폭에 맞게 축소할 수 있다. 어두운 우주 배경, 밝은 기체·적·탄환, y520 방어선을 자체 도형으로 그린다. 상태와 점수는 DOM에도 표시하고 시작·재시작 버튼은 의미 있는 이름을 제공한다.

| 범위 | 예정 검증 |
|---|---|
| 모델 | 초기 수치, 이동 범위, 양 방향, 첫 발사·0.2초 경계, 편대 반전·하강, 충돌 접촉·다중 겹침, 점수, 생존 적 종료, 재시작 |
| 브라우저 | 초기 title, 실제 키·버튼, DOM 일치, Canvas 존재, blur 후 키 해제, 콘솔 오류 없음, 종료·재시작 |
| 시간 | 결정적 고정 시간 입력과 제어된 브라우저 시간, 긴 공백 뒤 점프 방지, 중복 RAF 방지 |
| 빌드·게시 | 상대 에셋 URL, dist만 포함, 저장소 하위 경로 및 공개 URL 직접 확인 |

개발·배포 환경 모두 window 상태 변경·즉시 승리 치트나 테스트 전용 상태 API를 노출하지 않는다. 경계·충돌·종료 상태 주입은 DOM과 분리된 순수 모델 단위 테스트에서만 사용한다. Playwright는 실제 키·버튼과 page.clock의 제어 시간으로 게임을 진행하고 DOM·Canvas의 읽기 전용 관찰로 검증한다. 브라우저 승리는 실제 게임 조작으로 재현한 경우만 pass로 기록하며 재현하지 못하면 unverified로 남긴다.

## 6. 명령과 배포 계획

| 예정 명령 | 목적·상태 |
|---|---|
| npm run dev -- --host 127.0.0.1 --port 5173 --strictPort | dev: vite, 원문 개발·E2E 포트 5173 |
| npm test | node --test tests/*.test.js, e2e를 Node 테스트 수집에서 제외 |
| npm run test:e2e | Playwright, 전용 고정 포트·strictPort 서버 |
| npm run build | Vite dist 생성 |
| npm run preview -- --host 127.0.0.1 --port 4173 --strictPort | preview: vite preview, 별도 빌드 확인 포트 4173 |

Vite base는 상대 경로인 './'로 설정한다. Playwright의 Chromium 프로젝트는 testDir e2e와 url/baseURL http://127.0.0.1:5173을 사용한다. webServer 명령은 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort이며 reuseExistingServer는 false다. 기존 프로세스를 임의 종료하지 않고 점유 시 보고한다. dist 하위 경로 검사는 별도의 4173 preview로 실행하며 두 포트를 혼동하지 않는다.

06단계에서 GitHub Actions의 테스트·빌드 후 dist만 Pages 아티팩트로 게시한다. 기본 contents:read, 배포 작업만 pages:write/id-token:write를 사용하며 github-pages 환경은 main만 허용한다. PR은 테스트·빌드만, main 및 main의 수동 실행만 업로드·배포한다.

06-01에서 인증된 gh REST API로 Pages 게시 소스 workflow와 github-pages 환경의 main 브랜치 규칙 하나를 실제 설정·재조회했다. 사람의 GitHub 웹 조작과 구분한다. 06-02의 .github/workflows/pages.yml은 Ubuntu/Node24, npm ci → Node 검사 → Chromium 설치 → E2E → build 순서와 build 성공 의존 배포, deploy에만 pages-deployment 동시성 제어를 구현한다. 공식 Actions의 검증된 버전 SHA를 고정한다. 사용자 예외에 따른 main 게시가 배포를 유발하며 실제 Actions·공개 URL 결과는 06-03에서 별도 검증한다.

## 7. 단계와 후속 변경

M1은 시작·이동·발사와 로컬 실행, M2는 적·충돌·점수, M3는 종료·재시작·DOM 통합이다. P 일시정지, 난이도, 목숨은 각각 07·08·09에서 문서부터 변경하며 선행 구현하지 않는다.

02-03의 설계 검토는 파일 책임·요구사항 대응·시간/입력/충돌 경계를 대상으로 했으며 당시 실제 구현·명령 실행·브라우저·배포 검증은 미수행이었다. 이후 구현·자동 브라우저·06 최초 공개 배포는 TEST_RESULTS의 실제 기록으로 구분한다. 사람의 직접 플레이·OS 수준 포커스는 unverified다.

## 8. 원문 경로·실행 설정 보정

2026-09-14에 hahaysh/space-Invaders의 고정 커밋 c545b103a8816a061bb754d9ca92f59d25cfa7a9에서 docs/04-02-first-playable.md와 docs/04-03-core-gameplay.md 전문을 gh api로 읽었다. 기존 단수 스타일명·대체 포트는 원문 재현에 맞지 않아 src/styles.css와 5173/4173으로 보정했다. 별도 보조 파일에 있던 시간 누적·빌드 검사·배포형 브라우저 검사를 원문의 src/game.js·tests/game.test.js·e2e/game.spec.js에 통합하며 제품 규칙·검증을 제거하지 않는다.

## 9. CHG-01 설계 채택 (07-02)

src/game.js의 유효 mode에 paused, transition action에 togglePause를 추가한다(AC1). playing/paused에서만 mode를 바꾸고 나머지 모델 값은 보존한다. update의 기존 playing 가드로 paused의 이동·충돌·쿨다운 갱신을 막으며 시뮬레이션에 벽시계 경과를 적용하지 않는다(AC3).

src/main.js의 기존 키 핸들러에서 KeyP와 repeat 무시를 처리하고 네이티브 컨트롤 예외를 유지한다(AC2). 상태 변경 때 기존 clearInput/clock.reset을 재사용하며 blur/hidden에서도 키·시간 기준만 지운다(AC5/6). frame은 paused에서 clock.advance를 호출하지 않고 기존 RAF 체인으로 정지 화면만 렌더링한다. 재개 action에서 RAF나 리스너를 추가하지 않는다(AC7).

기존 DOM 상태·overlay/message/detail을 재사용해 일시정지와 P 재개 안내를 표시한다. 정지 화면에는 시작·재시작 버튼을 숨기고 새 버튼을 추가하지 않는다(AC4). 1/120초 고정 스텝과 프레임 상한·원래 수치·승패·완전 재시작은 그대로 회귀 검사한다(AC8). 이 절은 구현 전 채택이며 실제 결과는 TEST_RESULTS의 후속 회차로 기록한다.

## 10. CHG-02 설계 채택 (08-01)

src/game.js에 불변 DIFFICULTIES 설정을 두고 easy/normal/hard의 표시 이름과 적 속도를 함께 정의한다. normal의 속도는 기존 RULES.enemySpeed(64)를 재사용한다. 상태에는 selectedDifficulty(다음 선택)와 difficulty(이번 게임)를 구분한다. createState(difficulty = 'normal')는 둘을 같은 값으로 초기화하며 누락/undefined만 기본값을 적용한다. 지원하지 않는 문자열·null·다른 타입·상속 속성 이름은 TypeError로 드러낸다(AC1/5/9).

순수 selectDifficulty(state, value)는 상태와 값을 검증하고 title/won/lost에서 selectedDifficulty만 바꾼다. playing/paused와 CHG-03의 retry에서 유효한 변경 시도는 같은 상태를 반환한다. 지원하지 않는 값은 상태와 무관하게 명시적 오류다. start/restart가 createState(state.selectedDifficulty)를 사용해 이번 게임에 적용하며 이후 P나 update가 이를 바꾸지 않는다(AC2/3/4/7).

moveFormation에 이번 게임 설정의 enemySpeed를 전달한다. 기존 travel = speed * dt와 그 travel을 사용한 경계 비교·위치 제한을 유지한다. 현재 별도 벽 도달 시간 계산은 없으므로 새 시간 알고리즘을 추가하지 않으며 거리와 경계에 다른 속도가 남지 않게 한다(AC6/10).

index.html/src/styles.css에 label이 있는 기본 select와 난이도 텍스트를 추가하고 src/main.js가 change를 모델에 전달한다. 렌더링 때 모델 값으로 select를 다시 맞추고 playing/paused 및 CHG-03의 retry에서는 disabled로 설정한다. title의 텍스트는 선택값, 시작 뒤 텍스트는 이번 게임값으로 표시한다. 다음 선택을 바꿔도 이미 끝난 게임의 설정은 보존한다. 기존 nativeControl/focusin 입력 처리를 유지하여 select의 방향키·Enter·P를 가로채지 않는다(AC4/5/8).

잘못된 UI 값은 기존 fail의 한국어 오류·console.error 경로로 알리고 입력을 차단한다. 이미 예약된 frame도 failed 상태에서 더 진행하거나 새 RAF를 예약하지 않게 한다. 조작된 DOM 이벤트와 잘못된 값 검사는 제품 전역 API 대신 실제 DOM 이벤트와 명시적 오류 표시로 확인한다. 설정·상태를 window에 노출하거나 브라우저 저장을 추가하지 않는다.

설계 시 현재의 P·편대·입력 구조와 충돌은 없었다. D1 모델/Node를 먼저 검증한 뒤 D2 UI/Chromium을 진행하며 현재는 문서만 채택한다.

## 11. CHG-03 설계 채택 (09-01)

L1은 src/game.js/tests/game.test.js만 다룬다. RULES의 initialLives=3과 상태 lives, mode retry, transition action retry를 추가한다. lives는0~3 정수로 검증하고 lost는0, retry는1/2, 그 외 활성/승리 상태는 양수여야 한다. 잘못된 값·상태는 기존 명시적 오류 경로를 사용한다. 새 게임 생성은3목숨·0점·선택 난이도다(AC1/3).

update의 충돌/득점 뒤 기존 some 도달 조건에서 lives를 정확히1 감소하고 즉시 retry 또는 lost로 전환한다. 적마다 차감하지 않으며 update의 playing 가드와 기존 clock callback의 전환 시 clearInput/reset으로 같은 프레임의 후속 서브스텝 차감을 막는다. 마지막 적을 제거했다면 도달할 생존 적이 없어 won이며, 다른 위험 적이 있으면 도달 분기가 먼저다(AC2/7).

retry action은 retry 상태에서만 동작한다. 기존 createState(state.difficulty)로 시도 객체를 새로 만들되 lives와 현재/선택 난이도는 기존 값으로 보존하고 mode를 playing으로 바꾼다. start/restart는 기존 선택값 기반 새 게임 생성으로3을 복구한다. 두 초기화 책임을 구분하며 점수·24적·방향·플레이어·탄환·쿨다운의 생성 코드는 재사용한다. 모델에 별도 경과시간 필드는 없으며 어댑터의 clock 기준·나머지 시간 초기화가 시도 시간 책임이다(AC1/6).

L2는 src/main.js/index.html/e2e/game.spec.js와 필요한 경우에만 src/styles.css를 다룬다. 기존 점수 영역에 DOM 목숨 텍스트, overlay에 retry 안내/실패 점수와 별도 재도전 버튼을 연결한다. 새 Enter는 retry action, title에서는 start로 전달한다. 게임용 R/P/이동/발사는 retry에서 무시한다. nativeControl 예외는 유지하되 재도전 버튼의 반복 Enter가 기본 클릭을 일으키지 않게 차단한다. 버튼 조작 뒤 포커스를 해제하고 fail은 새 버튼도 비활성화한다(AC4/5/8/9).

기존 clearInput/clock.reset을 모든 전환·blur에 재사용하고 retry/paused에서는 clock.advance를 호출하지 않는다. 재도전에도 새 RAF·리스너·타이머를 만들지 않는다. 선택 가능 상태는 title/won/lost의 허용 목록 하나를 UI와 모델 양쪽에서 지키며 retry는 잠근다. 세 난이도와 P를 조합하고 긴 대기·반복 입력·재도전 후 첫 발사를 실제 UI에서 확인한다(AC10/11).

최초 520 도달=lost라는 규칙을 재사용하지 않고 CHG-03에 따른 retry/lost로 기존 기대값을 바꾼다. 정확한 수치·충돌·속도·P·양쪽 종료의 R/버튼 검사는 보존·확장한다. 기존 10회 새 게임 재시작은 실제 승리 경로로 반복하며, 3회 자연 도달과 Enter/버튼 재도전·최종 lost는 별도 실제 UI 검사로 유지한다. 이는 자연 패배 대기가 목숨 수만큼 늘어나는 것과 누적 초기화 검사의 책임을 분리한 검증 설계다.

문서만 채택했으며 모델 A의 npm test·diff 검토 후에만 UI B를 진행한다. 전역 상태 API·새 의존성·배포 설정 변경은 없다.

## 설계 승인

03-02 당시 사용자 위임에 따라 에이전트가 PRD·TRD의 최초 REQ-01~08과 구현 범위를 검토·채택했다. 그 시점은 게임 미구현·미검증 상태였으며 구현을 막는 설계 보류 사항은 없고 다음 범위는 04-01 구현 계획이었다. 당시 테스트가 통과했거나 사람이 개별 승인했다는 뜻은 아니다. P 일시정지·난이도·목숨은 후속 범위이며 미리 구현하지 않는다.

이 승인 문구는 M3(c28f6bd) 게시 뒤인 2026-09-14에 수행한 지연 기록 보완이다. 설계 당시의 미구현·미검증과 현재 M1~M3 구현·로컬 자동 검증 이력을 명시적으로 구분하며 현재까지 미구현이라고 주장하지 않는다. 과거 커밋·승인 시점·검증 시점을 소급 변경하지 않는다. 시나리오 완료 집계는 조정자의 통합 정렬 검증 승인과 별개이며 사람 직접 확인은 여전히 unverified다.
