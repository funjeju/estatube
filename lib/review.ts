// lib/review.ts — 게시 게이트 (검수 큐 핵심 규칙). 클라/서버 공유.
// DATA-AND-API §4: draft→published 는 verified && priceManwon>0 && region && regNo.
// SPEC §8(2026 개정법): 운영자 신원·관계 확인=verified 게이트, 필수정보 명시=표준필드 강제.

import type { Agent, Listing } from "./types";

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

// 표준필드(필수정보) 게이트 — 중개사(verified) 무관하게 항상 필요
export function fieldGate(listing: Pick<Listing, "priceManwon" | "region" | "propertyType" | "dealType">): GateResult {
  const reasons: string[] = [];
  if (!(listing.priceManwon > 0)) reasons.push("가격 미상 (priceManwon > 0 필요)");
  const region = (listing.region ?? "").trim();
  if (!region || region === "제주") reasons.push("지역(읍·면·동) 불명");
  if (!listing.propertyType) reasons.push("유형 없음");
  if (!listing.dealType) reasons.push("거래유형 없음");
  return { ok: reasons.length === 0, reasons };
}

// 전체 게시 게이트 = 표준필드 + 중개사 verified·등록번호
export function publishGate(
  listing: Pick<Listing, "priceManwon" | "region" | "propertyType" | "dealType">,
  agent: Pick<Agent, "verified" | "regNo"> | null,
): GateResult {
  const { reasons } = fieldGate(listing);
  if (!agent || !agent.verified) reasons.push("중개사 미검증 (verified)");
  else if (!agent.regNo) reasons.push("중개사 등록번호(regNo) 없음");
  return { ok: reasons.length === 0, reasons };
}
