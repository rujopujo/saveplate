import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
let ioInstance: Server;

export function setupSockets(server: HttpServer): Server {
  ioInstance = new Server(server, { cors: { origin: '*' } });

  ioInstance.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, role: string };
      (socket as any).user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  ioInstance.on('connection', (socket: Socket) => {
    socket.on('join_spatial_grid', ({ lat, lng }) => {
      const latGrid = Math.floor(lat * 100) / 100;
      const lngGrid = Math.floor(lng * 100) / 100;
      const room = `grid_${latGrid}_${lngGrid}`;
      socket.join(room);
    });

    socket.on('update_location', async ({ lat, lng }) => {
      const userId = (socket as any).user.userId;
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        lng, lat, userId
      );
    });
  });

  return ioInstance;
}

export function emitToNearbyRooms(io: Server, lat: number, lng: number, event: string, data: any) {
  const baseLat = Math.floor(lat * 100) / 100;
  const baseLng = Math.floor(lng * 100) / 100;
  
  for (let dLat = -0.05; dLat <= 0.05; dLat += 0.01) {
    for (let dLng = -0.05; dLng <= 0.05; dLng += 0.01) {
      const gridLat = (baseLat + dLat).toFixed(2);
      const gridLng = (baseLng + dLng).toFixed(2);
      io.to(`grid_${gridLat}_${gridLng}`).emit(event, data);
    }
  }
}

export function emitRemovePin(io: Server, surplusItemId: string) {
  io.emit('remove_pin', { surplusItemId });
}
