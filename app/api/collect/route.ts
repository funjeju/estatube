// app/api/collect — 어드민 수집 트리거 (editor+). {from,to,regions[]} → 검색→draft.
// 키는 서버에서만. firebase-admin 사용 → nodejs 런타임 고정.
import { NextResponse } from "next/server";
import { HttpError, requireStaff } from "@/lib/auth-server";
import { searchVideos } from "@/lib/socialkit";
import { candidateToItem, runCollect, type CollectResult } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 지역 라벨 → SocialKit 검색어
function regionQuery(region: string): string {
  if (region === "제주 전역") return "제주 매물";
  const token = region.split(/\s+/).pop() ?? region; // "제주시 애월읍" → "애월읍"
  const bare = token.replace(/(읍|면|동)$/, "");
  return `${bare} 매물`;
}

interface JobSummary extends CollectResult {
  region: string;
  query: string;
  error?: string;
}

export async function POST(req: Request) {
  let staff;
  try {
    staff = await requireStaff(req);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
    regions?: string[];
  };
  const regions = Array.isArray(body.regions) && body.regions.length ? body.regions : ["제주 전역"];
  const from = body.from ?? "";
  const to = body.to ?? "";

  const jobs: JobSummary[] = [];
  for (const region of regions) {
    const query = regionQuery(region);
    try {
      const found = await searchVideos(query);
      const items = found.map((c) => candidateToItem(c, region === "제주 전역" ? undefined : region));
      const res = await runCollect({ from, to, region, trigger: "manual", items });
      jobs.push({ region, query, ...res });
    } catch (e) {
      jobs.push({
        region,
        query,
        jobId: "",
        found: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
        items: [],
        error: String(e).slice(0, 200),
      });
    }
  }

  const totals = jobs.reduce(
    (a, j) => ({
      found: a.found + j.found,
      processed: a.processed + j.processed,
      failed: a.failed + j.failed,
      skipped: a.skipped + j.skipped,
    }),
    { found: 0, processed: 0, failed: 0, skipped: 0 },
  );

  return NextResponse.json({ ok: true, by: staff.email ?? staff.uid, totals, jobs });
}
