// lib/search.ts — 공개 검색 쿼리빌더 + 클라 필터/정렬.
// 인덱스 에러 회피: 서버는 status==published (+keyword array-contains) + orderBy publishedAt
// 두 인덱스만 사용(firestore.indexes.json에 존재). 나머지 필터·정렬은 로드된 페이지에 클라 적용.

import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import type { Listing, SearchFilters } from "./types";

export const PAGE_SIZE = 12;

export function buildListingQuery(
  db: Firestore,
  filters: SearchFilters,
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
) {
  const cons: QueryConstraint[] = [where("status", "==", "published")];
  const kw = filters.keyword?.trim();
  if (kw) cons.push(where("keywords", "array-contains", kw)); // status+keywords+publishedAt 인덱스
  cons.push(orderBy("publishedAt", "desc"));
  if (cursor) cons.push(startAfter(cursor));
  cons.push(fbLimit(PAGE_SIZE));
  return query(collection(db, "listings"), ...cons);
}

export function applyClientFilters(items: Listing[], f: SearchFilters): Listing[] {
  return items.filter((l) => {
    if (f.region && l.region !== f.region) return false;
    if (f.propertyType?.length && !f.propertyType.includes(l.propertyType)) return false;
    if (f.dealType?.length && !f.dealType.includes(l.dealType)) return false;
    if (f.priceMinManwon != null && l.priceManwon < f.priceMinManwon) return false;
    if (f.priceMaxManwon != null && l.priceManwon > f.priceMaxManwon) return false;
    if (f.areaMinPyeong != null && (l.areaPyeong ?? 0) < f.areaMinPyeong) return false;
    if (f.areaMaxPyeong != null && (l.areaPyeong ?? Number.POSITIVE_INFINITY) > f.areaMaxPyeong) return false;
    if (f.zoning && l.zoning !== f.zoning) return false;
    if (f.themes?.length && !f.themes.some((t) => l.themes?.includes(t))) return false;
    if (f.bbox) {
      if (l.lat == null || l.lng == null) return false;
      const { swLat, swLng, neLat, neLng } = f.bbox;
      if (l.lat < swLat || l.lat > neLat || l.lng < swLng || l.lng > neLng) return false;
    }
    return true;
  });
}

export function sortListings(items: Listing[], sort: SearchFilters["sort"]): Listing[] {
  const a = [...items];
  switch (sort) {
    case "price_asc": a.sort((x, y) => x.priceManwon - y.priceManwon); break;
    case "price_desc": a.sort((x, y) => y.priceManwon - x.priceManwon); break;
    case "area": a.sort((x, y) => (y.areaPyeong ?? 0) - (x.areaPyeong ?? 0)); break;
    case "price_drop": a.sort((x, y) => (y.priceDropAt ?? 0) - (x.priceDropAt ?? 0)); break;
    case "just_posted": a.sort((x, y) => (y.collectedAt ?? 0) - (x.collectedAt ?? 0)); break;
    default: a.sort((x, y) => (y.publishedAt ?? 0) - (x.publishedAt ?? 0));
  }
  return a;
}
