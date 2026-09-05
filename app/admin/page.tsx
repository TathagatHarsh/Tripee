import { redirect } from "next/navigation";

/**
 * There is no admin home page, because there is nothing a bakery owner opens
 * this to look at that is not one of the sections. Landing on the catalogue is
 * landing on the reason this portal exists.
 */
export default function AdminIndex() {
  redirect("/admin/catalog");
}
