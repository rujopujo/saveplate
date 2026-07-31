import express from 'express';
import http from 'http';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cron from 'node-cron';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { setupSockets, emitToNearbyRooms, emitRemovePin } from './sockets';
import { findNearbyUsers, claimWithLock, getActiveSurplusInBounds, MUMBAI_BOUNDS } from './spatial_queries';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = setupSockets(server);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(generalLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const roleGuard = (roles: string[]) => (req: any, res: any, next: any) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/),
  name: z.string(),
  role: z.enum(['CONSUMER', 'RESTAURANT', 'consumer', 'restaurant'])
});

app.post('/api/v1/auth/register', authLimiter, async (req: any, res: any) => {
  try {
    if (req.body.role && typeof req.body.role === 'string') {
      req.body.role = req.body.role.toUpperCase();
    }
    const { email, password, name, role } = registerSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role }
    });
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    res.json({ accessToken: token, refreshToken, user: { role: user.role } });
  } catch (e: any) {
    res.status(400).json({ error: e.errors ? e.errors : 'Registration failed' });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

app.post('/api/v1/auth/login', authLimiter, async (req: any, res: any) => {
  const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(403).json({ error: 'Account is locked. Try again later.' });
    }
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      await prisma.loginAttempt.create({ data: { email, ipAddress, success: false } });
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        if (attempts >= 5) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) }
          });
        } else {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts }
          });
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await prisma.loginAttempt.create({ data: { email, ipAddress, success: true } });
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    res.json({ accessToken: token, refreshToken, user: { role: user.role } });
  } catch (e: any) {
    res.status(400).json({ error: e.errors ? e.errors : 'Login failed' });
  }
});

const refreshSchema = z.object({
  refreshToken: z.string()
});

app.post('/api/v1/auth/refresh', async (req: any, res: any) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const storedToken = await prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false, expiresAt: { gt: new Date() } },
      include: { user: true }
    });
    
    if (!storedToken) return res.status(401).json({ error: 'Invalid refresh token' });
    
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true }
    });
    
    const token = jwt.sign({ userId: storedToken.user.id, role: storedToken.user.role }, JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    
    await prisma.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: storedToken.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    res.json({ accessToken: token, refreshToken: newRefreshToken });
  } catch (e: any) {
    res.status(400).json({ error: 'Refresh failed' });
  }
});

app.post('/api/v1/auth/logout', authMiddleware, async (req: any, res: any) => {
  try {
    await prisma.refreshToken.updateMany({
      where: { userId: req.user.userId, revoked: false },
      data: { revoked: true }
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/v1/me', authMiddleware, async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, role: true, co2_saved: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, co2Saved: user.co2_saved });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/v1/surplus', authMiddleware, roleGuard(['CONSUMER', 'RESTAURANT']), async (req: any, res: any) => {
  try {
    const items = await prisma.surplusItem.findMany({
      where: { active: true, quantity: { gt: 0 } }
    });
    const mapped = items.map(item => {
      let tierStr = item.discountTier as string;
      if (item.discountTier === 'HALF_OFF') tierStr = '50% OFF';
      else if (item.discountTier === 'THREE_QUARTER_OFF') tierStr = '75% OFF';
      else if (item.discountTier === 'FREE') tierStr = 'FREE';

      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        discountTier: tierStr,
        pickupWindowEnd: item.pickupWindowEnd,
        lng: item.lng,
        lat: item.lat
      };
    });
    res.json(mapped);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/v1/surplus', authMiddleware, roleGuard(['RESTAURANT']), async (req: any, res: any) => {
  let { name, quantity, originalPrice, discountTier, pickupWindowStart, pickupWindowEnd, lat, lng } = req.body;
  const id = crypto.randomUUID();
  
  if (discountTier === '50% OFF') discountTier = 'HALF_OFF';
  else if (discountTier === '75% OFF') discountTier = 'THREE_QUARTER_OFF';
  else if (discountTier === 'FREE') discountTier = 'FREE';

  await prisma.surplusItem.create({
    data: {
      id,
      restaurantId: req.user.userId,
      name,
      quantity,
      originalPrice,
      discountTier,
      pickupWindowStart: new Date(pickupWindowStart),
      pickupWindowEnd: new Date(pickupWindowEnd),
      lat,
      lng
    }
  });
  
  const nearbyUsers = await findNearbyUsers(prisma, lng, lat, 5000);
  if (nearbyUsers.length) {
    emitToNearbyRooms(io, lat, lng, 'new_surplus_pin', { id, name, quantity, discountTier, lat, lng });
  }
  res.status(201).json({ id });
});

app.post('/api/v1/claim', authMiddleware, roleGuard(['CONSUMER']), async (req: any, res: any) => {
  const { surplusItemId, quantity } = req.body;
  try {
    const { newQuantity, soldOut } = await claimWithLock(prisma, surplusItemId, req.user.userId, quantity);
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const qrData = `claim:${surplusItemId}:${req.user.userId}:${otpCode}`;
    
    await prisma.reservation.create({
      data: {
        surplusItemId,
        consumerId: req.user.userId,
        otpCode,
        qrData,
        status: 'PENDING',
        quantity
      }
    });

    const item = await prisma.surplusItem.findUnique({ where: { id: surplusItemId } });
    if (item) {
      const { lat, lng } = item;
      emitToNearbyRooms(io, lat, lng, 'update_pin_qty', { surplusItemId, newQuantity });
      if (soldOut) emitRemovePin(io, surplusItemId);
    }
    
    res.json({ otp: otpCode, qrData });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/v1/verify', authMiddleware, roleGuard(['RESTAURANT']), async (req: any, res: any) => {
  const { otpCode } = req.body;
  const reservation = await prisma.reservation.findFirst({
    where: { otpCode, status: 'PENDING', surplusItem: { restaurantId: req.user.userId } },
    include: { surplusItem: true }
  });
  
  if (!reservation) return res.status(400).json({ error: 'Invalid or expired OTP' });
  
  const co2Saved = reservation.quantity * 1.5;
  
  await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'COMPLETED' }
    }),
    prisma.user.update({
      where: { id: reservation.consumerId },
      data: { co2_saved: { increment: co2Saved } }
    }),
    prisma.user.update({
      where: { id: req.user.userId },
      data: { co2_saved: { increment: co2Saved } }
    })
  ]);
  
  res.json({ success: true, co2Saved });
});

cron.schedule('* * * * *', async () => {
  const expiredItems = await prisma.surplusItem.findMany({
    where: { active: true, pickupWindowEnd: { lt: new Date() } }
  });
  
  if (expiredItems.length > 0) {
    const ids = expiredItems.map(item => item.id);
    await prisma.surplusItem.updateMany({
      where: { id: { in: ids } },
      data: { active: false }
    });
    expiredItems.forEach(item => emitRemovePin(io, item.id));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
