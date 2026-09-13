# Orbit Defender 테스트 계획

## 1. 범위와 검토

05-01에서 고정 안내의 전체 절차와 AGENTS·PRD·TRD·구현 계획, 현재 Node/Playwright 테스트의 실제 assertion을 읽고 사용자 위임으로 아래 계획을 채택했다. 기준 코드는 759e064711e0702b29b305929a8a406a3e59c436이다.

이 문서는 방법과 기대 결과다. 실제 실행 결과는 TEST_RESULTS.md에 별도로 기록한다. 테스트 코드·제품 수정은 이 단계에서 하지 않고, 누락이나 실패는 05-02에서 재현·보완한다. 최초 범위는 REQ-01~08이며 P·난이도·목숨은 후속 단계다.

## 2. 요구사항별 검사

Node 연결은 tests/game.test.js, 브라우저 연결은 e2e/game.spec.js의 테스트 제목을 기준으로 한다. 아래 제목은 해당 파일에서 식별 가능한 부분 문자열이다.

| TC | REQ | 방법·현재 검사 연결 | 전제·입력·절차 | 기대 결과·현재 누락 |
|---|---|---|---|---|
| TC-01 | REQ-01 | Node `title, explicit start`; Playwright `semantic title`, `Start button`, 승패 재시작 검사 | 새 title에서 Enter 및 시작 버튼 각각 실행 | playing, 점수 0. 두 시작 경로 존재 |
| TC-02 | REQ-01/02/03 | Node title 검사; Playwright `inactive keys`, `title-held input` | title에서 R·방향키·Space, 유지한 채 시작 및 반복 keydown | title에서 이동·발사 없음. 시작 후 이전 키가 새 판에 누출되지 않음 |
| TC-03 | REQ-02 | Node `speed, bounds`; Playwright `real direction/A/D` | playing에서 오른쪽 0.5초, 각 방향키와 A/D | 모델 x=540, y=550. 브라우저는 320px/s와 고정 스텝·래스터 오차 범위 일치 |
| TC-04 | REQ-02 | 같은 이동 검사 | 좌우 끝까지 충분히 이동, 양 방향 동시 입력 | x=0/760 경계 유지, 동시 입력 정지 |
| TC-05 | REQ-02/03 | Playwright `blur / hidden events` | 이동·발사 중 blur/visibility 이벤트 후 긴 시간 경과·복귀 | held keys 해제, 잔류 이동·발사와 큰 시간 점프 없음. OS 실제 포커스 조작은 별도 |
| TC-06 | REQ-03 | Node `immediate shot exact spawn` | 새 playing에서 dt=0에 fire, 이어서 0.1초 | 탄환 좌상단 (398,538), 크기 4×12, 0.1초 후 y478 |
| TC-07 | REQ-03 | Node `held fire has no shot before 0.2`; Playwright `held Space` | 첫 발사 뒤 23/120초·24/120초, Space 유지·반복 keydown | 0.2초 미만 추가 발사 없음, 경계에서 발사. 반복 이벤트로 가속되지 않음 |
| TC-08 | REQ-03 | Node `bullet bottom just above`; Playwright held Space | 탄환 하단을 0 직전·정확히 0·음수로 구성, 발사 후 대기 | 화면에 남은 탄환 유지, 하단<=0 제거 |
| TC-09 | REQ-04 | Node `exactly 3×8`; Playwright 실제 플레이 | 초기 적의 모든 좌표·크기 확인, 1초 진행 | 24개, PRD 좌표, 첫 적 x176, 오른쪽 64px/s |
| TC-10 | REQ-04 | Node `exact boundary`, `before / beyond boundary` | 양쪽 경계 직전·도달·초과, 생존 적 하나의 외곽으로 진행 | 화면 안에서 한 번 반전·24px 하강, 이후 반복 하강 없음 |
| TC-11 | REQ-05 | Node `strict area overlap`; Playwright `actual held Space hits` | 네 변 접촉·빗나감·작은 면적 겹침, 실제 Space 명중 | 접촉 비충돌, 겹침 명중. 실제 DOM 점수가 10의 배수로 증가 |
| TC-12 | REQ-05 | Node `one bullet removes at most one`, `multiple bullets cannot score` | 한 탄환·여러 적, 여러 탄환·한 적, 전체 24개 명중 fixture | 탄환당 최대 한 적, 같은 적 점수 한 번, 전체 240점 |
| TC-13 | REQ-06 | Node `bottom below / exactly at / above 520`, `collision precedes defeat` | dt=0에서 적 하단519.999/520/520.001, 마지막 적 명중과 다른 생존 적 도달 | 520부터 lost. 충돌 후 생존 적만 판정하고 lost 검사 후 won |
| TC-14 | REQ-06 | Node `complete no-input round`; Playwright `natural no-shoot defeat`, `real movement and firing` | 실제 Enter 시작 후 무발사 55초, 별도 판은 Space와 1초 간격 좌우 입력 | 자연 패배와 실제 조작 240점 승리. 브라우저 상태 주입 없음 |
| TC-15 | REQ-06 | Node `both endings freeze`; Playwright 승패 후 공통 검사 | won/lost에서 Enter·P·방향키·Space와 추가 시간 | 위치·탄환·적·점수·상태 고정 |
| TC-16 | REQ-07 | Node `both endings freeze all state and restart`; Playwright 승리/패배 × key/button | 양쪽 종료에서 R/재시작 버튼, 이전 키 유지·새 입력 | 위치·적24개·점수0·방향·탄환·대기시간·입력 초기화, 첫 발사 즉시 |
| TC-17 | REQ-07/02 | Playwright 이동 검사; Node 시작 검사 | playing 중 Enter/R | 현재 판 유지. 잘못된 상태의 초기화 없음 |
| TC-18 | REQ-07 | 수동 후보/자동화 누락 | 10회 연속 자연 패배→R/버튼 재시작, 매 판 같은 시간 이동량·발사 수·상태 비교 | RAF·리스너 중복 없이 속도 유지. 현재 개별 재시작만 있으며 전용 10회 검사는 미구현 |
| TC-19 | REQ-08 | Node `original scripts`, `source exposes no`, `production uses relative`; Playwright `built game runs at repository subpath` | manifest/lock·메모리 빌드, 4173의 /space-Invaders-demo01/ 실제 dist 로드·Space | 상대 JS/CSS, 외부 요청·개발 API·문서 부재, DOM 점수·버튼, 404·콘솔 오류 없음 |
| TC-20 | REQ-08 | Playwright `responsive Canvas`, `native button`, `missing Canvas context` | 좁은 화면, 키보드 버튼·네이티브 컨트롤, Canvas 실패 주입 | 논리 800×600·가로 넘침 없음, 기본 키 조작 보존, 실패 시 한국어 오류와 입력 차단 |
| TC-21 | REQ-01~08 | 실제 사람 관찰 후보 | preview4173에서 시작·이동·발사·승패·재시작 직접 플레이 | 사람의 체감·시각 관찰. 자동 브라우저와 구분하고 실제 보고 없으면 미확인 |
| TC-22 | REQ-08 | 06단계 실제 Pages 확인 예정 | 실제 Actions SHA·page_url에서 새로고침·네트워크·게임 조작 | 공개 배포와 하위 경로 정상. 현재 미배포이므로 로컬 결과로 대체하지 않음 |

## 3. 실행 순서와 증거

먼저 현재 SHA·변경 목록·Windows/Node/npm/Playwright/Chromium 버전, manifest의 정확한 테스트 선택자와 잠금 파일을 확인한다. 필요한 의존성 복원은 npm ci이며 기존 설치가 유효하면 불필요한 재설치를 하지 않는다. 브라우저가 없다는 실패가 발생할 때만 설치된 Playwright로 Chromium을 설치하고 실패·복구 기록을 모두 남긴다.

실행은 npm test → npm run test:e2e → npm run build 순서다. E2E는 Chromium 프로젝트와 127.0.0.1:5173 개발 서버 및 별도 4173 빌드 preview를 관리하며 기존 서버를 재사용하거나 강제 종료하지 않는다.

별도 preview 명령은 npm run preview -- --host 127.0.0.1 --port 4173 --strictPort다. 실제 응답을 확인한 뒤 사용자 입력 기반 브라우저 관찰을 수행하고 이 세션 프로세스만 종료한다. 루트 preview는 하위 경로 증거가 아니며 TC-19의 별도 배포형 E2E와 구분한다.

TEST_RESULTS에는 실행 시각·대상 SHA/미커밋 파일·명령 종료 상태·TC별 실제 assertion을 연결한다. 결과는 pass/fail/unverified, 미실행·환경 차단은 실행상태/사유로 분리한다. 원문 로그의 개인 경로·토큰이나 자동 생성 보고서를 공개 커밋에 포함하지 않는다.
