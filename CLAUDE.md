# CLAUDE.md — 탐라인덱스 개발 지시서

제주 부동산 유튜브 매물 영상을 **수집 → 자막 → 표준 구조화 → 지오코딩 → 검수 → 게시**해 지도·검색으로 일원화하는 웹앱. 공개(사용자)·어드민(운영) 2영역, 중개사 포털은 2차.

문서는 4개뿐: 이 파일 · `SPEC.md`(제품/UX) · `DATA-AND-API.md`(데이터/API/설정) · `EXTRACTION-PROMPT.md`(자막→JSON, 사업 핵심). 작업 전 4개 다 읽는다.

## 골든 룰 (위반 금지)
1. **단계별로 짓는다.** 아래 빌드플랜 순서대로, 각 태스크 DoD를 통과해야 다음으로. 전체를 한 번에 생성 금지.
2. **추측 금지.** 스펙에 없는 결정은 문서에서 근거를 찾고, 없으면 멈춰 질문(특히 §오픈 퀘스천).
3. **Phase 0 먼저.** 추출 정확도(가격·위치 ≥ 90%)가 통과되기 전엔 MVP 본구현 금지.
4. **외부 API 응답 필드는 가정 말고 실응답 1회 로깅 후 매핑**(DATA-AND-API의 형태는 예상치). 모든 외부 IO는 zod 검증.
5. **시크릿 하드코딩·커밋 금지.** 전부 env.
6. **저작권/ToS**: 영상은 임베드만(다운로드·재호스팅 금지), rawTranscript는 캐시·만료(구조화 결과만 보관), 옵트아웃 videoId/channelId는 재수집 제외.
7. **비용 가드**: SocialKit·LLM·지오코딩에 상한·backoff 재시도·중복차단(videoId unique).

## 스택 (고정)
Next.js(App Router, TS) @ Vercel · Firebase(Firestore·Auth·Functions·Storage) · 카카오맵(지도·지오코딩) · SocialKit(검색·자막) · Claude `claude-sonnet-4-6`(tool use 구조화) · Tailwind. pnpm, Node 20+.

## 레포 구조
```
CLAUDE.md  SPEC.md  DATA-AND-API.md  EXTRACTION-PROMPT.md
.env.example  firebase.json  firestore.rules  firestore.indexes.json   # DATA-AND-API의 코드블록으로 생성
app/(public)/  app/admin/  app/api/        # Next App Router
components/  lib/  functions/  scripts/
```

## 빌드 플랜 (이 순서로, 태스크 단위 커밋)

**Phase 0 — 정확도 게이트 (먼저!)**
- **T0** `scripts/phase0-poc.ts`: 골든셋 30~50건 → 자막(SocialKit) → 구조화(EXTRACTION-PROMPT, tool use) → 채점. DoD: `pnpm poc`로 필드별/종합 정확도 출력, **종합·가격·위치 ≥ 90%**. 미달 시 프롬프트 보강 반복, 통과 전 Phase 1 금지. (Firebase/Next 불필요, 키만 있으면 단독 실행)

**Phase 1 — MVP**
- **T1 셋업**: Next+Tailwind(토큰)+strict+`.env.example`. DoD: dev/build/lint/typecheck 통과.
- **T2 Firebase**: client/admin SDK(`lib/firebase`), 에뮬레이터, rules·indexes 배치, `lib/types.ts`(DATA-AND-API 그대로). DoD: 에뮬레이터 기동·타입 컴파일.
- **T3 인증**: Auth + custom claims role, `app/admin/**` 가드. DoD: editor만 admin, 비로그인 my 차단.
- **T4 외부 클라**: `lib/socialkit.ts`/`lib/kakao.ts`/`lib/claude.ts`(+폴백). dev는 시드. DoD: 각 호출 동작+zod+backoff.
- **T5 워커/큐**: `functions/` collect(검색→중복·옵트아웃 스킵→Tasks) + worker(자막→구조화→지오코딩→썸네일→draft 저장)+collectionJobs. DoD: 시드 N건 draft 생성, 한 건 실패가 전체 중단 안 함.
- **T6 크론**: Scheduled(매일 08:00 KST), 키워드세트×지역×직전 48h, 비용 가드. DoD: 크론 경로·중복차단 검증.
- **T7 어드민 수집 콘솔** (`app/admin/collect`): 기간·지역·수집 버튼·실시간 로그·재시도. DoD: 수집→로그→draft.
- **T8 어드민 검수 큐 ★** (`app/admin/review`): 썸네일+필드+AI/폴백 배지+confidence, 인라인 수정, 핀 드래그 보정, 승인·게시/반려, 배치, 신뢰도 정렬, 필수필드 게이트. DoD: 수정→승인 시 published 전이, verified·필수필드 게이트 동작.
- **T9 게시·중개사 관리**: 옵트아웃(즉시 takedown+optOutList), verified 토글. DoD: 옵트아웃 후 공개 제거+재수집 제외.
- **T10 지도 홈** (`app/(public)`): 카카오맵, 핀·클러스터, draw search(geohash bbox), 미니카드. DoD: published만 표시, 영역 필터.
- **T11 검색·정렬·필터** (`/search`): `lib/search.ts` 쿼리빌더, 정렬 6종, 필터, 무한스크롤, 지도↔리스트 연동. DoD: 정렬·필터·키워드(array-contains) 동작, 인덱스 에러 없음.
- **T12 상세** (`/listing/[id]`): 임베드+표준필드+지도+중개사 소개+원격임장 CTA+찜. DoD: 게시물 렌더, 찜(Auth), 비공개 차단.
- **T13 마이**: 저장검색+알림주기, 찜 가격추적, 알림함, `POST /api/alerts/run`(신규/가격인하). DoD: 매칭 알림 생성.
- **T14 테마 컬렉션 + 마감**: themes 큐레이션, 반응형/접근성/빈상태·에러 카피, 비용가드, 배포(Vercel+Functions+인덱스). DoD: 전역 DoD 충족, 스모크 테스트.

**Phase 2 (게이트 후 보류)**: 원격 임장 운영, 중개사 셀프 포털·verified 실검증, 수익화(유료노출·리드), 외부검색엔진(Algolia/Typesense), 자연어 검색 고도화.

## 전역 DoD
타입체크·린트 통과, 핵심 경로 최소 테스트, `.env.example` 갱신, 문서와 불일치 없음, 모바일 반응형·키보드 포커스.

## 명령어
```
pnpm dev | build | lint | typecheck
pnpm poc            # Phase 0 정확도
pnpm fb:emulate     # Firestore/Functions 에뮬레이터
pnpm fb:deploy      # 함수·규칙·인덱스 배포
```

## 오픈 퀘스천 (임의 결정 금지 — 닿으면 질문)
- 수집 범위: 제주 전역 vs 애월·조천 집중
- 자연어 검색 Phase 1 포함 여부
- 원격 임장 운영 주체(직접 중개 vs 연결)
- `verified` 검증 수준(자율신고 vs 등록번호 실검증)
