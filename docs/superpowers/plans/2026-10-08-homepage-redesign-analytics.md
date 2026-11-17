# 전남열쇠 홈페이지 개편 · 방문 통계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 고객 접수·알림 기능을 보존하며 Lovable와 Figma를 거쳐 홈페이지를 개편하고 사장님에게 한국 시간 기준 시간별 방문 통계를 제공한다.

**Architecture:** 기존 HTML/CSS/JavaScript와 Cloudflare Worker를 유지한다. 독립 수집 스크립트와 D1 통계 모듈을 추가하고 기존 관리자 인증으로 통계 조회를 보호한다. 시각 초안과 편집 가능한 Figma 원본을 완성한 다음 운영 코드에 적용한다.

**Tech Stack:** Node.js 24+, pnpm 11, ES modules, HTML/CSS, Cloudflare Workers, D1(SQLite)/Drizzle, 기존 R2/Web Push, Lovable, Figma.

**Spec:** `docs/superpowers/specs/2026-10-08-homepage-redesign-analytics-design.md` — 2026-10-08 사용자 승인.

## Global Constraints

- 운영 주소: `https://jeonnam-lock-studio.hskim3514253.chatgpt.site/`.
- Sites 프로젝트: `appgprj_6aba2c6a4514819191c9dab01067bd47`. 같은 프로젝트와 기존 공개 범위를 유지한다.
- 지정 제품 설치비 포함 가격: 현관정 60,000원 / 보조키 120,000원 / 손잡이형 주키 150,000원 / 푸시풀 220,000원 / 푸시풀 지문 250,000원. 해당 제품 타공 시 10,000원 추가.
- 다른 제품의 사진 견적은 가격표와 별개이며 자동 확정 금액을 표시하지 않는다.
- 기존 `/admin`, `/admin#notifications`, 견적·비공개 사진·권한·알림·SEO를 유지한다. 기존 데이터와 비밀값을 교체하지 않는다.
- 모든 날짜는 `Asia/Seoul`. 서버 수신 시각을 사용한다. 최근 90일, 적용 이후의 기록만 제공한다.
- 방문자는 브라우저 추정치다. 하루와 시간별로 각각 중복을 제거한다. 조회 수는 재표시를 포함한다.
- 통계에는 고객 정보, 사진, 원시 IP, 전체 User-Agent, URL 쿼리 문자열을 저장하지 않는다.
- 기존 `lock-desk`와 바탕화면 바로가기는 변경하지 않는다. Lovable 초안을 별도 운영 사이트로 공개하지 않는다.
- 런타임에 새 유료 분석 서비스나 별도 프레임워크를 도입하지 않는다.

## Review Focus

1. 자정 직전 요청의 재시도가 자정 이후 도착해도 이벤트 ID가 같으면 중복 조회를 만들지 않아야 한다. Task 3의 교차 날짜 재시도 테스트로 고정한다.
2. 최초 방문의 여러 탭·쿠키 차단에서는 방문자 추정에 오차가 생길 수 있으나 오류가 견적 제출로 전파되어서는 안 된다. Task 3의 손상 쿠키 테스트와 Task 5의 차단·다중 탭 검증으로 확인한다.
3. 잘못된 날짜, 미래, 보관 범위 밖, 수집 전 날짜, 미래 시간은 서로 구분돼야 한다. Task 3의 조회 계약 테스트와 Task 4의 화면 검증으로 확인한다.
4. 비관리자·로그아웃 상태에서 URL을 직접 열거나 통계 API를 호출해도 수치를 읽을 수 없어야 한다. Task 3의 권한 테스트와 Task 4의 진입 검증으로 확인한다.
5. 통계 요청 지연·실패, BFCache 복원, 모바일 하단 버튼은 기존 견적 단계와 접수를 방해하지 않아야 한다. Task 5의 실제 브라우저 오류·복원·모바일 검증으로 확인한다.

## 파일 경계

| 파일 | 책임 |
| --- | --- |
| `docs/design/2026-10-redesign-handoff.md` | Lovable/Figma URL, 도구 결과·검증, 화면·토큰 대응표 |
| `dist/index.html`, `dist/styles.css`, `dist/pricing.css` | 고객 홈페이지와 기존 가격·견적 UI |
| `dist/analytics.js` | 공개 홈 문서 표시 이벤트만 비차단 전송 |
| `dist/admin-analytics.js`, `dist/analytics.css` | 통계 렌더링·날짜 선택·상태 표시 |
| `dist/admin.html`, `dist/admin.js` | 기존 관리자 탭에 통계 통합 |
| `src/analytics.mjs` | 한국 시간, 익명 쿠키, 수집 검증·저장, 집계·정리 |
| `src/worker.mjs` | 공개 수집/관리자 조회 라우팅과 기존 권한 적용 |
| `db/schema.ts`, 새 `drizzle/*.sql` | 추가 테이블·인덱스와 마이그레이션 |
| `scripts/build.mjs`, `package.json` | 새 자산·모듈과 테스트 명령 등록 |
| `tests/analytics.test.mjs` | 실제 로컬 SQLite를 쓰는 통계·권한·실패 테스트 |
| `dist/privacy.html`, `README.md` | 실제 수집 방식·운영 안내 |

## 실행 전 준비

- [ ] 계획 승인과 실행 방식 선택을 받은 뒤 해당 실행 스킬을 읽는다. 격리가 필요하면 `using-git-worktrees`와 Sites의 현재 체크아웃 규칙에 따라 이 설계·계획 커밋을 포함하는 작업 공간을 준비한다. 사용자의 다른 변경을 덮어쓰지 않는다.
- [ ] Sites building/hosting 지침을 읽고 같은 프로젝트의 현재 상태·공개 범위를 확인한다. 기존 Site의 소스 열기 절차를 수행하고 반환된 체크아웃을 사용한다. 새로운 Site를 등록하지 않는다.
- [ ] 기존 테스트 `node --test tests/backend.test.mjs`를 실행해 기준 상태를 기록한다. 운영 DB·고객 기록·비밀값을 시험 데이터로 사용하지 않는다.
- [ ] 현재 `dist`의 HTML·CSS·JS는 추적되는 원본이며 `dist/server`만 빌드 결과임을 보존한다. 설치가 필요하면 기존 잠금 파일과 공식 설치 도구를 사용한다.

## Task 1: Lovable 디자인 초안

**Files:** Create `docs/design/2026-10-redesign-handoff.md`.

**Interfaces:** 입력은 승인된 설계의 공개 정보와 가격·화면 구성. 출력은 기존과 연결되지 않은 시각 초안의 정확한 프로젝트 ID, 편집 URL, 미리보기 URL, 확인한 커밋과 디자인 판단이다.

- [ ] 현재 대화에 이 작업의 Lovable 프로젝트가 만들어졌는지 확인해 재사용한다. 없을 때만 연결된 워크스페이스 `d2b73665ba2ee80ade6e`에서 `create_project(wait:false)`를 한 번 호출한다. 프롬프트에 아이보리·네이비, 한글, 모바일, 가격표와 별도 견적, 가짜 후기 금지, 프런트엔드 초안만 제작, 운영 DB 연결·공개 배포 금지를 명시한다.
- [ ] 반환된 프로젝트 ID로 진행 위젯을 보여주고 `get_message`의 **response.status**로 완료를 확인한다. `awaiting_input`은 실제 사용자 결정을 요청하며 임의 승인하지 않는다. 프로젝트 생성 완료를 디자인 작업 완료로 오인하지 않는다.
- [ ] 초안의 데스크톱·모바일 화면과 파일을 읽고 가격·문구·레이아웃을 검토한다. 허구의 별점·실적·고객 후기와 가격 자동 확정 동작을 제거하도록 초안 도구에 수정 요청한다.
- [ ] 결과 URL과 채택할 레이아웃·타이포·색상·버튼 규칙을 handoff 문서에 기록한다. 제품 프롬프트나 내부 키 대신 검토 가능한 결과만 저장한다.
- [ ] **검증:** 1440px과 390px에서 가격 조건, 두 상담 버튼, 3단계 견적 흐름이 보이고 가로 넘침이 없어야 한다. 확인된 결과를 문서에 남기고 이 문서만 커밋한다.

## Task 2: Figma 디자인 원본

**Files:** Update `docs/design/2026-10-redesign-handoff.md`.

**Interfaces:** Task 1의 검증된 Lovable 초안과 토큰을 소비한다. 출력은 편집 가능한 Figma 파일 URL과 데스크톱·모바일·통계 화면 노드, 재사용 가능한 규칙이다.

- [ ] `figma-create-new-file`, `figma-use`, `figma-generate-design` 등 실제 작업에 필요한 스킬을 읽는다. 이번 작업 파일이 없을 때만 연결된 유일한 팀에서 파일을 생성한다. 도구가 반환한 파일 키만 사용한다. 권한 제한이 나면 실제 이유를 확인하고 사용자에게 해결이 필요한 내용을 알린다.
- [ ] Lovable 초안을 바탕으로 고객 홈 1440px/390px, 관리자 통계 1440px/390px 프레임을 만든다. 웹 캡처 방식은 Figma 스킬 규칙을 따르며, 화면을 단일 비트맵으로만 구성하지 않는다.
- [ ] 한국어 글꼴, 색상·간격·글자 스타일, 버튼·입력창·가격 행·통계 카드 규칙을 정의한다. 텍스트·도형·레이아웃은 편집 가능하게 한다. 샘플 차트에는 반드시 ‘디자인 예시’라고 표시한다.
- [ ] 프레임을 렌더링해 겹침·잘림·한글 줄바꿈을 수정한다. 링크와 노드 ID, 실제 사용한 토큰, 확인 이미지를 handoff 문서에 기록하고 커밋한다.
- [ ] **검증:** 네 화면과 공통 규칙을 사용자에게 열어줄 수 있어야 하며 고객 개인정보가 없어야 한다. 도구 제한으로 빠진 산출물을 완료로 표시하지 않는다.

## Task 3: 방문 수집·집계 서버

**Files:** Create `src/analytics.mjs`, `tests/analytics.test.mjs`; modify `src/worker.mjs`, `db/schema.ts`, `package.json`, `scripts/build.mjs`; generate one new Drizzle migration.

**Interfaces:**
- `analyticsBucket(nowMs)` → `{date: 'YYYY-MM-DD', hour: 0..23, nextMidnightMs: number}`.
- `recordPageview(request, {db, salt, nowMs, isAdmin})` → `Promise<Response>`; 정상·중복·관리자 제외·봇 제외는 204, 잘못된 입력은 400/403/413, 요청 한도 초과는 429.
- `readAnalytics(db, date, nowMs)` → `Promise<{date,timeZone,collectionStartedAt,asOf,status,daily,hours}>`; `date`는 ISO 날짜 문자열 또는 생략(서버 기준 오늘), `status`는 `collected | before_collection`, `daily`는 `{visitors,pageviews}`, `hours`는 `{hour,visitors,pageviews,pending}` 24개.
- `POST /api/analytics/pageview`, JSON `{eventId: UUID}`; `GET /api/admin/analytics?date=YYYY-MM-DD`. 첫 조회는 날짜 쿼리를 생략해 서버가 오늘을 결정한다.

- [ ] **RED:** 실제 SQLite 어댑터와 `createWorker`를 사용하는 테스트를 작성한다. 아래 핵심 단언과 함께 이벤트 재시도·쿠키 변조·무권한·외부 출처·큰 본문·봇·관리자 제외·손실된 R2·보관 정리·동시 중복을 검사한다.

```js
assert.equal(analyticsBucket(Date.parse('2026-10-07T14:59:59.999Z')).date, '2026-10-07');
assert.equal(analyticsBucket(Date.parse('2026-10-07T15:00:00.000Z')).hour, 0);
// A:10시에 2회, 11시에 1회 / B:11시에 1회
assert.deepEqual(summary.daily, {visitors: 2, pageviews: 4});
assert.deepEqual(summary.hours[10], {hour: 10, visitors: 1, pageviews: 2, pending: false});
assert.deepEqual(summary.hours[11], {hour: 11, visitors: 2, pageviews: 2, pending: false});
assert.equal(summary.hours.length, 24);
```

- [ ] `node --test tests/analytics.test.mjs`로 구현 부재 때문에 실패하는 것을 확인한다. 경계 시간 시험은 함수를 직접 호출하거나 테스트 전용 clock 주입을 사용하고 운영 HTTP에서 시각을 주입할 수 없게 한다.
- [ ] `analytics_events`에 `event_id` PK, `day`, `hour`, `visitor_key`, `received_at`과 날짜·방문자 인덱스를 추가한다. `analytics_state`에 수집 시작 시각과 마지막 정리 날짜를 저장한다. 기존 마이그레이션은 수정하지 않고 Drizzle로 생성 후 SQL을 검토한다.
- [ ] 서버 시간과 서명된 당일 쿠키 `__Host-jn-visit`를 구현한다. `Secure; HttpOnly; SameSite=Lax; Path=/`, 자정 만료, 버전·날짜·임의 UUID·HMAC 서명을 사용한다. `RATE_LIMIT_SALT`에 `analytics-visitor-v1` 용도 구분을 적용하고 저장 키도 당일 해시로 만든다. 손상·만료 쿠키는 새 익명 쿠키로 교체하며 오류를 내지 않는다.
- [ ] 기존 동일 출처 검사를 적용하고 본문을 1KB, 이벤트 UUID v4로 제한한다. 로그인 관리자와 명백한 봇·미리 가져오기 요청은 집계하지 않는다. 요청 제한은 IP 원문을 저장하지 않는 분당 해시 키로 120회이며 기존 제한과 다른 접두어를 쓴다. 헤더가 없는 환경은 그 사실을 숨기지 않고 제한용 공통 키를 쓴다.
- [ ] 유일 이벤트 INSERT와 시작 시각 설정을 원자적으로 처리한다. 같은 ID의 자정 이후 재전송도 원래 기록을 유지한다. 시작 시각은 첫 수집/통계 요청 때 한 번만 생성한다. 비식별 통계 정리는 다음 수집/통계 조회 시 하루 한 번, 오늘을 포함해 90일보다 오래된 날짜에 적용한다.
- [ ] 날짜 검증·24개 구간 채우기·하루 DISTINCT·시간 DISTINCT를 구현한다. 미래 날짜와 90일 범위 밖은 400, 수집 전의 유효 날짜는 `before_collection`. 오늘의 미래 시간만 `pending:true`; 오류 응답을 0명으로 바꾸지 않는다.
- [ ] Worker에서 통계 경로를 기존 R2 가용성 검사와 분리하고 관리자 조회에 `requireAdmin`을 적용한다. 모든 통계 응답은 `no-store`. 빌드에 통계 모듈을 등록하고 테스트 명령에 새 테스트를 포함한다.
- [ ] **GREEN:** `node --test tests/backend.test.mjs tests/analytics.test.mjs` 결과가 모두 통과해야 한다. 실제 고객 데이터 없이 로컬 DB를 닫고 다시 열어도 통계가 유지되는 테스트를 포함한다. 관련 소스·SQL·테스트만 커밋한다.

## Task 4: 관리자 통계 화면

**Files:** Create `dist/admin-analytics.js`, `dist/analytics.css`; modify `dist/admin.html`, `dist/admin.js`, `scripts/build.mjs`.

**Interfaces:** `mountAnalytics({root, api})` → `{open(): Promise<void>, refresh(): Promise<void>}`. `api(path)`는 기존 인증된 JSON 호출기를 사용한다. Task 3의 JSON 계약을 그대로 소비하며 권한을 브라우저 값으로 판정하지 않는다.

- [ ] 먼저 API 계약의 빈 날짜·수집 전·미래 구간·권한 실패 fixture로 화면에서 확인할 상태를 정한다. 실제 운영 수치를 디자인 예시로 대체하지 않는다.
- [ ] Figma 통계 디자인으로 날짜·이전/다음·새로고침, 일 방문자/조회 카드, 24시간 차트와 동등한 표를 구현한다. 기본 날짜와 표시 시각은 서버가 제공한 한국 시간 기준이다. 최근 90일 및 수집 시작일을 날짜 선택 범위에 반영한다.
- [ ] 기존 `showTab`과 hash 전환을 `inbox`, `push`, `analytics`로 확장한다. `#notifications`를 유지하고 `#analytics`는 인증 확인 후 열며 통계는 해당 탭에서 필요할 때만 조회한다. 통계 오류는 통계 패널 안에 표시한다.
- [ ] **검증:** 로컬 브라우저에서 오늘·이전 날짜·0건·수집 전·오류·느린 응답·미래 시간 표시를 확인한다. `#analytics` 직접 진입과 로그아웃 시 가림, 다른 두 탭 동작을 확인한다. 오류 상태에 0명 카드가 남지 않아야 한다.
- [ ] 390px에서 표는 패널 안에서만 스크롤하고 페이지 전체가 가로로 넘치지 않아야 한다. 차트는 키보드/텍스트로도 확인 가능해야 한다. 빌드 자산 목록을 갱신하고 화면 파일을 커밋한다.

## Task 5: 고객 홈페이지와 비차단 수집

**Files:** Create `dist/analytics.js`; modify `dist/index.html`, `dist/styles.css`, `dist/pricing.css`, 필요 시 `dist/app.js`, `dist/privacy.html`, `README.md`, `scripts/build.mjs`.

**Interfaces:** 독립 `analytics.js`는 공개 홈에서만 실행하며 Task 3의 POST API에 UUID 이벤트를 보낸다. 기존 견적 코드의 상태·고객값·사진·전송 Promise에 접근하거나 합류하지 않는다.

- [ ] 승인된 Figma 레이아웃을 기존 정적 페이지에 적용한다. 기존 폼의 ID·name·서비스 값·첨부 슬롯·동의 버전·접수 계약을 유지한다. 공통 CSS 변경이 관리자에 영향을 주면 고객 페이지 아래로 스타일 범위를 제한한다.
- [ ] 전화·사진 견적 CTA, 다섯 가격과 지정 제품·타공·별도 견적 안내, 출처 있는 후기·매장 정보를 적용한다. 네이버 태그·canonical·JSON-LD·robots·사이트맵을 유지하고 실제 홈 변경일만 갱신한다.
- [ ] 수집 스크립트는 첫 visible 표시와 `pageshow.persisted` 재표시에 새 이벤트 ID를 만든다. 초기 `pageshow`와 `visibilitychange`가 연달아 발생해도 한 번만 보낸다. 앵커·폼 단계 전환은 보내지 않는다. 네트워크 예외/5xx 재시도는 같은 ID로 최대 1회, 숨겨진 동안 발생한 재표시는 다음 visible까지 미룬다.
- [ ] 페이지 요청은 `credentials:'same-origin'`, `keepalive:true`로 전송하고 오류는 수집 모듈에서 처리한다. 반복 타이머·화면 클릭 전수 수집·고객 데이터 접근을 추가하지 않는다. 쿠키 차단, 네트워크 차단에서도 고객 UI는 그대로 동작해야 한다.
- [ ] **검증:** 로컬에서 새 표시 1회 → 새로고침 2회 → 앵커/폼 이동은 증가 없음 → 뒤로가기 복원은 1회 증가를 확인한다. 같은 이벤트 재시도는 증가하지 않아야 한다. 다중 탭·손상/차단 쿠키에서도 페이지와 문의가 정상이어야 하며 브라우저 추정 오차 안내가 있어야 한다.
- [ ] 통계 API만 실패·지연시키고 기존 폼으로 시험 사진·필수 정보·동의를 입력해 접수 번호가 나오는지 확인한다. 390px/1440px에서 입력 오류·사진 삭제·이전 단계·성공 화면·모바일 고정 버튼을 점검한다. 시험은 로컬의 식별 가능한 가짜 자료로만 한다.
- [ ] 개인정보 안내에 목적·수집 항목·당일 쿠키·90일 조회/정리·한계를 추가한다. README에 API·검증·운영 기준과 Lovable/Figma 링크를 기록한다. 관련 파일을 커밋한다.

## Task 6: 통합 검증 · 같은 주소 배포

**Files:** Update `docs/design/2026-10-redesign-handoff.md` with verification and release evidence. 배포 파일은 원본에 포함하지 않는다.

- [ ] 모든 작업의 spec 충족 여부와 Review Focus를 다시 확인한다. 선택한 실행 방식의 별도 리뷰에서 발견한 실제 결함을 수정하고 영향받는 테스트를 재실행한다.
- [ ] `node --test tests/backend.test.mjs tests/analytics.test.mjs`, 공식 build helper를 실행한다. 테스트 0실패와 Worker 빌드 성공을 확인한다. 운영 푸시 시험이나 고객 자료 삭제로 검증하지 않는다.
- [ ] 로컬 화면·접수/통계 상태의 검증 결과와 최종 Lovable/Figma 링크를 handoff 문서에 기록한다. `git diff --check`와 변경 파일 목록을 확인한 뒤 마지막 소스를 커밋한다.
- [ ] Sites 공식 workflow로 같은 프로젝트의 소스 저장·빌드 산출물 포장·새 마이그레이션 포함을 처리한다. 자격 증명은 세션 메모리와 표준입력으로만 전달한다. Windows 실행 경로가 부족하면 설치된 공식 런타임/패키저를 사용하며 프로젝트를 새로 만들지 않는다.
- [ ] 사이트의 확인된 현재 공개 범위에 맞는 저장·배포 작업을 사용한다. private 사이트 배포 도구로 공개 사이트를 전환하거나 고객 로그인 요구를 추가하지 않는다. 반환된 버전/배포 ID를 재사용한다.
- [ ] 배포 상태가 성공하고 URL이 반환될 때까지 확인한다. 운영 데이터의 추가 마이그레이션이 실패하면 실패를 보고하고 원인을 해결하며 성공으로 표시하지 않는다.
- [ ] 성공한 홈페이지 URL과 관리자 통계 진입 URL, Lovable/Figma 원본을 사용자에게 전달하고 공개 홈 탭을 재사용해 연다. 통계는 적용 이후부터 수집하며 광고 클릭 수와 같지 않음을 한 문장으로 안내한다. 로컬 임시 서버·미리보기 설정을 정리한다.

## 계획 자체 검토 결과

- 설계의 시각 초안·Figma 관리·기존 기능 보존·통계 정의·데이터 최소화·검증·배포 요구를 Task 1~6에 연결했다.
- 날짜/시간·API 경로·JSON 필드·소스 파일·검증 명령의 명칭을 통일했다.
- 시각 작업은 화면 검증을 사용하고, 집계·보안·중복 방지는 실제 동작 테스트의 RED/GREEN 순서로 검증한다.
- 독립 서비스를 추가하지 않고 기존 사이트의 한 릴리스로 통합하되, 수집·관리 화면·고객 디자인은 구분된 파일과 커밋으로 검토한다.
- 실행 권장: 이 대화에서 직접 구현한 후 마지막에 별도 검토. 기존 견적·알림과 화면의 연결 지점이 많아 한 구현자가 맥락을 유지하는 방식이 적합하다.

상태: **계획 작성·자체 검토 완료. 사용자 계획 검토와 실행 방식 선택 대기.**
