import { notFound } from "next/navigation";

/** A design study, not part of the shop: answers 404 on the live site, still works locally and on previews. */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return children;
}
