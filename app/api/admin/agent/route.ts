// app/api/admin/agent — 중개사 등록/수정(verified 토글 등). editor+.
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

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const channelId = typeof b.channelId === "string" ? b.channelId.trim() : "";
  if (!channelId) return NextResponse.json({ error: "channelId 필요" }, { status: 400 });

  const ref = adminDb.collection("agents").doc(channelId);
  const exists = (await ref.get()).exists;

  const patch: Record<string, unknown> = { id: channelId, channelId };
  for (const k of ["channelName", "channelUrl", "name", "regNo", "office", "expertise", "phone"]) {
    if (typeof b[k] === "string") patch[k] = b[k];
  }
  if (typeof b.verified === "boolean") patch.verified = b.verified;
  if (typeof b.optedOut === "boolean") patch.optedOut = b.optedOut;
  if (b.plan === "free" || b.plan === "featured" || b.plan === "premium") patch.plan = b.plan;
  if (!exists) {
    patch.verified = patch.verified ?? false;
    patch.optedOut = patch.optedOut ?? false;
    patch.plan = patch.plan ?? "free";
    patch.createdAt = Date.now();
  }

  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true, channelId, created: !exists });
}
