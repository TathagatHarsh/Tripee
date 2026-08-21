import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-5">
        <span className={eyebrow}>404</span>
        <h1 className="text-heading">Nothing on this shelf</h1>
        <p className="text-body leading-relaxed text-steel">
          The page you were after isn&rsquo;t here. The cake builder is, though.
        </p>
        <Link href="/build/shape" className={btn("primary", "md")}>
          Build a cake
        </Link>
      </div>
    </main>
  );
}
