import { DOORS, OBJECTS } from '../src/game/levelData.js';

export function createGameState() {
  return {
    started: false,
    stage: 'find-key',
    keyCollected: false,
    doors: { keyDoor: false, switchDoor: false },
    switches: { blue: null, red: null, expiresAt: 0 },
    robot: { x: OBJECTS.robot.x, y: OBJECTS.robot.y, health: 3, disabled: false, nextAttackAt: 0 },
    controls: { a: null, b: null, expiresAt: 0 },
    generator: false,
    players: {},
    words: [],
    completed: false,
    startedAt: null,
  };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (player, point, radius) => distance(player.position, point) <= radius;
const remember = (state, word) => { if (word && !state.words.includes(word)) state.words.push(word); };

export function applyInteraction(state, player, players, target, now = Date.now()) {
  if (!state.started || state.completed || !player?.connected) return { ok: false, reason: 'Mission is not active.' };
  let result;
  switch (target) {
    case 'key':
      if (state.stage !== 'find-key' || state.keyCollected || !near(player, OBJECTS.key, 84)) break;
      state.keyCollected = true; state.stage = 'open-door'; remember(state, 'blue'); remember(state, 'key'); remember(state, 'take');
      result = { ok: true, notice: 'Blue key secured. Both players can see the update.', sound: 'key', vocab: ['blue', 'key', 'take'] }; break;
    case 'decoy':
      if (!near(player, OBJECTS.decoy, 84)) break;
      result = { ok: false, reason: 'This one is not the key. Look for the blue glow.', sound: 'wrong' }; break;
    case 'door1':
      if (state.stage !== 'open-door' || !state.keyCollected || !near(player, DOORS.keyDoor.interact, 96)) break;
      state.doors.keyDoor = true; state.stage = 'switches'; remember(state, 'door'); remember(state, 'open');
      result = { ok: true, notice: 'Security door unlocked.', sound: 'door', vocab: ['door', 'open'] }; break;
    case 'blueSwitch':
    case 'redSwitch': {
      const color = target === 'blueSwitch' ? 'blue' : 'red';
      const point = OBJECTS[target];
      if (state.stage !== 'switches' || !state.doors.keyDoor || !near(player, point, 82)) break;
      const other = color === 'blue' ? 'red' : 'blue';
      if (state.switches[other] === player.key) break;
      if (state.switches[color] === player.key) break;
      if (!state.switches[color]) {
        if (state.switches.expiresAt && now > state.switches.expiresAt) state.switches = { blue: null, red: null, expiresAt: 0 };
        state.switches[color] = player.key;
        state.switches.expiresAt = now + 24000;
        remember(state, color); remember(state, 'press');
      }
      if (state.switches[other] && state.switches[other] !== player.key && now <= state.switches.expiresAt) {
        state.stage = 'robot'; state.doors.switchDoor = true;
        result = { ok: true, notice: 'Co-op circuit synced. Generator access is open.', sound: 'switch-pair', vocab: [color, 'press'] };
      } else {
        result = { ok: true, notice: `The ${color} switch is armed. Your partner must press the other color.`, sound: 'switch', vocab: [color, 'press'] };
      }
      break;
    }
    case 'controlA':
    case 'controlB': {
      const which = target === 'controlA' ? 'a' : 'b';
      if (state.stage !== 'generator' || !state.robot.disabled || !near(player, OBJECTS[target], 82)) break;
      if (state.controls[which] === player.key) break;
      if (!state.controls[which]) {
        if (state.controls.expiresAt && now > state.controls.expiresAt) state.controls = { a: null, b: null, expiresAt: 0 };
        state.controls[which] = player.key; state.controls.expiresAt = now + 24000;
      }
      const other = which === 'a' ? 'b' : 'a';
      if (state.controls[other] && state.controls[other] !== player.key && now <= state.controls.expiresAt) {
        state.generator = true; state.stage = 'extract'; remember(state, 'press');
        result = { ok: true, notice: 'Power restored! Reach extraction together.', sound: 'generator', vocab: ['press'] };
      } else {
        result = { ok: true, notice: 'Control locked in. Your partner must use the second panel.', sound: 'switch' };
      }
      break;
    }
    case 'exit': {
      if (state.stage !== 'extract' || !state.generator || !near(player, OBJECTS.exit, 96)) break;
      const connected = players.filter((entry) => entry.connected);
      if (connected.length !== 2 || connected.some((entry) => !near(entry, OBJECTS.exit, 110))) {
        result = { ok: false, reason: 'Both agents need to be in the extraction zone.' }; break;
      }
      state.stage = 'complete'; state.completed = true;
      result = { ok: true, notice: 'Mission complete. Beautifully done, agents.', sound: 'complete' }; break;
    }
    default: break;
  }
  return result || { ok: false, reason: 'Move closer or complete the previous objective first.' };
}

export function expireCoopWindows(state, now = Date.now()) {
  if (state.switches.expiresAt && now > state.switches.expiresAt && state.stage === 'switches') state.switches = { blue: null, red: null, expiresAt: 0 };
  if (state.controls.expiresAt && now > state.controls.expiresAt && state.stage === 'generator') state.controls = { a: null, b: null, expiresAt: 0 };
}

export function damageRobot(state, player, now = Date.now()) {
  if (state.stage !== 'robot' || state.robot.disabled || !player?.connected) return { ok: false, reason: 'No active robot target.' };
  if (distance(player.position, state.robot) > 260) return { ok: false, reason: 'The robot is too far away.' };
  state.robot.health = Math.max(0, state.robot.health - 1);
  if (!state.robot.health) {
    state.robot.disabled = true;
    state.stage = 'generator';
    return { ok: true, disabled: true, notice: 'Security robot disabled. Reach the two generator controls.', sound: 'robot-down' };
  }
  return { ok: true, notice: `Robot hit. ${state.robot.health} charge${state.robot.health === 1 ? '' : 's'} remaining.`, sound: 'robot-hit' };
}
