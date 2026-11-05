/**
 * Một trận đấu đang chơi: nối lõi mô phỏng (tick cố định 10 Hz) với thời gian thật của trình duyệt.
 *
 * Mẫu "fixed timestep": cộng dồn thời gian thật vào `acc`, đủ 0.1 s thì chạy 1 tick.
 * Phần vẽ dùng phần dư (alpha = acc / 0.1) để nội suy vị trí giữa 2 tick, nên hình vẫn mượt 60 khung/giây
 * dù logic chỉ chạy 10 lần/giây. Lệnh của người chơi được gom lại và áp dụng ở tick kế tiếp.
 */
import { Ai } from "../sim/ai";
import type { ScenarioRun } from "../sim/scenarios";
import type { Side } from "../sim/content";
import type { Command, Order, SimEvent } from "../sim/types";
import { DT, World } from "../sim/world";

/** vsai: người chơi đấu AI · aivai: xem hai AI đấu · sandbox: Phòng Thử Nghiệm (không AI, tự thả quân). */
export type Mode = "vsai" | "aivai" | "sandbox";

export class Match {
  readonly world: World;
  readonly ais: Ai[];
  /** Phe người chơi điều khiển; null = chỉ xem (AI đấu AI). Phòng Thử Nghiệm cho đổi phe giữa chừng. */
  player: Side | null;
  speed = 1;
  /** Phòng Thử Nghiệm: kịch bản thiết kế đang chạy (ra lệnh mỗi tick như một AI). */
  director: ScenarioRun | null = null;
  paused = false;
  private acc = 0;
  private pending: Command[] = [];
  private evq: SimEvent[] = [];
  /** Nhật ký lệnh: seed + nhật ký này là đủ để chiếu lại cả trận (replay, sau MVP). */
  readonly log: { tick: number; side: Side; order: Order }[] = [];

  constructor(
    readonly mode: Mode,
    readonly seed: number,
    /** Mã bản đồ (mặc định "Thung Lũng Sông Sắt"). */
    mapId?: string
  ) {
    this.world = new World(seed, { sandbox: mode === "sandbox", map: mapId });
    this.player = mode === "aivai" ? null : 0;
    this.ais = mode === "vsai" ? [new Ai(1, seed)] : mode === "aivai" ? [new Ai(0, seed), new Ai(1, seed)] : [];
  }

  issue(order: Order): void {
    if (this.player !== null && this.world.winner === -1) this.pending.push({ side: this.player, order });
  }

  /** Phòng Thử Nghiệm: ra lệnh thay cho một phe bất kỳ (vẫn đi qua kênh lệnh, nên vẫn tất định). */
  issueAs(side: Side, order: Order): void {
    if (this.mode === "sandbox") this.pending.push({ side, order });
  }

  /** Cho thời gian thật trôi dt giây; trả về alpha để nội suy hình. */
  advance(dt: number): number {
    if (!this.paused && this.world.winner === -1) {
      this.acc += Math.min(dt, 0.25) * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        this.stepOnce();
        this.acc -= DT;
        steps++;
      }
      if (steps === 12) this.acc = 0;
    }
    return Math.min(1, this.acc / DT);
  }

  private stepOnce(): void {
    const cmds: Command[] = [];
    for (const c of this.pending) cmds.push(c);
    this.pending = [];
    for (const ai of this.ais) for (const o of ai.think(this.world)) cmds.push({ side: ai.side, order: o });
    if (this.director) for (const c of this.director.commands(this.world)) cmds.push(c);
    for (const c of cmds) this.log.push({ tick: this.world.tick, side: c.side, order: c.order });
    this.world.step(cmds);
    this.director?.check(this.world);
    for (const e of this.world.events) this.evq.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.evq;
    this.evq = [];
    return e;
  }
}
