# Phase 0 — 정확도 게이트 (T0)

추출 정확도(종합·가격·위치 ≥ 90%)가 통과되기 전엔 MVP 본구현 금지. (CLAUDE.md 골든룰 #3)

## 실행

```bash
pnpm install
cp .env.example .env   # 키 채우기 (ANTHROPIC_API_KEY, SOCIALKIT_ACCESS_KEY)

pnpm poc               # 실제 골든셋(scripts/golden-set.json) 채점
pnpm poc -- --fixtures # 합성 픽스처(scripts/golden-fixtures.json)로 하니스 자가검증
```

키가 없거나 `USE_MOCK_SOURCES=true`면:
- 자막: 픽스처의 `mockTranscript` 사용(실 골든셋엔 mockTranscript 없음 → SocialKit 필요).
- `ANTHROPIC_API_KEY` 없으면 LLM 대신 폴백 추출기로 채점(정확도 낮게 측정됨 — 하니스 동작 확인용).

## 골든셋 채우기 (`scripts/golden-set.json`)

제주 부동산 유튜브 매물 영상 **30~50건**(유형·거래 혼합)을 사람이 직접 확인해 truth 라벨링.
SocialKit으로 자막을 가져오므로 `mockTranscript`는 불필요.

### 후보 자동 수집 (SocialKit 검색)

```bash
pnpm collect:candidates                          # .env.local 의 CRON_KEYWORD_SET 사용
pnpm collect:candidates -- "애월 단독주택" "조천 토지"  # 키워드 직접 지정
```

산출물:
- `scripts/candidates.json` — 중복 제거된 원시 후보(videoId·제목·채널·URL).
- `scripts/golden-set.skeleton.json` — meta 자동 채움 + truth 빈칸. **영상 확인 후 truth 를 채워** 30~50건을 `golden-set.json` 으로 옮긴다(각 항목의 `_TODO` 줄은 삭제).

> regionHint·region 추정값은 라벨러 보조일 뿐 정답이 아니다. 반드시 영상으로 확정한다.

```jsonc
[
  {
    "videoId": "유튜브_영상_ID",
    "meta": { "channelName": "채널명", "videoTitle": "영상 제목", "regionHint": "제주시 애월읍" },
    "truth": {
      "priceManwon": 68000,           // 만원 정수, 정확 일치 판정
      "areaPyeong": 30,               // ±2평 판정
      "region": "제주시 애월읍",        // 읍면동 일치 판정
      "zoning": null,                 // 일치(또는 둘 다 null)
      "propertyType": "단독주택",       // enum 일치
      "dealType": "매매"               // enum 일치
    }
  }
]
```

## 채점 (EXTRACTION-PROMPT.md §채점)

| 필드 | 판정 |
|---|---|
| priceManwon | 정확 일치 |
| areaPyeong | ±2평 |
| region | 읍면동 일치 |
| zoning | 일치(또는 둘 다 null) |
| propertyType / dealType | enum 일치 |

종합 = 6필드 평균. **게이트: 종합·가격·위치 각 ≥ 90% + 자막 추출 성공 ≥ 90%.**
미달 시 오류 케이스로 `EXTRACTION-PROMPT.md` 규칙 보강 후 재측정.
