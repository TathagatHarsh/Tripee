import { requireVendor } from '@/lib/auth';
import { InventoryPage } from '@/components/inventory/InventoryPage';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; stock?: string }> }) {
  const { vendor } = await requireVendor();
  return <InventoryPage vendorId={vendor.id} query={await searchParams} />;
}
