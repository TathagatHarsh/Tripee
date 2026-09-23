import 'server-only';
import { getViewer } from './auth';
import { db } from './db';
import type { Prisma } from '@prisma/client';
export async function portalScope() {
  const viewer = await getViewer();
  if (!viewer || !['ADMIN', 'VENDOR'].includes(viewer.profile.role)) return null;
  if (viewer.profile.role === 'VENDOR') {
    if (!viewer.profile.vendorId || !await db.vendor.findFirst({ where: { id: viewer.profile.vendorId, isActive: true } })) return null;
  }
  const where: Prisma.PortalNotificationWhereInput = viewer.profile.role === 'ADMIN' ? {} : { vendorId: viewer.profile.vendorId! };
  return { viewer, where };
}
