import { requireVendorSetup } from '@/lib/auth';
import { getViewerEmail } from '@/lib/auth';
import { SignOutButton } from '@clerk/nextjs';
import { aBtn, PageHeader } from '@/components/admin/ui';
import { DetailsForm } from '@/components/vendor/DetailsForm';
import { LocationPicker } from '@/components/vendor/LocationPicker';
import { pointFrom } from '@/lib/assignmentRules';

export default async function Profile() {
  const { vendor } = await requireVendorSetup();
  const email = await getViewerEmail();
  return (
    <div className="space-y-5">
      <PageHeader title={vendor.name} blurb="Your bakery’s contact, location and kitchen details." />
      <section className="rounded-a border border-a-line bg-a-surface p-4 shadow-a-card sm:p-5">
        <h2 className="font-a-sans text-a-item font-semibold text-a-ink">Contact</h2>
        <dl className="mt-2 grid gap-1 text-a-body">
          <div><dt className="inline text-a-muted">Signed in as </dt><dd className="inline font-medium text-a-ink">{email ?? 'your account'}</dd></div>
          {vendor.phone && <div><dt className="inline text-a-muted">Phone </dt><dd className="inline font-medium text-a-ink">{vendor.phone}</dd></div>}
        </dl>
      </section>
      <div id="location" className="scroll-mt-20">
        <LocationPicker initial={vendor.locationSetAt ? pointFrom(vendor) : null} radiusKm={vendor.serviceRadiusKm} setAt={vendor.locationSetAt} />
      </div>
      <DetailsForm key={vendor.updatedAt.toISOString()} vendor={vendor} />
      <SignOutButton redirectUrl="/">
        <button type="button" className={aBtn('secondary', 'md', 'min-h-11')}>Sign out</button>
      </SignOutButton>
    </div>
  );
}
