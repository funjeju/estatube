// app/api/alerts/run — 저장검색 매칭 + 찜 가격추적 → 알림 생성 (cron).
// 보호: x-cron-secret(env CRON_SECRET) 또는 editor+ 토큰.
import { NextResponse } from "next/server";
import { HttpError, requireStaff } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase/admin";
import type { Listing, SavedSearch, SearchFilters, Favorite } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function match(l: Listing, f: SearchFilters): boolean {
  if (f.region && l.region !== f.region) return false;
  if (f.propertyType?.length && !f.propertyType.includes(l.propertyType)) return false;
  if (f.dealType?.length && !f.dealType.includes(l.dealType)) return false;
  if (f.priceMinManwon != null && l.priceManwon < f.priceMinManwon) return false;
  if (f.priceMaxManwon != null && l.priceManwon > f.priceMaxManwon) return false;
  if (f.areaMinPyeong != null && (l.areaPyeong ?? 0) < f.areaMinPyeong) return false;
  if (f.areaMaxPyeong != null && (l.areaPyeong ?? 1e9) > f.areaMaxPyeong) return false;
  if (f.zoning && l.zoning !== f.zoning) return false;
  if (f.themes?.length && !f.themes.some((t) => l.themes?.includes(t))) return false;
  if (f.keyword && !(l.keywords ?? []).includes(f.keyword)) return false;
  return true;
}

async function alert(userId: string, type: string, listingId: string, searchId?: string) {
  const id = `${userId}_${type}_${listingId}`;
  const ref = adminDb.collection("alerts").doc(id);
  if ((await ref.get()).exists) return false; // 중복 방지
  await ref.set({ id, userId, type, listingId, searchId: searchId ?? null, read: false, sentAt: Date.now() });
  return true;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  if (!(secret && headerSecret === secret)) {
    try {
      await requireStaff(req);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }

  // 최근 게시 매물(후보 풀)
  const lsnap = await adminDb
    .collection("listings")
    .where("status", "==", "published")
    .orderBy("publishedAt", "desc")
    .limit(300)
    .get();
  const listings = lsnap.docs.map((d) => d.data() as Listing);

  let created = 0;
  const now = Date.now();

  // 1) 저장검색 매칭 (신규/가격인하)
  const ssnap = await adminDb.collection("savedSearches").get();
  for (const sdoc of ssnap.docs) {
    const ss = sdoc.data() as SavedSearch;
    if (ss.alertFreq === "off") continue;
    const since = ss.lastNotifiedAt ?? 0;
    for (const l of listings) {
      if (!match(l, ss.filters)) continue;
      const pub = l.publishedAt2 ?? l.publishedAt ?? 0;
      if (pub > since) {
        if (await alert(ss.userId, "new_listing", l.id, ss.id)) created++;
      } else if ((l.priceDropAt ?? 0) > since) {
        if (await alert(ss.userId, "price_drop", l.id, ss.id)) created++;
      }
    }
    await sdoc.ref.update({ lastNotifiedAt: now });
  }

  // 2) 찜 가격추적
  const fsnap = await adminDb.collection("favorites").where("notifyPriceDrop", "==", true).get();
  for (const fdoc of fsnap.docs) {
    const fav = fdoc.data() as Favorite;
    const l = listings.find((x) => x.id === fav.listingId);
    if (l && (l.priceDropAt ?? 0) > (fav.savedAt ?? 0)) {
      if (await alert(fav.userId, "price_drop", l.id)) created++;
    }
  }

  return NextResponse.json({ ok: true, created, scannedListings: listings.length });
}
