/**
 * BÀN ĐO DI CHUYỂN (lõi di chuyển mới 20/11/2026, `Docs/plans/2026-11-20-loi-di-chuyen-moi-thiet-ke.md` mục 7).
 *
 * Các kiểm thử cũ đều qua mà quân vẫn loạn (người dùng 20/11/2026: "lần nào kiểm rồi vẫn lỗi lên xuống"), vì chúng khóa từng
 * luật chứ không đo CẢM GIÁC. Bàn này dựng các cảnh hành quân thật trên Cao Nguyên Ba Bậc và đo đúng thứ mắt thấy:
 *  - GIẬT: số lần thân đổi chiều quay / tốc độ đổi chiều tăng-hãm (mỗi xe mỗi phút đang chạy);
 *  - TRƯỢT NGANG: vận tốc lệch trục thân lớn nhất (m/s);
 *  - CHỒNG THÂN: phần lồng lớn nhất của hai thân (tỉ lệ tổng hai bán kính) và số tick lồng quá 15%;
 *  - KẸT: lâu nhất một xe có lệnh mà không tiến (giây);
 *  - NGAY HÀNG lúc tới: lệch ô lớn nhất (m), lệch hướng mặt lớn nhất (độ), thời gian xong.
 * Mỗi cảnh chạy cho phe Lam và phe Đỏ soi gương qua tâm bản đồ: hai vệt phải trùng nhau (luật công bằng số 4).
 * Xem bằng mắt: `?play=sandbox&map=standard&scenario=<mã cảnh>`; chạy không giao diện: `npm run bench`.
 */
import type { Side, UnitId } from "./content";
import type { Command, Unit } from "./types";
import { TICK_RATE, bodyRadius, type World } from "./world";
import { softOverlap } from "./world/shared";
import type { Scenario, Verdict } from "./scenarios";

export const BENCH_MAP = "standard";

interface Spawn {
  kind: UnitId;
  x: number;
  z: number;
  /** Phe của quân trong cảnh: 0 = phe được đo, 1 = đối phương. */
  foe?: boolean;
}

interface Ctx {
  /** Mã các quân theo thứ tự `spawn`. */
  ids: number[];
  /** Thời gian từ lúc thả quân (giây). */
  t: number;
  w: World;
  /** Đổi tọa độ cảnh (khung phe Lam) sang khung phe đang chạy. */
  P(x: number, z: number): [number, number];
  side: Side;
  foe: Side;
  /** Lệnh cho một nhóm quân (chỉ số trong `spawn`). */
  move(idx: readonly number[], x: number, z: number, t?: "move" | "amove"): Command;
  memo: Record<string, number>;
}

export interface BenchScene {
  id: string;
  name: string;
  intent: string;
  seconds: number;
  spawn: Spawn[];
  /** Lệnh theo thời gian (gọi mỗi tick). */
  script(c: Ctx): Command[];
  /** Cảnh xong sớm (mặc định: mọi quân của phe được đo đã đứng, không trong khối, sau khi đã ra lệnh). */
  done?(c: Ctx): boolean;
  /** Chỉ đo các quân này (chỉ số trong `spawn`); mặc định mọi quân của phe được đo. */
  track?: number[];
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

/** Khối n quân loại k quanh (cx, cz): hàng ngang theo trục x, lệch nhẹ có quy luật (lộn xộn nhưng tất định). */
function blob(kinds: readonly UnitId[], cx: number, cz: number, spread: number): Spawn[] {
  const out: Spawn[] = [];
  const n = kinds.length;
  const cols = Math.ceil(Math.sqrt(n));
  kinds.forEach((k, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // lệch giả ngẫu nhiên cố định
    const jx = (((i * 7919) % 13) / 13 - 0.5) * spread * 0.5;
    const jz = (((i * 104729) % 11) / 11 - 0.5) * spread * 0.5;
    out.push({ kind: k, x: cx + (c - (cols - 1) / 2) * spread + jx, z: cz + (r - (cols - 1) / 2) * spread + jz });
  });
  return out;
}

const MIX20: UnitId[] = ["titan", "titan", "titan", "titan", "titan", "titan", "lynx", "lynx", "lynx", "lynx", "lynx", "lynx", "skyguard", "skyguard", "skyguard", "rocket", "rocket", "rocket", "artillery", "artillery"];
const MIX12: UnitId[] = ["titan", "titan", "titan", "titan", "lynx", "lynx", "lynx", "lynx", "skyguard", "skyguard", "rocket", "artillery"];

export const BENCH: Record<string, () => BenchScene> = {
  "mv-s1-le": () => ({
    id: "mv-s1-le",
    name: "S1 Xe lẻ xuống dốc",
    intent: "Một Titan từ nền căn cứ xuống dốc cửa Đông ra vùng trũng (~75 m): đi mượt, không quệt vách, dừng đúng chỗ.",
    seconds: 60,
    spawn: [{ kind: "titan", x: -150, z: -30 }],
    script: (c) => (c.t === 0.5 ? [c.move([0], -96, 20)] : [])
  }),
  "mv-s2-doi-dau": () => ({
    id: "mv-s2-doi-dau",
    name: "S2 Hai Titan đối đầu qua dốc hẹp",
    intent: "Hai Titan cùng phe đi ngược chiều qua một làn dốc cửa Nam rộng 10 m: cùng giữ phải, tránh nhau, cả hai qua.",
    seconds: 50,
    spawn: [
      { kind: "titan", x: -187, z: 54 },
      { kind: "titan", x: -187, z: 92 }
    ],
    script: (c) => (c.t === 0.5 ? [c.move([0], -187, 92), c.move([1], -187, 54)] : [])
  }),
  "mv-s3-xuyen-doi": () => ({
    id: "mv-s3-xuyen-doi",
    name: "S3 Pháo đi qua đội Titan đang đứng",
    intent: "5 Titan đứng thành hàng quay mặt về Đông; Pháo ở cánh phải được lệnh sang cánh trái: đi vòng / lách, Titan lệch ít và tự về ô.",
    seconds: 70,
    spawn: [...blob(["titan", "titan", "titan", "titan", "titan"], -12, -16, 5), { kind: "artillery", x: 16, z: 2 }],
    script: (c) => {
      if (c.t === 0.5) return [c.move([0, 1, 2, 3, 4], 16, -16)];
      if (c.t === 18) return [c.move([5], 16, -34)];
      return [];
    },
    done: (c) => c.t > 20 && allIdle(c),
    track: [5]
  }),
  "mv-s4-hanh-quan": () => ({
    id: "mv-s4-hanh-quan",
    name: "S4 Sư đoàn 20 xe hành quân xa",
    intent: "20 xe trộn từ nền căn cứ qua cửa Đông, xuống vùng trũng, lên cao nguyên giữa (~220 m): đi thành khối, cùng tốc độ, không kẹt, tới nơi xếp hàng ngay.",
    seconds: 150,
    spawn: blob(MIX20, -160, 30, 6),
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 20), 40, -16)] : [])
  }),
  "mv-s5-cua-hep": () => ({
    id: "mv-s5-cua-hep",
    name: "S5 Khối 12 xe qua làn dốc 10 m",
    intent: "12 xe trộn từ nền căn cứ xuống vùng trũng qua cửa Nam (mỗi làn dốc rộng 10 m): co cột trước làn, qua làn, giãn lại.",
    seconds: 100,
    spawn: blob(MIX12, -185, 30, 6),
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 12), -185, 100)] : [])
  }),
  "mv-s6-vao-hang": () => ({
    id: "mv-s6-vao-hang",
    name: "S6 12 xe lộn xộn vào hàng",
    intent: "12 xe trộn đứng lộn xộn, lệnh tới cách 30 m: đúng vai (giáp trước, pháo sau), cùng tới, xếp xong nhanh.",
    seconds: 45,
    spawn: blob(MIX12, -30, 20, 7),
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 12), 4, 18)] : [])
  }),
  "mv-s7-danh-suon": () => ({
    id: "mv-s7-danh-suon",
    name: "S7 Sư đoàn đứng bị đánh sườn",
    intent: "Sư đoàn 10 xe đóng quân quay mặt về Đông; 4 Lynx địch đánh vào sườn: báo động, quay mặt, cùng bắn, không đuổi quá vùng.",
    seconds: 70,
    spawn: [...blob(["titan", "titan", "titan", "titan", "titan", "titan", "skyguard", "skyguard", "lynx", "lynx"], 10, -16, 5)],
    script: (c) => {
      const out: Command[] = [];
      if (c.t === 0.5) out.push(c.move(range(0, 10), 40, -16));
      const d = c.w.divisions.find((x) => x.side === c.side);
      if (!c.memo.sent && d && d.directive === "station" && c.t > 2) {
        c.memo.sent = c.t;
        for (const k of [-6, -2, 2, 6]) {
          const [x, z] = c.P(40 + k, -46);
          const [gx, gz] = c.P(40, -16);
          out.push({ side: c.foe, order: { t: "sbSpawn", kind: "lynx", side: c.foe, x, z, gx, gz, go: "amove" } });
        }
      }
      return out;
    },
    // xong khi hết địch và sư đoàn đã về ô, quay mặt xong (đo cả phần "đánh xong về chỗ")
    done: (c) => !!c.memo.sent && c.t > c.memo.sent + 3 && c.w.units.every((u) => u.side !== c.foe || u.hp <= 0) && allIdle(c)
  }),
  "mv-s8-bi-ban": () => ({
    id: "mv-s8-bi-ban",
    name: "S8 Tấn công-di chuyển gặp địch giữa đường",
    intent: "Khối 12 xe tấn công-di chuyển 100 m, 3 Titan địch đứng cạnh đường: cả khối dừng đánh, hết địch thì đi tiếp tới nơi.",
    seconds: 120,
    spawn: [...blob(MIX12, 4, -22, 6), { kind: "titan", x: 34, z: -38, foe: true }, { kind: "titan", x: 40, z: -38, foe: true }, { kind: "titan", x: 46, z: -38, foe: true }],
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 12), 66, -22, "amove")] : []),
    track: range(0, 12)
  }),
  "mv-s9-cat-nhau": () => ({
    id: "mv-s9-cat-nhau",
    name: "S9 Hai khối cùng phe cắt nhau",
    intent: "Khối 8 Titan đi Đông và khối 8 Titan đi Nam cắt nhau giữa cao nguyên: không kẹt, chậm thêm ít.",
    seconds: 90,
    spawn: [...blob(["titan", "titan", "titan", "titan", "titan", "titan", "titan", "titan"], 6, -18, 5), ...blob(["titan", "titan", "titan", "titan", "titan", "titan", "titan", "titan"], 36, -8, 5)],
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 8), 66, -18), c.move(range(8, 16), 36, -38)] : [])
  }),
  "mv-s10-doi-lenh": () => ({
    id: "mv-s10-doi-lenh",
    name: "S10 Đổi lệnh liên tục",
    intent: "Khối 10 xe nhận 5 lệnh đổi hướng trong 5 giây rồi lệnh cuối: không quay loạn, không văng hàng.",
    seconds: 60,
    spawn: blob(["titan", "titan", "titan", "titan", "titan", "titan", "lynx", "lynx", "skyguard", "skyguard"], -10, -12, 5),
    script: (c) => {
      const pts: [number, number][] = [
        [30, -12],
        [-10, -30],
        [-30, 10],
        [20, 20],
        [40, -20]
      ];
      for (let k = 0; k < pts.length; k++) if (c.t === 0.5 + k) return [c.move(range(0, 10), pts[k][0], pts[k][1])];
      return [];
    }
  }),
  "mv-s11-len-tang": () => ({
    id: "mv-s11-len-tang",
    name: "S11 Lên hai bậc địa hình",
    intent: "10 xe từ vùng trũng leo dốc lên cao nguyên rồi leo tiếp lên thềm tầng 2: không lấn vách, co / giãn ở chân dốc, tới nơi.",
    seconds: 100,
    spawn: blob(["titan", "titan", "titan", "titan", "lynx", "lynx", "skyguard", "skyguard", "rocket", "rocket"], -99, 12, 5),
    script: (c) => (c.t === 0.5 ? [c.move(range(0, 10), -38, -14)] : [])
  }),
  "mv-s12-dich-khoi": () => ({
    id: "mv-s12-dich-khoi",
    name: "S12 Đội đã vào hàng dịch ngang rồi lùi",
    intent: "9 Titan đã vào hàng quay mặt về Đông: dịch ngang 16 m rồi lùi 14 m. Mỗi lần cả khối giữ nguyên hình, mọi xe tịnh tiến song song cùng lúc, tới nơi quay mặt về hướng vừa đi (quay đầu thì hàng sau thành hàng đầu, không ai đổi chỗ).",
    seconds: 80,
    spawn: blob(["titan", "titan", "titan", "titan", "titan", "titan", "titan", "titan", "titan"], -16, -16, 5),
    script: (c) => {
      if (c.t === 0.5) return [c.move(range(0, 9), 10, -16)];
      if (!c.memo.a && c.t > 2 && allIdle(c)) {
        c.memo.a = c.t;
        return [c.move(range(0, 9), 10, 0)];
      }
      if (c.memo.a && !c.memo.b && c.t > c.memo.a + 1 && allIdle(c)) {
        c.memo.b = c.t;
        return [c.move(range(0, 9), -4, 0)];
      }
      return [];
    },
    done: (c) => !!c.memo.b && c.t > c.memo.b + 1 && allIdle(c)
  })
};

function allIdle(c: Ctx): boolean {
  return c.ids.every((id) => {
    const u = c.w.byId.get(id) as Unit | undefined;
    // xong = đứng ở ô, không còn đường đi, đã quay về hướng chung (lệch dưới ~12°)
    const faced = (u?.faceX === 0 && u?.faceZ === 0) || (u ? u.hx * u.faceX + u.hz * u.faceZ > 0.978 : true);
    return !u || u.hp <= 0 || u.side !== c.side || (u.order === "idle" && !u.group && u.path.length === 0 && u.speed === 0 && faced);
  });
}

// ------------------------------------------------------------------ đo

export interface Metrics {
  /** Thời gian tới lúc xong (giây), Infinity = chưa xong khi hết giờ. */
  time: number;
  /** Phần lồng lớn nhất của hai thân (tỉ lệ tổng hai bán kính), số tick có cặp lồng quá 15%. */
  overlap: number;
  overlapTicks: number;
  /** Số lần đổi chiều quay thân / đổi chiều tăng-hãm tốc, tính trung bình mỗi xe mỗi phút đang chạy. */
  turnJitter: number;
  speedJitter: number;
  /** Vận tốc trượt ngang (lệch trục thân) lớn nhất, m/s. */
  slip: number;
  /** Lâu nhất một xe có lệnh mà không tiến (giây). */
  stuck: number;
  /** Lúc xong: lệch ô lớn nhất (m), lệch hướng mặt lớn nhất (độ). */
  slotErr: number;
  faceErr: number;
  /** Vệt (khung phe Lam) để soi gương. */
  trace: number[];
  /** Cảnh dựng sai chỗ. */
  warnings: string[];
}

/** Góc (độ) giữa hai hướng đơn vị, chỉ để báo cáo: 2·asin(|a − b| / 2) theo chuỗi (không dùng hàm lượng giác trong sim). */
function angleDeg(ax: number, az: number, bx: number, bz: number): number {
  const c = Math.min(1, Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz)) / 2);
  const x = c;
  const asin = x + (x * x * x) / 6 + (3 * x * x * x * x * x) / 40 + (15 * x ** 7) / 336;
  return (2 * asin * 180) / 3.141592653589793;
}

/**
 * GIẬT = DAO ĐỘNG: xu hướng đổi chiều sau một biên độ đủ lớn (tốc độ > 0,25 m/s, góc thân > 3°) mà lần đổi chiều trước mới cách
 * dưới OSC_T giây (trái–phải–trái, tăng–hãm–tăng liên tiếp). Đổi chiều thưa (qua từng khúc cua, dừng rồi đi) không phải giật.
 */
const SPEED_SWING = 0.25;
const TURN_SWING = 0.0524;
const OSC_T = 2 * TICK_RATE;

class Recorder {
  private last = new Map<number, { x: number; z: number; hx: number; hz: number; v: number; still: number; vDir: number; vRef: number; tDir: number; tAcc: number; vT: number; tT: number }>();
  private tick = 0;
  overlap = 0;
  overlapTicks = 0;
  turnFlips = 0;
  accFlips = 0;
  moveTicks = 0;
  slip = 0;
  stuck = 0;
  trace: number[] = [];

  sample(w: World, tracked: readonly Unit[], sg: number): void {
    this.tick++;
    // chồng thân: mọi cặp quân mặt đất
    const g = w.units.filter((u) => u.hp > 0 && u.air === "none");
    let worst = 0;
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i];
        const b = g[j];
        const touch = bodyRadius(a.kind) + bodyRadius(b.kind) - softOverlap(a.kind, b.kind);
        const d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
        if (d < touch) worst = Math.max(worst, (touch - d) / (bodyRadius(a.kind) + bodyRadius(b.kind)));
      }
    this.overlap = Math.max(this.overlap, worst);
    if (worst > 0.15) this.overlapTicks++;
    for (const u of tracked) {
      if (u.hp <= 0) continue;
      this.trace.push(u.x * sg, u.z * sg);
      const p = this.last.get(u.id);
      const cur = { x: u.x, z: u.z, hx: u.hx, hz: u.hz, v: u.speed, still: 0, vDir: 0, vRef: u.speed, tDir: 0, tAcc: 0, vT: -1000, tT: -1000 };
      if (p) {
        const dx = u.x - p.x;
        const dz = u.z - p.z;
        const moving = Math.abs(u.speed) > 0.2 || dx * dx + dz * dz > 0.0004;
        if (moving) this.moveTicks++;
        // tốc độ: xu hướng (tăng / hãm) và mốc cực trị gần nhất; đổi xu hướng sau biên độ > SPEED_SWING thì là một lần giật
        cur.vDir = p.vDir;
        cur.vRef = p.vRef;
        cur.vT = p.vT;
        cur.tT = p.tT;
        const dv = u.speed - p.vRef;
        if (p.vDir >= 0 && dv < -SPEED_SWING) {
          if (p.vDir > 0 && this.tick - p.vT < OSC_T) this.accFlips++;
          if (p.vDir > 0) cur.vT = this.tick;
          cur.vDir = -1;
          cur.vRef = u.speed;
        } else if (p.vDir <= 0 && dv > SPEED_SWING) {
          if (p.vDir < 0 && this.tick - p.vT < OSC_T) this.accFlips++;
          if (p.vDir < 0) cur.vT = this.tick;
          cur.vDir = 1;
          cur.vRef = u.speed;
        } else if ((p.vDir > 0 && u.speed > p.vRef) || (p.vDir < 0 && u.speed < p.vRef)) cur.vRef = u.speed;
        // quay thân: cộng dồn góc theo chiều đang quay; đổi chiều sau khi đã quay > TURN_SWING thì là một lần lắc
        const cr = p.hx * u.hz - p.hz * u.hx;
        cur.tDir = p.tDir;
        cur.tAcc = p.tAcc;
        if (Math.abs(cr) > 0.002) {
          const sd = Math.sign(cr);
          if (sd === p.tDir) cur.tAcc = p.tAcc + Math.abs(cr);
          else {
            if (p.tDir !== 0 && p.tAcc > TURN_SWING) {
              if (this.tick - p.tT < OSC_T) this.turnFlips++;
              cur.tT = this.tick;
            }
            cur.tDir = sd;
            cur.tAcc = Math.abs(cr);
          }
        }
        // trượt ngang: thành phần vận tốc vuông góc thân
        const lat = Math.abs(dx * u.hz - dz * u.hx) * TICK_RATE;
        this.slip = Math.max(this.slip, lat);
        // kẹt: có lệnh / trong khối mà không nhích
        const busy = u.order !== "idle" || u.group !== 0 || u.path.length > 0;
        cur.still = busy && dx * dx + dz * dz < 0.0001 ? p.still + 1 : 0;
        this.stuck = Math.max(this.stuck, cur.still / TICK_RATE);
      }
      this.last.set(u.id, cur);
    }
  }
}

/** Đổi một cảnh bàn đo thành kịch bản Phòng Thử Nghiệm (xem bằng mắt), cho phe Lam. */
export function benchScenario(id: string): Scenario {
  const run = new BenchRun(id, 0);
  let fx = 0;
  let fz = 0;
  const own = run.scene.spawn.filter((s) => !s.foe);
  for (const sp of own) {
    fx += sp.x / own.length;
    fz += sp.z / own.length;
  }
  return {
    id,
    name: run.scene.name,
    intent: run.scene.intent,
    map: BENCH_MAP,
    focus: [fx, fz],
    seconds: run.scene.seconds,
    setup: () => run.setup(),
    step: (w) => run.step(w),
    done: (w) => run.done(w),
    judge: (w): Verdict => {
      const m = run.metrics(w);
      return { ok: m.time < Infinity, text: formatMetrics(m) };
    }
  };
}

export function formatMetrics(m: Metrics): string {
  const f = (v: number, d = 1): string => (v === Infinity ? "—" : v.toFixed(d));
  return `xong ${f(m.time)} s · chồng ${(m.overlap * 100).toFixed(0)}% (${m.overlapTicks} tick >15%) · giật quay ${f(m.turnJitter)} / tốc ${f(m.speedJitter)} lần/xe/phút · trượt ${f(m.slip, 2)} m/s · kẹt ${f(m.stuck)} s · lệch ô ${f(m.slotErr, 2)} m · lệch mặt ${f(m.faceErr, 0)}°`;
}

/** Một lượt chạy cảnh cho phe `side` (phe 1 = ảnh soi gương qua tâm bản đồ). */
export class BenchRun {
  readonly scene: BenchScene;
  private rec = new Recorder();
  private t0 = -1;
  private ids: number[] = [];
  private memo: Record<string, number> = {};
  private finished = -1;
  /** Cảnh dựng sai chỗ (xem `step`). */
  readonly warnings: string[] = [];
  constructor(
    id: string,
    readonly side: Side,
    /** Lượt lệch (0 = đúng cảnh gốc): k > 0 dời mỗi quân thả một chút (≤ 0,5 m, tất định theo k và số thứ tự) để đo trung bình nhiều lượt. */
    readonly jitter = 0
  ) {
    const make = BENCH[id];
    if (!make) throw new Error(`Không có cảnh "${id}"`);
    this.scene = make();
    if (jitter > 0)
      this.scene.spawn = this.scene.spawn.map((s, i) => ({
        ...s,
        x: s.x + ((((i + 1) * 7919 * jitter) % 101) / 101 - 0.5),
        z: s.z + ((((i + 3) * 104729 * jitter) % 97) / 97 - 0.5)
      }));
  }

  private get sg(): number {
    return this.side === 0 ? 1 : -1;
  }

  private ctx(w: World): Ctx {
    const sg = this.sg;
    const side = this.side;
    const foe = (1 - side) as Side;
    const ids = this.ids;
    return {
      ids,
      t: Math.round(((w.tick - this.t0) / TICK_RATE) * 10) / 10,
      w,
      P: (x, z) => [x * sg, z * sg],
      side,
      foe,
      memo: this.memo,
      move: (idx, x, z, t = "move") => ({ side, order: { t, ids: idx.map((i) => ids[i]).filter((v) => v > 0), x: x * sg, z: z * sg } })
    };
  }

  setup(): Command[] {
    const sg = this.sg;
    return [
      { side: 0, order: { t: "sbClear" } },
      ...this.scene.spawn.map((s): Command => {
        const sd = (s.foe ? 1 - this.side : this.side) as Side;
        return { side: sd, order: { t: "sbSpawn", kind: s.kind, side: sd, x: s.x * sg, z: s.z * sg } };
      })
    ];
  }

  /** Lệnh cho tick sắp chạy; lần đầu nhận diện quân vừa thả theo thứ tự thả. */
  step(w: World): Command[] {
    if (this.t0 < 0) {
      this.t0 = w.tick;
      // quân thả theo đúng thứ tự `spawn`: mã tăng dần
      const fresh = w.units.filter((u) => u.cat === "unit").sort((a, b) => a.id - b.id);
      this.ids = this.scene.spawn.map((_s, i) => fresh[i]?.id ?? 0);
      // cảnh dựng sai chỗ (quân bị dời xa chỗ thả, hoặc rơi lên tầng khác): báo để sửa cảnh, đừng đổ lỗi cho lõi
      this.scene.spawn.forEach((sp, i) => {
        const u = fresh[i];
        if (!u) return;
        const x = sp.x * this.sg;
        const z = sp.z * this.sg;
        const moved = Math.sqrt((u.x - x) * (u.x - x) + (u.z - z) * (u.z - z));
        if (moved > 2.5 || w.map.tierAt(u.x, u.z) !== w.map.tierAt(x, z)) this.warnings.push(`quân ${i} (${sp.kind}) thả lệch ${moved.toFixed(1)} m / tầng ${w.map.tierAt(x, z)} → ${w.map.tierAt(u.x, u.z)}`);
      });
    }
    const c = this.ctx(w);
    this.rec.sample(w, this.tracked(w), this.sg);
    return this.scene.script(c);
  }

  private tracked(w: World): Unit[] {
    const idx = this.scene.track ?? this.scene.spawn.map((_, i) => i).filter((i) => !this.scene.spawn[i].foe);
    return idx.map((i) => w.byId.get(this.ids[i]) as Unit).filter((u) => !!u);
  }

  done(w: World): boolean {
    if (this.t0 < 0) return false;
    const c = this.ctx(w);
    if (c.t < 1.5) return false;
    const ok = this.scene.done ? this.scene.done(c) : allIdle(c);
    if (ok && this.finished < 0) this.finished = c.t;
    return ok;
  }

  metrics(w: World): Metrics {
    const r = this.rec;
    const min = Math.max(r.moveTicks / TICK_RATE / 60, 1e-6);
    let slotErr = 0;
    let faceErr = 0;
    for (const u of this.tracked(w)) {
      if (u.hp <= 0) continue;
      slotErr = Math.max(slotErr, Math.sqrt((u.x - u.tx) * (u.x - u.tx) + (u.z - u.tz) * (u.z - u.tz)));
      if (u.faceX !== 0 || u.faceZ !== 0) faceErr = Math.max(faceErr, angleDeg(u.hx, u.hz, u.faceX, u.faceZ));
    }
    return {
      time: this.finished >= 0 ? this.finished : Infinity,
      overlap: r.overlap,
      overlapTicks: r.overlapTicks,
      turnJitter: r.turnFlips / min,
      speedJitter: r.accFlips / min,
      slip: r.slip,
      stuck: r.stuck,
      slotErr,
      faceErr,
      trace: r.trace,
      warnings: this.warnings
    };
  }
}

/** Chạy một cảnh không giao diện cho phe `side`; trả về số đo. */
export function runBench(id: string, side: Side, make: () => World, jitter = 0): Metrics {
  const run = new BenchRun(id, side, jitter);
  const w = make();
  w.step(run.setup());
  for (let i = 0; i < run.scene.seconds * TICK_RATE; i++) {
    const cmds = run.step(w);
    w.step(cmds);
    if (run.done(w)) break;
  }
  return run.metrics(w);
}
