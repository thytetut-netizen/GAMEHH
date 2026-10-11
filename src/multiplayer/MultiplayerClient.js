import { io } from 'socket.io-client';
import { readStorage, removeStorage, writeStorage } from '../game/storage.js';

const PLAYER_KEY = 'operation-hebrew-player-key';
const ROOM_KEY = 'operation-hebrew-last-room';

function persistentKey() {
  let key = readStorage(PLAYER_KEY);
  if (!key) {
    key = globalThis.crypto?.randomUUID?.() || `agent-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    writeStorage(PLAYER_KEY, key);
  }
  return key;
}

export class MultiplayerClient {
  constructor(bus) {
    this.bus = bus;
    this.playerKey = persistentKey();
    this.lastRoom = readStorage(ROOM_KEY);
    this.resumePending = false;
    this.socket = io({ autoConnect: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 700, reconnectionDelayMax: 3500, timeout: 12000 });
    this.socket.on('connect', () => {
      this.bus.emit('network', { connected: true });
      if (this.lastRoom) { this.resumePending = true; this.socket.emit('room:resume', { code: this.lastRoom, playerKey: this.playerKey }); }
    });
    this.socket.on('disconnect', () => this.bus.emit('network', { connected: false }));
    for (const event of ['room:joined', 'room:state', 'game:state', 'game:started', 'game:action-result', 'game:error', 'game:notice']) {
      this.socket.on(event, (data) => {
        if (event === 'room:joined' && data?.code) { this.resumePending = false; this.lastRoom = data.code; writeStorage(ROOM_KEY, data.code); }
        if (event === 'game:error' && this.resumePending) {
          this.resumePending = false; this.lastRoom = null; removeStorage(ROOM_KEY);
          this.bus.emit('room:resume-failed', data);
        }
        this.bus.emit(event, data);
      });
    }
  }

  createRoom() { this.socket.emit('room:create', { playerKey: this.playerKey }); }
  joinRoom(code) { this.socket.emit('room:join', { code: code.trim().toUpperCase(), playerKey: this.playerKey }); }
  startMission() { this.socket.emit('game:start'); }
  move(position, facing) { this.socket.emit('player:move', { ...position, facing }); }
  interact(target) { this.socket.emit('game:interact', { target }); }
  attack() { this.socket.emit('game:attack'); }
  restart() { this.socket.emit('game:restart'); }
  returnToLobby() { this.socket.emit('game:return-lobby'); }
  leave() {
    this.socket.emit('room:leave');
    this.lastRoom = null;
    removeStorage(ROOM_KEY);
  }
}
