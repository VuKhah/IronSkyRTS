/**
 * Kịch bản thiết kế: biến ý đồ trong Docs/ARMY_DESIGN.md thành phép thử có tiêu chí đạt / chưa đạt.
 *
 * Mỗi kịch bản giống một "đạo diễn": đầu trận dàn quân, mỗi tick có thể ra thêm lệnh (ví dụ thả Lynx kế tiếp
 * khi chiếc trước bị hạ), rồi chấm kết quả. Đạo diễn chỉ đọc trạng thái và gửi LỆNH qua kênh lệnh, nên kết quả
 * tất định: chạy trong Phòng Thử Nghiệm (xem bằng mắt) hay chạy không giao diện (`npm run balance`) đều ra như nhau.
 *
 * Chỉ dùng trong World { sandbox: true }.
 */
import type { Side, UnitId } from "./content";
import { fromUV } from "./map";
import type { Command } from "./types";
import { TICK_RATE, type World } from "./world";

/** Bãi thử: vùng đất bằng bên bờ Liên Minh Lam, trục đấu chạy song song dòng sông (trục v). */
export const ARENA_U = -38;
export const ARENA_CENTER = fromUV(ARENA_U, 0);
const SPACING = 3.6;

/**
 * Vị trí thứ i trong khối n quân: hàng ngang tối đa 5 chiếc, các hàng lùi dần theo hướng (bx, bz) (vector đơn vị).
 * Chỉ dùng cộng trừ nhân nên tất định.
 */
export function formation(i: number, n: number, cx: number, cz: number, bx: number, bz: number): [number, number] {
  const cols = Math.min(5, n);
  const row = Math.floor(i / cols);
  const inRow = Math.min(cols, n - row * cols);
  const col = (i % cols) - (inRow - 1) / 2;
  const px = -bz;
  const pz = bx;
  return [cx + px * col * SPACING + bx * row * SPACING, cz + pz * col * SPACING + bz * row * SPACING];
}

/** Lệnh thả một khối quân ở điểm v trên trục bãi thử, các hàng lùi xa phía `toward`. */
function group(side: Side, kind: UnitId, n: number, v: number, toward: number, go?: { v: number; mode: "move" | "amove" }): Command[] {
  const [cx, cz] = fromUV(ARENA_U, v);
  const [ex, ez] = fromUV(ARENA_U, toward);
  const l = Math.sqrt((cx - ex) * (cx - ex) + (cz - ez) * (cz - ez)) || 1;
  const [gx, gz] = go ? fromUV(ARENA_U, go.v) : [undefined, undefined];
  const out: Command[] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = formation(i, n, cx, cz, (cx - ex) / l, (cz - ez) / l);
    out.push({ side, order: { t: "sbSpawn", kind, side, x, z, gx, gz, go: go?.mode } });
  }
  return out;
}

const alive = (w: World, side: Side, kind: UnitId): number => {
  let n = 0;
  for (const u of w.units) if (u.side === side && u.kind === kind && u.hp > 0) n++;
  return n;
};
const hpPct = (w: World, side: Side, kind: UnitId): number => {
  const u = w.units.find((e) => e.side === side && e.kind === kind);
  return u ? Math.round((u.hp / u.maxHp) * 100) : 0;
};

export interface Verdict {
  ok: boolean;
  /** Mô tả kết quả bằng tiếng Việt. */
  text: string;
}

export interface Scenario {
  id: string;
  name: string;
  /** Ý đồ thiết kế (trích từ ARMY_DESIGN.md). */
  intent: string;
  /** Giới hạn thời gian (giây). */
  seconds: number;
  /** Lệnh dàn quân ở tick đầu (sau lệnh dọn sạch). */
  setup(): Command[];
  /** Lệnh thêm ở mỗi tick (đạo diễn). */
  step?(w: World): Command[];
  /** Đã ngã ngũ chưa (chưa hết giờ cũng được kết thúc sớm). */
  done(w: World): boolean;
  judge(w: World): Verdict;
}

/** Bảng kịch bản: hàm tạo, vì kịch bản có trạng thái riêng (ví dụ đã thả bao nhiêu Lynx). */
export const SCENARIOS: Record<string, () => Scenario> = {
  "titan-vs-lynx-seq": () => {
    let sent = 1;
    return {
      id: "titan-vs-lynx-seq",
      name: "Titan đấu 3 Lynx lần lượt",
      intent: "Lynx lao vào từng chiếc một, Titan không được hồi máu: Titan phải hạ đủ 3 Lynx.",
      seconds: 150,
      setup: () => [...group(1, "titan", 1, 16, -16), ...group(0, "lynx", 1, -16, 16, { v: 16, mode: "amove" })],
      step(w) {
        if (sent >= 3 || alive(w, 0, "lynx") > 0 || alive(w, 1, "titan") === 0) return [];
        sent++;
        return group(0, "lynx", 1, -16, 16, { v: 16, mode: "amove" });
      },
      done: (w) => alive(w, 1, "titan") === 0 || (sent >= 3 && alive(w, 0, "lynx") === 0),
      judge(w) {
        const titan = alive(w, 1, "titan") > 0;
        const killed = sent - alive(w, 0, "lynx");
        return {
          ok: titan && killed >= 3,
          text: titan ? `Titan còn ${hpPct(w, 1, "titan")}% máu, hạ ${killed}/3 Lynx` : `Titan bị hạ sau khi hạ ${killed} Lynx (đã thả ${sent})`
        };
      }
    };
  },
  "titan-vs-lynx-sim": () => ({
    id: "titan-vs-lynx-sim",
    name: "Titan đấu 3 Lynx cùng lúc",
    intent: "Ba Lynx đánh cùng lúc: Lynx thắng nhưng chỉ còn đúng 1 chiếc.",
    seconds: 90,
    setup: () => [...group(1, "titan", 1, 16, -16), ...group(0, "lynx", 3, -16, 16, { v: 16, mode: "amove" })],
    done: (w) => alive(w, 1, "titan") === 0 || alive(w, 0, "lynx") === 0,
    judge(w) {
      const left = alive(w, 0, "lynx");
      const titan = alive(w, 1, "titan") > 0;
      return {
        ok: !titan && left === 1,
        text: titan ? `Titan thắng, còn ${hpPct(w, 1, "titan")}% máu` : `Lynx thắng, còn ${left}/3 chiếc`
      };
    }
  }),
  "reaction-time": () => {
    // Hai đạo quân giống hệt nhau (4 Lynx đi trước, 2 Titan theo sau) lao vào nhau.
    // Đo từ phát bắn đầu tiên tới lúc một bên mất nửa quân.
    const PER_SIDE = 6;
    let first = -1;
    let at = -1;
    const lost = (w: World, side: Side) => PER_SIDE - (alive(w, side, "lynx") + alive(w, side, "titan"));
    const half = (w: World) => lost(w, 0) >= PER_SIDE / 2 || lost(w, 1) >= PER_SIDE / 2;
    return {
      id: "reaction-time",
      name: "Thời gian kịp phản ứng",
      intent: "Giao tranh tầm trung (mỗi bên 4 Lynx + 2 Titan): từ phát bắn đầu tới lúc một bên mất nửa quân phải ít nhất ~8 giây (đạt nếu 7–12 giây), để người chơi điện thoại kịp ra lệnh.",
      seconds: 90,
      setup: () => [
        ...group(0, "lynx", 4, -22, 22, { v: 30, mode: "amove" }),
        ...group(0, "titan", 2, -27, 22, { v: 30, mode: "amove" }),
        ...group(1, "lynx", 4, 22, -22, { v: -30, mode: "amove" }),
        ...group(1, "titan", 2, 27, -22, { v: -30, mode: "amove" })
      ],
      step(w) {
        if (first < 0 && w.sides[0].stats.damageDealt + w.sides[1].stats.damageDealt > 0) first = w.tick;
        if (at < 0 && half(w)) at = w.tick;
        return [];
      },
      done: (w) => half(w),
      judge(w) {
        if (at < 0 && half(w)) at = w.tick;
        if (first < 0 || at < 0) return { ok: false, text: "Hai bên chưa giao tranh xong" };
        const t = (at - first) / TICK_RATE;
        return { ok: t >= 7 && t <= 12, text: `Mất nửa quân sau ${t.toFixed(1)} giây giao tranh (mục tiêu 7–9; Lam mất ${lost(w, 0)}, Đỏ mất ${lost(w, 1)})` };
      }
    };
  },
  "falcon-flyover-skyguard": () => {
    const N = 10;
    const [dx, dz] = fromUV(ARENA_U, 55);
    return {
      id: "falcon-flyover-skyguard",
      name: "10 Falcon bay ngang qua 4 SkyGuard",
      intent: "Một sư đội 10 Falcon bay ngang không phận (không tấn công) 4 SkyGuard một lượt: SkyGuard phải hạ được 5–8 chiếc.",
      seconds: 30,
      setup: () => [...group(1, "skyguard", 4, 0, -55), ...group(0, "falcon", N, -55, 55, { v: 55, mode: "move" })],
      // xong khi mọi Falcon còn sống đã bay qua, tới gần đích
      done: (w) => w.units.every((u) => u.side !== 0 || u.kind !== "falcon" || (u.x - dx) * (u.x - dx) + (u.z - dz) * (u.z - dz) < 14 * 14),
      judge(w) {
        const lost = N - alive(w, 0, "falcon");
        return { ok: lost >= 5 && lost <= 8, text: `SkyGuard hạ ${lost}/${N} Falcon (mục tiêu 5–8)` };
      }
    };
  }
};

/** Một lượt chạy kịch bản: gom lệnh từng tick và chấm điểm khi ngã ngũ hoặc hết giờ. */
export class ScenarioRun {
  readonly scenario: Scenario;
  private startTick = -1;
  result: Verdict | null = null;

  constructor(id: string) {
    const make = SCENARIOS[id];
    if (!make) throw new Error(`Không có kịch bản "${id}"`);
    this.scenario = make();
  }

  get finished(): boolean {
    return this.result !== null;
  }

  /** Lệnh cho tick sắp chạy. */
  commands(w: World): Command[] {
    if (this.finished) return [];
    if (this.startTick < 0) {
      this.startTick = w.tick;
      return [{ side: 0, order: { t: "sbClear" } }, ...this.scenario.setup()];
    }
    return this.scenario.step?.(w) ?? [];
  }

  /** Gọi sau mỗi tick. */
  check(w: World): void {
    if (this.finished || this.startTick < 0 || w.tick <= this.startTick + 1) return;
    const timeUp = w.tick - this.startTick >= this.scenario.seconds * TICK_RATE;
    if (this.scenario.done(w) || timeUp) {
      const v = this.scenario.judge(w);
      this.result = timeUp && !this.scenario.done(w) ? { ok: v.ok, text: `${v.text} (hết ${this.scenario.seconds} giây)` } : v;
    }
  }

  elapsed(w: World): number {
    return this.startTick < 0 ? 0 : (w.tick - this.startTick) / TICK_RATE;
  }
}

/** Chạy một kịch bản không giao diện. */
export function runScenario(id: string, w: World): Verdict {
  const run = new ScenarioRun(id);
  while (!run.finished) {
    w.step(run.commands(w));
    run.check(w);
  }
  return run.result!;
}
