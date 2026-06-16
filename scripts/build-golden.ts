// scripts/build-golden.ts — _labels.json(사람 truth) + candidates.json(메타/설명) → golden-set.json.
// regionHint 는 생산과 동일하게 제목 기반(guessRegion)으로 주입(truth 누설 방지).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGION_HINTS: { kw: string; region: string }[] = [
  { kw: "애월", region: "제주시 애월읍" },
  { kw: "조천", region: "제주시 조천읍" },
  { kw: "구좌", region: "제주시 구좌읍" },
  { kw: "한림", region: "제주시 한림읍" },
  { kw: "한경", region: "제주시 한경면" },
  { kw: "노형", region: "제주시 노형동" },
  { kw: "대정", region: "서귀포시 대정읍" },
  { kw: "안덕", region: "서귀포시 안덕면" },
  { kw: "남원", region: "서귀포시 남원읍" },
  { kw: "표선", region: "서귀포시 표선면" },
  { kw: "성산", region: "서귀포시 성산읍" },
  { kw: "중문", region: "서귀포시 중문동" },
];
function guessRegion(text: string): string {
  for (const { kw, region } of REGION_HINTS) if (text.includes(kw)) return region;
  return "";
}

interface Cand {
  videoId: string;
  title: string;
  channelName: string;
  description: string | null;
}
interface Label {
  videoId: string;
  truth: Record<string, unknown>;
}

const labels: Label[] = JSON.parse(readFileSync(resolve(__dirname, "_labels.json"), "utf-8"));
const cands: Cand[] = JSON.parse(readFileSync(resolve(__dirname, "candidates.json"), "utf-8"));
const byId = new Map(cands.map((c) => [c.videoId, c]));

const missing: string[] = [];
const out = labels.map((l) => {
  const c = byId.get(l.videoId);
  if (!c) missing.push(l.videoId);
  return {
    videoId: l.videoId,
    meta: {
      channelName: c?.channelName ?? "",
      videoTitle: c?.title ?? "",
      regionHint: guessRegion(c?.title ?? ""),
      description: c?.description ?? "",
    },
    truth: l.truth,
  };
});

writeFileSync(resolve(__dirname, "golden-set.json"), JSON.stringify(out, null, 2) + "\n", "utf-8");
console.error(
  `golden-set.json: ${out.length}건` +
    (missing.length ? ` / candidates 누락 ${missing.length}: ${missing.join(",")}` : " / 누락 0"),
);
