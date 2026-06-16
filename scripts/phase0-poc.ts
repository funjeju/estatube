// scripts/phase0-poc.ts — Phase 0 정확도 게이트 (CLAUDE.md T0).
// 골든셋 → 자막(SocialKit) → 구조화(Claude tool use) → 채점.
// DoD: 필드별/종합 정확도 출력, 종합·가격·위치 ≥ 90% + 자막 추출 성공 ≥ 90%.
//
//   pnpm poc                # scripts/golden-set.json (실 골든셋)
//   pnpm poc -- --fixtures  # scripts/golden-fixtures.json (합성 자가검증)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { loadLocalEnv } from "../lib/env.js";
import { extractWithClaude } from "../lib/claude.js";
import { extractWithGemini } from "../lib/gemini.js";
import { extractFallback } from "../lib/extractFallback.js";
import { fetchTranscript } from "../lib/socialkit.js";
import {
  DEAL_TYPES,
  PROPERTY_TYPES,
  type Structured,
} from "../lib/types.js";

loadLocalEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 골든셋 스키마 ────────────────────────────────────────────────
const goldenSchema = z.array(
  z.object({
    videoId: z.string().min(1),
    meta: z
      .object({
        channelName: z.string().optional(),
        videoTitle: z.string().optional(),
        regionHint: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
    mockTranscript: z.string().optional(),
    truth: z.object({
      priceManwon: z.number().int(),
      areaPyeong: z.number().nullable(),
      region: z.string(),
      zoning: z.string().nullable(),
      propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]),
      dealType: z.enum(DEAL_TYPES as [string, ...string[]]),
    }),
  }),
);
type GoldenEntry = z.infer<typeof goldenSchema>[number];

// ── 필드 판정 (EXTRACTION-PROMPT.md §채점) ─────────────────────────
const eumMyeonDong = (r: string): string => {
  const m = r.match(/(\S+?(?:읍|면|동))\s*$/);
  return (m?.[1] ?? r).trim();
};

const judge = {
  priceManwon: (got: number, t: number) => got === t,
  areaPyeong: (got: number | null, t: number | null) => {
    if (t === null) return got === null;
    if (got === null) return false;
    return Math.abs(got - t) <= 2;
  },
  region: (got: string, t: string) => eumMyeonDong(got) === eumMyeonDong(t),
  zoning: (got: string | null, t: string | null) => {
    if (t === null && got === null) return true;
    if (t === null || got === null) return false;
    return got.replace(/\s/g, "") === t.replace(/\s/g, "");
  },
  propertyType: (got: string, t: string) => got === t,
  dealType: (got: string, t: string) => got === t,
};

const FIELDS = [
  "priceManwon",
  "areaPyeong",
  "region",
  "zoning",
  "propertyType",
  "dealType",
] as const;
type Field = (typeof FIELDS)[number];

interface CaseResult {
  videoId: string;
  transcriptOk: boolean;
  extractionSource: "ai" | "fallback" | "none";
  fields: Partial<Record<Field, boolean>>;
  error?: string;
}

// LLM 백엔드 선택: LLM_PROVIDER=claude|gemini|auto(기본). 키 없으면 폴백.
function chooseProvider(): "claude" | "gemini" | "none" {
  const p = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  if (p === "claude") return process.env.ANTHROPIC_API_KEY ? "claude" : "none";
  if (p === "gemini") return process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "gemini" : "none";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "gemini";
  return "none";
}
const PROVIDER = chooseProvider();

async function extractFor(
  text: string,
  meta: GoldenEntry["meta"],
): Promise<{ s: Structured; source: "ai" | "fallback"; provider: string }> {
  if (PROVIDER !== "none") {
    try {
      const s =
        PROVIDER === "claude"
          ? await extractWithClaude(text, meta ?? {})
          : await extractWithGemini(text, meta ?? {});
      return { s, source: "ai", provider: PROVIDER };
    } catch (e) {
      console.error(`  ⚠ ${PROVIDER} 실패 → 폴백: ${String(e).slice(0, 140)}`);
    }
  }
  return {
    s: extractFallback(text, { regionHint: meta?.regionHint }),
    source: "fallback",
    provider: "fallback",
  };
}

function judgeCase(got: Structured, truth: GoldenEntry["truth"]): Partial<Record<Field, boolean>> {
  return {
    priceManwon: judge.priceManwon(got.priceManwon, truth.priceManwon),
    areaPyeong: judge.areaPyeong(got.areaPyeong, truth.areaPyeong),
    region: judge.region(got.region, truth.region),
    zoning: judge.zoning(got.zoning, truth.zoning),
    propertyType: judge.propertyType(got.propertyType, truth.propertyType),
    dealType: judge.dealType(got.dealType, truth.dealType),
  };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

async function main() {
  const useFixtures = process.argv.includes("--fixtures");
  const file = useFixtures ? "golden-fixtures.json" : "golden-set.json";
  const path = resolve(__dirname, file);

  let golden: GoldenEntry[];
  try {
    golden = goldenSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch (e) {
    console.error(`골든셋 로드 실패 (${file}): ${String(e)}`);
    process.exit(1);
  }

  if (golden.length === 0) {
    console.error(
      `\n⚠ ${file} 이 비어 있습니다.\n` +
        `  실 게이트는 제주 매물 영상 30~50건을 라벨링해 scripts/golden-set.json 에 채워야 합니다.\n` +
        `  하니스 자가검증: pnpm poc -- --fixtures\n` +
        `  형식: scripts/README.md 참고.\n`,
    );
    process.exit(1);
  }

  console.error(
    `\n▶ Phase 0 PoC — ${golden.length}건 (${file})` +
      ` | LLM=${PROVIDER}` +
      ` | mock=${process.env.USE_MOCK_SOURCES === "true" || !process.env.SOCIALKIT_ACCESS_KEY}\n`,
  );

  const results: CaseResult[] = [];
  for (const entry of golden) {
    const r: CaseResult = {
      videoId: entry.videoId,
      transcriptOk: false,
      extractionSource: "none",
      fields: {},
    };
    try {
      const text = await fetchTranscript(entry.videoId, {
        mock: (id) => {
          if (entry.mockTranscript) return entry.mockTranscript;
          const p = resolve(__dirname, ".transcript-cache", `${id}.txt`);
          return existsSync(p) ? readFileSync(p, "utf-8") : undefined;
        },
      });
      r.transcriptOk = true;

      const { s, source, provider } = await extractFor(text, entry.meta);
      r.extractionSource = source;
      r.fields = judgeCase(s, entry.truth);

      const ok = FIELDS.filter((f) => r.fields[f]).length;
      console.error(
        `  [${ok}/${FIELDS.length}] ${entry.videoId} (${provider}) ` +
          FIELDS.map((f) => `${f.slice(0, 5)}:${r.fields[f] ? "○" : "✗"}`).join(" "),
      );
    } catch (e) {
      r.error = String(e).slice(0, 160);
      console.error(`  [자막실패] ${entry.videoId}: ${r.error}`);
    }
    results.push(r);
  }

  // ── 집계 ──────────────────────────────────────────────────────
  const total = results.length;
  const transcriptOk = results.filter((r) => r.transcriptOk).length;
  const scored = results.filter((r) => r.transcriptOk);

  const fieldAcc: Record<Field, number> = {} as Record<Field, number>;
  for (const f of FIELDS) {
    const correct = scored.filter((r) => r.fields[f]).length;
    fieldAcc[f] = pct(correct, scored.length);
  }
  const overall =
    scored.length === 0
      ? 0
      : Math.round(
          (FIELDS.reduce((sum, f) => sum + fieldAcc[f], 0) / FIELDS.length) * 10,
        ) / 10;

  const transcriptRate = pct(transcriptOk, total);

  console.error("\n──────────── 결과 ────────────");
  console.error(`자막 추출 성공:  ${transcriptRate}%  (${transcriptOk}/${total})`);
  for (const f of FIELDS) console.error(`  ${f.padEnd(14)} ${fieldAcc[f]}%`);
  console.error(`  ${"종합".padEnd(14)} ${overall}%`);

  // ── 게이트 판정 ───────────────────────────────────────────────
  const GATE = 90;
  const checks = [
    { name: "종합", val: overall },
    { name: "가격(priceManwon)", val: fieldAcc.priceManwon },
    { name: "위치(region)", val: fieldAcc.region },
    { name: "자막 추출 성공", val: transcriptRate },
  ];
  const passed = checks.every((c) => c.val >= GATE);

  console.error("\n──────────── 게이트 (≥90%) ────────────");
  for (const c of checks)
    console.error(`  ${c.val >= GATE ? "✅" : "❌"} ${c.name}: ${c.val}%`);
  console.error(
    passed
      ? "\n✅ PASS — Phase 1(MVP) 진행 가능.\n"
      : "\n❌ FAIL — 오류 케이스로 EXTRACTION-PROMPT 규칙 보강 후 재측정. Phase 1 금지.\n",
  );

  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("PoC 비정상 종료:", e);
  process.exit(1);
});
