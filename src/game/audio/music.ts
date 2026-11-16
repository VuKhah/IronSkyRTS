/**
 * NHẠC THÍCH ỨNG (Bản cập nhật vui): tổng hợp bằng Web Audio API, không có file nhạc nào.
 *
 * Hai phần:
 * - `composeStep(bước, độ căng)` — "nhà soạn nhạc" THUẦN (không đụng âm thanh): trả về các nốt của một nhịp 1/16.
 *   Nhạc nhiều lớp, bật dần theo độ căng thẳng của trận:
 *     yên  (≥ 0)    : hợp âm nền chậm (La thứ: Am – F – C – G)
 *     căng (≥ 0,25) : bè trầm theo phách
 *     nóng (≥ 0,45) : chuỗi nốt rải 1/16 + tiếng hi-hat
 *     đánh (≥ 0,65) : trống (kick, snare), kèn nhấn đầu ô nhịp; ≥ 0,8 đổi sang vòng hợp âm kịch tính (Am – F – G – E)
 *   Mỗi lớp mờ dần vào trong khoảng 0,15 quanh ngưỡng nên chuyển lớp không giật. Kiểm thử được bằng máy (music.test.ts).
 * - `Music` — bộ hẹn giờ nhìn trước (look-ahead scheduler): cứ 25 ms đặt trước các nốt của 0,15 s tới vào đồng hồ âm thanh,
 *   nên nhịp đều dù khung hình có giật. Độ căng thẳng do trận đấu đưa vào, được làm mượt (~2,5 giây).
 */
import type { Sfx } from "./audio";

export type Voice = "pad" | "bass" | "arp" | "hat" | "kick" | "snare" | "brass";

export interface Note {
  voice: Voice;
  /** Tần số (Hz); trống / hi-hat không dùng. */
  freq: number;
  /** Độ dài (giây). */
  dur: number;
  /** Âm lượng tương đối (đã nhân trọng số lớp). */
  gain: number;
}

export const BPM = 96;
export const STEPS_PER_BAR = 16;
/** Độ dài một nhịp 1/16 (giây). */
export const STEP_SEC = 60 / BPM / 4;

/** Ngưỡng bật từng lớp theo độ căng thẳng. */
export const LAYERS = { bass: 0.25, arp: 0.45, drums: 0.65, brass: 0.75, dramatic: 0.8 } as const;

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
// hợp âm (số MIDI), mỗi hợp âm một ô nhịp
const PROG_CALM = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62] // G
];
const PROG_DRAMA = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 56, 59] // E (trưởng: kéo về Am, căng hơn)
];

/** Trọng số của một lớp: 0 dưới ngưỡng, lên dần tới 1 trong khoảng 0,15 phía trên ngưỡng. */
export function layerWeight(intensity: number, threshold: number): number {
  const t = (intensity - threshold) / 0.15;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Hợp âm đang chơi ở bước `step` (đổi mỗi ô nhịp). */
export function chordAt(step: number, intensity: number): number[] {
  const bar = Math.floor(step / STEPS_PER_BAR) % 4;
  return (intensity >= LAYERS.dramatic ? PROG_DRAMA : PROG_CALM)[bar];
}

/** Các nốt của nhịp 1/16 thứ `step` khi độ căng thẳng là `intensity` (0..1). Thuần, tất định. */
export function composeStep(step: number, intensity: number): Note[] {
  const out: Note[] = [];
  const pos = step % STEPS_PER_BAR;
  const chord = chordAt(step, intensity);
  const bar = STEPS_PER_BAR * STEP_SEC;
  // hợp âm nền: đầu mỗi ô nhịp, ngân hết ô; nhỏ lại khi trống vào cho đỡ đục
  if (pos === 0) {
    const g = 0.06 * (1 - 0.35 * layerWeight(intensity, LAYERS.drums));
    for (const m of chord) out.push({ voice: "pad", freq: midi(m), dur: bar * 1.05, gain: g });
  }
  // bè trầm: mỗi phách (bước 0, 4, 8, 12), nốt gốc hạ hai quãng tám; căng hơn thì thêm nốt móc ở bước 14
  const wb = layerWeight(intensity, LAYERS.bass);
  if (wb > 0 && (pos % 4 === 0 || (pos === 14 && intensity >= 0.55))) out.push({ voice: "bass", freq: midi(chord[0] - 24), dur: STEP_SEC * 2.6, gain: 0.13 * wb });
  // nốt rải lên xuống trong hợp âm + hi-hat phách lẻ
  const wa = layerWeight(intensity, LAYERS.arp);
  if (wa > 0) {
    const order = [0, 1, 2, 1];
    const m = chord[order[pos % 4]] + 12 + (pos >= 8 ? 12 : 0);
    out.push({ voice: "arp", freq: midi(m), dur: STEP_SEC * 0.9, gain: 0.045 * wa });
    if (pos % 4 === 2) out.push({ voice: "hat", freq: 0, dur: 0.04, gain: 0.05 * wa });
  }
  // trống: kick phách 1 và 3 (gắt hơn thì thêm nhịp lệch), snare phách 2 và 4
  const wd = layerWeight(intensity, LAYERS.drums);
  if (wd > 0) {
    if (pos === 0 || pos === 8 || (intensity >= 0.85 && (pos === 6 || pos === 10 || pos === 14))) out.push({ voice: "kick", freq: 0, dur: 0.18, gain: 0.32 * wd });
    if (pos === 4 || pos === 12) out.push({ voice: "snare", freq: 0, dur: 0.14, gain: 0.13 * wd });
  }
  // kèn nhấn đầu ô nhịp
  const wk = layerWeight(intensity, LAYERS.brass);
  if (wk > 0 && pos === 0) for (const m of chord.slice(0, 2)) out.push({ voice: "brass", freq: midi(m), dur: STEP_SEC * 5, gain: 0.05 * wk });
  return out;
}

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  /** Độ căng thẳng mục tiêu (do trận đấu đặt) và độ căng đã làm mượt (dùng để soạn). */
  private target = 0;
  private level = 0;
  private stopped = false;

  constructor(private sfx: Sfx) {}

  /** Mỗi khung hình: đặt độ căng thẳng mục tiêu; tự khởi động khi âm thanh đã được mở khóa (sau cú chạm đầu). */
  update(dt: number, tension: number): void {
    this.target = Math.max(0, Math.min(1, tension));
    this.level += (this.target - this.level) * Math.min(1, dt / 2.5);
    if (this.stopped) return;
    if (!this.ctx) {
      const a = this.sfx.audio();
      if (!a) return;
      this.ctx = a.ctx;
      this.noise = a.noise;
      this.out = a.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(a.out);
      this.nextTime = a.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    // tắt tiếng thì nhạc nhỏ dần về 0 (không cắt cụt)
    const want = this.sfx.muted ? 0 : 0.85;
    this.out!.gain.setTargetAtTime(want, this.ctx.currentTime, 0.3);
  }

  /** Để kiểm tra (?audio=1): số nhịp đã đặt, độ căng thẳng đang dùng, trạng thái âm thanh. */
  debug(): string {
    return `nhịp ${this.step} · độ căng ${this.level.toFixed(2)} · âm thanh ${this.ctx?.state ?? "chưa mở"}`;
  }

  /** Hết trận: nhạc nhỏ dần rồi dừng (tiếng thắng / thua phát riêng). */
  stop(fade = 2): void {
    this.stopped = true;
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    window.setTimeout(() => window.clearInterval(this.timer), fade * 1000 + 200);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    // tab bị ẩn lâu: đừng dồn một tràng nốt bù, nhảy tới hiện tại
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      for (const n of composeStep(this.step, this.level)) this.play(n, this.nextTime);
      this.nextTime += STEP_SEC;
      this.step++;
    }
  }

  private play(n: Note, t: number): void {
    const ctx = this.ctx!;
    const out = this.out!;
    const env = (g: GainNode, peak: number, attack: number, dur: number): void => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    switch (n.voice) {
      case "pad": {
        // hai dao động lệch nhau một chút cho dày, qua bộ lọc thấp cho êm
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1100;
        const g = ctx.createGain();
        env(g, n.gain, 0.5, n.dur);
        for (const [type, det] of [["triangle", -4], ["sine", 5]] as const) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = n.freq;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + n.dur + 0.05);
        }
        f.connect(g).connect(out);
        break;
      }
      case "bass":
      case "arp":
      case "brass": {
        const o = ctx.createOscillator();
        o.type = n.voice === "arp" ? "triangle" : "sawtooth";
        o.frequency.value = n.freq;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = n.voice === "bass" ? 420 : n.voice === "brass" ? 1600 : 3000;
        const g = ctx.createGain();
        env(g, n.gain, n.voice === "brass" ? 0.06 : 0.01, n.dur);
        o.connect(f).connect(g).connect(out);
        o.start(t);
        o.stop(t + n.dur + 0.05);
        break;
      }
      case "kick": {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(42, t + n.dur);
        const g = ctx.createGain();
        env(g, n.gain, 0.005, n.dur);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + n.dur + 0.05);
        break;
      }
      case "snare":
      case "hat": {
        if (!this.noise) break;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = n.voice === "hat" ? "highpass" : "bandpass";
        f.frequency.value = n.voice === "hat" ? 7000 : 1800;
        const g = ctx.createGain();
        env(g, n.gain, 0.003, n.dur);
        src.connect(f).connect(g).connect(out);
        src.start(t);
        src.stop(t + n.dur + 0.05);
        break;
      }
    }
  }
}
