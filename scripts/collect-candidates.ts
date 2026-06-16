// scripts/collect-candidates.ts — 골든셋용 후보 영상 수집 (SocialKit 검색).
// CRON_KEYWORD_SET(또는 인자) 키워드로 검색 → videoId 중복 제거 → 라벨링 스켈레톤 작성.
//
//   pnpm collect:candidates                       # CRON_KEYWORD_SET 사용
//   pnpm collect:candidates -- "애월 단독주택" "조천 토지"   # 키워드 직접 지정
//
// 산출: scripts/candidates.json (원시 후보) + scripts/golden-set.skeleton.json
//   skeleton 의 truth 를 사람이 채운 뒤 golden-set.json 으로 옮기면 게이트 측정 가능.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "../lib/env.js";
import { searchVideos, type VideoCandidate } from "../lib/socialkit.js";

loadLocalEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));

// 제목/키워드 → region 힌트 추정 (라벨러 보조용, 정답 아님)
const REGION_HINTS: { kw: string; region: string }[] = [
  { kw: "애월", region: "제주시 애월읍" },
  { kw: "조천", region: "제주시 조천읍" },
  { kw: "구좌", region: "제주시 구좌읍" },
  { kw: "한림", region: "제주시 한림읍" },
  { kw: "한경", region: "제주시 한경면" },
  { kw: "노형", region: "제주시 노형동" },
  { kw: "연동", region: "제주시 연동" },
  { kw: "대정", region: "서귀포시 대정읍" },
  { kw: "안덕", region: "서귀포시 안덕면" },
  { kw: "남원", region: "서귀포시 남원읍" },
  { kw: "표선", region: "서귀포시 표선면" },
  { kw: "성산", region: "서귀포시 성산읍" },
  { kw: "중문", region: "서귀포시 중문동" },
];

function guessRegion(text: string): string | undefined {
  for (const { kw, region } of REGION_HINTS) if (text.includes(kw)) return region;
  return undefined;
}

async function main() {
  const argKeywords = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const keywords =
    argKeywords.length > 0
      ? argKeywords
      : (process.env.CRON_KEYWORD_SET ?? "제주 매물")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  if (!process.env.SOCIALKIT_ACCESS_KEY) {
    console.error(
      "\n⚠ SOCIALKIT_ACCESS_KEY 가 없습니다. .env.local 에 키를 넣고 다시 실행하세요.\n",
    );
    process.exit(1);
  }

  console.error(`\n▶ 후보 수집 — 키워드 ${keywords.length}개: ${keywords.join(", ")}\n`);

  const byId = new Map<string, VideoCandidate>();
  for (const kw of keywords) {
    try {
      const found = await searchVideos(kw);
      let added = 0;
      for (const c of found) {
        if (!byId.has(c.videoId)) {
          byId.set(c.videoId, c);
          added++;
        }
      }
      console.error(`  "${kw}": ${found.length}건 → 신규 ${added}건 (누적 ${byId.size})`);
    } catch (e) {
      console.error(`  "${kw}": 검색 실패 — ${String(e).slice(0, 140)}`);
    }
  }

  const candidates = [...byId.values()];
  const candPath = resolve(__dirname, "candidates.json");
  writeFileSync(candPath, JSON.stringify(candidates, null, 2) + "\n", "utf-8");

  // 라벨링 스켈레톤: meta 자동 채움, truth 는 사람이 확정
  const skeleton = candidates.map((c) => ({
    videoId: c.videoId,
    meta: {
      channelName: c.channelName,
      videoTitle: c.title,
      regionHint: guessRegion(`${c.title} ${c.channelName}`) ?? "",
    },
    truth: {
      priceManwon: 0,
      areaPyeong: null as number | null,
      region: guessRegion(c.title) ?? "",
      zoning: null as string | null,
      propertyType: "단독주택",
      dealType: "매매",
      _TODO: "영상 확인 후 위 truth 값을 실제로 채우고 이 줄을 삭제하세요",
    },
  }));
  const skelPath = resolve(__dirname, "golden-set.skeleton.json");
  writeFileSync(skelPath, JSON.stringify(skeleton, null, 2) + "\n", "utf-8");

  console.error(
    `\n✅ 후보 ${candidates.length}건\n` +
      `  - 원시: ${candPath}\n` +
      `  - 라벨링 스켈레톤: ${skelPath}\n` +
      `  영상 확인 후 truth 를 채워 30~50건을 scripts/golden-set.json 으로 옮기면\n` +
      `  pnpm poc 로 실제 게이트를 측정합니다.\n`,
  );
}

main().catch((e) => {
  console.error("후보 수집 비정상 종료:", e);
  process.exit(1);
});
