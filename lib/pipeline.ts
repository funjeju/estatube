// lib/pipeline.ts — 수집/구조화 파이프라인 (공유 로직).
// Next API 라우트(동기)·Cloud Functions worker(비동기 큐) 양쪽에서 재사용.
// DATA-AND-API §1: collect(가벼움) → worker(자막→구조화→지오코딩→썸네일→draft).
// 멱등: docId=videoId. 건별 try/catch로 한 건 실패가 전체를 중단하지 않음.

import { fetchTranscript, type VideoCandidate } from "./socialkit";
import { extractWithClaude, type ExtractMeta } from "./claude";
import { extractWithGemini } from "./gemini";
import { extractFallback } from "./extractFallback";
import { geocode } from "./kakao";
import { adminDb } from "./firebase/admin";
import { underCap, incrUsage } from "./cost-guard";
import type { Listing, Structured } from "./types";

// ── LLM 백엔드 선택 (poc와 동일 규칙) ──────────────────────────────
async function extract(
  transcript: string,
  meta: ExtractMeta,
): Promise<{ s: Structured; source: "ai" | "fallback" }> {
  const p = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const provider =
    p === "claude" ? (hasClaude ? "claude" : "none")
    : p === "gemini" ? (hasGemini ? "gemini" : "none")
    : hasClaude ? "claude"
    : hasGemini ? "gemini"
    : "none";
  if (provider !== "none") {
    try {
      const s =
        provider === "claude"
          ? await extractWithClaude(transcript, meta)
          : await extractWithGemini(transcript, meta);
      return { s, source: "ai" };
    } catch (e) {
      console.error(`[pipeline] ${provider} 추출 실패 → 폴백: ${String(e).slice(0, 120)}`);
    }
  }
  return { s: extractFallback(transcript, { regionHint: meta.regionHint }), source: "fallback" };
}

// collect가 worker로 넘기는 작업 단위 (seed는 transcript 동봉 가능)
export interface PipelineItem {
  videoId: string;
  channelId: string;
  videoUrl: string;
  thumbnailUrl: string;
  publishedAt: number;
  channelName?: string;
  videoTitle?: string;
  regionHint?: string;
  description?: string;
  transcript?: string; // 제공 시 자막 재조회 생략(seed/재처리)
}

export function candidateToItem(c: VideoCandidate, regionHint?: string): PipelineItem {
  return {
    videoId: c.videoId,
    channelId: c.channelId ?? "",
    videoUrl: c.url,
    thumbnailUrl: c.thumbnail ?? `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
    publishedAt: Date.now(), // 실제 publishedAt 파싱은 추후(검색 응답 상대시간) — 수집시각 근사
    channelName: c.channelName,
    videoTitle: c.title,
    regionHint,
    description: c.description ?? undefined,
  };
}

/**
 * worker 본체: 1건을 자막→구조화→지오코딩→draft 로 변환해 Firestore 저장.
 * 성공 시 status="draft", 실패는 throw(호출측에서 status="error" 기록).
 */
export async function processItemToDraft(item: PipelineItem): Promise<Listing> {
  const now = Date.now();
  const meta: ExtractMeta = {
    channelName: item.channelName,
    videoTitle: item.videoTitle,
    regionHint: item.regionHint,
    description: item.description,
  };

  // ① 자막
  const transcript = item.transcript ?? (await fetchTranscript(item.videoId));
  // ② 구조화
  const { s, source } = await extract(transcript, meta);
  // ③ 지오코딩
  const geo = await geocode(s.addressText ?? s.region, s.region);

  const listing: Listing = {
    ...s,
    id: item.videoId,
    videoId: item.videoId,
    videoUrl: item.videoUrl,
    thumbnailUrl: item.thumbnailUrl,
    channelId: item.channelId,
    publishedAt: item.publishedAt,
    collectedAt: now,
    lat: geo.lat,
    lng: geo.lng,
    geohash: geo.geohash,
    geoNeedsReview: geo.needsReview,
    priceHistory: s.priceManwon > 0 ? [{ manwon: s.priceManwon, at: now }] : [],
    extractionSource: source,
    status: "draft",
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection("listings").doc(item.videoId).set(listing);
  return listing;
}

async function isOptedOut(videoId: string, channelId: string): Promise<boolean> {
  const refs = [
    adminDb.collection("optOutList").doc(videoId),
    adminDb.collection("optOutList").doc(`ch_${channelId}`),
  ];
  const snaps = await Promise.all(refs.map((r) => r.get()));
  return snaps.some((s) => s.exists);
}

async function alreadyHandled(videoId: string): Promise<boolean> {
  const snap = await adminDb.collection("listings").doc(videoId).get();
  if (!snap.exists) return false;
  const status = snap.get("status");
  // 재수집 제외: 이미 게시/검수중/반려/옵트아웃이면 스킵. error 는 재시도 허용.
  return status !== "error";
}

export interface JobItem {
  videoId: string;
  step: string;
  source: string;
  status: string;
  error?: string;
}

export interface CollectInput {
  from: string;
  to: string;
  region: string;
  trigger: "cron" | "manual";
  items: PipelineItem[]; // collect 단계에서 수집된 후보(검색 결과 → item)
}

export interface CollectResult {
  jobId: string;
  found: number;
  processed: number;
  failed: number;
  skipped: number;
  items: JobItem[];
}

/**
 * collect→worker 오케스트레이션(개발/동기 경로). 건별 격리.
 * 프로덕션은 이 worker 부분을 Cloud Tasks로 분리(여기선 인라인 처리).
 */
export async function runCollect(input: CollectInput): Promise<CollectResult> {
  const jobId = `${input.trigger}_${Date.now()}`;
  const startedAt = Date.now();
  const jobItems: JobItem[] = [];

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of input.items) {
    // 중복/옵트아웃 스킵
    try {
      if (await isOptedOut(item.videoId, item.channelId)) {
        skipped++;
        jobItems.push({ videoId: item.videoId, step: "skip", source: "-", status: "opted_out" });
        continue;
      }
      if (await alreadyHandled(item.videoId)) {
        skipped++;
        jobItems.push({ videoId: item.videoId, step: "skip", source: "-", status: "duplicate" });
        continue;
      }
    } catch (e) {
      // 스킵 판정 실패도 전체 중단 금지
      jobItems.push({ videoId: item.videoId, step: "precheck", source: "-", status: "error", error: String(e).slice(0, 160) });
      failed++;
      continue;
    }

    // 비용 가드: 일일 LLM 상한 초과 시 중단(남은 항목은 다음 실행)
    if (!(await underCap("llm"))) {
      jobItems.push({ videoId: item.videoId, step: "guard", source: "-", status: "cost_capped" });
      skipped++;
      continue;
    }

    // worker (건별 격리 — 한 건 실패가 루프를 끊지 않음)
    try {
      const listing = await processItemToDraft(item);
      await incrUsage("llm");
      processed++;
      jobItems.push({ videoId: item.videoId, step: "draft", source: listing.extractionSource, status: "draft" });
    } catch (e) {
      failed++;
      const now = Date.now();
      // error 상태로 기록(재시도 대상)
      await adminDb
        .collection("listings")
        .doc(item.videoId)
        .set(
          {
            id: item.videoId,
            videoId: item.videoId,
            channelId: item.channelId,
            status: "error",
            createdAt: now,
            updatedAt: now,
          },
          { merge: true },
        )
        .catch(() => {});
      jobItems.push({ videoId: item.videoId, step: "worker", source: "-", status: "error", error: String(e).slice(0, 160) });
    }
  }

  const job = {
    id: jobId,
    trigger: input.trigger,
    from: input.from,
    to: input.to,
    region: input.region,
    found: input.items.length,
    processed,
    failed,
    items: jobItems,
    startedAt,
    finishedAt: Date.now(),
  };
  await adminDb.collection("collectionJobs").doc(jobId).set(job);

  return { jobId, found: input.items.length, processed, failed, skipped, items: jobItems };
}
