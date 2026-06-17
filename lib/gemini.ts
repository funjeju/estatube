// lib/gemini.ts — Gemini 2.5 Flash 구조화 백엔드 (Claude 대체, "일단" 임시).
// EXTRACTION-PROMPT 규칙/시스템 프롬프트/zod 검증은 claude.ts 와 100% 공유.
// 출력은 save_listing function call 로 강제. REST(v1beta) 직접 호출.
//
// ⚠ 스택 고정(claude-sonnet-4-6) 이탈. Anthropic 키 확보 후 LLM_PROVIDER=claude 로 복귀 권장.

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  normalizeStructured,
  structuredSchema,
  type ExtractMeta,
} from "./claude";
import {
  DEAL_TYPES,
  PROPERTY_TYPES,
  THEMES,
  type Structured,
} from "./types";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const BACKOFF_MS = [1000, 4000, 10000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// save_listing — Gemini function declaration (OpenAPI subset, nullable 사용)
const SAVE_LISTING_DECLARATION = {
  name: "save_listing",
  description: "매물 자막에서 추출한 표준 정보",
  parameters: {
    type: "OBJECT",
    properties: {
      propertyType: { type: "STRING", enum: PROPERTY_TYPES },
      dealType: { type: "STRING", enum: DEAL_TYPES },
      priceText: { type: "STRING" },
      priceManwon: { type: "INTEGER" },
      monthlyRentManwon: { type: "INTEGER", nullable: true },
      areaM2: { type: "NUMBER", nullable: true },
      areaPyeong: { type: "NUMBER", nullable: true },
      zoning: { type: "STRING", nullable: true },
      addressText: { type: "STRING", nullable: true },
      region: { type: "STRING" },
      summary: { type: "STRING" },
      highlights: { type: "ARRAY", items: { type: "STRING" } },
      keywords: { type: "ARRAY", items: { type: "STRING" } },
      themes: { type: "ARRAY", items: { type: "STRING", enum: THEMES } },
      confidence: { type: "NUMBER" },
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
  },
};

interface GeminiPart {
  functionCall?: { name?: string; args?: unknown };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

let _loggedShape = false;

export async function extractWithGemini(
  transcriptText: string,
  meta: ExtractMeta = {},
): Promise<Structured> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 미설정");

  const url = `${BASE}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      { role: "user", parts: [{ text: buildUserPrompt(transcriptText, meta) }] },
    ],
    tools: [{ functionDeclarations: [SAVE_LISTING_DECLARATION] }],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["save_listing"],
      },
    },
    generationConfig: { temperature: 0 },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`Gemini ${res.status} (4xx 즉시 실패): ${(await res.text()).slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const json = (await res.json()) as GeminiResponse;
      if (!_loggedShape) {
        console.error(
          "[gemini] generateContent 실응답 샘플:",
          JSON.stringify(json).slice(0, 400),
        );
        _loggedShape = true;
      }
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const fc = parts.find((p) => p.functionCall?.name === "save_listing")?.functionCall;
      if (!fc?.args)
        throw new Error(
          "Gemini functionCall(save_listing) 없음: " + JSON.stringify(json).slice(0, 300),
        );

      return normalizeStructured(structuredSchema.parse(fc.args));
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /\(4xx/.test(e.message)) throw e;
      const wait = BACKOFF_MS[attempt];
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  throw new Error(`Gemini 구조화 실패(backoff 소진): ${String(lastErr)}`);
}
