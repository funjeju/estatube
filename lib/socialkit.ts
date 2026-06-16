// lib/socialkit.ts — SocialKit 클라이언트 (서버 only).
// T0 범위: 자막 조회 + backoff + zod. dev(USE_MOCK_SOURCES)는 시드 폴백.
// 검색(youtube/search)은 T4/T5에서 확장. 실응답은 1회 로깅 후 매핑(골든룰 4).

import { z } from "zod";

const BASE = "https://api.socialkit.dev";
const BACKOFF_MS = [1000, 4000, 10000]; // §6: 1/4/10s, ≤3회

// 실응답(확인됨): { success, data: { url, transcript: "<문자열>" } }
// 방어적 추출: data.transcript(string) | data.transcript.text | segments[] | text
const nonEmpty = z.string().trim().min(1);

function extractTranscriptText(json: unknown): string {
  const containers: unknown[] = [json, (json as { data?: unknown })?.data];
  for (const c of containers) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const t = o["transcript"];
    if (typeof t === "string" && t.trim()) return t;
    if (t && typeof t === "object") {
      const text = (t as Record<string, unknown>)["text"];
      if (typeof text === "string" && text.trim()) return text;
    }
    if (Array.isArray(t)) {
      const joined = t
        .map((s) => (typeof s === "string" ? s : ((s as Record<string, unknown>)?.["text"] as string) ?? ""))
        .join(" ")
        .trim();
      if (joined) return joined;
    }
    if (typeof o["text"] === "string" && (o["text"] as string).trim()) {
      return o["text"] as string;
    }
  }
  throw new Error("transcript 텍스트를 응답에서 찾지 못함");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

let _loggedShape = false;

/**
 * 자막 텍스트 조회. 4xx 즉시 실패, 5xx/네트워크는 backoff ≤3.
 * 키 없거나 USE_MOCK_SOURCES=true면 mockTranscript 콜백으로 폴백.
 */
export async function fetchTranscript(
  videoId: string,
  opts: { mock?: (videoId: string) => string | undefined } = {},
): Promise<string> {
  const key = process.env.SOCIALKIT_ACCESS_KEY;
  const useMock = process.env.USE_MOCK_SOURCES === "true" || !key;

  if (useMock) {
    const m = opts.mock?.(videoId);
    if (m) return m;
    throw new Error(`mock 자막 없음: ${videoId} (USE_MOCK_SOURCES=${useMock})`);
  }

  const url = `${BASE}/youtube/transcript?access_key=${encodeURIComponent(
    key!,
  )}&url=${encodeURIComponent(youtubeUrl(videoId))}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`SocialKit ${res.status} (4xx 즉시 실패): ${videoId}`);
      }
      if (!res.ok) throw new Error(`SocialKit ${res.status}`);

      const json: unknown = await res.json();
      if (!_loggedShape) {
        // 골든룰 4: 실응답 형태 1회 로깅 후 매핑
        console.error(
          "[socialkit] transcript 실응답 샘플:",
          JSON.stringify(json).slice(0, 500),
        );
        _loggedShape = true;
      }
      return nonEmpty.parse(extractTranscriptText(json));
    } catch (e) {
      lastErr = e;
      // 4xx는 재시도 무의미
      if (e instanceof Error && /4\d\d \(4xx/.test(e.message)) throw e;
      const wait = BACKOFF_MS[attempt];
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  throw new Error(
    `SocialKit 자막 실패(backoff 소진) ${videoId}: ${String(lastErr)}`,
  );
}

// ── 검색 (youtube/search) ─────────────────────────────────────────
// 응답 필드는 미확정 → 실응답 1회 로깅 후 방어적으로 정규화(골든룰 4).
export interface VideoCandidate {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string | null;
  url: string;
  thumbnail: string | null;
  publishedAt: string | null;
  description: string | null;
}

let _loggedSearchShape = false;

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function findArray(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    for (const k of ["videos", "results", "items", "data", "list"]) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
    // data.videos 같은 1단계 중첩
    const data = (json as Record<string, unknown>)["data"];
    if (data && typeof data === "object") return findArray(data);
  }
  return [];
}

function videoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([\w-]{11})/) ||
    url.match(/youtu\.be\/([\w-]{11})/) ||
    url.match(/\/shorts\/([\w-]{11})/);
  return m?.[1] ?? null;
}

function normalizeCandidate(o: Record<string, unknown>): VideoCandidate | null {
  const url =
    pickStr(o, ["url", "videoUrl", "link", "watchUrl"]) ??
    (pickStr(o, ["videoId", "id"])
      ? `https://www.youtube.com/watch?v=${pickStr(o, ["videoId", "id"])}`
      : null);
  const videoId =
    pickStr(o, ["videoId", "video_id", "id"]) ?? videoIdFromUrl(url);
  if (!videoId || !url) return null;
  return {
    videoId,
    title: pickStr(o, ["title", "videoTitle", "name"]) ?? "",
    channelName:
      pickStr(o, ["channelName", "channel", "author", "channelTitle"]) ?? "",
    channelId: pickStr(o, ["channelId", "channel_id"]),
    url,
    thumbnail: pickStr(o, ["thumbnail", "thumbnailUrl", "thumb"]),
    publishedAt: pickStr(o, ["publishedAt", "published", "publishedTime", "date"]),
    description: pickStr(o, ["description", "desc", "snippet"]),
  };
}

/**
 * 키워드 검색 → 후보 목록. dev/키없음에서는 빈 배열 대신 throw(후보 수집은 실 키 필요).
 */
export async function searchVideos(query: string): Promise<VideoCandidate[]> {
  const key = process.env.SOCIALKIT_ACCESS_KEY;
  if (!key) throw new Error("SOCIALKIT_ACCESS_KEY 미설정 — 후보 수집 불가");

  const url = `${BASE}/youtube/search?access_key=${encodeURIComponent(
    key,
  )}&query=${encodeURIComponent(query)}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status >= 400 && res.status < 500)
        throw new Error(`SocialKit search ${res.status} (4xx 즉시 실패)`);
      if (!res.ok) throw new Error(`SocialKit search ${res.status}`);

      const json: unknown = await res.json();
      if (!_loggedSearchShape) {
        console.error(
          "[socialkit] search 실응답 샘플:",
          JSON.stringify(json).slice(0, 600),
        );
        _loggedSearchShape = true;
      }
      return findArray(json)
        .map(normalizeCandidate)
        .filter((c): c is VideoCandidate => c !== null);
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /4\d\d \(4xx/.test(e.message)) throw e;
      const wait = BACKOFF_MS[attempt];
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  throw new Error(`SocialKit search 실패(backoff 소진) "${query}": ${String(lastErr)}`);
}
