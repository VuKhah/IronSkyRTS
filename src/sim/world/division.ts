/**
 * SƯ ĐOÀN BỀN VỮNG (A2 bước D1, thiết kế `Docs/plans/2026-11-17-A2-tuong-su-doan-thiet-ke.md`, người dùng duyệt 17/11/2026).
 *
 * `Squad` chỉ sống trong lúc hành quân và tan khi tới nơi; sau đó không còn ai "chỉ huy" các xe nữa (gốc của lỗi 8: bị đánh
 * sườn thì chỉ xe bị bắn bắn trả). Sư đoàn là lớp bền hơn đặt trên đó: nhớ quân, chế độ (tự chủ / trực tiếp), chỉ thị, và
 * chỗ đóng quân khi tới nơi. Bước D1 chỉ dựng vòng đời; chưa luật nào đọc sư đoàn nên đường đi của xe giữ nguyên.
 *
 * Luật vòng đời:
 *  - lệnh đi / tấn công-di chuyển cho từ `DIV_MIN` xe mặt đất chiến đấu trở lên (không tính Xe Vận Tải) lập một sư đoàn;
 *    Drone Khiên đi cùng lệnh thì vào theo (nó bay theo quân mặt đất), drone khác và máy bay thì không;
 *  - lệnh mới cho cả sư đoàn (hoặc sư đoàn cộng thêm xe) giữ nguyên sư đoàn đó: cùng mã, cùng chế độ;
 *  - lệnh riêng cho một phần sư đoàn: phần đó rời sư đoàn;
 *  - sư đoàn còn một xe mặt đất thì tan (ngưỡng 3 chỉ áp khi lập: đang đánh mất xe còn 2 thì vẫn giữ tướng);
 *  - mọi xe mặt đất đã đứng (hết đội hình hành quân) thì sư đoàn đóng quân: ghi tâm, hướng mặt, ô từng xe.
 */
import { UNITS, type Side } from "../content";
import type { Division, Unit } from "../types";
import { World } from "./core";

/** Số xe mặt đất tối thiểu để lập sư đoàn (người dùng chốt 17/11/2026). */
export const DIV_MIN = 3;

/** Xe được tính là quân mặt đất của sư đoàn. */
function isDivGround(u: Unit): boolean {
  return u.air === "none" && u.kind !== "hauler";
}

/** Drone Khiên: đi theo sư đoàn mặt đất nên thuộc sư đoàn, nhưng không tính vào ngưỡng và không có ô mặt đất. */
function isDivEscort(u: Unit): boolean {
  return u.air !== "none" && !!UNITS[u.kind].shield;
}

function divisionById(this: World, id: number): Division | undefined {
  if (!id) return undefined;
  for (const d of this.divisions) if (d.id === id) return d;
  return undefined;
}

function divGroundCount(this: World, d: Division): number {
  let n = 0;
  for (const id of d.ids) {
    const u = this.byId.get(id);
    if (u && u.cat === "unit" && isDivGround(u)) n++;
  }
  return n;
}

/** Tan sư đoàn: mọi xe thành xe lẻ. Dọn khỏi danh sách ở `updateDivisions`. */
function dissolveDivision(this: World, d: Division): void {
  for (const id of d.ids) {
    const u = this.byId.get(id);
    if (u && u.cat === "unit" && u.division === d.id) u.division = 0;
  }
  d.ids = [];
}

function leaveDivision(this: World, u: Unit): void {
  const d = this.divisionById(u.division);
  u.division = 0;
  if (!d) return;
  const i = d.ids.indexOf(u.id);
  if (i >= 0) d.ids.splice(i, 1);
  delete d.homeX[u.id];
  delete d.homeZ[u.id];
  if (this.divGroundCount(d) <= 1) this.dissolveDivision(d);
}

/**
 * Lệnh đi / tấn công-di chuyển: lập (hoặc giữ) sư đoàn cho nhóm xe được lệnh. Gọi từ `orderMove`.
 * Xe trong lệnh mà không vào sư đoàn mới (nhóm dưới 3 xe, Xe Vận Tải, máy bay) thì rời sư đoàn cũ.
 */
function formDivision(this: World, side: Side, units: readonly Unit[], kind: "move" | "amove"): void {
  const ground = units.filter(isDivGround);
  const members = ground.length >= DIV_MIN ? units.filter((u) => isDivGround(u) || isDivEscort(u)) : [];
  const inNew = new Set(members.map((u) => u.id));
  for (const u of units) if (u.division && !inNew.has(u.id)) this.leaveDivision(u);
  if (!members.length) return;
  // giữ sư đoàn cũ lớn nhất mà mọi xe của nó đều có trong lệnh (cùng cỡ thì sư đoàn lập trước: thứ tự mảng, tất định)
  let keep: Division | null = null;
  for (const d of this.divisions)
    if (d.side === side && d.ids.length && d.ids.every((id) => inNew.has(id)) && (!keep || d.ids.length > keep.ids.length)) keep = d;
  // sư đoàn mới ghép từ nhiều nguồn: theo chế độ của phần đông xe mặt đất (hòa thì tự chủ)
  let direct = 0;
  for (const u of ground) if (this.divisionById(u.division)?.mode === "direct") direct++;
  const mode = keep ? keep.mode : direct * 2 > ground.length ? "direct" : "auto";
  for (const u of members) if (u.division && u.division !== keep?.id) this.leaveDivision(u);
  let d = keep;
  if (!d) {
    d = { id: this.nextDivId++, side, ids: [], mode, directive: kind, cx: 0, cz: 0, hx: 0, hz: 1, homeX: {}, homeZ: {} };
    this.divisions.push(d);
  }
  d.ids = members.map((u) => u.id);
  d.mode = mode;
  d.directive = kind;
  d.homeX = {};
  d.homeZ = {};
  for (const u of members) u.division = d.id;
}

/**
 * Lệnh khác có danh sách xe (tấn công, dừng, khai thác, trục vớt, về căn cứ): lệnh cho cả sư đoàn thì sư đoàn còn nguyên;
 * lệnh cho một phần thì phần đó rời sư đoàn (Tư lệnh tách xe ra dùng riêng).
 */
function divisionOrder(this: World, side: Side, ids: readonly number[]): void {
  const units = this.ownUnits(side, ids);
  const inOrder = new Set(units.map((u) => u.id));
  for (const u of units) {
    const d = this.divisionById(u.division);
    if (d && !d.ids.every((id) => inOrder.has(id))) this.leaveDivision(u);
  }
}

/** Ghi chỗ đóng quân: tâm, hướng mặt chung, ô của từng xe là chỗ nó đang đứng. */
function stationDivision(this: World, d: Division): void {
  let n = 0;
  let cx = 0;
  let cz = 0;
  let fx = 0;
  let fz = 0;
  let bx = 0;
  let bz = 0;
  d.homeX = {};
  d.homeZ = {};
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    d.homeX[id] = u.x;
    d.homeZ[id] = u.z;
    if (!isDivGround(u)) continue;
    n++;
    cx += u.x;
    cz += u.z;
    fx += u.faceX;
    fz += u.faceZ;
    bx += u.hx;
    bz += u.hz;
  }
  d.cx = cx / n;
  d.cz = cz / n;
  // hướng đội: hướng mặt `disbandSquad` đặt cho từng xe; không có thì hướng thân trung bình
  let l = Math.sqrt(fx * fx + fz * fz);
  if (l < 1e-6) {
    fx = bx;
    fz = bz;
    l = Math.sqrt(fx * fx + fz * fz);
  }
  if (l < 1e-6) {
    fx = 0;
    fz = 1;
    l = 1;
  }
  d.hx = fx / l;
  d.hz = fz / l;
  d.directive = "station";
}

/** Mỗi tick, sau `updateSquads`: dọn xe đã mất, tan sư đoàn còn một xe, đóng quân khi mọi xe mặt đất đã đứng. */
function updateDivisions(this: World): void {
  if (!this.divisions.length) return;
  for (const d of this.divisions) {
    if (!d.ids.length) continue;
    d.ids = d.ids.filter((id) => {
      const u = this.byId.get(id);
      return !!u && u.cat === "unit" && u.hp > 0 && u.division === d.id;
    });
    if (this.divGroundCount(d) <= 1) {
      this.dissolveDivision(d);
      continue;
    }
    if (d.directive === "station") continue;
    let settled = true;
    for (const id of d.ids) {
      const u = this.byId.get(id) as Unit;
      if (isDivGround(u) && (u.order !== "idle" || u.squad !== 0)) {
        settled = false;
        break;
      }
    }
    if (settled) this.stationDivision(d);
  }
  this.divisions = this.divisions.filter((d) => d.ids.length > 0);
}

const methods = { divisionById, divGroundCount, dissolveDivision, leaveDivision, formDivision, divisionOrder, stationDivision, updateDivisions };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
