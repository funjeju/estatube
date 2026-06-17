// scripts/seed-pipeline.ts — T5 DoD 검증: 시드 N건 → 에뮬레이터에 draft 생성 +
// 한 건(자막없음) 실패가 전체를 중단하지 않음을 확인.
//
//   1) pnpm fb:emulate (별도 터미널, JDK21 필요)
//   2) pnpm seed:pipeline
//
// 에뮬레이터(127.0.0.1:8080)로 강제 라우팅. 실제 프로젝트 데이터는 건드리지 않음.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "../lib/env.js";
import type { PipelineItem } from "../lib/pipeline.js";

loadLocalEnv();
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.USE_MOCK_SOURCES = "true"; // 자막=시드 동봉, 지오코딩=폴백

const __dirname = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(__dirname, ".transcript-cache");

interface Cand {
  videoId: string;
  channelId: string | null;
  url: string;
  thumbnail: string | null;
  channelName: string;
  title: string;
  description: string | null;
}

function loadCands(): Map<string, Cand> {
  const arr: Cand[] = JSON.parse(readFileSync(resolve(__dirname, "candidates.json"), "utf-8"));
  return new Map(arr.map((c) => [c.videoId, c]));
}

function cacheTranscript(id: string): string | undefined {
  const p = resolve(cacheDir, `${id}.txt`);
  return existsSync(p) ? readFileSync(p, "utf-8") : undefined;
}

async function main() {
  const cands = loadCands();
  const goodIds = ["sUn3RCRxCh0", "RXzQPTCmOxY", "DXO3HrXlHSc", "KqOMxoz5HIc"];

  const items: PipelineItem[] = [];
  for (const id of goodIds) {
    const t = cacheTranscript(id);
    if (!t) {
      console.error(`  (스킵: 캐시 자막 없음 ${id})`);
      continue;
    }
    const c = cands.get(id);
    items.push({
      videoId: id,
      channelId: c?.channelId ?? `ch_${id}`,
      videoUrl: c?.url ?? `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: c?.thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: Date.now(),
      channelName: c?.channelName,
      videoTitle: c?.title,
      description: c?.description ?? undefined,
      transcript: t,
    });
  }
  // 의도적 실패 1건: 자막 없음(캐시·동봉 모두 없음) → fetchTranscript throw
  items.push({
    videoId: "SEED_FAIL_no_transcript",
    channelId: "ch_seedfail",
    videoUrl: "https://www.youtube.com/watch?v=SEED_FAIL_no_transcript",
    thumbnailUrl: "https://i.ytimg.com/vi/SEED_FAIL_no_transcript/hqdefault.jpg",
    publishedAt: Date.now(),
  });

  console.error(`\n▶ seed-pipeline — 정상 ${items.length - 1}건 + 실패유도 1건 (emulator ${process.env.FIRESTORE_EMULATOR_HOST})\n`);

  const { runCollect } = await import("../lib/pipeline.js");
  const { adminDb } = await import("../lib/firebase/admin.js");

  // 멱등 검증 위해 기존 시드 데이터 정리
  for (const col of ["listings", "collectionJobs"]) {
    const snap = await adminDb.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  const res = await runCollect({
    from: "2026-06-15",
    to: "2026-06-17",
    region: "제주 전역",
    trigger: "manual",
    items,
  });
  console.error("결과:", JSON.stringify(res));

  // 검증
  const drafts = await adminDb.collection("listings").where("status", "==", "draft").get();
  const errors = await adminDb.collection("listings").where("status", "==", "error").get();
  const jobs = await adminDb.collection("collectionJobs").get();

  console.error(`\n── 에뮬레이터 검증 ──`);
  console.error(`  draft 매물:   ${drafts.size}`);
  console.error(`  error 매물:   ${errors.size}`);
  console.error(`  collectionJobs: ${jobs.size}`);
  for (const d of drafts.docs) {
    console.error(`    · ${d.id}  ${d.get("priceManwon")}만 ${d.get("region")} [${d.get("extractionSource")}] geo(${d.get("lat")},${d.get("lng")})`);
  }

  const expectGood = items.length - 1;
  const ok = drafts.size === expectGood && errors.size === 1 && jobs.size === 1;
  console.error(
    ok
      ? `\n✅ PASS — draft ${expectGood}건 생성, 실패 1건 격리(전체 미중단), job 1건 기록.\n`
      : `\n❌ FAIL — 기대(draft ${expectGood}, error 1, job 1)와 불일치.\n`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("seed-pipeline 오류:", e);
  process.exit(1);
});
