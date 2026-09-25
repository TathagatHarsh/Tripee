/** Shared vector mark and the approved Fraunces wordmark. Inherits surface color. */
export function BrandLogo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className={`brand-logo inline-flex shrink-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
      {/* A static SVG keeps the mark identical in navigation and app icons. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light ? "/brand/mark-light.svg" : "/brand/mark.svg"} width={24} height={24} alt="" className="size-6 shrink-0" />
      <span className={`font-display font-normal normal-case leading-none tracking-[-0.01em] whitespace-nowrap ${compact ? "text-[1.125rem]" : "text-[1.375rem]"}`}>
        MakeYourCakes
      </span>
    </span>
  );
}
