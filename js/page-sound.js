export class PageSound {
  #ctx = null;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  play(heavy = false) {
    if (!this.enabled) return;
    try {
      this.#ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.#ctx;
      const duration = heavy ? 0.5 : 0.42;
      const rate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.floor(rate * duration), rate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const t = i / samples.length;
        const envelope = Math.sin(Math.PI * t) ** 2 * (1 - 0.5 * t);
        samples[i] = (Math.random() * 2 - 1) * envelope;
      }
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(heavy ? 1400 : 3800, now);
      filter.frequency.exponentialRampToValueAtTime(heavy ? 300 : 900, now + duration);
      const gain = ctx.createGain();
      gain.gain.value = heavy ? 0.5 : 0.35;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(now);
    } catch {
      // Audio is a nice-to-have; ignore unsupported browsers.
    }
  }
}
