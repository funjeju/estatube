import Link from "next/link";
import type { Listing } from "@/lib/types";

// 썸네일 카드 (SPEC §6). 공개 리스트·테마·검색 공용.
export function ListingCard({ listing: l }: { listing: Listing }) {
  const drop = !!l.priceDropAt;
  return (
    <Link
      href={`/listing/${l.id}`}
      className="group block overflow-hidden rounded-card border border-stone/40 bg-paper transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-video bg-sea-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={l.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-pill bg-basalt/85 px-2 py-0.5 text-xs text-paper">
          {l.propertyType}
        </span>
        {drop && (
          <span className="num absolute right-2 top-2 rounded-pill bg-tangerine px-2 py-0.5 text-xs text-paper">
            ▼인하
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="num text-lg font-bold text-basalt">{l.priceManwon.toLocaleString()}만</div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <span className="rounded-pill bg-sea-soft px-2 py-0.5 text-sea">{l.dealType}</span>
          {l.zoning && <span className="rounded-pill border border-stone px-2 py-0.5 text-muted">{l.zoning}</span>}
        </div>
        <div className="num mt-1 text-sm text-tangerine">{l.region}{l.areaPyeong ? ` · ${l.areaPyeong}평` : ""}</div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{l.summary}</p>
        {l.keywords?.length > 0 && (
          <div className="mt-2 truncate text-xs text-stone">
            {l.keywords.slice(0, 5).map((k) => `#${k}`).join(" ")}
          </div>
        )}
      </div>
    </Link>
  );
}
