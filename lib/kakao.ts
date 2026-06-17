// lib/kakao.ts — 카카오 Local 지오코딩 (서버 only). 주소→좌표→geohash.
// DATA-AND-API §5: GET dapi.kakao.com/v2/local/search/address.json?query=
//   Header Authorization: KakaoAK {KAKAO_REST_KEY} → documents[0].x(lng)/.y(lat)
// 실패→읍면동 중심좌표+geoNeedsReview=true. 실응답은 1회 로깅 후 매핑(골든룰 4).

import { z } from "zod";
import { geohashForLocation } from "geofire-common";

const BASE = "https://dapi.kakao.com/v2/local/search/address.json";
const BACKOFF_MS = [1000, 4000, 10000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 예상 형태 — 실응답 로깅 후 보정
const kakaoSchema = z
  .object({
    documents: z
      .array(z.object({ x: z.string(), y: z.string() }).passthrough())
      .default([]),
  })
  .passthrough();

export interface GeocodeResult {
  lat: number;
  lng: number;
  geohash: string;
  needsReview: boolean;
  source: "kakao" | "fallback";
}

// 제주 읍·면·동 중심좌표 [lat, lng] — API 실패/미스 시 폴백(핀 보정 대상)
const CENTERS: Record<string, [number, number]> = {
  // 제주시 읍면
  애월읍: [33.4626, 126.332], 조천읍: [33.5386, 126.635], 구좌읍: [33.524, 126.854],
  한림읍: [33.411, 126.269], 한경면: [33.349, 126.18], 우도면: [33.506, 126.953],
  추자면: [33.961, 126.301],
  // 제주시 동
  노형동: [33.489, 126.481], 연동: [33.488, 126.493], 이도동: [33.499, 126.531],
  도남동: [33.488, 126.526], 일도동: [33.514, 126.531], 삼도동: [33.512, 126.522],
  아라동: [33.471, 126.541], 오라동: [33.486, 126.508], 외도동: [33.49, 126.43],
  용담동: [33.513, 126.507], 화북동: [33.524, 126.578], 삼양동: [33.535, 126.598],
  // 서귀포시 읍면
  대정읍: [33.227, 126.252], 안덕면: [33.254, 126.357], 남원읍: [33.278, 126.717],
  표선면: [33.326, 126.833], 성산읍: [33.386, 126.88],
  // 서귀포시 동
  중문동: [33.249, 126.412], 회수동: [33.266, 126.488], 강정동: [33.239, 126.487],
  법환동: [33.241, 126.507], 서귀동: [33.247, 126.562], 토평동: [33.264, 126.587],
  동홍동: [33.262, 126.566], 서홍동: [33.258, 126.552], 대천동: [33.252, 126.46],
};
const JEJU_CENTER: [number, number] = [33.3617, 126.5292];

function centerFor(query: string): [number, number] | null {
  for (const token of Object.keys(CENTERS)) {
    if (query.includes(token)) return CENTERS[token]!;
  }
  // "애월"/"조천" 등 읍/면/동 접미사 없는 표기도 매칭
  for (const token of Object.keys(CENTERS)) {
    const bare = token.replace(/(읍|면|동)$/, "");
    if (bare.length >= 2 && query.includes(bare)) return CENTERS[token]!;
  }
  return null;
}

function fallback(query: string): GeocodeResult {
  const [lat, lng] = centerFor(query) ?? JEJU_CENTER;
  return {
    lat,
    lng,
    geohash: geohashForLocation([lat, lng]),
    needsReview: true,
    source: "fallback",
  };
}

let _loggedShape = false;

/**
 * 주소/지역 문자열 → 좌표+geohash. 실패·미스는 읍면동 중심 폴백(needsReview).
 * query: addressText 우선, 없으면 region. regionHint는 폴백 매칭 보조.
 */
export async function geocode(
  query: string,
  regionHint?: string,
): Promise<GeocodeResult> {
  const key = process.env.KAKAO_REST_KEY;
  const useMock = process.env.USE_MOCK_SOURCES === "true" || !key;
  if (useMock) return fallback(`${query} ${regionHint ?? ""}`);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(
        `${BASE}?query=${encodeURIComponent(query)}`,
        { headers: { Authorization: `KakaoAK ${key}` } },
      );
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Kakao ${res.status} (4xx 즉시 실패)`);
      }
      if (!res.ok) throw new Error(`Kakao ${res.status}`);

      const json: unknown = await res.json();
      if (!_loggedShape) {
        console.error("[kakao] geocode 실응답 샘플:", JSON.stringify(json).slice(0, 400));
        _loggedShape = true;
      }
      const doc = kakaoSchema.parse(json).documents[0];
      if (!doc) return fallback(`${query} ${regionHint ?? ""}`);

      const lat = Number(doc.y);
      const lng = Number(doc.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return fallback(`${query} ${regionHint ?? ""}`);
      }
      return {
        lat,
        lng,
        geohash: geohashForLocation([lat, lng]),
        needsReview: false,
        source: "kakao",
      };
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /4\d\d \(4xx/.test(e.message)) break;
      const wait = BACKOFF_MS[attempt];
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  // backoff 소진/4xx → 폴백(서비스 지속). 디버그 로깅만.
  console.error(`[kakao] 지오코딩 폴백 "${query}": ${String(lastErr).slice(0, 120)}`);
  return fallback(`${query} ${regionHint ?? ""}`);
}
