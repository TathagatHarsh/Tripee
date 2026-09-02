/**
 * The name of the step, in the display face.
 *
 * It was `text-2xl` — a raw Tailwind default outside the type scale — on a
 * variable-width grotesque, which put it four points away from a group heading
 * and made every step look like a subsection of something else. The step title
 * is the largest thing in the controls column and it is the only serif in it.
 */
export function StepHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <header className="mb-6 flex flex-col gap-[7px]">
      <h1 className="text-title">{title}</h1>
      <p className="max-w-[52ch] text-body leading-normal text-steel">{hint}</p>
    </header>
  );
}

/**
 * A group heading inside a step: Tiers, Coverage, Drip, Delivery.
 *
 * These were 13px steel legends indistinguishable from the caption underneath
 * the thing above them, so a step with three groups read as one long list. 19px
 * at 600 over a rule is the only other level of hierarchy the column needs.
 */
export function GroupHeader({
  title,
  hint,
  aside,
}: {
  title: string;
  hint?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 border-b border-rule pb-2.5">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h4 className="text-group">{title}</h4>
        {hint && <span className="text-meta leading-snug text-steel">{hint}</span>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
