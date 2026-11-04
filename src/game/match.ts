/**
 * Một trận đấu đang chơi: nối lõi mô phỏng (tick cố định 10 Hz) với thời gian thật của trình duyệt.
 *
 * Mẫu "fixed timestep": cộng dồn thời gian thật vào `acc`, đủ 0.1 s thì chạy 1 tick.
 * Phần vẽ dùng phần dư (alpha = acc / 0.1) để nội suy vị trí giữa 2 tick, nên hình vẫn mượt 60 khung/giây
 * dù logic chỉ chạy 10 lần/giây. Lệnh của người chơi được gom lại và áp dụng ở tick kế tiếp.
 */
import { Ai } from "../sim/ai";
import type { Side } from "../sim/content";
import type { Command, Order, SimEvent } from "../sim/types";
import { DT, World } from "../sim/world";

export type Mode = "vsai" | "aivai";

export class Match {
  readonly world: World;
  readonly ais: Ai[];
  /** Phe người chơi điều khiển; null = chỉ xem (AI đấu AI). */
  readonly player: Side | null;
  speed = 1;
  paused = false;
  private acc = 0;
  private pending: Order[] = [];
  private evq: SimEvent[] = [];
  /** Nhật ký lệnh: seed + nhật ký này là đủ để chiếu lại cả trận (replay, sau MVP). */
  readonly log: { tick: number; side: Side; order: Order }[] = [];

  constructor(
    readonly mode: Mode,
    readonly seed: number
  ) {
    this.world = new World(seed);
    this.player = mode === "vsai" ? 0 : null;
    this.ais = mode === "vsai" ? [new Ai(1, seed)] : [new Ai(0, seed), new Ai(1, seed)];
  }

  issue(order: Order): void {
    if (this.player !== null && this.world.winner === -1) this.pending.push(order);
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
    if (this.player !== null) {
      for (const o of this.pending) cmds.push({ side: this.player, order: o });
      this.pending = [];
    }
    for (const ai of this.ais) for (const o of ai.think(this.world)) cmds.push({ side: ai.side, order: o });
    for (const c of cmds) this.log.push({ tick: this.world.tick, side: c.side, order: c.order });
    this.world.step(cmds);
    for (const e of this.world.events) this.evq.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.evq;
    this.evq = [];
    return e;
  }
}
