import { createGameState } from './game-state.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomRegistry {
  constructor({ now = () => Date.now(), random = Math.random, graceMs = 30000 } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.random = random;
    this.graceMs = graceMs;
  }

  create(socketId, playerKey) {
    const code = this.#newCode();
    const player = { key: playerKey, socketId, index: 0, connected: true, position: { x: 150, y: 418 }, facing: 'right', health: 3, downUntil: 0 };
    const room = { code, hostKey: playerKey, players: [player], game: createGameState(), createdAt: this.now(), expiresAt: 0 };
    this.rooms.set(code, room);
    return { room, player };
  }

  join(code, socketId, playerKey) {
    this.prune();
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) return { error: 'Room not found or expired. Check the code and try again.' };
    if (room.players.some((p) => p.key === playerKey)) return { error: 'That agent already has a reserved seat. Reconnect to the room instead.' };
    if (room.players.length >= 2) return { error: 'This room is full or has a player reconnecting.' };
    if (room.game.started) return { error: 'This mission is already in progress.' };
    const index = room.players.some((entry) => entry.index === 0) ? 1 : 0;
    const player = { key: playerKey, socketId, index, connected: true, position: { x: index === 0 ? 150 : 238, y: index === 0 ? 418 : 482 }, facing: index === 0 ? 'right' : 'left', health: 3, downUntil: 0 };
    room.players.push(player);
    return { room, player };
  }

  resume(code, socketId, playerKey) {
    this.prune();
    const room = this.rooms.get(String(code || '').toUpperCase());
    const player = room?.players.find((p) => p.key === playerKey);
    if (!room || !player || player.connected || !player.disconnectedAt || this.now() - player.disconnectedAt > this.graceMs) return { error: 'This room can no longer be resumed.' };
    player.socketId = socketId; player.connected = true; player.disconnectedAt = 0;
    return { room, player };
  }

  disconnect(socketId) {
    const room = this.findBySocket(socketId);
    if (!room) return null;
    const player = room.players.find((p) => p.socketId === socketId);
    player.connected = false; player.socketId = null; player.disconnectedAt = this.now();
    room.expiresAt = this.now() + this.graceMs;
    return { room, player };
  }

  leave(socketId) {
    const room = this.findBySocket(socketId);
    if (!room) return null;
    const player = room.players.find((p) => p.socketId === socketId);
    room.players = room.players.filter((p) => p !== player);
    if (!room.players.length) this.rooms.delete(room.code);
    else if (room.hostKey === player.key) room.hostKey = room.players.find((p) => p.connected)?.key || room.players[0].key;
    return { room, player };
  }

  findBySocket(socketId) { return [...this.rooms.values()].find((room) => room.players.some((p) => p.socketId === socketId)); }

  prune() {
    for (const [code, room] of this.rooms) {
      const expired = room.players.some((p) => !p.connected && p.disconnectedAt && this.now() - p.disconnectedAt > this.graceMs);
      if (!expired) continue;
      room.players = room.players.filter((p) => p.connected);
      if (!room.players.length) this.rooms.delete(code);
      else {
        room.expiresAt = 0;
        if (!room.players.some((p) => p.key === room.hostKey)) room.hostKey = room.players[0].key;
      }
    }
  }

  #newCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let i = 0; i < 5; i += 1) code += CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Unable to allocate a unique room code.');
  }
}
