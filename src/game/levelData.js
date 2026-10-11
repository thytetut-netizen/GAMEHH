export const WORLD = { width: 1360, height: 860, margin: 44 };

export const SPAWNS = [
  { x: 150, y: 418 },
  { x: 238, y: 482 },
];

// Rectangles are shared by Phaser collision and server-side movement validation.
export const WALLS = [
  { x: 450, y: 48, width: 24, height: 260 },
  { x: 450, y: 552, width: 24, height: 260 },
  { x: 920, y: 48, width: 24, height: 306 },
  { x: 920, y: 506, width: 24, height: 306 },
  { x: 625, y: 367, width: 104, height: 44 },
  { x: 776, y: 518, width: 128, height: 42 },
  { x: 1118, y: 252, width: 86, height: 38 },
];

export const DOORS = {
  keyDoor: { x: 450, y: 308, width: 24, height: 244, interact: { x: 414, y: 430 } },
  switchDoor: { x: 920, y: 354, width: 24, height: 152, interact: { x: 882, y: 430 } },
};

export const OBJECTS = {
  key: { x: 300, y: 324 },
  decoy: { x: 300, y: 512 },
  blueSwitch: { x: 603, y: 217 },
  redSwitch: { x: 790, y: 680 },
  robot: { x: 1080, y: 432 },
  controlA: { x: 1065, y: 367 },
  controlB: { x: 1065, y: 502 },
  generator: { x: 1190, y: 432 },
  exit: { x: 1300, y: 432 },
};

export const VOCABULARY = [
  { id: 'blue', hebrew: 'כחול', english: 'Blue', transliteration: 'KACHOL', icon: 'blue' },
  { id: 'red', hebrew: 'אדום', english: 'Red', transliteration: 'ADOM', icon: 'red' },
  { id: 'key', hebrew: 'מפתח', english: 'Key', transliteration: "MAFTE'ACH", icon: 'key' },
  { id: 'door', hebrew: 'דלת', english: 'Door', transliteration: 'DELET', icon: 'door' },
  { id: 'take', hebrew: 'קח', english: 'Take', transliteration: 'KACH', icon: 'take' },
  { id: 'open', hebrew: 'פתח', english: 'Open', transliteration: 'PTACH', icon: 'open' },
  { id: 'press', hebrew: 'לחץ', english: 'Press', transliteration: 'LACHATZ', icon: 'press' },
];

export function inRect(x, y, rect, radius = 0) {
  return x + radius > rect.x && x - radius < rect.x + rect.width &&
    y + radius > rect.y && y - radius < rect.y + rect.height;
}

export function collidesWithWorld(x, y, radius, state) {
  const { margin } = WORLD;
  if (x - radius < margin || y - radius < margin || x + radius > WORLD.width - margin || y + radius > WORLD.height - margin) return true;
  if (WALLS.some((wall) => inRect(x, y, wall, radius))) return true;
  if (!state.doors.keyDoor && inRect(x, y, DOORS.keyDoor, radius)) return true;
  if (!state.doors.switchDoor && inRect(x, y, DOORS.switchDoor, radius)) return true;
  return false;
}
