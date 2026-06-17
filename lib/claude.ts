// lib/claude.ts — 자막 → 표준 매물 JSON (Claude tool use 강제).
// 프롬프트/규칙: EXTRACTION-PROMPT.md, tool 스키마: DATA-AND-API.md §5.
// 사업 핵심 모듈. 출력은 save_listing tool로만 받고 zod로 검증한다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  PROPERTY_TYPES,
  DEAL_TYPES,
  THEMES,
  type Structured,
} from "./types";

export const EXTRACTION_MODEL = "claude-sonnet-4-6";

// ── 시스템 프롬프트 (EXTRACTION-PROMPT.md §시스템) ──────────────────
export const SYSTEM_PROMPT = `너는 제주 부동산 매물 영상 자막에서 정형 데이터를 추출하는 전문 추출기다.
반드시 save_listing 도구를 호출해 결과를 채운다. 자유 텍스트로 답하지 않는다.
자막에 없는 값은 null. 근거 없는 수치를 지어내지 않는다. 아래 규칙을 엄격히 따른다.`;

// ── 규칙 (EXTRACTION-PROMPT.md §규칙) ──────────────────────────────
export const RULES = `**가격 priceManwon(만원 정수)**
- "6억 8천만원"→68000, "1억 6천만원"→16000, "3억 2천"→32000. 억/천만/만 합산. priceText는 원문형("6억 8,000만원").
- 거래별 기준: 매매·경매→매매가(최저가). 전세→전세보증금. 월세·임대→보증금을 priceManwon, 월세액은 monthlyRentManwon(예 "보증금2천/월130"→2000, 130).
- "평당 X만원"만 있으면 면적×평당으로 총액 추정+confidence↓. 미상→0, "가격문의", confidence↓.

**면적 areaM2/areaPyeong**
- ㎡↔평 환산(평=㎡÷3.3058 반올림, ㎡=평×3.3058). 토지·건물 둘 다면 대표 거래면적 사용, 둘 다 highlights에.

**유형 propertyType 정규화** — enum에 없는 표현을 매핑한다: 타운하우스·연립주택·다세대주택·"단독주택형 빌라"→빌라, 다가구주택→단독주택, 펜트하우스·공동주택→아파트. 토지·임야·나대지·택지(지목 대)→토지. 읍·면 소재 마당 있는 개별 단독은 전원주택, 시내(동) 단독은 단독주택.

**용도지역 zoning** — 표준어 정규화(자연녹지지역/계획관리지역/보전관리지역/생산관리지역/관리지역/1·2종일반주거지역/준주거지역/상업지역/녹지지역). 없으면 null.

**위치 region/addressText**
- region="시+읍면동" 표준형: "애월"→"제주시 애월읍", "대정"→"서귀포시 대정읍", "노형동"→"제주시 노형동", "표선"→"서귀포시 표선면", "성산"→"서귀포시 성산읍". 제주시 본동(노형/연동/이도/도남)·읍면(애월/조천/구좌/한림/한경/우도)과 서귀포시(대정/안덕/남원/표선/성산/중문) 구분.
- addressText: 자막에 리·번지 있으면 그대로, 없으면 null.

**테마 themes(복수)** — 세컨하우스(별장/주말), 한달살기(단기·임대수익), 구옥(옛집/돌집/리모델링), 바다뷰(바다/해변/조망), 읍면단독(읍면 단독·전원), 급매(급매/초급매/가격인하). 근거 없으면 빈 배열.

**요약·키워드** — summary 2~3문장(가격·유형·위치·핵심특징, 과장 제거). highlights 3~5("주차2대","신축복층","해변도보10분"). keywords 4~8(지역·유형·특징, 조사 제거).

**신뢰도 confidence(0~1)** — 가격·면적·위치 명시면 1.0 근접, 핵심 누락/추정 0.5↓. <0.6 또는 priceManwon==0 또는 region 불명 → 검수 큐 상단.`;

export interface ExtractMeta {
  channelName?: string;
  videoTitle?: string;
  regionHint?: string;
  /** 영상 설명(더보기). 제주 매물 영상은 가격·면적·용도지역을 설명란에 적는 경우가 많음(Phase0 발견). */
  description?: string;
}

export function buildUserPrompt(transcriptText: string, meta: ExtractMeta): string {
  const descBlock = meta.description?.trim()
    ? `\n[영상설명] """${meta.description.trim()}"""  ← 가격·면적·용도지역이 여기 명시된 경우가 많다. 자막과 설명을 함께 근거로 삼되, 상충 시 더 구체적인 수치를 채택.`
    : "";
  return `다음 제주 부동산 매물 영상의 자막과 설명에서 표준 매물 정보를 추출하라.
[참고] 채널: ${meta.channelName ?? "(미상)"} / 제목: ${meta.videoTitle ?? "(미상)"} / 지역 힌트: ${meta.regionHint ?? "(없음)"}
[규칙]
${RULES}${descBlock}
[자막] """${transcriptText}"""`;
}

// ── save_listing tool (DATA-AND-API.md §5) ────────────────────────
export const SAVE_LISTING_TOOL: Anthropic.Tool = {
  name: "save_listing",
  description: "매물 자막에서 추출한 표준 정보",
  input_schema: {
    type: "object",
    properties: {
      propertyType: { type: "string", enum: PROPERTY_TYPES },
      dealType: { type: "string", enum: DEAL_TYPES },
      priceText: { type: "string" },
      priceManwon: { type: "integer" },
      monthlyRentManwon: { type: ["integer", "null"] },
      areaM2: { type: ["number", "null"] },
      areaPyeong: { type: ["number", "null"] },
      zoning: { type: ["string", "null"] },
      addressText: { type: ["string", "null"] },
      region: { type: "string" },
      summary: { type: "string" },
      highlights: { type: "array", items: { type: "string" } },
      keywords: { type: "array", items: { type: "string" } },
      themes: {
        type: "array",
        items: { type: "string", enum: THEMES },
      },
      confidence: { type: "number" },
    },
    required: [
      "propertyType",
      "dealType",
      "priceText",
      "priceManwon",
      "region",
      "summary",
      "keywords",
      "themes",
      "confidence",
    ],
  } as Anthropic.Tool.InputSchema,
};

// ── 출력 zod 검증 (골든룰 4: 모든 외부 IO zod) ─────────────────────
// claude/gemini 등 모든 LLM 백엔드가 공유.
export const structuredSchema = z.object({
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]),
  dealType: z.enum(DEAL_TYPES as [string, ...string[]]),
  priceText: z.string(),
  priceManwon: z.number().int().nonnegative(),
  monthlyRentManwon: z.number().int().nullable().optional(),
  areaM2: z.number().nullable().optional(),
  areaPyeong: z.number().nullable().optional(),
  zoning: z.string().nullable().optional(),
  addressText: z.string().nullable().optional(),
  region: z.string().min(1),
  summary: z.string(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()),
  themes: z.array(z.enum(THEMES as [string, ...string[]])),
  confidence: z.number().min(0).max(1),
});

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * 자막 → Structured. tool_use 강제 + zod 검증.
 * 실패(파싱/검증/네트워크)는 throw — 호출측에서 폴백 추출로 전환.
 */
export async function extractWithClaude(
  transcriptText: string,
  meta: ExtractMeta = {},
): Promise<Structured> {
  const res = await client().messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [SAVE_LISTING_TOOL],
    tool_choice: { type: "tool", name: "save_listing" },
    messages: [{ role: "user", content: buildUserPrompt(transcriptText, meta) }],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "save_listing",
  );
  if (!toolUse) throw new Error("save_listing tool_use 블록 없음");

  return normalizeStructured(structuredSchema.parse(toolUse.input));
}

/** 검증된 tool 출력 → Structured (선택 필드 기본값 채움). LLM 백엔드 공통. */
export function normalizeStructured(
  parsed: z.infer<typeof structuredSchema>,
): Structured {
  return {
    propertyType: parsed.propertyType as Structured["propertyType"],
    dealType: parsed.dealType as Structured["dealType"],
    priceText: parsed.priceText,
    priceManwon: parsed.priceManwon,
    monthlyRentManwon: parsed.monthlyRentManwon ?? null,
    areaM2: parsed.areaM2 ?? null,
    areaPyeong: parsed.areaPyeong ?? null,
    zoning: parsed.zoning ?? null,
    addressText: parsed.addressText ?? null,
    region: parsed.region,
    summary: parsed.summary,
    highlights: parsed.highlights ?? [],
    keywords: parsed.keywords,
    themes: parsed.themes as Structured["themes"],
    confidence: parsed.confidence,
  };
}
