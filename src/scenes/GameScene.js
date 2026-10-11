import Phaser from 'phaser';
import { DOORS, OBJECTS, SPAWNS, WALLS, WORLD, collidesWithWorld } from '../game/levelData.js';

const clamp = Phaser.Math.Clamp;
const COLORS = { cyan: 0x54dcff, blue: 0x54baff, orange: 0xffad61, red: 0xff5e69, green: 0x71e4ac, white: 0xeaf7ff, navy: 0x07111d };
const INTERACTIONS = [
  ['key', OBJECTS.key], ['decoy', OBJECTS.decoy], ['door1', DOORS.keyDoor.interact],
  ['blueSwitch', OBJECTS.blueSwitch], ['redSwitch', OBJECTS.redSwitch],
  ['controlA', OBJECTS.controlA], ['controlB', OBJECTS.controlB], ['exit', OBJECTS.exit],
];

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.app = this.registry.get('app');
    this.backdropG = this.add.graphics().setScrollFactor(0).setDepth(-1);
    this.staticG = this.add.graphics().setDepth(0);
    this.entityG = this.add.graphics().setDepth(4);
    this.worldText = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#aac3d2', fontStyle: 'bold', letterSpacing: 1 }).setDepth(5);
    this.distanceText = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffc27e', fontStyle: 'bold', letterSpacing: 1 }).setDepth(5);
    this.controls = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,SHIFT,ESC');
    this.lastMoveSent = 0; this.lastNearTarget = ''; this.particles = []; this.projectiles = []; this.remoteVisualPlayers = new Map();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.drawEnvironment();
    this.drawViewportBackdrop();
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.app.screen === 'game') this.app.bus.emit('pause', {});
    });
    this.input.keyboard.on('keydown-SPACE', () => { if (this.app.screen === 'game') this.fireStun(); });
    this.input.keyboard.on('keydown-E', () => { if (this.app.screen === 'game') this.interact(); });
    this.app.bus.on('game:state', (snapshot) => this.sync(snapshot));
    this.app.bus.on('game:started', (snapshot) => { this.sync(snapshot); this.emitSound('start'); });
    this.app.bus.on('game:action-result', (result) => {
      if (result.sound) this.emitSound(result.sound);
      if (result.ok && result.target === 'key') this.burst(OBJECTS.key, COLORS.blue);
      if (result.target === 'robot' && result.ok) this.burst(this.gameState.robot, COLORS.cyan, result.disabled ? 20 : 8);
      if (!result.ok && result.sound === 'wrong') this.burst(OBJECTS.decoy, COLORS.red, 8);
    });
    this.sync(this.app.roomSnapshot);
    this.scale.on('resize', () => { this.cameras.main.setSize(this.scale.width, this.scale.height); this.drawViewportBackdrop(); });
  }

  drawViewportBackdrop() {
    const g = this.backdropG;
    g.clear();
    g.fillGradientStyle(0x08131f, 0x0a1925, 0x07111c, 0x08131f, 1).fillRect(0, 0, this.scale.width, this.scale.height);
    for (let x = 0; x < this.scale.width; x += 36) g.lineStyle(1, 0x1c3543, 0.16).beginPath().moveTo(x, 0).lineTo(x, this.scale.height).strokePath();
    for (let y = 0; y < this.scale.height; y += 36) g.lineStyle(1, 0x1c3543, 0.14).beginPath().moveTo(0, y).lineTo(this.scale.width, y).strokePath();
  }

  emitSound(name) { this.app.bus.emit('sound', { name }); }

  sync(snapshot) {
    if (!snapshot) return;
    this.snapshot = snapshot;
    this.gameState = snapshot.game || this.gameState;
    this.remotePlayers = snapshot.players || [];
    for (const player of this.remotePlayers) {
      if (player.index === this.app.myIndex) continue;
      let visual = this.remoteVisualPlayers.get(player.index);
      if (!visual) {
        visual = { x: player.position.x, y: player.position.y, targetX: player.position.x, targetY: player.position.y, facing: player.facing, down: player.down };
        this.remoteVisualPlayers.set(player.index, visual);
      }
      visual.targetX = player.position.x; visual.targetY = player.position.y;
      visual.facing = player.facing; visual.down = player.down;
    }
    const local = this.remotePlayers.find((player) => player.index === this.app.myIndex);
    if (local) {
      if (!this.local) this.local = { ...local.position };
      const error = Phaser.Math.Distance.Between(this.local.x, this.local.y, local.position.x, local.position.y);
      if (error > 65) this.local = { ...local.position };
      else if (error > 8) { this.local.x += (local.position.x - this.local.x) * 0.28; this.local.y += (local.position.y - this.local.y) * 0.28; }
      this.localFacing = local.facing;
    }
  }

  drawEnvironment() {
    const g = this.staticG;
    g.fillStyle(0x0b1722, 1).fillRect(0, 0, WORLD.width, WORLD.height);
    for (let y = 0; y < WORLD.height; y += 44) for (let x = 0; x < WORLD.width; x += 44) {
      const alt = (Math.floor(x / 44) + Math.floor(y / 44)) % 2;
      g.fillStyle(alt ? 0x0e1e2b : 0x10212f, 1).fillRect(x + 1, y + 1, 42, 42);
      g.lineStyle(1, 0x243745, 0.42).strokeRect(x + 1, y + 1, 42, 42);
      if ((x + y) % 176 === 0) { g.fillStyle(0x476071, 0.55); g.fillCircle(x + 7, y + 7, 1.5); }
    }
    // Cable runs, floor strips, and room thresholds give the facility a layered industrial feel.
    g.lineStyle(2, 0x23516a, 0.6).beginPath().moveTo(65, 142).lineTo(414, 142).lineTo(414, 250).strokePath();
    g.lineStyle(2, 0x6b492d, 0.5).beginPath().moveTo(507, 754).lineTo(882, 754).lineTo(882, 590).strokePath();
    g.lineStyle(5, 0x1c2d39, 1).beginPath().moveTo(55, 82).lineTo(1300, 82).strokePath();
    g.lineStyle(1, 0x467087, 0.4).beginPath().moveTo(55, 88).lineTo(1300, 88).strokePath();
    // Outer bulkhead.
    g.fillStyle(0x263946, 1).fillRect(24, 24, WORLD.width - 48, 23);
    g.fillStyle(0x263946, 1).fillRect(24, WORLD.height - 47, WORLD.width - 48, 23);
    g.fillStyle(0x263946, 1).fillRect(24, 24, 23, WORLD.height - 48);
    g.fillStyle(0x263946, 1).fillRect(WORLD.width - 47, 24, 23, WORLD.height - 48);
    g.lineStyle(2, 0x516979, 0.65).strokeRect(32, 32, WORLD.width - 64, WORLD.height - 64);
    for (const wall of WALLS) {
      g.fillStyle(0x1e303c, 1).fillRect(wall.x, wall.y, wall.width, wall.height);
      g.fillStyle(0x405661, 1).fillRect(wall.x, wall.y, wall.width, 6);
      g.lineStyle(1, 0x68808b, 0.35).strokeRect(wall.x + 5, wall.y + 9, wall.width - 10, wall.height - 18);
    }
    // Raised machinery and inset vents.
    this.drawCrate(g, 625, 367, 104, 44); this.drawCrate(g, 776, 518, 128, 42); this.drawCrate(g, 1118, 252, 86, 38);
    for (const [x, y, w] of [[110, 760, 220], [510, 106, 260], [1030, 720, 180]]) {
      g.fillStyle(0x101f29, 1).fillRoundedRect(x, y, w, 26, 5);
      g.lineStyle(1, 0x435a67, 0.8).strokeRoundedRect(x, y, w, 26, 5);
      for (let n = 0; n < w - 18; n += 18) g.lineStyle(2, 0x344b57, 0.9).beginPath().moveTo(x + 10 + n, y + 5).lineTo(x + 10 + n, y + 21).strokePath();
    }
    this.addRoomLabel('ENTRY BAY', 100, 114); this.addRoomLabel('SECURITY TRANSIT', 526, 114);
    this.addRoomLabel('GENERATOR CORE', 1002, 114); this.addRoomLabel('CO-OP CIRCUIT', 526, 725);
    for (let y = 150; y < 750; y += 72) this.drawLightStrip(g, 66, y, 8, 24);
    for (let y = 150; y < 750; y += 72) this.drawLightStrip(g, 1284, y, 8, 24);
  }

  drawCrate(g, x, y, w, h) {
    g.fillStyle(0x14232d, 1).fillRoundedRect(x, y, w, h, 5);
    g.fillStyle(0x263b48, 1).fillRoundedRect(x + 5, y + 4, w - 10, h - 8, 4);
    g.lineStyle(1, 0x58717c, 0.5).strokeRoundedRect(x + 8, y + 7, w - 16, h - 14, 3);
    g.fillStyle(0x59727b, 0.7).fillCircle(x + 9, y + 9, 2).fillCircle(x + w - 9, y + h - 9, 2);
  }

  addRoomLabel(label, x, y) {
    this.add.text(x, y, label, { fontFamily: 'Arial Narrow, Arial, sans-serif', fontSize: '16px', color: '#6c8999', letterSpacing: 2, fontStyle: 'bold' }).setDepth(1).setAlpha(0.7);
  }

  drawLightStrip(g, x, y, w, h) {
    g.fillStyle(0x253946, 1).fillRoundedRect(x - 4, y - 3, w + 8, h + 6, 4);
    g.fillStyle(0x49c6eb, 0.45).fillRoundedRect(x, y, w, h, 3);
  }

  drawMenuBackdrop(time) {
    const g = this.entityG; g.clear();
    const width = this.scale.width; const height = this.scale.height;
    g.fillGradientStyle(0x07111d, 0x091a28, 0x0b1a25, 0x07111d, 1).fillRect(0, 0, WORLD.width, WORLD.height);
    for (let x = 80; x < WORLD.width; x += 44) {
      g.lineStyle(1, 0x214050, 0.22).beginPath().moveTo(x, 0).lineTo(x, WORLD.height).strokePath();
    }
    for (let y = 70; y < WORLD.height; y += 44) g.lineStyle(1, 0x214050, 0.2).beginPath().moveTo(0, y).lineTo(WORLD.width, y).strokePath();
    const pulse = 0.5 + Math.sin(time / 900) * 0.5;
    for (let i = 0; i < 48; i += 1) {
      const x = (i * 197 + Math.sin(time / 2000 + i) * 24) % WORLD.width;
      const y = (i * 137 + Math.cos(time / 2100 + i) * 21) % WORLD.height;
      g.fillStyle(i % 4 === 0 ? COLORS.orange : COLORS.cyan, 0.16 + pulse * 0.13).fillCircle(x, y, i % 5 === 0 ? 2 : 1.1);
    }
    g.lineStyle(1, 0x55d6ff, 0.2).strokeCircle(1095, 455, 210 + pulse * 5).strokeCircle(1095, 455, 255 - pulse * 4);
    this.drawCharacter(g, 1000, 455, 0x46c7ed, 'right', time, true, false, 1.5);
    this.drawCharacter(g, 1165, 500, 0xf1a562, 'left', time + 300, false, false, 1.5);
    const camera = this.cameras.main;
    camera.setZoom(Math.min(width / WORLD.width, height / WORLD.height));
    camera.centerOn(WORLD.width / 2, WORLD.height / 2);
  }

  drawDoor(g, rect, opened, color) {
    const centerX = rect.x + rect.width / 2; const centerY = rect.y + rect.height / 2;
    if (opened) {
      g.fillStyle(0x51e0b0, 0.1).fillRect(rect.x - 2, rect.y, rect.width + 4, rect.height);
      g.lineStyle(2, 0x71e4ac, 0.75).strokeRect(rect.x - 7, rect.y, rect.width + 14, rect.height);
      g.fillStyle(0x71e4ac, 1).fillCircle(centerX, centerY - rect.height / 2 + 12, 4);
    } else {
      g.fillStyle(0x182832, 1).fillRect(rect.x - 3, rect.y, rect.width + 6, rect.height);
      g.fillStyle(color, 0.14).fillRect(rect.x + 4, rect.y + 8, rect.width - 8, rect.height - 16);
      g.lineStyle(2, color, 0.75).strokeRect(rect.x - 4, rect.y, rect.width + 8, rect.height);
      for (let i = 0; i < 4; i += 1) g.fillStyle(i < (opened ? 4 : 1) ? color : 0x52616a, 0.8).fillCircle(centerX, rect.y + 18 + i * ((rect.height - 36) / 3), 3);
    }
  }

  drawKey(g, x, y, time) {
    const bob = Math.sin(time / 250) * 4;
    g.fillStyle(0x53c6ff, 0.12).fillCircle(x, y + bob, 28);
    g.lineStyle(4, COLORS.blue, 1).strokeCircle(x - 6, y + bob, 8);
    g.lineStyle(4, COLORS.blue, 1).beginPath().moveTo(x + 2, y + bob).lineTo(x + 19, y + bob).lineTo(x + 19, y + bob + 7).moveTo(x + 12, y + bob).lineTo(x + 12, y + bob + 5).strokePath();
    g.fillStyle(0xe8f7ff, 0.7).fillCircle(x - 8, y + bob - 8, 2);
  }

  drawDecoy(g, x, y) {
    g.fillStyle(0x5a4528, 1).fillRoundedRect(x - 15, y - 14, 30, 28, 7);
    g.lineStyle(2, 0xe6a755, 0.8).strokeRoundedRect(x - 15, y - 14, 30, 28, 7);
    g.fillStyle(0xf4bf61, 0.9).fillCircle(x, y, 5);
  }

  drawSwitch(g, x, y, color, active, time) {
    const tint = color === 'blue' ? COLORS.blue : COLORS.red;
    const pulse = 0.5 + Math.sin(time / 260 + x) * 0.5;
    g.fillStyle(tint, 0.08 + pulse * 0.1).fillCircle(x, y, 34 + pulse * 3);
    g.fillStyle(0x142531, 1).fillRoundedRect(x - 22, y - 22, 44, 44, 8);
    g.lineStyle(2, tint, 0.75).strokeRoundedRect(x - 22, y - 22, 44, 44, 8);
    g.fillStyle(active ? 0x75e9b2 : tint, active ? 1 : 0.75).fillCircle(x, y, active ? 10 : 7);
    g.lineStyle(2, tint, 0.5).strokeCircle(x, y, 14 + pulse * 3);
  }

  drawGenerator(g, x, y, active, time) {
    const glow = 0.09 + (active ? 0.2 : 0.06) + (Math.sin(time / 350) + 1) * 0.035;
    g.fillStyle(active ? 0x54dcff : 0xffad61, glow).fillCircle(x, y, active ? 105 : 72);
    g.fillStyle(0x152834, 1).fillCircle(x, y, 48);
    g.lineStyle(5, 0x425966, 1).strokeCircle(x, y, 46);
    g.lineStyle(2, active ? COLORS.cyan : COLORS.orange, active ? 0.9 : 0.65).strokeCircle(x, y, 38);
    for (let i = 0; i < 4; i += 1) {
      const angle = time / 1300 + i * Math.PI / 2;
      g.fillStyle(active ? COLORS.cyan : COLORS.orange, 0.75).fillCircle(x + Math.cos(angle) * 33, y + Math.sin(angle) * 33, 4);
    }
    g.fillStyle(active ? 0x79e9ff : 0x924d34, 0.9).fillCircle(x, y, active ? 19 + Math.sin(time / 160) * 3 : 16);
    g.fillStyle(0xf4fcff, active ? 0.65 : 0.25).fillCircle(x - 5, y - 6, 5);
  }

  drawControl(g, x, y, active, tint, time) {
    g.fillStyle(tint, 0.08).fillCircle(x, y, 30);
    g.fillStyle(0x13232e, 1).fillRoundedRect(x - 19, y - 16, 38, 32, 5);
    g.lineStyle(2, 0x5a7481, 0.7).strokeRoundedRect(x - 19, y - 16, 38, 32, 5);
    g.fillStyle(active ? 0x72e4ad : tint, 0.95).fillRoundedRect(x - 12, y - 8, 24, 8, 3);
    for (let i = 0; i < 3; i += 1) g.fillStyle(active ? 0x72e4ad : 0x718995, 0.85).fillCircle(x - 8 + i * 8, y + 8, 2);
    g.fillStyle(tint, 0.3 + Math.sin(time / 230) * 0.15).fillCircle(x + 15, y - 12, 3);
  }

  drawRobot(g, x, y, disabled, time) {
    const bob = disabled ? 0 : Math.sin(time / 90) * 2;
    g.fillStyle(0xff7263, disabled ? 0.04 : 0.11).fillCircle(x, y, 42);
    g.fillStyle(disabled ? 0x273843 : 0x283d48, 1).fillRoundedRect(x - 23, y - 18 + bob, 46, 35, 10);
    g.lineStyle(2, disabled ? 0x64747b : 0x8b6672, 0.9).strokeRoundedRect(x - 23, y - 18 + bob, 46, 35, 10);
    g.fillStyle(0x101d26, 1).fillRoundedRect(x - 15, y - 10 + bob, 30, 16, 6);
    if (!disabled) {
      g.fillStyle(0xff5d66, 0.17).fillCircle(x, y - 2 + bob, 17);
      g.fillStyle(0xff6570, 1).fillRoundedRect(x - 10, y - 4 + bob, 20, 6, 3);
      g.fillStyle(0xffffff, 0.75).fillCircle(x - 7, y - 2 + bob, 1.5);
      g.fillStyle(0xa1c0cc, 1).fillCircle(x - 16, y + 20, 4).fillCircle(x + 16, y + 20, 4);
    } else {
      g.lineStyle(2, 0x718995, 0.9).beginPath().moveTo(x - 8, y - 2).lineTo(x + 8, y + 3).strokePath();
      g.fillStyle(0x536875, 1).fillCircle(x - 14, y + 20, 4).fillCircle(x + 15, y + 20, 4);
    }
  }

  drawCharacter(g, x, y, color, facing = 'down', time = 0, local = false, down = false, scale = 1, moving = false) {
    const bob = down ? 0 : moving ? Math.abs(Math.sin(time / 70)) * 2.5 : Math.sin(time / 155) * 0.8;
    const sx = scale;
    g.fillStyle(0x000000, 0.26).fillEllipse(x, y + 15 * sx, 42 * sx, 14 * sx);
    if (down) {
      g.fillStyle(color, 0.55).fillRoundedRect(x - 20 * sx, y - 5 * sx, 40 * sx, 16 * sx, 7 * sx);
      g.lineStyle(2, 0xf2f8fb, 0.55).strokeCircle(x + 20 * sx, y - 5 * sx, 4 * sx); return;
    }
    g.fillStyle(0x172a36, 1).fillRoundedRect(x - 14 * sx, y - 17 * sx + bob, 28 * sx, 34 * sx, 10 * sx);
    g.fillStyle(color, 1).fillRoundedRect(x - 11 * sx, y - 16 * sx + bob, 22 * sx, 29 * sx, 8 * sx);
    g.fillStyle(0x16303d, 1).fillRoundedRect(x - 8 * sx, y - 13 * sx + bob, 16 * sx, 13 * sx, 6 * sx);
    g.fillStyle(0xe9fbff, 0.93).fillRoundedRect(x - 6.7 * sx, y - 10 * sx + bob, 13.4 * sx, 5 * sx, 2.5 * sx);
    g.fillStyle(0x13232d, 0.9).fillRoundedRect(x - 6 * sx, y + 4 * sx + bob, 12 * sx, 7 * sx, 3 * sx);
    const stride = moving ? Math.sin(time / 65) * 2.5 : 0;
    g.fillStyle(0xdaf5ff, 0.95).fillEllipse(x - 7 * sx, y + 16 * sx + bob + stride, 11 * sx, 7 * sx).fillEllipse(x + 7 * sx, y + 16 * sx + bob - stride, 11 * sx, 7 * sx);
    g.lineStyle(3 * sx, 0xd6f2fa, 0.85).beginPath().moveTo(x - 13 * sx, y - 9 * sx + bob).lineTo(x + 13 * sx, y - 9 * sx + bob).strokePath();
    if (facing === 'left') g.fillStyle(0xeefbff, 1).fillCircle(x - 5 * sx, y - 12 * sx + bob, 2.3 * sx);
    if (facing === 'right') g.fillStyle(0xeefbff, 1).fillCircle(x + 5 * sx, y - 12 * sx + bob, 2.3 * sx);
    if (facing === 'up') g.fillStyle(0xeefbff, 1).fillCircle(x, y - 14 * sx + bob, 2 * sx);
    if (local) { g.lineStyle(1.5, 0xdff9ff, 0.95).strokeCircle(x, y, 24 * sx); g.fillStyle(0xdff9ff, 1).fillTriangle(x, y - 31 * sx, x - 5 * sx, y - 25 * sx, x + 5 * sx, y - 25 * sx); }
  }

  drawMission(time) {
    const g = this.entityG; g.clear();
    const s = this.gameState || { doors: {}, switches: {}, robot: OBJECTS.robot, controls: {}, generator: false, keyCollected: false };
    this.drawDoor(g, DOORS.keyDoor, s.doors?.keyDoor, COLORS.orange);
    this.drawDoor(g, DOORS.switchDoor, s.doors?.switchDoor, COLORS.cyan);
    if (!s.keyCollected) { this.drawKey(g, OBJECTS.key.x, OBJECTS.key.y, time); this.drawDecoy(g, OBJECTS.decoy.x, OBJECTS.decoy.y); }
    this.drawSwitch(g, OBJECTS.blueSwitch.x, OBJECTS.blueSwitch.y, 'blue', s.switches?.blue, time);
    this.drawSwitch(g, OBJECTS.redSwitch.x, OBJECTS.redSwitch.y, 'red', s.switches?.red, time);
    this.drawControl(g, OBJECTS.controlA.x, OBJECTS.controlA.y, s.controls?.a, COLORS.cyan, time);
    this.drawControl(g, OBJECTS.controlB.x, OBJECTS.controlB.y, s.controls?.b, COLORS.orange, time);
    this.drawGenerator(g, OBJECTS.generator.x, OBJECTS.generator.y, s.generator, time);
    const exitPulse = 0.6 + Math.sin(time / 240) * 0.25;
    g.fillStyle(s.generator ? 0x71e4ac : 0x4a6674, s.generator ? 0.16 : 0.08).fillCircle(OBJECTS.exit.x, OBJECTS.exit.y, 31);
    g.fillStyle(0x162a35, 1).fillRoundedRect(OBJECTS.exit.x - 16, OBJECTS.exit.y - 22, 32, 44, 8);
    g.lineStyle(2, s.generator ? 0x71e4ac : 0x718995, exitPulse).strokeRoundedRect(OBJECTS.exit.x - 16, OBJECTS.exit.y - 22, 32, 44, 8);
    g.fillStyle(s.generator ? 0x71e4ac : 0x536974, 1).fillRect(OBJECTS.exit.x - 5, OBJECTS.exit.y - 13, 10, 26);
    this.drawRobot(g, s.robot?.x ?? OBJECTS.robot.x, s.robot?.y ?? OBJECTS.robot.y, s.robot?.disabled, time);
    const local = this.local || SPAWNS[this.app.myIndex || 0];
    const other = this.remotePlayers?.find((player) => player.index !== this.app.myIndex);
    const remote = other ? (this.remoteVisualPlayers.get(other.index) || { ...other.position, targetX: other.position.x, targetY: other.position.y, facing: other.facing, down: other.down }) : null;
    this.drawCharacter(g, local.x, local.y, this.app.myIndex === 1 ? 0xf1a562 : 0x46c7ed, this.localFacing || 'down', time, true, this.remotePlayers?.find((p) => p.index === this.app.myIndex)?.down, 1, this.localMoving);
    if (other && remote) {
      const walking = Math.hypot(remote.targetX - remote.x, remote.targetY - remote.y) > 1;
      this.drawCharacter(g, remote.x, remote.y, other.index === 1 ? 0xf1a562 : 0x46c7ed, remote.facing, time, false, remote.down, 1, walking);
    }
    this.drawEffects(g, time);
    this.drawInteractionMarker(g, local, time);
    if (remote) this.drawDistanceLink(g, local, remote);
  }

  drawDistanceLink(g, local, remote) {
    const distance = Phaser.Math.Distance.Between(local.x, local.y, remote.x, remote.y);
    if (distance < 280) return;
    g.lineStyle(1, 0xffbd70, 0.32).beginPath().moveTo(local.x, local.y).lineTo(remote.x, remote.y).strokePath();
    const midX = (local.x + remote.x) / 2; const midY = (local.y + remote.y) / 2;
    g.fillStyle(0x101e29, 0.9).fillRoundedRect(midX - 28, midY - 12, 56, 22, 8);
    g.lineStyle(1, 0xffbd70, 0.55).strokeRoundedRect(midX - 28, midY - 12, 56, 22, 8);
    this.distanceText.setText(`${Math.round(distance)} m`).setPosition(midX - 18, midY - 8).setColor('#ffc27e').setVisible(true);
    if (distance < 280) this.distanceText.setVisible(false);
  }

  drawInteractionMarker(g, local, time) {
    const target = this.nearestInteractable(local);
    if (!target) {
      if (this.lastNearTarget) this.app.bus.emit('nearby', { target: null });
      this.lastNearTarget = ''; this.worldText.setText(''); return;
    }
    const point = target.position; const pulse = 0.6 + Math.sin(time / 180) * 0.25;
    g.lineStyle(2, 0xe8f8ff, pulse).strokeCircle(point.x, point.y, 28);
    g.fillStyle(0x07111d, 0.92).fillRoundedRect(point.x - 11, point.y - 49, 22, 20, 6);
    g.lineStyle(1, 0x83d8ee, 0.8).strokeRoundedRect(point.x - 11, point.y - 49, 22, 20, 6);
    this.worldText.setText('E').setPosition(point.x - 4, point.y - 47).setColor('#f2fbff');
    if (target.name !== this.lastNearTarget) { this.lastNearTarget = target.name; this.app.bus.emit('nearby', { target: target.name }); }
  }

  drawEffects(g, time) {
    this.particles = this.particles.filter((p) => time - p.born < p.life);
    for (const p of this.particles) {
      const age = (time - p.born) / p.life;
      g.fillStyle(p.color, 1 - age).fillCircle(p.x + p.vx * age * 50, p.y + p.vy * age * 50, Math.max(0.6, p.size * (1 - age)));
    }
    this.projectiles = this.projectiles.filter((p) => time - p.born < p.life);
    for (const p of this.projectiles) {
      const age = (time - p.born) / p.life; const x = p.x + p.vx * age; const y = p.y + p.vy * age;
      g.fillStyle(0x56dfff, 0.18).fillCircle(x, y, 14);
      g.fillStyle(0x9cf2ff, 0.95).fillCircle(x, y, 5);
      g.lineStyle(2, 0x6ce4ff, 0.8).beginPath().moveTo(x - p.vx * 0.035, y - p.vy * 0.035).lineTo(x, y).strokePath();
    }
  }

  burst(point, color, amount = 14) {
    const now = this.time?.now ?? performance.now();
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2; const speed = 0.4 + Math.random() * 1.8;
      this.particles.push({ x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + Math.random() * 3, color, born: now, life: 380 + Math.random() * 450 });
    }
    this.cameras.main.shake(100, 0.0018);
  }

  fireStun() {
    if (!this.local || this.app.paused || this.fireCooldown) return;
    this.fireCooldown = true; window.setTimeout(() => { this.fireCooldown = false; }, 480);
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = dirs[this.localFacing || 'right'];
    const now = this.time?.now ?? performance.now();
    this.projectiles.push({ x: this.local.x + dx * 22, y: this.local.y + dy * 22, vx: dx * 390, vy: dy * 390, born: now, life: 660 });
    this.emitSound('stun'); this.app.multiplayer.attack();
  }

  nearestInteractable(position) {
    if (!this.gameState) return null;
    const stage = this.gameState.stage;
    let names = [];
    if (stage === 'find-key') names = ['key', 'decoy'];
    if (stage === 'open-door') names = ['door1'];
    if (stage === 'switches') names = ['blueSwitch', 'redSwitch'];
    if (stage === 'generator') names = ['controlA', 'controlB'];
    if (stage === 'extract') names = ['exit'];
    return INTERACTIONS.filter(([name]) => names.includes(name)).map(([name, point]) => ({ name, position: point, distance: Phaser.Math.Distance.Between(position.x, position.y, point.x, point.y) })).filter((entry) => entry.distance < 86).sort((a, b) => a.distance - b.distance)[0] || null;
  }

  interact() {
    if (!this.local || this.app.paused) return;
    const target = this.nearestInteractable(this.local);
    if (target) this.app.multiplayer.interact(target.name);
    else this.app.bus.emit('toast', { message: 'Move closer to an objective marker.' });
  }

  update(time, delta) {
    if (this.app.screen !== 'game') { this.drawMenuBackdrop(time); return; }
    this.localMoving = false;
    const focused = document.activeElement;
    const typing = focused && ['INPUT', 'TEXTAREA'].includes(focused.tagName);
    if (this.gameState && !this.gameState.completed && !this.app.paused && !typing && this.local) {
      const horizontal = (this.controls.D.isDown || this.controls.RIGHT.isDown ? 1 : 0) - (this.controls.A.isDown || this.controls.LEFT.isDown ? 1 : 0);
      const vertical = (this.controls.S.isDown || this.controls.DOWN.isDown ? 1 : 0) - (this.controls.W.isDown || this.controls.UP.isDown ? 1 : 0);
      this.localMoving = horizontal !== 0 || vertical !== 0;
      if (this.localMoving) {
        const norm = Math.hypot(horizontal, vertical); const speed = this.controls.SHIFT.isDown ? 294 : 230; const step = speed * Math.min(delta, 50) / 1000;
        const dx = (horizontal / norm) * step; const dy = (vertical / norm) * step;
        if (horizontal) {
          const nx = this.local.x + dx;
          if (!collidesWithWorld(nx, this.local.y, 15, this.gameState)) this.local.x = nx;
        }
        if (vertical) {
          const ny = this.local.y + dy;
          if (!collidesWithWorld(this.local.x, ny, 15, this.gameState)) this.local.y = ny;
        }
        if (Math.abs(horizontal) > Math.abs(vertical)) this.localFacing = horizontal < 0 ? 'left' : 'right';
        else if (vertical) this.localFacing = vertical < 0 ? 'up' : 'down';
        if (time - this.lastMoveSent > 65) {
          this.app.multiplayer.move({ x: this.local.x, y: this.local.y }, this.localFacing || 'down'); this.lastMoveSent = time;
        }
      }
    }
    const blend = 1 - Math.exp(-Math.min(delta, 80) / 82);
    for (const visual of this.remoteVisualPlayers.values()) {
      visual.x += (visual.targetX - visual.x) * blend;
      visual.y += (visual.targetY - visual.y) * blend;
    }
    this.drawMission(time);
    this.cameraUpdate(delta);
  }

  cameraUpdate(delta) {
    const local = this.local || SPAWNS[0];
    const other = this.remotePlayers?.find((player) => player.index !== this.app.myIndex);
    const remote = other ? this.remoteVisualPlayers.get(other.index) : null;
    const remotePosition = remote ? { x: remote.x, y: remote.y } : (other?.position || local);
    const midpointX = (local.x + remotePosition.x) / 2; const midpointY = (local.y + remotePosition.y) / 2;
    const distance = Phaser.Math.Distance.Between(local.x, local.y, remotePosition.x, remotePosition.y);
    const fit = Math.min(this.scale.width / 1180, this.scale.height / 760);
    const targetZoom = clamp(fit * (distance > 520 ? 0.86 : 1), 0.6, 0.96);
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Linear(camera.zoom || targetZoom, targetZoom, Math.min(1, delta / 240)));
    const halfW = this.scale.width / camera.zoom / 2; const halfH = this.scale.height / camera.zoom / 2;
    const centerX = halfW * 2 >= WORLD.width ? WORLD.width / 2 : clamp(midpointX, halfW, WORLD.width - halfW);
    const centerY = halfH * 2 >= WORLD.height ? WORLD.height / 2 : clamp(midpointY, halfH, WORLD.height - halfH);
    camera.centerOn(centerX, centerY);
  }
}
