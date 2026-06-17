// app/api/review/decision — 검수 결정(승인·게시/반려). editor+. 서버에서 게이트 강제.
import { NextResponse } from "next/server";
import { HttpError, requireStaff } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase/admin";
import { publishGate } from "@/lib/review";
import type { Agent, Listing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DecisionResult {
  id: string;
  ok: boolean;
  status?: string;
  reasons?: string[];
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
    ids?: string[];
    action?: "approve" | "reject";
  };
  const ids = (body.ids ?? []).filter(Boolean);
  const action = body.action;
  if (!ids.length || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "ids[]·action(approve|reject) 필요" }, { status: 400 });
  }

  const results: DecisionResult[] = [];
  for (const id of ids) {
    const ref = adminDb.collection("listings").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      results.push({ id, ok: false, reasons: ["매물 없음"] });
      continue;
    }
    const listing = snap.data() as Listing;
    const now = Date.now();

    if (action === "reject") {
      await ref.update({ status: "rejected", reviewedBy: staff.uid, updatedAt: now });
      results.push({ id, ok: true, status: "rejected" });
      continue;
    }

    // approve → 게시 게이트(표준필드 + 중개사 verified·regNo)
    const agentSnap = await adminDb.collection("agents").doc(listing.channelId).get();
    const agent = agentSnap.exists ? (agentSnap.data() as Agent) : null;
    const gate = publishGate(listing, agent);
    if (!gate.ok) {
      results.push({ id, ok: false, reasons: gate.reasons });
      continue;
    }
    await ref.update({
      status: "published",
      publishedAt2: now,
      reviewedBy: staff.uid,
      updatedAt: now,
    });
    results.push({ id, ok: true, status: "published" });
  }

  const published = results.filter((r) => r.ok && r.status === "published").length;
  const rejected = results.filter((r) => r.ok && r.status === "rejected").length;
  const blocked = results.filter((r) => !r.ok).length;
  return NextResponse.json({ ok: true, by: staff.uid, published, rejected, blocked, results });
}
