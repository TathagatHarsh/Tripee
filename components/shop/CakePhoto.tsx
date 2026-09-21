import Image from "next/image";
import { CakeMark } from "@/components/orders/CakeMark";
import type { CakeConfig } from "@/lib/schema";

/**
 * A cake's photograph, or the cake drawn, and never a placeholder.
 *
 * Every cake had a picture when the catalogue was hardcoded: the twenty-one
 * presets ship committed renders of their own configuration. A cake an owner
 * adds at /admin/cakes has whatever they uploaded, and until they upload
 * something it has nothing at all — which is a real state and needs a real
 * answer.
 *
 * The answer is the same one components/orders/CakeThumb has always given an
 * order with no photograph: draw it. `CakeMark` renders a cake from its config
 * — real tiers, real frosting colour — and for a cake with no config it draws a
 * plain one. What it never does is show a stock photograph of somebody else's
 * cake under this cake's name, which is the one thing a shop must not do and
 * the reason lib/photos.ts is an empty array with an explanation in it.
 *
 * `object-[50%_62%]` because the preset photographs are 1122x1402 portrait with
 * the cake running from about a fifth of the way down; printed square, the
 * wasted backdrop is all at the top. components/PresetCard measured this.
 */
export function CakePhoto({
  src,
  alt,
  config,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  /** Drawn when there is no photograph. Null draws a plain cake. */
  config?: CakeConfig | null;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return <CakeMark config={config ?? null} className={`size-full p-4 ${className}`} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover object-[50%_62%] ${className}`}
    />
  );
}
