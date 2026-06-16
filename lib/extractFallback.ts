// lib/extractFallback.ts — LLM 미가용 시 정규식 폴백 (EXTRACTION-PROMPT.md §4).
// confidence ≤ 0.4, extractionSource="fallback". 절대 LLM 대체가 아닌 최후수단.

import type { DealType, PropertyType, Structured, Theme } from "./types.js";

const PYEONG_PER_M2 = 3.3058;

// 읍면동 사전: 자막 키워드 → region 표준형 (EXTRACTION-PROMPT 규칙 일부)
const REGION_MAP: { kw: string; region: string }[] = [
  { kw: "애월", region: "제주시 애월읍" },
  { kw: "조천", region: "제주시 조천읍" },
  { kw: "구좌", region: "제주시 구좌읍" },
  { kw: "한림", region: "제주시 한림읍" },
  { kw: "한경", region: "제주시 한경면" },
  { kw: "우도", region: "제주시 우도면" },
  { kw: "노형", region: "제주시 노형동" },
  { kw: "연동", region: "제주시 연동" },
  { kw: "이도", region: "제주시 이도동" },
  { kw: "도남", region: "제주시 도남동" },
  { kw: "대정", region: "서귀포시 대정읍" },
  { kw: "안덕", region: "서귀포시 안덕면" },
  { kw: "남원", region: "서귀포시 남원읍" },
  { kw: "표선", region: "서귀포시 표선면" },
  { kw: "성산", region: "서귀포시 성산읍" },
  { kw: "중문", region: "서귀포시 중문동" },
];

function parsePriceManwon(text: string): { manwon: number; priceText: string } {
  // "N억", "억 N천", "보증금 N천만", "월세 N만"
  let manwon = 0;
  let priceText = "가격문의";

  const eok = text.match(/(\d+)\s*억/);
  if (eok && eok[1]) {
    manwon += parseInt(eok[1], 10) * 10000;
    const eokCheon = text.match(/억\s*(\d{1,2})\s*천/);
    if (eokCheon && eokCheon[1]) manwon += parseInt(eokCheon[1], 10) * 1000;
    priceText = eok[0] + (eokCheon ? ` ${eokCheon[1]}천` : "");
  }

  if (manwon === 0) {
    const deposit = text.match(/보증금\s*(\d+)\s*천?만/);
    if (deposit && deposit[1]) {
      const raw = deposit[0];
      manwon = parseInt(deposit[1], 10) * (raw.includes("천") ? 1000 : 1);
      priceText = raw;
    }
  }

  return { manwon, priceText };
}

function parseMonthlyRent(text: string): number | null {
  const m = text.match(/월세\s*(\d+)\s*만/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

function parseArea(text: string): { areaM2: number | null; areaPyeong: number | null } {
  const m2 = text.match(/(\d{2,5})\s*(?:제곱미터|㎡)/);
  if (m2 && m2[1]) {
    const v = parseInt(m2[1], 10);
    return { areaM2: v, areaPyeong: Math.round(v / PYEONG_PER_M2) };
  }
  const py = text.match(/(\d{2,4})\s*평/);
  if (py && py[1]) {
    const v = parseInt(py[1], 10);
    return { areaPyeong: v, areaM2: Math.round(v * PYEONG_PER_M2 * 10) / 10 };
  }
  return { areaM2: null, areaPyeong: null };
}

function parsePropertyType(text: string): PropertyType {
  // "대지면적"·"대지 110㎡" 등은 면적 서술이므로 유형 판정에서 제외
  if (/토지|임야|매매\s*부지|나대지/.test(text)) return "토지";
  if (/상가주택/.test(text)) return "상가주택";
  if (/상가/.test(text)) return "상가";
  if (/아파트/.test(text)) return "아파트";
  if (/전원주택/.test(text)) return "전원주택";
  if (/빌라|다세대/.test(text)) return "빌라";
  return "단독주택";
}

function parseDealType(text: string): DealType {
  if (/월세|임대/.test(text)) return "월세";
  if (/전세/.test(text)) return "전세";
  if (/경매|타경/.test(text)) return "경매";
  return "매매";
}

function parseRegion(text: string, regionHint?: string): string {
  if (regionHint) return regionHint;
  for (const { kw, region } of REGION_MAP) {
    if (text.includes(kw)) return region;
  }
  return "제주";
}

function parseThemes(text: string): Theme[] {
  const t: Theme[] = [];
  if (/별장|주말주택|세컨/.test(text)) t.push("세컨하우스");
  if (/한달살기|단기임대|임대수익/.test(text)) t.push("한달살기");
  if (/구옥|옛집|돌집|리모델링/.test(text)) t.push("구옥");
  if (/바다|해변|오션뷰|조망/.test(text)) t.push("바다뷰");
  if (/급매|초급매|가격인하/.test(text)) t.push("급매");
  return t;
}

export function extractFallback(
  transcriptText: string,
  meta: { regionHint?: string } = {},
): Structured {
  const text = transcriptText;
  const { manwon, priceText } = parsePriceManwon(text);
  const { areaM2, areaPyeong } = parseArea(text);

  return {
    propertyType: parsePropertyType(text),
    dealType: parseDealType(text),
    priceText,
    priceManwon: manwon,
    monthlyRentManwon: parseMonthlyRent(text),
    areaM2,
    areaPyeong,
    zoning: null,
    addressText: null,
    region: parseRegion(text, meta.regionHint),
    summary: text.slice(0, 110),
    highlights: [],
    keywords: [],
    themes: parseThemes(text),
    confidence: Math.min(0.4, manwon > 0 ? 0.4 : 0.2),
  };
}
