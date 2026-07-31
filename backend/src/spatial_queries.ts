import { PrismaClient } from '@prisma/client';

export const MUMBAI_BOUNDS = {
  SW: { lng: 72.7, lat: 18.85 },
  NE: { lng: 73.05, lat: 19.35 }
};

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function findNearbyUsers(prisma: PrismaClient, lng: number, lat: number, radiusMeters = 5000) {
  const users = await prisma.user.findMany({
    where: {
      role: 'CONSUMER',
      lat: { not: null },
      lng: { not: null },
    }
  });
  return users.filter(u => u.lat && u.lng && haversineDistance(lat, lng, u.lat, u.lng) <= radiusMeters).map(u => ({ id: u.id, email: u.email }));
}

export async function claimWithLock(prisma: PrismaClient, surplusItemId: string, consumerId: string, qty = 1) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.surplusItem.findFirst({
      where: { id: surplusItemId }
    });

    if (!item || !item.active) throw new Error('Item not available');
    if (item.quantity < qty) throw new Error('Insufficient stock');
    
    const newQuantity = item.quantity - qty;
    const soldOut = newQuantity === 0;
    
    await tx.surplusItem.update({
      where: { id: surplusItemId },
      data: {
        quantity: newQuantity,
        active: !soldOut
      }
    });
    
    return { newQuantity, soldOut };
  });
}

export async function getActiveSurplusInBounds(prisma: PrismaClient, swLng: number, swLat: number, neLng: number, neLat: number) {
  const items = await prisma.surplusItem.findMany({
    where: {
      active: true,
      lat: { gte: swLat, lte: neLat },
      lng: { gte: swLng, lte: neLng }
    }
  });
  return items.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    discount_tier: item.discountTier,
    lng: item.lng,
    lat: item.lat,
    pickup_window_end: item.pickupWindowEnd,
    restaurant_id: item.restaurantId
  }));
}
