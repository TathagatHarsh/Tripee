import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LAB_CONFIGS } from "../configs";
import { LabSolo } from "./LabSolo";

export const metadata: Metadata = {
  title: "Render lab — single",
  robots: { index: false, follow: false },
};

/** One cake, big. This is where the squint test actually happens. */
export default async function LabSoloPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  const i = Number(index);
  const entry = LAB_CONFIGS[i];
  if (!entry) notFound();

  return (
    <main className="min-h-dvh p-4 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h1 className="text-sm ">{entry.label}</h1>
        <nav className="flex gap-3 text-meta text-steel">
          <Link href="/lab" className="underline underline-offset-4">All twelve</Link>
          {i > 0 && <Link href={`/lab/${i - 1}`}>Prev</Link>}
          {i < LAB_CONFIGS.length - 1 && <Link href={`/lab/${i + 1}`}>Next</Link>}
        </nav>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-steel">{entry.note}</p>

      <div className="h-[78dvh] overflow-hidden bg-paper paper-edge">
        <LabSolo index={i} />
      </div>
    </main>
  );
}

export function generateStaticParams() {
  return LAB_CONFIGS.map((_, i) => ({ index: String(i) }));
}
