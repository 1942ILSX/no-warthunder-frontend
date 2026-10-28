/** Original synthesized effects. No downloaded samples or background autoplay. */
export class AudioEngine {
  private context?: AudioContext;
  enabled = false;
  constructor() {
    try { this.enabled = localStorage.getItem('bcr-sound') === 'on'; } catch { /* Storage can be disabled. */ }
  }
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    void this.context.resume();
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('bcr-sound', this.enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    this.unlock();
    if (this.enabled) this.play('select');
    return this.enabled;
  }
  play(kind: 'shoot' | 'hit' | 'select' | 'win' | 'lose') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const durations = { shoot: 0.075, hit: 0.16, select: 0.06, win: 0.45, lose: 0.38 };
    const frequencies = { shoot: 180, hit: 95, select: 440, win: 440, lose: 180 };
    oscillator.type = kind === 'win' || kind === 'select' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequencies[kind], now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'win' ? 880 : 40, now + durations[kind]);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durations[kind]);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now); oscillator.stop(now + durations[kind] + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
