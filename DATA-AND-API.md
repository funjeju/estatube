# DATA-AND-API.md — 데이터 · API · 설정

> 외부 응답 필드는 "예상". 구현 시 실응답 1회 로깅 후 매핑하고 zod 검증(CLAUDE.md 골든룰 4).

## 1. 데이터 흐름
```
Scheduled fn(08:00 KST) → collect(): SocialKit/YouTube search → videoId
  · videoId unique + optOutList 스킵 → Cloud Tasks enqueue (수집은 가볍게)
Task worker(건별·재시도): ①자막(SocialKit) ②구조화(Claude tool use) ③지오코딩(Kakao→geohash)
  ④썸네일 ⑤Firestore draft 저장 + collectionJobs 기록
Admin 검수 → 승인(verified·필수필드 게이트) → published → 공개 프런트(published만)
```
원칙: 수집(가벼움)과 구조화(LLM, 느림/비쌈)를 **큐로 분리**, 멱등+backoff.

## 2. TS 타입 (`lib/types.ts` 그대로)
```ts
export type PropertyType="단독주택"|"토지"|"상가"|"아파트"|"전원주택"|"상가주택"|"빌라"|"기타";
export type DealType="매매"|"전세"|"월세"|"임대"|"경매";
export type ListingStatus="collected"|"structuring"|"draft"|"published"|"rejected"|"opted_out"|"error";
export type Theme="세컨하우스"|"한달살기"|"구옥"|"바다뷰"|"읍면단독"|"급매";

export interface Structured {            // EXTRACTION-PROMPT 산출(save_listing tool)
  propertyType:PropertyType; dealType:DealType;
  priceText:string; priceManwon:number; monthlyRentManwon?:number|null;
  areaM2:number|null; areaPyeong:number|null; zoning:string|null;
  addressText:string|null; region:string;          // "제주시 애월읍"
  summary:string; highlights:string[]; keywords:string[]; themes:Theme[];
  confidence:number;                                // 0~1
}
export interface Listing extends Structured {
  id:string; videoId:string; videoUrl:string; thumbnailUrl:string;
  channelId:string; publishedAt:number; collectedAt:number;
  lat:number|null; lng:number|null; geohash:string|null;
  priceHistory:{manwon:number;at:number}[]; priceDropAt?:number|null;
  extractionSource:"ai"|"fallback"; status:ListingStatus;
  reviewedBy?:string|null; publishedAt2?:number|null; takedownAt?:number|null;
  geoNeedsReview?:boolean; createdAt:number; updatedAt:number;
}
export interface Agent { id:string; channelId:string; channelName:string; channelUrl:string;
  name?:string; regNo?:string; office?:string; expertise?:string; phone?:string;
  verified:boolean; optedOut:boolean; plan:"free"|"featured"|"premium"; createdAt:number; }
export interface SavedSearch { id:string; userId:string; filters:SearchFilters; alertFreq:"instant"|"daily"|"off"; lastNotifiedAt?:number; createdAt:number; }
export interface Favorite { id:string; userId:string; listingId:string; notifyPriceDrop:boolean; savedAt:number; }
export interface AlertItem { id:string; userId:string; type:"new_listing"|"price_drop"|"status_change"; listingId?:string; searchId?:string; read:boolean; sentAt:number; }
export interface SearchFilters {
  region?:string; propertyType?:PropertyType[]; dealType?:DealType[];
  priceMinManwon?:number; priceMaxManwon?:number; areaMinPyeong?:number; areaMaxPyeong?:number;
  zoning?:string; themes?:Theme[]; keyword?:string;
  bbox?:{swLat:number;swLng:number;neLat:number;neLng:number};
  sort:"latest"|"price_asc"|"price_desc"|"area"|"price_drop"|"just_posted";
}
export interface CollectionJob { id:string; trigger:"cron"|"manual"; from:string; to:string; region:string;
  found:number; processed:number; failed:number;
  items:{videoId:string;step:string;source:string;status:string;error?:string}[]; startedAt:number; finishedAt?:number; }
```

## 3. 컬렉션
`listings`(**docId=videoId**로 중복수집 구조적 차단) · `agents`(docId=channelId) · `savedSearches` · `favorites`(`{userId}_{listingId}`) · `alerts` · `collectionJobs` · `optOutList`(`{videoId}` / `ch_{channelId}`).

## 4. 상태머신
```
collected→structuring→(성공)draft/(실패)error  · error→재시도(≤3)→structuring
draft→(승인:verified&&priceManwon>0&&region&&regNo)published / (반려)rejected
published→옵트아웃 opted_out(+optOutList+takedownAt) · published→가격변동 priceHistory+priceDropAt+price_drop 알림
opted_out|rejected→재수집 시 제외
```
confidence<0.6 또는 priceManwon==0 또는 region 불명 → 검수 큐 상단.

## 5. 외부 API
**SocialKit** (서버only, access_key; dev는 시드 폴백)
- 검색: `GET api.socialkit.dev/youtube/search?access_key=&query=` → 후보. (병행/백업: YouTube Data API `search.list?order=date&publishedAfter&publishedBefore&q=&maxResults=50` — search.list=100u/call, 일10,000 → time-bin 분할)
- 자막: `GET api.socialkit.dev/youtube/transcript?access_key=&url=` → 예상 `{transcript:{text}}`. 실패 backoff≤3→error. zod: `z.object({transcript:z.object({text:z.string().min(1)}).passthrough()}).passthrough()`.

**카카오 Local** (서버 지오코딩)
- `GET dapi.kakao.com/v2/local/search/address.json?query=` Header `Authorization: KakaoAK {KAKAO_REST_KEY}` → `documents[0].x`(lng)/`.y`(lat). 실패→읍면동 중심좌표+`geoNeedsReview=true`. `geohash`=geofire-common `geohashForLocation([lat,lng])`. 지도표시는 카카오 JS SDK(클라).

**Claude 구조화** `POST api.anthropic.com/v1/messages`, model `claude-sonnet-4-6`. 프롬프트=`EXTRACTION-PROMPT.md`. tool로 출력 강제:
```ts
tools:[{ name:"save_listing", description:"매물 자막에서 추출한 표준 정보",
  input_schema:{ type:"object", properties:{
    propertyType:{type:"string",enum:["단독주택","토지","상가","아파트","전원주택","상가주택","빌라","기타"]},
    dealType:{type:"string",enum:["매매","전세","월세","임대","경매"]},
    priceText:{type:"string"}, priceManwon:{type:"integer"}, monthlyRentManwon:{type:["integer","null"]},
    areaM2:{type:["number","null"]}, areaPyeong:{type:["number","null"]}, zoning:{type:["string","null"]},
    addressText:{type:["string","null"]}, region:{type:"string"}, summary:{type:"string"},
    highlights:{type:"array",items:{type:"string"}}, keywords:{type:"array",items:{type:"string"}},
    themes:{type:"array",items:{type:"string",enum:["세컨하우스","한달살기","구옥","바다뷰","읍면단독","급매"]}},
    confidence:{type:"number"} },
    required:["propertyType","dealType","priceText","priceManwon","region","summary","keywords","themes","confidence"] } }],
tool_choice:{type:"tool",name:"save_listing"}
```
파싱: `content`의 `tool_use(name=save_listing).input`. 실패→폴백 추출(EXTRACTION-PROMPT §4)+`extractionSource="fallback"`+confidence↓.

## 6. 내부 라우트 (`app/api/*`, 키는 서버에서만)
| 경로 | 권한 | 입력→출력 |
|---|---|---|
| `POST /api/collect` | editor+ | `{from,to,region}`→`{jobId}` |
| `POST /api/structure` | editor+ | `{videoId}`→`{listing}` |
| `GET /api/geocode` | editor+ | `?q=`→`{lat,lng,geohash,needsReview}` |
| `GET /api/listings` | public | SearchFilters→`{items,nextCursor}`(published만) |
| `POST /api/alerts/run` | cron | →저장검색 매칭 알림 생성 |
공통: 외부호출 backoff(1/4/10s ≤3회), 4xx 즉시실패, 일일 상한(env) 초과 시 중단+알림.

## 7. 설정 파일 (Claude Code가 이 내용으로 생성)

### `.env.example`
```
ANTHROPIC_API_KEY=
SOCIALKIT_ACCESS_KEY=
YOUTUBE_API_KEY=
KAKAO_REST_KEY=
NEXT_PUBLIC_KAKAO_JS_KEY=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
MAX_DAILY_SOCIALKIT=300
MAX_DAILY_LLM=300
CRON_KEYWORD_SET=제주 매물,애월 매물,조천 매물,서귀포 매물
CRON_LOOKBACK_HOURS=48
USE_MOCK_SOURCES=true
```

### `firestore.rules`
```
rules_version='2';
service cloud.firestore { match /databases/{db}/documents {
  function signed(){return request.auth!=null;}
  function role(){return signed()?request.auth.token.role:'';}
  function staff(){return role()=='editor'||role()=='superadmin';}
  function owner(uid){return signed()&&request.auth.uid==uid;}
  match /listings/{id}{ allow read: if resource.data.status=='published'||staff();
                        allow create,update,delete: if staff(); }
  match /agents/{id}{ allow read: if true; allow write: if staff(); }
  match /savedSearches/{id}{ allow read,update,delete: if owner(resource.data.userId);
                             allow create: if owner(request.resource.data.userId); }
  match /favorites/{id}{ allow read,update,delete: if owner(resource.data.userId);
                         allow create: if owner(request.resource.data.userId); }
  match /alerts/{id}{ allow read,update: if owner(resource.data.userId); allow create,delete: if staff(); }
  match /collectionJobs/{id}{ allow read,write: if staff(); }
  match /optOutList/{id}{ allow read,write: if staff(); }
}}
```

### `firestore.indexes.json` (status 복합 — 정렬키별)
```json
{ "indexes":[
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"publishedAt","order":"DESCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"region","order":"ASCENDING"},{"fieldPath":"publishedAt","order":"DESCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"propertyType","order":"ASCENDING"},{"fieldPath":"priceManwon","order":"ASCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"priceManwon","order":"DESCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"priceDropAt","order":"DESCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"geohash","order":"ASCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"themes","arrayConfig":"CONTAINS"},{"fieldPath":"publishedAt","order":"DESCENDING"}]},
  {"collectionGroup":"listings","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"keywords","arrayConfig":"CONTAINS"},{"fieldPath":"publishedAt","order":"DESCENDING"}]}
], "fieldOverrides":[] }
```

### `firebase.json`
```json
{ "firestore":{"rules":"firestore.rules","indexes":"firestore.indexes.json"},
  "functions":{"source":"functions","runtime":"nodejs20"},
  "emulators":{"auth":{"port":9099},"firestore":{"port":8080},"functions":{"port":5001},"ui":{"enabled":true}} }
```
