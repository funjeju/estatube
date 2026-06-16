// scripts/fetch-transcripts.ts — 후보 영상 자막 수집/캐시 (골든셋 라벨링 보조).
// 실 SocialKit 자막 엔드포인트의 응답 형태 검증 + 캐시(저작권: 캐시만, 만료 전제).
//
//   pnpm fetch:transcripts            # candidates.json 전체
//   pnpm fetch:transcripts -- 1       # 앞에서 1건만 (형태 확인용)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "../lib/env.js";

loadLocalEnv();
// 이 스크립트는 실제 자막을 받는 게 목적 → mock 비활성(키 있으면)
if (process.env.SOCIALKIT_ACCESS_KEY) process.env.USE_MOCK_SOURCES = "false";

const { fetchTranscript } = await import("../lib/socialkit.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(__dirname, ".transcript-cache");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

interface Candidate {
  videoId: string;
  title: string;
  channelName: string;
}

async function main() {
  const limitArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

  const candidates: Candidate[] = JSON.parse(
    readFileSync(resolve(__dirname, "candidates.json"), "utf-8"),
  );
  const targets = candidates.slice(0, limit);

  console.error(`\n▶ 자막 수집 — ${targets.length}/${candidates.length}건\n`);

  let ok = 0;
  let fail = 0;
  for (const c of targets) {
    const cachePath = resolve(cacheDir, `${c.videoId}.txt`);
    if (existsSync(cachePath)) {
      console.error(`  [캐시] ${c.videoId}`);
      ok++;
      continue;
    }
    try {
      const text = await fetchTranscript(c.videoId);
      writeFileSync(cachePath, text, "utf-8");
      console.error(`  [OK ${text.length}자] ${c.videoId} ${c.title.slice(0, 30)}`);
      ok++;
    } catch (e) {
      console.error(`  [실패] ${c.videoId}: ${String(e).slice(0, 140)}`);
      fail++;
    }
  }

  console.error(`\n✅ 성공 ${ok} / 실패 ${fail} (캐시: ${cacheDir})\n`);
}

main().catch((e) => {
  console.error("자막 수집 비정상 종료:", e);
  process.exit(1);
});
