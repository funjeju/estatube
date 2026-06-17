// lib/cost-guard.ts — 일일 사용량 상한(SocialKit·LLM). 비용 폭주 방지(CLAUDE.md 골든룰 7).
// usage/{YYYY-MM-DD} 문서에 kind별 카운트 누적, 상한 초과 시 중단.
import { adminDb } from "./firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type CostKind = "socialkit" | "llm" | "geocode";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function cap(kind: CostKind): number {
  if (kind === "socialkit") return Number(process.env.MAX_DAILY_SOCIALKIT || 300);
  if (kind === "llm") return Number(process.env.MAX_DAILY_LLM || 300);
  return Number(process.env.MAX_DAILY_GEOCODE || 1000);
}

export async function underCap(kind: CostKind): Promise<boolean> {
  const snap = await adminDb.collection("usage").doc(today()).get();
  const used = (snap.exists ? (snap.get(kind) as number) : 0) ?? 0;
  return used < cap(kind);
}

export async function incrUsage(kind: CostKind, n = 1): Promise<void> {
  await adminDb
    .collection("usage")
    .doc(today())
    .set({ [kind]: FieldValue.increment(n), date: today() }, { merge: true });
}
