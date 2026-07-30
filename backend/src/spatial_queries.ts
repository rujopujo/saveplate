import { PrismaClient } from '@prisma/client';

export const MUMBAI_BOUNDS = {
  SW: { lng: 72.7, lat: 18.85 },
  NE: { lng: 73.05, lat: 19.35 }
};

export async function findNearbyUsers(prisma: PrismaClient, lng: number, lat: number, radiusMeters = 5000) {
  return prisma.$queryRawUnsafe<{ id: string, email: string }[]>(
    `SELECT id, email FROM "User" 
     WHERE role = 'CONSUMER' 
     AND location IS NOT NULL 
     AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
    lng, lat, radiusMeters
  );
}

export async function claimWithLock(prisma: PrismaClient, surplusItemId: string, consumerId: string, qty = 1) {
  return prisma.$transaction(async (tx) => {
    const items = await tx.$queryRawUnsafe<{ quantity: number, active: boolean }[]>(
      `SELECT quantity, active FROM surplus_items WHERE id = $1::uuid FOR UPDATE`,
      surplusItemId
    );

    if (!items.length || !items[0].active) throw new Error('Item not available');
    
    const currentQty = items[0].quantity;
    if (currentQty < qty) throw new Error('Insufficient stock');
    
    await tx.$executeRawUnsafe(
      `UPDATE surplus_items SET quantity = quantity - $2 WHERE id = $1::uuid`,
      surplusItemId, qty
    );
    
    const newQuantity = currentQty - qty;
    const soldOut = newQuantity === 0;
    
    if (soldOut) {
      await tx.$executeRawUnsafe(
        `UPDATE surplus_items SET active = false WHERE id = $1::uuid`,
        surplusItemId
      );
    }
    
    return { newQuantity, soldOut };
  });
}

export async function getActiveSurplusInBounds(prisma: PrismaClient, swLng: number, swLat: number, neLng: number, neLat: number) {
  return prisma.$queryRawUnsafe<{ id: string, name: string, quantity: number, discount_tier: string, lng: number, lat: number, pickup_window_end: Date, restaurant_id: string }[]>(
    `SELECT id, name, quantity, discount_tier, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat, pickup_window_end, restaurant_id
     FROM surplus_items 
     WHERE active = true 
     AND ST_Within(location::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
    swLng, swLat, neLng, neLat
  );
}
