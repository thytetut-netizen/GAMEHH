const PREF_KEY = 'operation-hebrew-audio-v1';
const DEFAULTS = { music: 0.17, effects: 0.52, muted: false };

function readPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}')) }; } catch { return { ...DEFAULTS }; }
}

export class AudioEngine {
  constructor() {
    this.prefs = readPrefs();
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  async unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.context = new Context();
      this.master = this.context.createGain(); this.master.connect(this.context.destination);
      this.fxGain = this.context.createGain(); this.fxGain.connect(this.master);
      this.musicGain = this.context.createGain(); this.musicGain.connect(this.master);
      this.applyVolumes();
    }
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
    if (!this.started) this.startMusic();
    return true;
  }

  applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : 1, now, 0.04);
    this.fxGain.gain.setTargetAtTime(this.prefs.effects, now, 0.04);
    this.musicGain.gain.setTargetAtTime(this.prefs.muted ? 0 : this.prefs.music, now, 0.04);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(this.prefs)); } catch { /* Audio remains available without storage. */ }
  }

  set(key, value) { this.prefs[key] = value; this.applyVolumes(); }

  tone(frequency, duration = 0.12, { type = 'sine', volume = 0.28, endFrequency = null, when = 0, destination = this.fxGain } = {}) {
    if (!this.context || !destination) return;
    const now = this.context.currentTime + when;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(destination); oscillator.start(now); oscillator.stop(now + duration + 0.025);
  }

  noise(duration = 0.08, volume = 0.11) {
    if (!this.context || !this.fxGain) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource(); const gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = volume; source.connect(gain).connect(this.fxGain); source.start();
  }

  play(name = 'click') {
    if (!this.context || !this.master) return;
    const sounds = {
      click: [[640, 0.07]], join: [[460, 0.09], [720, 0.12]], start: [[392, 0.2], [523, 0.22], [784, 0.3]],
      vocab: [[660, 0.1], [880, 0.14]], key: [[760, 0.12], [980, 0.24]], wrong: [[170, 0.16]],
      door: [[210, 0.3], [320, 0.22]], switch: [[520, 0.11], [660, 0.13]], 'switch-pair': [[520, 0.13], [660, 0.15], [880, 0.22]],
      stun: [[880, 0.08]], 'robot-hit': [[240, 0.11]], 'robot-down': [[330, 0.22], [220, 0.32]],
      damage: [[130, 0.18]], revive: [[392, 0.12], [587, 0.2]], generator: [[196, 0.35], [293, 0.42], [440, 0.56]], complete: [[523, 0.2], [659, 0.25], [784, 0.33], [1046, 0.5]], notice: [[540, 0.1]],
    };
    const notes = sounds[name] || sounds.click;
    notes.forEach(([frequency, duration], index) => this.tone(frequency, duration, { type: name === 'damage' || name === 'wrong' ? 'triangle' : 'sine', volume: 0.25, when: index * 0.095 }));
    if (name === 'stun' || name === 'robot-hit') this.noise(0.055, 0.06);
  }

  startMusic() {
    if (this.started || !this.context || !this.musicGain) return;
    this.started = true;
    const notes = [110, 164.81, 196, 146.83, 220, 164.81, 130.81, 196];
    this.musicTimer = window.setInterval(() => {
      if (!this.context || this.context.state !== 'running') return;
      const note = notes[this.musicStep % notes.length];
      this.tone(note, 1.7, { type: 'sine', volume: 0.055, destination: this.musicGain });
      if (this.musicStep % 2 === 0) this.tone(note * 2, 0.65, { type: 'triangle', volume: 0.018, when: 0.32, destination: this.musicGain });
      this.musicStep += 1;
    }, 1250);
  }
}
