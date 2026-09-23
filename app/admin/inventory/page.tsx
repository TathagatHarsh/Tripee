import { requireAdmin } from '@/lib/auth';
import { InventoryPage } from '@/components/inventory/InventoryPage';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; vendor?: string; stock?: string }> }) {
  await requireAdmin();
  return <InventoryPage admin query={await searchParams} />;
}
