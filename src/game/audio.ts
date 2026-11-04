/**
 * Âm thanh tổng hợp bằng Web Audio API — không có file âm thanh nào.
 * Tiếng súng = một nhát nhiễu trắng qua bộ lọc; tiếng pháo = sóng sin trầm trượt xuống + nhiễu;
 * tiếng nổ = nhiễu qua bộ lọc thấp tắt dần. Trình duyệt chỉ cho phát âm thanh sau cú chạm đầu tiên (unlock).
 */
import type { WeaponVisual } from "../sim/content";

export type UiSound = "click" | "ack" | "error" | "alert" | "build" | "ready" | "win" | "lose";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private budgetT = 0;
  private budget = 0;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Giới hạn số tiếng mỗi 80 ms để trận đông không thành một mớ ồn. */
  private ok(): boolean {
    if (!this.ctx || !this.master || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - this.budgetT > 0.08) {
      this.budgetT = now;
      this.budget = 0;
    }
    return this.budget++ < 5;
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, vol: number, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", freqEnd?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  shot(visual: WeaponVisual, vol: number): void {
    if (vol < 0.05 || !this.ok()) return;
    if (visual === "bullet") this.burst(0.07, "highpass", 1600, 0.22 * vol);
    else if (visual === "cannon") {
      this.tone(110, 0.25, 0.45 * vol, "sine", 38);
      this.burst(0.2, "lowpass", 1100, 0.3 * vol);
    } else if (visual === "missile") this.burst(0.5, "bandpass", 700, 0.25 * vol, 2600);
    else this.burst(0.3, "lowpass", 600, 0.3 * vol);
  }

  boom(size: number, vol: number): void {
    if (vol < 0.05 || !this.ok()) return;
    this.burst(0.45 + size * 0.2, "lowpass", 700, Math.min(0.8, 0.35 + size * 0.15) * vol, 120);
    this.tone(60, 0.5 + size * 0.15, 0.35 * vol, "sine", 28);
  }

  ui(kind: UiSound): void {
    if (!this.ctx || !this.master || this.muted) return;
    switch (kind) {
      case "click":
        this.tone(900, 0.05, 0.12, "triangle");
        break;
      case "ack":
        this.tone(620, 0.07, 0.14, "square", undefined, 0);
        this.tone(930, 0.08, 0.12, "square", undefined, 0.06);
        break;
      case "error":
        this.tone(220, 0.16, 0.18, "sawtooth", 160);
        break;
      case "alert":
        this.tone(880, 0.12, 0.2, "square");
        this.tone(660, 0.14, 0.2, "square", undefined, 0.15);
        break;
      case "build":
        this.tone(520, 0.1, 0.15, "triangle");
        this.tone(780, 0.16, 0.15, "triangle", undefined, 0.09);
        break;
      case "ready":
        this.tone(700, 0.08, 0.12, "triangle");
        this.tone(1050, 0.12, 0.12, "triangle", undefined, 0.07);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 0.18, "triangle", undefined, i * 0.14));
        break;
      case "lose":
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 0.18, "sawtooth", undefined, i * 0.18));
        break;
    }
  }
}
