# 전남열쇠 Claude 인계

## 먼저 읽을 내용
이 묶음은 전남열쇠 홈페이지의 수정 가능한 원본 소스입니다. 2026-11-16에 Sites 저장소에서 읽기 전용으로 회수했습니다. 기존 사이트를 새로 만드는 대신 이 코드를 이어서 수정하세요.

- 운영 주소: https://jeonnamlock.com
- 이 원본: 저장본 v27, 커밋 36c91461f4195058a7dc65079198d65d40367d5f
- 현재 배포 확인본: v26, 커밋 8249ae9e6d079ed3b3782dcd6a0602a0d5e7cf0d (2026-11-13 배포 성공)
- v27은 제품 문의 기능까지 구현·저장됐지만 공개 배포 승인이 거부되어 운영 미반영입니다. 이 파일을 제공하는 것은 새 배포 승인이 아닙니다.

## 실행
Node.js 24 이상을 사용합니다. package.json은 pnpm 11.19.0을 지정합니다.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

개발 주소는 http://127.0.0.1:4173 입니다. 앱 실행·테스트·빌드 자체는 Node 내장 모듈을 사용하며, Drizzle 도구 의존성은 drizzle-kit 0.31.4 / drizzle-orm 0.44.5입니다. 이 복구 환경에서는 Node 24.22.1로 `npm test` 73/73 통과 및 `npm run build` 성공을 확인했습니다. 새 기기 브라우저/모바일 실기기 검증은 별도입니다.

## 파일 안내
- dist/: 편집 대상 HTML/CSS/브라우저 JS와 제품 이미지 등 원본 정적 자산. 일반적인 빌드 산출물로 오해해 삭제하지 마세요.
- src/worker.mjs: Cloudflare Workers API, 접수와 관리자 처리
- src/db.mjs, src/analytics.mjs, src/push.mjs: DB, 방문 통계, Web Push
- src/catalog*.mjs 및 scripts/catalog.mjs: 제품 카탈로그
- scripts/build.mjs: 단일 Worker 빌드
- preview-server.mjs, scripts/local-adapters.mjs: 로컬 미리보기와 SQLite/파일 어댑터
- db/schema.ts, drizzle/: DB 스키마와 마이그레이션
- tests/: 회귀 테스트
- docs/: 디자인 및 제품 사진 출처, 제품 문의 설계·구현 계획
- .env.example: 개발 전용 예시. 운영 비밀값 없음
- .openai/hosting.json: 기존 Sites 프로젝트 연결과 DB/BUCKET 바인딩 이름

## 현재 기능과 최근 변경
고객용 제품 소개와 상담 요청, 관리자 접수함/사진 조회/상태 변경, 방문 통계, 무료 Web Push가 있습니다. 결제·온라인 주문·확정 견적 서비스가 아닙니다.
v26은 예전 chatgpt.site 주소로 접속한 고객을 공식 도메인으로 301 이동시켜 상담 제출 원점 불일치 403을 방지했습니다. 관리자/API 보안 제한은 유지합니다.
v27은 선택 제품의 사진·이름과 선택 취소, 서버 검증한 제품 ID/이름/사진 저장, 관리자 목록·상세 제품 카드 표시를 추가했습니다. 일반 알림에는 고객정보를 넣지 않습니다.

## 운영 연결 주의
운영은 Sites + Cloudflare Workers, D1(DB), 비공개 R2(BUCKET) 구조입니다. ADMIN_USER_IDS는 플랫폼이 주입한 oai-authenticated-user-id를 검사합니다. Claude나 다른 호스팅으로 옮기면 로그인·관리자 인증을 별도로 설계해야 하며 브라우저가 보낸 헤더를 신뢰하면 안 됩니다. 로컬 모의 로그인을 운영에 배포하지 마세요.
필요 변수: SITE_ORIGIN, ADMIN_USER_IDS, RATE_LIMIT_SALT, CONFIG_ENCRYPTION_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK. 운영 값·관리자 ID 목록·비밀키는 이 묶음에 포함하지 않았습니다. 기존 암호화 키를 바꾸면 푸시 구독 복호화에 문제가 생길 수 있습니다. D1/R2 운영 고객 데이터, 사진 업로드, 기존 푸시 구독, DB 덤프는 미포함입니다. 따라서 소스 ZIP만 다른 서버에 올린다고 기존 운영 데이터와 알림이 이전되는 것은 아닙니다.
운영 SQL은 과거 마이그레이션을 수정하지 말고 신규 마이그레이션을 추가하세요. 배포 아카이브에는 .openai/drizzle/ 마이그레이션 전달이 필요합니다. 현재 원본의 build 스크립트만으로 운영 이전을 완료했다고 판단하지 마세요.

## 문서의 오래된 설명
기존 README 일부는 예전 주소 및 문 사진 필수 설명을 남기고 있습니다. 공식 주소는 jeonnamlock.com이고 최근 로컬 검증에서는 사진 없이 상담 접수가 가능했습니다. 현재 코드와 tests를 우선 확인하고 README의 오래된 문구를 무조건 구현 요구사항으로 삼지 마세요.

## Claude에 줄 요청
이 저장소와 CLAUDE_HANDOFF.md를 먼저 읽고 현재 동작과 v26/v27 차이를 이해해라. 새 디자인으로 처음부터 다시 만들지 말고 사용자가 요청한 변경만 적용해라. 비밀키·운영 고객 데이터는 요구하거나 코드에 넣지 말고 안전한 환경 설정으로 분리해라. 테스트와 빌드를 실행하고 결과를 보고해라. 배포·도메인 변경·DB 데이터 변경·고객 알림 발송은 별도 사용자 승인 전 수행하지 마라. v27을 이미 운영 중이라고 표현하지 마라.

## 2026-11-17 이후 저장본 변경 (운영 미배포)
첫 화면 스크롤 연출(dist/intro.*)과 가격문의 채팅(dist/chat.*, src/chat.mjs, src/prices.mjs, POST /api/chat)을 추가했습니다. 선택 환경변수 ANTHROPIC_API_KEY, CHAT_MODEL이 생겼습니다. 자세한 내용은 README의 해당 절을 보세요. 운영 배포는 사용자 승인 전입니다.
공급처 키뉴스쇼핑몰(keynews.co.kr)의 판매중 디지털 도어락 중 카탈로그에 없던 69개 모델과 사진 116장을 src/catalog-keynews.mjs로 추가했습니다(총 432개 상품, 17개 브랜드). 사진 사용은 소유자의 허락 보고에 근거하며 docs/product-photo-permission.md#keynews-confirmation-2026-11-17과 docs/keynews-inventory.md에 기록했습니다. 빌드한 Worker는 gzip 약 9.9MB로 커졌으니 배포 한도를 확인하세요.
이후 소유자 요청으로 카탈로그를 키뉴스 판매중 모델과 아카라로 제한했습니다(140개 상품, src/catalog.mjs의 필터와 keynewsListedIds). 숨긴 293개 모델의 데이터와 사진은 저장소에 남아 있습니다.

## 호스팅 전환 (2026-11-17)
소유자가 ChatGPT Sites 대신 GitHub + Render를 쓰기로 했습니다. README의 "호스팅: Render + GitHub" 절을 먼저 읽으세요. 위쪽의 Sites 관련 설명(oai-authenticated-user-id, .openai/drizzle 전달 등)은 이전 환경 기록입니다.
