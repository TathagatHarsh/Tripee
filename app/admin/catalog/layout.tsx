import { redirect } from "next/navigation";
import { BUILDER_ENABLED } from "@/lib/flags";

/**
 * Options & prices is the 3D builder's parts list. With the builder off the shop
 * sells only the named cakes, so every page under here is held back and old
 * bookmarks land on the cakes the shop does sell. The pages are kept: setting
 * NEXT_PUBLIC_BUILDER_ENABLED=true brings them back with the builder.
 */
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  if (!BUILDER_ENABLED) redirect("/admin/cakes");
  return children;
}
