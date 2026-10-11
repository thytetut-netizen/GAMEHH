import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry } from '../server/rooms.js';
import { applyInteraction, createGameState, damageRobot, expireCoopWindows } from '../server/game-state.js';
import { DOORS, OBJECTS, SPAWNS } from '../src/game/levelData.js';

test('room registry creates short codes, caps at two, and reserves a disconnect for 30 seconds', () => {
  let now = 1000;
  const registry = new RoomRegistry({ now: () => now, random: () => 0.1, graceMs: 30000 });
  const created = registry.create('socket-a', 'player-key-a-123456');
  assert.match(created.room.code, /^[A-Z2-9]{5}$/);
  const joined = registry.join(created.room.code, 'socket-b', 'player-key-b-123456');
  assert.equal(joined.player.index, 1);
  assert.match(registry.join(created.room.code, 'socket-c', 'player-key-c-123456').error, /full/i);
  registry.disconnect('socket-b');
  assert.match(registry.join(created.room.code, 'socket-c', 'player-key-c-123456').error, /full|reconnecting/i);
  now += 29999;
  assert.equal(registry.resume(created.room.code, 'socket-b2', 'player-key-b-123456').player.connected, true);
  registry.disconnect('socket-b2');
  now += 30001;
  assert.equal(registry.resume(created.room.code, 'socket-b3', 'player-key-b-123456').error, 'This room can no longer be resumed.');
  assert.equal(created.room.players.length, 1);
});

test('server validates the full mission sequence and requires two different switch and generator operators', () => {
  const state = createGameState(); state.started = true;
  const players = [
    { key: 'blue-agent', connected: true, position: { ...OBJECTS.key } },
    { key: 'orange-agent', connected: true, position: { ...SPAWNS[1] } },
  ];
  const key = applyInteraction(state, players[0], players, 'key', 1000);
  assert.equal(key.ok, true); assert.equal(state.keyCollected, true);
  assert.equal(applyInteraction(state, players[0], players, 'key', 1100).ok, false);
  players[0].position = { ...DOORS.keyDoor.interact };
  assert.equal(applyInteraction(state, players[0], players, 'door1', 1200).ok, true);
  players[0].position = { ...OBJECTS.blueSwitch };
  assert.equal(applyInteraction(state, players[0], players, 'blueSwitch', 2000).ok, true);
  assert.equal(state.stage, 'switches');
  players[0].position = { ...OBJECTS.redSwitch };
  assert.equal(applyInteraction(state, players[0], players, 'redSwitch', 3000).ok, false, 'same agent cannot operate both switches');
  players[1].position = { ...OBJECTS.redSwitch };
  assert.equal(applyInteraction(state, players[1], players, 'redSwitch', 4000).ok, true);
  assert.equal(state.stage, 'robot'); assert.equal(state.doors.switchDoor, true);
  players[0].position = { x: state.robot.x, y: state.robot.y };
  assert.equal(damageRobot(state, players[0], 5000).ok, true);
  assert.equal(damageRobot(state, players[0], 5100).ok, true);
  players[1].position = { x: state.robot.x, y: state.robot.y };
  const defeated = damageRobot(state, players[1], 5200);
  assert.equal(defeated.disabled, true); assert.equal(state.stage, 'generator');
  players[0].position = { ...OBJECTS.controlA };
  assert.equal(applyInteraction(state, players[0], players, 'controlA', 6000).ok, true);
  players[1].position = { ...OBJECTS.controlB };
  assert.equal(applyInteraction(state, players[1], players, 'controlB', 7000).ok, true);
  assert.equal(state.generator, true); assert.equal(state.stage, 'extract');
  players[0].position = { ...OBJECTS.exit }; players[1].position = { ...OBJECTS.exit };
  assert.equal(applyInteraction(state, players[0], players, 'exit', 8000).ok, true);
  assert.equal(state.completed, true);
});

test('cooperative action windows expire without completing a puzzle', () => {
  const state = createGameState(); state.started = true; state.stage = 'switches'; state.doors.keyDoor = true;
  const player = { key: 'a', connected: true, position: { ...OBJECTS.blueSwitch } };
  assert.equal(applyInteraction(state, player, [player], 'blueSwitch', 1000).ok, true);
  expireCoopWindows(state, 26001);
  assert.equal(state.switches.blue, null);
  assert.equal(state.stage, 'switches');
});

test('a freed seat is reused without assigning two players the same color slot', () => {
  let now = 1000;
  const registry = new RoomRegistry({ now: () => now, random: () => 0.2, graceMs: 30000 });
  const host = registry.create('host-socket', 'host-player-key-123456');
  const partner = registry.join(host.room.code, 'partner-socket', 'partner-player-key-123456');
  registry.disconnect('host-socket');
  now += 30001;
  registry.prune();
  assert.equal(host.room.hostKey, 'partner-player-key-123456');
  const replacement = registry.join(host.room.code, 'replacement-socket', 'replacement-player-key-123456');
  assert.equal(replacement.player.index, 0);
  assert.deepEqual(host.room.players.map((player) => player.index).sort(), [0, 1]);
  assert.equal(partner.player.index, 1);
});
