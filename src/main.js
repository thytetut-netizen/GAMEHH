import Phaser from 'phaser';
import GameScene from './scenes/GameScene.js';
import { MultiplayerClient } from './multiplayer/MultiplayerClient.js';
import { VOCABULARY } from './game/levelData.js';
import { getReviewedWords, markReviewed, speakHebrew } from './game/vocabulary.js';
import { readStorage, removeStorage, writeStorage } from './game/storage.js';
import { AudioEngine } from './game/audio.js';
import './style.css';

class Bus extends EventTarget {
  on(type, listener) { this.addEventListener(type, (event) => listener(event.detail)); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

const assistanceKey = 'operation-hebrew-assistance-v1';
const app = {
  bus: new Bus(), screen: 'menu', roomSnapshot: null, myIndex: null, paused: false,
  assistance: readStorage(assistanceKey) !== 'false', connected: false,
  toast: '', toastTimer: null, vocabTimer: null, currentVocab: null,
  audio: new AudioEngine(), multiplayer: null, game: null, shownWords: new Set(), vocabQueue: [], nearTarget: null,
  lastHudSignature: '',
};
app.multiplayer = new MultiplayerClient(app.bus);
app.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#07111d',
  scale: { mode: Phaser.Scale.RESIZE, width: 1360, height: 860, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: true },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [GameScene],
});
app.game.registry.set('app', app);

const root = document.querySelector('#ui-root');
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const isHost = () => app.roomSnapshot?.hostIndex === app.myIndex;
const players = () => app.roomSnapshot?.players || [];
const canStart = () => players().length === 2 && players().every((player) => player.connected) && isHost();
const statusLabels = {
  'find-key': ['מצא את המפתח הכחול', 'Find the blue key.', 'Retrieve the cobalt key shard from the entry bay.'],
  'open-door': ['פתח את הדלת', 'Open the door.', 'Use the key to open the security bulkhead.'],
  switches: ['לחץ כחול ואדום', 'Press blue and red.', 'Blue agent: blue switch. Orange agent: red switch — within 24 seconds.'],
  robot: ['נטרל את הרובוט', 'Disable the robot.', 'Use SPACE to fire stun pulses at the security unit.'],
  generator: ['הפעל את הגנרטור', 'Activate the generator.', 'Use both control panels at the same time.'],
  extract: ['צאו יחד', 'Extract together.', 'Restore power, then reach the exit as a team.'],
  complete: ['המשימה הושלמה', 'Mission complete.', 'Facility power restored. Both agents are clear.'],
};

function objectiveMarkup() {
  const game = app.roomSnapshot?.game;
  if (!game) return '';
  const [hebrew, english, hint] = statusLabels[game.stage] || statusLabels['find-key'];
  return `<div class="objective-copy"><span class="eyebrow">CURRENT OBJECTIVE</span><strong dir="rtl" lang="he">${hebrew}</strong><span class="objective-english ${app.assistance ? '' : 'is-hidden'}">${english}</span><span class="objective-hint">${hint}</span></div>`;
}

function playerCard(player, index) {
  const tone = index === 0 ? 'blue' : 'orange';
  const slotLabel = index === 0 ? 'BLUE AGENT' : 'ORANGE AGENT';
  return `<div class="player-card ${player.connected ? 'is-online' : 'is-offline'} ${player.index === app.myIndex ? 'is-you' : ''}">
    <div class="agent-badge ${tone}"><span class="agent-visor"></span></div>
    <div class="player-card-copy"><b>${player.index === app.myIndex ? 'YOU · ' : ''}${slotLabel}</b><span>${player.connected ? 'ONLINE' : 'RECONNECTING · 30 SEC'}</span></div>
    ${player.host ? '<span class="host-tag">HOST</span>' : `<span class="slot-check ${player.connected ? 'online' : ''}"></span>`}
  </div>`;
}

function menuScreen() {
  const connecting = app.screen === 'connecting';
  return `<div class="app-shell menu-shell">
    <header class="topbar"><a class="brand-lockup" href="#" aria-label="Operation Hebrew home"><span class="brand-mark"><i></i><i></i><i></i></span><span>OPERATION <b>HEBREW</b></span></a>
      <div class="topbar-right"><span class="server-pill ${app.connected ? 'online' : ''}"><i></i>${app.connected ? 'SYSTEM ONLINE' : 'CONNECTING'}</span><button class="icon-button" data-action="settings" aria-label="Sound settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/></svg></button></div>
    </header>
    <main class="hero-layout"><section class="hero-copy">
      <div class="mission-chip"><span class="chip-dot"></span> CO-OP FIELD OPERATION <span class="chip-line"></span> 01 / 01</div>
      <h1>OPERATION<br><span>HEBREW</span></h1>
      <p class="tagline">Two Players. One Mission.<br><b>Learn Hebrew Together.</b></p>
      <p class="hero-description">A research facility has gone dark. Team up, outsmart its security, and bring the power back online.</p>
      <div class="hero-actions"><button class="button button-primary" data-action="create" ${connecting || !app.connected ? 'disabled' : ''}><span class="button-symbol">${connecting ? '<i class="loading-ring"></i>' : '+'}</span> ${connecting ? 'OPENING SECURE ROOM…' : 'CREATE ROOM'} <span class="button-arrow">${connecting ? '' : '↗'}</span></button><button class="button button-secondary" data-action="join" ${connecting || !app.connected ? 'disabled' : ''}><span class="join-symbol">↗</span> JOIN ROOM</button></div>
      <div class="hero-links"><button class="text-button" data-action="how">HOW TO PLAY <span>↗</span></button><span class="link-divider"></span><button class="text-button" data-action="vocabulary">VOCABULARY <span>↗</span></button><span class="link-divider"></span><label class="assist-toggle"><input id="assist-toggle" type="checkbox" ${app.assistance ? 'checked' : ''}><span class="toggle-track"><i></i></span><span>ENGLISH HELP</span></label></div>
      <div class="hero-footnote"><span class="small-orbit"></span> NO ACCOUNTS. NO DOWNLOADS. JUST CO-OP.</div>
    </section>
    <aside class="mission-side"><div class="side-marker"><i></i> FIELD BRIEFING <span>01: POWER STATION</span></div><div class="side-title">THE BLUE<br>GENERATOR</div><div class="side-rule"></div><div class="side-data"><div><span>OPERATIVES</span><b>02</b></div><div><span>DIFFICULTY</span><b>CO-OP</b></div><div><span>MISSION TIME</span><b>~15 MIN</b></div></div><div class="side-coop"><div class="mini-agent blue"><i></i></div><div class="mini-agent orange"><i></i></div><span>BETTER TOGETHER</span><b>01 + 01</b></div></aside></main>
    <footer class="menu-footer"><span>HEBREW LANGUAGE ASSISTANCE BUILT INTO THE MISSION</span><span>© OPERATION HEBREW <i></i> v1.0</span></footer>
    ${modalMarkup()}${feedbackToastMarkup()}
  </div>`;
}

function lobbyScreen() {
  const room = app.roomSnapshot;
  const allConnected = players().length === 2 && players().every((player) => player.connected);
  return `<div class="app-shell lobby-shell"><header class="topbar"><a class="brand-lockup" href="#"><span class="brand-mark"><i></i><i></i><i></i></span><span>OPERATION <b>HEBREW</b></span></a><div class="topbar-right"><span class="server-pill ${app.connected ? 'online' : ''}"><i></i>${app.connected ? 'SYSTEM ONLINE' : 'RECONNECTING'}</span></div></header>
    <main class="lobby-wrap"><div class="lobby-kicker"><span>01</span> / TWO-OPERATIVE LINK</div><h1>MISSION <span>LOBBY</span></h1><p class="lobby-sub">Your team is almost ready. Share the code and bring a partner online.</p>
      <section class="lobby-panel"><div class="room-code-section"><div><span class="eyebrow">SECURE ROOM CODE</span><div class="room-code" aria-label="Room code">${esc(room?.code || '-----').split('').map((letter, i) => `<span class="${i === 2 ? 'code-gap' : ''}">${letter}</span>`).join('')}</div></div><button class="copy-button" data-action="copy"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg> COPY CODE</button></div>
      <div class="lobby-divider"></div><div class="roster-label"><span>OPERATIVE ROSTER</span><span>${players().filter((player) => player.connected).length} / 2 CONNECTED</span></div><div class="player-roster">${[0, 1].map((index) => { const player = players().find((candidate) => candidate.index === index); return player ? playerCard(player, index) : `<div class="player-card waiting-card"><div class="agent-badge ${index === 0 ? 'blue' : 'orange'}"><span class="agent-visor"></span></div><div class="player-card-copy"><b>${index === 0 ? 'BLUE' : 'ORANGE'} AGENT</b><span>AWAITING OPERATIVE</span></div><span class="loading-ring"></span></div>`; }).join('')}</div>
      <div class="lobby-status ${allConnected ? 'ready' : ''}"><span class="status-pulse"></span><span>${allConnected ? 'ALL OPERATIVES READY' : 'WAITING FOR YOUR PARTNER TO CONNECT'}</span><i></i><small>${allConnected ? 'LINK ESTABLISHED' : 'ROOM EXPIRES AFTER 30 SEC OF DISCONNECT'}</small></div>
      <div class="lobby-actions"><button class="button button-primary ${canStart() ? '' : 'is-disabled'}" data-action="start" ${canStart() ? '' : 'disabled'}>START MISSION <span class="button-arrow">↗</span></button><button class="button button-quiet" data-action="leave">LEAVE ROOM</button></div></section>
      <div class="lobby-tip"><span class="tip-icon">i</span> Your friend can join from another computer using this code and the same game link.</div>
    </main>${modalMarkup()}${feedbackToastMarkup()}</div>`;
}

function feedbackToastMarkup() {
  return app.toast ? `<div class="standalone-toast"><i></i>${esc(app.toast)}</div>` : '';
}

function vocabularyCard(id, compact = false) {
  const word = VOCABULARY.find((entry) => entry.id === id);
  if (!word) return '';
  return `<div class="vocab-card ${compact ? 'compact' : ''}"><div class="vocab-illustration ${word.icon}">${illustration(word.icon)}</div><div class="vocab-copy"><span class="eyebrow">${compact ? 'NEW WORD' : 'MISSION VOCABULARY'}</span><b class="hebrew-word" dir="rtl" lang="he">${word.hebrew}</b><strong>${word.english}</strong><span>${word.transliteration}</span></div><button class="speaker-button" data-action="speak" data-word="${word.id}" aria-label="Hear pronunciation"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/></svg></button></div>`;
}

function illustration(icon) {
  const shapes = {
    key: '<span class="ill-key-ring"></span><span class="ill-key-stem"></span><span class="ill-key-notch"></span>',
    blue: '<span class="ill-swatch"></span>', red: '<span class="ill-swatch"></span>', take: '<span class="ill-hand">E</span>',
    door: '<span class="ill-door"><i></i></span>', open: '<span class="ill-door open"><i></i></span>', press: '<span class="ill-button"></span>',
  };
  return shapes[icon] || '';
}

function gameScreen() {
  const game = app.roomSnapshot?.game;
  const done = game?.completed;
  const words = game?.words || [];
  return `<div class="game-ui"><header class="game-topline"><a class="brand-lockup mini-brand"><span class="brand-mark"><i></i><i></i><i></i></span><span>OPERATION <b>HEBREW</b></span></a><div class="game-room-pill"><i></i> ROOM ${esc(app.roomSnapshot?.code || '-----')}</div><div class="game-top-actions"><button class="icon-button small" data-action="vocabulary" aria-label="Vocabulary"><span class="vocab-count">${words.length}</span><span class="book-icon">▤</span></button><button class="icon-button small" data-action="settings" aria-label="Audio settings"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/></svg></button><button class="icon-button small" data-action="pause" aria-label="Pause"><span class="pause-icon">Ⅱ</span></button></div></header>
    ${missionHudMarkup()}
    <div class="mission-bottom"><div class="bottom-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><span><kbd>E</kbd> INTERACT</span><span><kbd>SPACE</kbd> STUN</span><span><kbd>SHIFT</kbd> RUN</span></div><div class="coop-distance" id="coop-distance"><i></i> STAY IN RANGE</div></div>
    ${app.currentVocab ? `<aside class="vocab-toast">${vocabularyCard(app.currentVocab, true)}<button class="toast-close" data-action="dismiss-vocab" aria-label="Dismiss">×</button></aside>` : ''}
    ${app.toast ? `<div class="game-toast"><i></i>${esc(app.toast)}</div>` : ''}
    ${app.paused && !app.modal ? pauseModal() : ''}
    ${done && !app.modal ? completionModal(words) : ''}
    ${modalMarkup()}</div>`;
}

function missionHudMarkup() {
  const game = app.roomSnapshot?.game;
  return `<section class="mission-hud" id="mission-hud">${objectiveMarkup()}<div class="mission-progress"><span class="eyebrow">MISSION PROGRESS</span><div class="progress-steps">${[['find-key','01'],['open-door','02'],['switches','03'],['robot','04'],['generator','05'],['extract','06']].map(([stage, n]) => `<i class="${game?.stage === stage ? 'active' : (['find-key','open-door','switches','robot','generator','extract'].indexOf(game?.stage) > ['find-key','open-door','switches','robot','generator','extract'].indexOf(stage) ? 'done' : '')}">${n}</i>`).join('')}</div></div><div class="hud-roster">${players().map((player, index) => `<div class="hud-agent"><div class="hud-agent-dot ${index === 0 ? 'blue' : 'orange'}"></div><div><b>${player.index === app.myIndex ? 'YOU' : 'PARTNER'}</b><span>${player.connected ? player.down ? 'RECOVERING' : 'ONLINE' : 'DISCONNECTED'}</span></div><div class="health-pips">${[0,1,2].map((i) => `<i class="${i < player.health ? 'healthy' : ''}"></i>`).join('')}</div></div>`).join('')}</div></section>`;
}

function completionModal(words) {
  const recapped = [...new Set(words)].map((id) => VOCABULARY.find((word) => word.id === id)).filter(Boolean);
  return `<div class="screen-scrim complete-scrim"><section class="complete-card"><div class="completion-mark"><i></i><i></i><i></i></div><span class="eyebrow">FACILITY STATUS · POWER RESTORED</span><h2>MISSION<br><b>COMPLETE.</b></h2><p>Every system is back online. Great work, agents.</p><div class="complete-stats"><div><span>WORDS ENCOUNTERED</span><b>${recapped.length.toString().padStart(2, '0')}</b></div><div><span>OPERATIVES EXTRACTED</span><b>02 / 02</b></div></div><div class="recap-heading">FIELD VOCABULARY <i></i></div><div class="recap-list">${recapped.map((word) => `<div><b dir="rtl" lang="he">${word.hebrew}</b><span>${word.english}</span></div>`).join('')}</div><div class="complete-actions"><button class="button button-primary" data-action="retry">RETRY MISSION <span class="button-arrow">↗</span></button><button class="button button-secondary" data-action="return-lobby">RETURN TO LOBBY</button></div><button class="text-button leave-from-complete" data-action="leave">LEAVE ROOM</button></section></div>`;
}

function pauseModal() {
  return `<div class="screen-scrim"><section class="dialog-card pause-card"><button class="dialog-close" data-action="resume">×</button><span class="eyebrow">MISSION PAUSED</span><h2>TAKE A<br><b>BREATHER.</b></h2><p>Your partner remains in the mission while you pause.</p><div class="dialog-actions"><button class="button button-primary" data-action="resume">RESUME MISSION</button><button class="button button-secondary" data-action="controls">CONTROLS & VOCAB</button><button class="button button-quiet danger" data-action="confirm-leave">LEAVE MISSION</button></div></section></div>`;
}

function modalMarkup() {
  if (!app.modal) return '';
  if (app.modal === 'join') return `<div class="screen-scrim"><section class="dialog-card"><button class="dialog-close" data-action="close-modal">×</button><span class="eyebrow">JOIN YOUR PARTNER</span><h2>ENTER ROOM<br><b>CODE.</b></h2><p>Ask the host for the five-character code displayed in their lobby.</p><form id="join-form"><label class="form-label" for="room-code-input">ROOM CODE</label><input id="room-code-input" name="code" maxlength="5" minlength="5" autocomplete="off" spellcheck="false" placeholder="A7K2Q" required pattern="[A-Za-z0-9]{5}"><div class="form-error">${esc(app.formError || '')}</div><button class="button button-primary" type="submit" data-action="submit-join">JOIN SECURE ROOM <span class="button-arrow">↗</span></button></form></section></div>`;
  if (app.modal === 'how' || app.modal === 'controls') return `<div class="screen-scrim"><section class="dialog-card info-card"><button class="dialog-close" data-action="close-modal">×</button><span class="eyebrow">FIELD MANUAL</span><h2>HOW TO<br><b>PLAY.</b></h2><div class="manual-list"><div><kbd>W A S D</kbd><span>Move through the power station</span></div><div><kbd>E</kbd><span>Interact with keys, doors, and controls</span></div><div><kbd>SPACE</kbd><span>Fire a short-range stun pulse at the robot</span></div><div><kbd>SHIFT</kbd><span>Run when you need to cover ground</span></div><div><kbd>ESC</kbd><span>Pause or review words</span></div></div><div class="manual-note"><b>CO-OP TIP</b><span>The blue and red switches need two different players. Listen for the Hebrew word and follow the matching color.</span></div><button class="button button-primary full-width" data-action="close-modal">GOT IT</button></section></div>`;
  if (app.modal === 'vocabulary') return `<div class="screen-scrim"><section class="dialog-card vocab-modal"><button class="dialog-close" data-action="close-modal">×</button><span class="eyebrow">YOUR FIELD VOCABULARY</span><h2>WORDS TO<br><b>REMEMBER.</b></h2><p>Words you have reviewed stay saved on this device.</p><div class="vocab-list">${VOCABULARY.map((word) => `<div class="vocab-list-row ${getReviewedWords().has(word.id) ? 'reviewed' : ''}"><div class="vocab-illustration ${word.icon}">${illustration(word.icon)}</div><div class="vocab-copy"><b class="hebrew-word" dir="rtl" lang="he">${word.hebrew}</b><strong>${word.english}</strong><span>${word.transliteration}</span></div><button class="speaker-button" data-action="speak" data-word="${word.id}" aria-label="Hear pronunciation"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/></svg></button></div>`).join('')}</div><div class="voice-note" id="voice-note">${'he-IL' ? 'Tap the speaker to hear Hebrew when your browser has a Hebrew voice.' : ''}</div></section></div>`;
  if (app.modal === 'settings') return `<div class="screen-scrim"><section class="dialog-card settings-card"><button class="dialog-close" data-action="close-modal">×</button><span class="eyebrow">SYSTEM SETTINGS</span><h2>AUDIO<br><b>& ACCESS.</b></h2><div class="setting-row mute-row"><div><b>MASTER SOUND</b><span>Music and effects</span></div><button class="switch-button ${app.audio.prefs.muted ? '' : 'on'}" data-action="mute" aria-pressed="${app.audio.prefs.muted}"><i></i><span>${app.audio.prefs.muted ? 'OFF' : 'ON'}</span></button></div><label class="setting-slider"><span><b>MUSIC</b><output>${Math.round(app.audio.prefs.music * 100)}%</output></span><input type="range" min="0" max="100" value="${Math.round(app.audio.prefs.music * 100)}" data-setting="music"></label><label class="setting-slider"><span><b>SOUND EFFECTS</b><output>${Math.round(app.audio.prefs.effects * 100)}%</output></span><input type="range" min="0" max="100" value="${Math.round(app.audio.prefs.effects * 100)}" data-setting="effects"></label><div class="setting-row"><div><b>ENGLISH ASSISTANCE</b><span>Show translations beside Hebrew</span></div><button class="switch-button ${app.assistance ? 'on' : ''}" data-action="assist" aria-pressed="${app.assistance}"><i></i><span>${app.assistance ? 'ON' : 'OFF'}</span></button></div><button class="button button-primary full-width" data-action="close-modal">DONE</button></section></div>`;
  if (app.modal === 'confirm-leave') return `<div class="screen-scrim"><section class="dialog-card"><span class="eyebrow">TEAM CONNECTION</span><h2>LEAVE THE<br><b>MISSION?</b></h2><p>Your partner will be notified and may continue alone.</p><div class="dialog-actions"><button class="button button-danger" data-action="leave-confirmed">LEAVE MISSION</button><button class="button button-secondary" data-action="resume">STAY WITH TEAM</button></div></section></div>`;
  return '';
}

function render() {
  if (app.screen === 'menu' || app.screen === 'connecting') root.innerHTML = menuScreen();
  else if (app.screen === 'lobby') root.innerHTML = lobbyScreen();
  else root.innerHTML = gameScreen();
  app.lastHudSignature = app.screen === 'game' ? hudSignature() : '';
  const joinButton = root.querySelector('[data-action="submit-join"]');
  if (joinButton) joinButton.addEventListener('click', submitJoin);
  if (app.screen === 'lobby' && app.modal === 'join') root.querySelector('#room-code-input')?.focus();
}

function hudSignature() {
  const game = app.roomSnapshot?.game;
  return JSON.stringify([game?.stage, game?.words?.length, game?.completed, players().map((player) => [player.connected, player.down, player.health])]);
}

function updateGameHud() {
  const signature = hudSignature();
  if (signature === app.lastHudSignature) return;
  app.lastHudSignature = signature;
  const missionHud = root.querySelector('#mission-hud');
  if (missionHud) missionHud.outerHTML = missionHudMarkup();
  const count = root.querySelector('.vocab-count');
  if (count) count.textContent = app.roomSnapshot?.game?.words?.length || '0';
}

function toast(message) {
  app.toast = message;
  if (app.screen === 'game') render(); else render();
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => { app.toast = ''; if (app.screen === 'game' || app.screen === 'lobby') render(); }, 3600);
}

function displayVocab(id) {
  if (!VOCABULARY.some((word) => word.id === id)) return;
  app.currentVocab = id; markReviewed(id); app.bus.emit('sound', { name: 'vocab' });
  if (app.screen === 'game') render();
  clearTimeout(app.vocabTimer);
  app.vocabTimer = setTimeout(() => { app.currentVocab = null; if (app.screen === 'game') render(); displayNextVocab(); }, 4200);
}

function queueVocabulary(ids = []) {
  for (const id of ids) {
    if (VOCABULARY.some((word) => word.id === id) && !app.shownWords.has(id)) {
      app.shownWords.add(id); app.vocabQueue.push(id);
    }
  }
  displayNextVocab();
}

function displayNextVocab() {
  if (!app.currentVocab && app.vocabQueue.length && app.screen === 'game') displayVocab(app.vocabQueue.shift());
}

function navigateToMenu() {
  app.multiplayer.leave(); app.roomSnapshot = null; app.myIndex = null; app.screen = 'menu'; app.paused = false; app.currentVocab = null; app.modal = null; render();
}

function unlockAudio() { void app.audio.unlock().catch(() => {}); }

app.bus.on('network', ({ connected }) => { app.connected = connected; render(); });
app.bus.on('room:resume-failed', () => {
  app.roomSnapshot = null; app.myIndex = null; app.screen = 'menu'; app.paused = false; app.modal = null; app.currentVocab = null;
  toast('This room expired or is no longer available. Create a new room to continue.');
});
app.bus.on('room:joined', (snapshot) => {
  app.roomSnapshot = snapshot; app.myIndex = snapshot.myIndex ?? app.myIndex; app.modal = null; app.formError = '';
  if (snapshot.started) app.screen = 'game'; else app.screen = 'lobby';
  app.paused = false; app.shownWords.clear(); app.vocabQueue = []; app.bus.emit('sound', { name: 'join' }); render();
});
app.bus.on('room:state', (snapshot) => { app.roomSnapshot = snapshot; if (!snapshot.started && app.screen !== 'menu') { app.screen = 'lobby'; app.paused = false; } render(); });
app.bus.on('game:state', (snapshot) => {
  const priorWords = new Set(app.roomSnapshot?.game?.words || []);
  const wasComplete = Boolean(app.roomSnapshot?.game?.completed);
  app.roomSnapshot = snapshot; app.screen = 'game';
  queueVocabulary((snapshot.game?.words || []).filter((id) => !priorWords.has(id)));
  if (!wasComplete && snapshot.game?.completed) render(); else updateGameHud();
});
app.bus.on('game:started', (snapshot) => { app.roomSnapshot = snapshot; app.screen = 'game'; app.paused = false; app.currentVocab = null; app.vocabQueue = []; app.shownWords.clear(); render(); toast('Mission link established. Stay together, agents.'); });
app.bus.on('game:action-result', (result) => { if (result.notice) toast(result.notice); else if (result.reason) toast(result.reason); if (result.vocab?.length) queueVocabulary(result.vocab); });
app.bus.on('game:error', ({ message }) => {
  if (app.screen === 'connecting') app.screen = 'menu';
  if (app.screen === 'menu' && app.multiplayer.lastRoom && !app.roomSnapshot) {
    removeStorage('operation-hebrew-last-room'); app.multiplayer.lastRoom = null;
  }
  if (app.modal === 'join') { app.formError = message; render(); }
  else toast(message);
});
app.bus.on('game:notice', ({ message, sound }) => { if (message) { app.bus.emit('sound', { name: sound || 'notice' }); toast(message); } });
app.bus.on('sound', ({ name }) => app.audio.play(name));
app.bus.on('toast', ({ message }) => toast(message));
app.bus.on('pause', () => { app.paused = !app.paused; app.modal = null; render(); });
app.bus.on('nearby', ({ target }) => { app.nearTarget = target; const hint = document.querySelector('.coop-distance'); if (hint) hint.innerHTML = target ? `<i></i> E &nbsp; ${target.replace(/([A-Z])/g, ' $1').toUpperCase()}` : '<i></i> STAY IN RANGE'; });

root.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action !== 'speak') app.bus.emit('sound', { name: 'click' });
  switch (action) {
    case 'create': unlockAudio(); app.screen = 'connecting'; render(); app.multiplayer.createRoom(); break;
    case 'join': app.modal = 'join'; app.formError = ''; render(); break;
    case 'how': app.modal = 'how'; render(); break;
    case 'controls': app.paused = app.screen === 'game'; app.modal = 'controls'; render(); break;
    case 'vocabulary': app.paused = app.screen === 'game'; app.modal = 'vocabulary'; render(); break;
    case 'settings': app.paused = app.screen === 'game'; app.modal = 'settings'; render(); break;
    case 'close-modal': app.modal = null; app.paused = false; render(); break;
    case 'copy': try { await navigator.clipboard.writeText(app.roomSnapshot?.code || ''); button.innerHTML = '✓ COPIED'; setTimeout(render, 1400); } catch { toast(`Room code: ${app.roomSnapshot?.code || ''}`); } break;
    case 'start': unlockAudio(); app.multiplayer.startMission(); break;
    case 'leave': if (app.screen === 'game') { app.paused = true; app.modal = 'confirm-leave'; render(); } else navigateToMenu(); break;
    case 'confirm-leave': app.paused = true; app.modal = 'confirm-leave'; render(); break;
    case 'leave-confirmed': navigateToMenu(); break;
    case 'pause': app.paused = true; render(); break;
    case 'resume': app.paused = false; app.modal = null; render(); break;
    case 'mute': app.audio.set('muted', !app.audio.prefs.muted); render(); break;
    case 'assist': app.assistance = !app.assistance; writeStorage(assistanceKey, app.assistance); render(); break;
    case 'retry': app.multiplayer.restart(); break;
    case 'return-lobby': app.multiplayer.returnToLobby(); break;
    case 'speak': {
      const worked = speakHebrew(button.dataset.word);
      markReviewed(button.dataset.word);
      if (!worked) { const note = root.querySelector('#voice-note'); if (note) note.textContent = 'No Hebrew voice is available in this browser. The word and transliteration are still here to review.'; toast('Hebrew speech is not available on this browser.'); }
      else { button.classList.add('speaking'); setTimeout(() => button.classList.remove('speaking'), 850); }
      break;
    }
    case 'dismiss-vocab': app.currentVocab = null; clearTimeout(app.vocabTimer); render(); displayNextVocab(); break;
  }
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'assist-toggle') { app.assistance = event.target.checked; writeStorage(assistanceKey, app.assistance); render(); }
  if (event.target.matches('[data-setting]')) {
    const key = event.target.dataset.setting; const value = Number(event.target.value) / 100;
    app.audio.set(key, value); event.target.closest('.setting-slider').querySelector('output').value = `${event.target.value}%`;
  }
});

function submitJoin(event) {
  event.preventDefault();
  const form = root.querySelector('#join-form');
  if (!form) return;
  const code = new FormData(form).get('code');
  if (!/^[a-z0-9]{5}$/i.test(code)) { app.formError = 'Use the five letters or numbers from your partner.'; render(); return; }
  unlockAudio(); app.formError = ''; app.multiplayer.joinRoom(code);
  const submit = root.querySelector('#join-form button'); if (submit) { submit.disabled = true; submit.innerHTML = 'CONNECTING…'; }
}

root.addEventListener('submit', (event) => {
  if (event.target.id !== 'join-form') return;
  event.preventDefault();
  submitJoin(event);
});

document.addEventListener('pointerdown', unlockAudio, { once: true });
render();
