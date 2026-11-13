/** The supplied artwork, with a wordmark window for compact navigation. */
export function BrandLogo({ compact = false, light = false, full = false }: { compact?: boolean; light?: boolean; full?: boolean }) {
  return (
    <span className={`brand-logo ${full ? "brand-logo-full" : "brand-logo-wordmark"} ${compact ? "brand-logo-compact" : ""} ${light ? "brand-logo-light" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.webp" width={1200} height={800} alt="MakeYourCakes.com" />
    </span>
  );
}
