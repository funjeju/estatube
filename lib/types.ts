// lib/types.ts — DATA-AND-API.md §2 그대로. 단일 진실 원천(SSOT).

export type PropertyType =
  | "단독주택"
  | "토지"
  | "상가"
  | "아파트"
  | "전원주택"
  | "상가주택"
  | "빌라"
  | "기타";
export type DealType = "매매" | "전세" | "월세" | "임대" | "경매";
export type ListingStatus =
  | "collected"
  | "structuring"
  | "draft"
  | "published"
  | "rejected"
  | "opted_out"
  | "error";
export type Theme =
  | "세컨하우스"
  | "한달살기"
  | "구옥"
  | "바다뷰"
  | "읍면단독"
  | "급매";

export interface Structured {
  // EXTRACTION-PROMPT 산출(save_listing tool)
  propertyType: PropertyType;
  dealType: DealType;
  priceText: string;
  priceManwon: number;
  monthlyRentManwon?: number | null;
  areaM2: number | null;
  areaPyeong: number | null;
  zoning: string | null;
  addressText: string | null;
  region: string; // "제주시 애월읍"
  summary: string;
  highlights: string[];
  keywords: string[];
  themes: Theme[];
  confidence: number; // 0~1
}

export interface Listing extends Structured {
  id: string;
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string;
  channelId: string;
  publishedAt: number;
  collectedAt: number;
  lat: number | null;
  lng: number | null;
  geohash: string | null;
  priceHistory: { manwon: number; at: number }[];
  priceDropAt?: number | null;
  extractionSource: "ai" | "fallback";
  status: ListingStatus;
  reviewedBy?: string | null;
  publishedAt2?: number | null;
  takedownAt?: number | null;
  geoNeedsReview?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Agent {
  id: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  name?: string;
  regNo?: string;
  office?: string;
  expertise?: string;
  phone?: string;
  verified: boolean;
  optedOut: boolean;
  plan: "free" | "featured" | "premium";
  createdAt: number;
}

export interface SavedSearch {
  id: string;
  userId: string;
  filters: SearchFilters;
  alertFreq: "instant" | "daily" | "off";
  lastNotifiedAt?: number;
  createdAt: number;
}

export interface Favorite {
  id: string;
  userId: string;
  listingId: string;
  notifyPriceDrop: boolean;
  savedAt: number;
}

export interface AlertItem {
  id: string;
  userId: string;
  type: "new_listing" | "price_drop" | "status_change";
  listingId?: string;
  searchId?: string;
  read: boolean;
  sentAt: number;
}

export interface SearchFilters {
  region?: string;
  propertyType?: PropertyType[];
  dealType?: DealType[];
  priceMinManwon?: number;
  priceMaxManwon?: number;
  areaMinPyeong?: number;
  areaMaxPyeong?: number;
  zoning?: string;
  themes?: Theme[];
  keyword?: string;
  bbox?: { swLat: number; swLng: number; neLat: number; neLng: number };
  sort:
    | "latest"
    | "price_asc"
    | "price_desc"
    | "area"
    | "price_drop"
    | "just_posted";
}

export interface CollectionJob {
  id: string;
  trigger: "cron" | "manual";
  from: string;
  to: string;
  region: string;
  found: number;
  processed: number;
  failed: number;
  items: {
    videoId: string;
    step: string;
    source: string;
    status: string;
    error?: string;
  }[];
  startedAt: number;
  finishedAt?: number;
}

// ── enum 런타임 가드 (zod 등에서 재사용) ──────────────────────────
export const PROPERTY_TYPES: PropertyType[] = [
  "단독주택",
  "토지",
  "상가",
  "아파트",
  "전원주택",
  "상가주택",
  "빌라",
  "기타",
];
export const DEAL_TYPES: DealType[] = ["매매", "전세", "월세", "임대", "경매"];
export const THEMES: Theme[] = [
  "세컨하우스",
  "한달살기",
  "구옥",
  "바다뷰",
  "읍면단독",
  "급매",
];
