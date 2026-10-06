import { CakePhoto } from "@/components/shop/CakePhoto";
import { Icon } from "@/components/admin/icons";
import { aBtn } from "@/components/admin/ui";
import type { CakeConfig } from "@/lib/schema";

/**
 * The whole photograph, uncropped, for whoever has to reproduce the cake.
 *
 * `fit="contain"` so nothing is trimmed off the edges, a link to the original
 * for zooming, and a download through /api/orders/[ref]/photo. A builder cake
 * with no photograph shows its drawing and no buttons: there is no file to give.
 */
export function FullCakePhoto({
  orderRef,
  src,
  cakeId,
  name,
  config,
  size = "lg",
}: {
  orderRef: string;
  src: string | null;
  /** Which of the order's cakes, for a multi-cake order. */
  cakeId?: string;
  name: string;
  config?: CakeConfig | null;
  size?: "sm" | "lg";
}) {
  const frame = size === "lg" ? "aspect-square w-full max-w-sm" : "size-28";
  const photo = (
    <CakePhoto
      src={src}
      alt={`Photo of the ${name} as ordered`}
      config={config}
      fit="contain"
      sizes={size === "lg" ? "(min-width: 640px) 384px, 100vw" : "112px"}
    />
  );

  if (!src) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-a border border-a-line bg-a-sunken ${frame}`}>
        {photo}
      </div>
    );
  }

  const download = `/api/orders/${encodeURIComponent(orderRef)}/photo${cakeId ? `?cake=${encodeURIComponent(cakeId)}` : ""}`;
  return (
    <figure className={`flex shrink-0 flex-col gap-2 ${size === "lg" ? "w-full max-w-sm" : "w-28"}`}>
      <a
        href={src}
        target="_blank"
        rel="noopener"
        aria-label={`Open the ${name} photo full size`}
        className={`relative block overflow-hidden rounded-a border border-a-line bg-a-sunken transition-colors hover:border-a-accent-line ${frame}`}
      >
        {photo}
      </a>
      <a href={download} download className={aBtn("secondary", size === "lg" ? "md" : "sm", "w-full")}>
        <Icon name="arrowDown" size={14} />
        {size === "lg" ? "Download photo" : "Download"}
      </a>
    </figure>
  );
}
