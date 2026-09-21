import { LoadingState } from "@/components/admin/ui";

/**
 * What is on screen while a page's data is on its way.
 *
 * §37 asks for skeletons rather than a screen that flashes blank, and one file
 * here covers every route under /admin: Next uses the nearest `loading.tsx` up
 * the tree, so the dashboard, the orders table, every catalogue page and every
 * option editor all get this without a file each.
 *
 * One shared shape rather than a bespoke skeleton per page, and the reason is
 * that a skeleton is only useful if it appears instantly — a per-page one that
 * mirrors its layout exactly is more code to keep in step with that layout than
 * the fidelity is worth. This is a title, a row of stat cards and a table,
 * which is the shape of most pages in the portal.
 *
 * Notably it does NOT reproduce the shell. The sidebar and header live in
 * app/admin/layout.tsx, which has already rendered by the time this shows — so
 * the navigation stays on screen and usable while the page beneath it loads,
 * which is the whole point of putting the guard and the chrome in a layout.
 */
export default function Loading() {
  return <LoadingState />;
}
