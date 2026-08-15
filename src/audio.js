// Tiny procedural audio using WebAudio — no external sound files required.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.enabled = true;
    } catch (e) {
      console.warn('Audio init failed', e);
    }
  }
  _noiseBurst(duration = 0.15, freq = 800, gain = 0.3, type = 'lowpass') {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start();
  }
  _tone(freq, dur, type='sine', gain=0.1, slide=0) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq+slide), ctx.currentTime+dur);
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime+dur);
  }
  playShot() {
    this._noiseBurst(0.18, 1800, 0.25, 'lowpass');
    this._tone(120, 0.1, 'square', 0.15, -60);
  }
  playBotShot() {
    this._noiseBurst(0.12, 900, 0.12, 'lowpass');
  }
  playReload() {
    setTimeout(() => this._tone(220, 0.05, 'square', 0.08), 0);
    setTimeout(() => this._tone(160, 0.06, 'square', 0.08), 250);
    setTimeout(() => this._tone(300, 0.05, 'square', 0.08), 1200);
  }
  playHit() { this._tone(880, 0.05, 'square', 0.08); }
  playKill() {
    this._tone(660, 0.08, 'square', 0.1);
    setTimeout(() => this._tone(990, 0.1, 'square', 0.1), 80);
  }
  playHurt() { this._noiseBurst(0.2, 400, 0.18, 'bandpass'); }
}
