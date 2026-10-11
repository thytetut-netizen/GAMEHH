import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomRegistry } from './rooms.js';
import { applyInteraction, createGameState, damageRobot, expireCoopWindows } from './game-state.js';
import { collidesWithWorld, DOORS, OBJECTS, SPAWNS, WORLD } from '../src/game/levelData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.NODE_ENV === 'production' ? false : '*' }, pingInterval: 25000, pingTimeout: 20000 });
const rooms = new RoomRegistry();
const buckets = new Map();
const lastAttack = new Map();
const targetNames = new Set(['key', 'decoy', 'door1', 'blueSwitch', 'redSwitch', 'controlA', 'controlB', 'exit']);

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'operation-hebrew' }));
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

function allow(socket, event, limit = 20, intervalMs = 1000) {
  const now = Date.now();
  const key = `${socket.id}:${event}`;
  const bucket = buckets.get(key) || { count: 0, start: now };
  if (now - bucket.start >= intervalMs) { bucket.count = 0; bucket.start = now; }
  bucket.count += 1; buckets.set(key, bucket);
  return bucket.count <= limit;
}

function sendError(socket, message) { socket.emit('game:error', { message }); }
function validPlayerKey(value) { return typeof value === 'string' && /^[\w-]{12,64}$/.test(value); }
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function publicPlayer(player, room) {
  return { id: `p${player.index + 1}`, index: player.index, connected: player.connected, position: { ...player.position }, facing: player.facing, health: player.health, down: player.downUntil > Date.now(), host: player.key === room.hostKey };
}

function snapshot(room) {
  return {
    code: room.code,
    hostIndex: room.players.find((player) => player.key === room.hostKey)?.index ?? 0,
    started: room.game.started,
    players: room.players.map((player) => publicPlayer(player, room)),
    game: {
      started: room.game.started,
      stage: room.game.stage,
      keyCollected: room.game.keyCollected,
      doors: { ...room.game.doors },
      switches: { blue: Boolean(room.game.switches.blue), red: Boolean(room.game.switches.red), expiresAt: room.game.switches.expiresAt },
      robot: { ...room.game.robot },
      controls: { a: Boolean(room.game.controls.a), b: Boolean(room.game.controls.b), expiresAt: room.game.controls.expiresAt },
      generator: room.game.generator,
      words: [...room.game.words],
      completed: room.game.completed,
    },
  };
}

function broadcastState(room) {
  if (room) io.to(room.code).emit(room.game.started ? 'game:state' : 'room:state', snapshot(room));
}

function attachPlayer(socket, room, player, resumed = false) {
  socket.join(room.code);
  player.lastMoveAt = Date.now();
  player.lastAcceptedPosition = { ...player.position };
  socket.data.roomCode = room.code;
  socket.emit('room:joined', { ...snapshot(room), myIndex: player.index, resumed });
  broadcastState(room);
  if (resumed) io.to(room.code).emit('game:notice', { message: 'Agent reconnected. Mission state restored.' });
}

io.on('connection', (socket) => {
  socket.on('room:create', (input) => {
    const payload = safeObject(input);
    if (!allow(socket, 'room:create', 3) || !validPlayerKey(payload.playerKey)) return sendError(socket, 'Unable to create a room. Refresh and try again.');
    if (rooms.findBySocket(socket.id)) return sendError(socket, 'Leave your current room before creating another.');
    const { room, player } = rooms.create(socket.id, payload.playerKey);
    attachPlayer(socket, room, player);
  });

  socket.on('room:join', (input) => {
    const payload = safeObject(input);
    if (!allow(socket, 'room:join', 5) || !validPlayerKey(payload.playerKey) || typeof payload.code !== 'string' || !/^[a-z0-9]{5}$/i.test(payload.code)) return sendError(socket, 'Enter a five-character room code.');
    if (rooms.findBySocket(socket.id)) return sendError(socket, 'Leave your current room before joining another.');
    const joined = rooms.join(payload.code, socket.id, payload.playerKey);
    if (joined.error) return sendError(socket, joined.error);
    attachPlayer(socket, joined.room, joined.player);
    io.to(joined.room.code).emit('game:notice', { message: 'A second agent has joined the mission.' });
  });

  socket.on('room:resume', (input) => {
    const payload = safeObject(input);
    if (!allow(socket, 'room:resume', 4) || !validPlayerKey(payload.playerKey) || typeof payload.code !== 'string') return sendError(socket, 'Unable to reconnect to that room.');
    if (rooms.findBySocket(socket.id)) return sendError(socket, 'Leave your current room before reconnecting elsewhere.');
    const resumed = rooms.resume(payload.code, socket.id, payload.playerKey);
    if (resumed.error) return sendError(socket, resumed.error);
    attachPlayer(socket, resumed.room, resumed.player, true);
  });

  socket.on('game:start', () => {
    if (!allow(socket, 'game:start', 3)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room || !player || player.key !== room.hostKey) return sendError(socket, 'Only the host can start the mission.');
    if (room.players.length !== 2 || room.players.some((entry) => !entry.connected)) return sendError(socket, 'Waiting for both agents to connect.');
    if (room.game.started) return;
    room.game = createGameState(); room.game.started = true; room.game.startedAt = Date.now();
    room.players.forEach((entry) => {
      entry.position = { ...SPAWNS[entry.index] }; entry.health = 3; entry.downUntil = 0;
      entry.lastAcceptedPosition = { ...entry.position }; entry.lastMoveAt = Date.now();
    });
    io.to(room.code).emit('game:started', snapshot(room));
    broadcastState(room);
  });

  socket.on('player:move', (input) => {
    const payload = safeObject(input);
    if (!allow(socket, 'player:move', 22, 1000)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room?.game.started || room.game.completed || !player?.connected || player.downUntil > Date.now()) return;
    const { x, y, facing } = payload;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !['up', 'down', 'left', 'right'].includes(facing)) return;
    const now = Date.now();
    const elapsed = Math.max(0.02, Math.min(0.3, (now - (player.lastMoveAt || now)) / 1000));
    const maxDelta = elapsed * 292 + 22;
    if (Math.hypot(x - player.position.x, y - player.position.y) > maxDelta) return;
    if (collidesWithWorld(x, y, 16, room.game)) return;
    player.position = { x, y }; player.facing = facing; player.lastMoveAt = now;
    player.lastAcceptedPosition = { x, y };
  });

  socket.on('game:interact', (input) => {
    const payload = safeObject(input);
    if (!allow(socket, 'game:interact', 5, 1000) || typeof payload.target !== 'string' || !targetNames.has(payload.target)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room?.game.started || !player) return;
    const result = applyInteraction(room.game, player, room.players, payload.target);
    if (result.vocab) for (const word of result.vocab) if (!room.game.words.includes(word)) room.game.words.push(word);
    const actionResult = { target: payload.target, ...result };
    if (result.ok) io.to(room.code).emit('game:action-result', actionResult);
    else socket.emit('game:action-result', actionResult);
    if (result.ok) broadcastState(room);
  });

  socket.on('game:attack', () => {
    if (!allow(socket, 'game:attack', 3, 1000)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room?.game.started || !player) return;
    const last = lastAttack.get(socket.id) || 0;
    if (Date.now() - last < 500) return;
    lastAttack.set(socket.id, Date.now());
    const result = damageRobot(room.game, player);
    if (result.ok) io.to(room.code).emit('game:action-result', { target: 'robot', ...result });
    else socket.emit('game:action-result', { target: 'robot', ...result });
    if (result.ok) broadcastState(room);
  });

  socket.on('game:restart', () => {
    if (!allow(socket, 'game:restart', 2)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room || !player || !room.game.started || !room.game.completed) return sendError(socket, 'A completed mission is required before retrying.');
    room.game = createGameState(); room.game.started = true; room.game.startedAt = Date.now();
    room.players.forEach((entry) => { entry.position = { ...SPAWNS[entry.index] }; entry.health = 3; entry.downUntil = 0; entry.lastAcceptedPosition = { ...entry.position }; });
    io.to(room.code).emit('game:started', snapshot(room)); broadcastState(room);
  });

  socket.on('game:return-lobby', () => {
    if (!allow(socket, 'game:return-lobby', 2)) return;
    const room = rooms.findBySocket(socket.id);
    const player = room?.players.find((entry) => entry.socketId === socket.id);
    if (!room || !player || !room.game.started || !room.game.completed) return sendError(socket, 'Complete the mission before returning to the lobby.');
    room.game = createGameState();
    room.players.forEach((entry, index) => { entry.position = { ...SPAWNS[index] }; entry.health = 3; entry.downUntil = 0; });
    io.to(room.code).emit('game:notice', { message: 'Mission ended. The team returned to the lobby.' });
    broadcastState(room);
  });

  socket.on('room:leave', () => {
    if (!allow(socket, 'room:leave', 4)) return;
    const code = socket.data.roomCode;
    const removed = rooms.leave(socket.id);
    if (code) socket.leave(code);
    socket.data.roomCode = null;
    if (!removed) return;
    if (removed.room.players.length) {
      io.to(removed.room.code).emit('game:notice', { message: `${removed.player.index === 0 ? 'Blue' : 'Orange'} agent left the room.` });
      broadcastState(removed.room);
    }
  });

  socket.on('disconnect', () => {
    const result = rooms.disconnect(socket.id);
    if (result) {
      io.to(result.room.code).emit('game:notice', { message: 'Agent connection lost. Their seat is reserved for 30 seconds.' });
      broadcastState(result.room);
    }
    for (const key of buckets.keys()) if (key.startsWith(`${socket.id}:`)) buckets.delete(key);
    lastAttack.delete(socket.id);
  });
});

let lastTick = Date.now();
let lastBroadcast = 0;
setInterval(() => {
  const now = Date.now();
  const dt = Math.max(0, Math.min(0.1, (now - lastTick) / 1000)); lastTick = now;
  const roomSizes = new Map([...rooms.rooms].map(([code, room]) => [code, room.players.length]));
  rooms.prune();
  for (const room of rooms.rooms.values()) {
    if ((roomSizes.get(room.code) ?? room.players.length) !== room.players.length) {
      const message = room.game.started ? 'Your partner could not reconnect. You can leave this mission and create a new room.' : 'The reconnect window ended. The open seat is available for a new partner.';
      io.to(room.code).emit('game:notice', { message, sound: 'notice' });
      broadcastState(room);
    }
    if (!room.game.started || room.game.completed) continue;
    const game = room.game;
    expireCoopWindows(game, now);
    const active = room.players.filter((player) => player.connected && player.downUntil <= now);
    if (game.stage === 'robot' && !game.robot.disabled && active.length) {
      const target = active.reduce((best, player) => Math.hypot(player.position.x - game.robot.x, player.position.y - game.robot.y) < Math.hypot(best.position.x - game.robot.x, best.position.y - game.robot.y) ? player : best, active[0]);
      const distance = Math.hypot(target.position.x - game.robot.x, target.position.y - game.robot.y);
      if (distance < 350 && distance > 1) {
        const step = Math.min(distance - 1, 78 * dt);
        const nx = game.robot.x + ((target.position.x - game.robot.x) / distance) * step;
        const ny = game.robot.y + ((target.position.y - game.robot.y) / distance) * step;
        if (!collidesWithWorld(nx, game.robot.y, 18, game)) game.robot.x = nx;
        if (!collidesWithWorld(game.robot.x, ny, 18, game)) game.robot.y = ny;
      }
      if (distance < 48 && now >= game.robot.nextAttackAt) {
        target.health = Math.max(0, target.health - 1); game.robot.nextAttackAt = now + 2200;
        io.to(room.code).emit('game:notice', { message: `${target.index === 0 ? 'Blue' : 'Orange'} agent took a hit.`, sound: 'damage' });
        if (!target.health) {
          target.downUntil = now + 6500;
          io.to(room.code).emit('game:notice', { message: 'Agent down. Stand by for a quick recovery.', sound: 'damage' });
        }
      }
    }
    for (const player of room.players) {
      if (player.connected && player.downUntil && player.downUntil <= now) {
        player.health = 3; player.downUntil = 0; player.position = { ...SPAWNS[player.index] };
        io.to(room.code).emit('game:notice', { message: 'Agent recovered at the entry point.', sound: 'revive' });
      }
    }
    if (now - lastBroadcast >= 100) broadcastState(room);
  }
  if (now - lastBroadcast >= 100) lastBroadcast = now;
}, 50);

const port = Number(process.env.PORT) || 3001;
httpServer.listen(port, '0.0.0.0', () => console.log(`OPERATION HEBREW server listening on ${port}`));
