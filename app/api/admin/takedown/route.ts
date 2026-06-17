// app/api/admin/takedown — 옵트아웃(즉시 takedown + 재수집 제외). editor+.
// 영상 단위 또는 채널 단위. optOutList 등록 → 파이프라인 isOptedOut가 재수집 차단.
import { NextResponse } from "next/server";
import { HttpError, requireStaff } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireStaff(req);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const b = (await req.json().catch(() => ({}))) as {
    videoId?: string;
    channelId?: string;
    scope?: "video" | "channel";
  };
  const now = Date.now();
  const scope = b.scope === "channel" ? "channel" : "video";

  if (scope === "channel") {
    const channelId = (b.channelId ?? "").trim();
    if (!channelId) return NextResponse.json({ error: "channelId 필요" }, { status: 400 });
    await adminDb.collection("optOutList").doc(`ch_${channelId}`).set({ channelId, at: now });
    await adminDb.collection("agents").doc(channelId).set({ optedOut: true }, { merge: true });
    // 해당 채널의 공개/검수 매물 takedown
    const snap = await adminDb.collection("listings").where("channelId", "==", channelId).get();
    let n = 0;
    for (const d of snap.docs) {
      const status = d.get("status");
      if (status === "published" || status === "draft" || status === "error") {
        await d.ref.update({ status: "opted_out", takedownAt: now, updatedAt: now });
        n++;
      }
    }
    return NextResponse.json({ ok: true, scope, channelId, takedown: n });
  }

  const videoId = (b.videoId ?? "").trim();
  if (!videoId) return NextResponse.json({ error: "videoId 필요" }, { status: 400 });
  await adminDb.collection("optOutList").doc(videoId).set({ videoId, at: now });
  await adminDb
    .collection("listings")
    .doc(videoId)
    .set({ status: "opted_out", takedownAt: now, updatedAt: now }, { merge: true });
  return NextResponse.json({ ok: true, scope, videoId });
}
