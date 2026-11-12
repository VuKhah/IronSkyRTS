/** Bố trí công trình: lưới 2 m, xoay nhà, nền móng, cửa ra, ô cấm xây, kiểm chỗ đặt. */
import { BUILDINGS, defaultRot, doorDir, normRot, rotHalf, rotOffset, PAD_OFFSETS, RULES, UNITS, type BuildingId, type Side } from "../content";
import { dist2 } from "../fmath";
import { CELL } from "../maps";
import { WALL } from "../maps/game-map";
import type { Building } from "../types";
import { EXIT_W, EXIT_D, EXIT_ESCAPE, EXIT_ROOM, N4, cellsFor, snapAxis } from "./shared";
import { World } from "./core";


function padPos(this: World, b: Building, i: number): [number, number] {
  const [ox, oz] = rotOffset(PAD_OFFSETS[i][0], PAD_OFFSETS[i][1], b.rot);
  return [b.x + ox, b.z + oz];
}

/** Tọa độ thật của công trình nếu đặt ở (x, z): tâm khối ô lưới mà nó chiếm. */
function snapBuilding(this: World, kind: BuildingId, x: number, z: number, rot = 0): [number, number] {
  const [hw, hd] = rotHalf(kind, rot);
  return [snapAxis(x, cellsFor(hw), this.map.halfW, z), snapAxis(z, cellsFor(hd), this.map.halfH, x)];
}

/** Số ô lưới công trình chiếm theo x và z. */
function blockCells(this: World, kind: BuildingId, rot = 0): [number, number] {
  const [hw, hd] = rotHalf(kind, rot);
  return [cellsFor(hw), cellsFor(hd)];
}

/** Nửa kích thước khối ô lưới công trình chiếm (lớn hơn hoặc bằng `half`). */
function blockHalf(this: World, kind: BuildingId, rot = 0): [number, number] {
  const [hw, hd] = rotHalf(kind, rot);
  return [(cellsFor(hw) * CELL) / 2, (cellsFor(hd) * CELL) / 2];
}

/**
 * Ô cửa ra của công trình có xe mặt đất chạy ra (Tổng Hành Dinh, Xưởng Xe Tăng, Xưởng Xe Chuyên Dụng): hình chữ nhật
 * `EXIT_W` × `EXIT_D` m ngay trước cửa (phía `doorDir(rot)`). Trả về [tâm x, tâm z, nửa rộng, nửa sâu], hoặc null nếu nhà
 * không có xe chạy ra. Người dùng 10/11/2026: nhà được đặt sát nhau, miễn là xe vẫn ra được.
 */
function exitRect(this: World, kind: BuildingId, x: number, z: number, rot: number): [number, number, number, number] | null {
  const bay = BUILDINGS[kind].bay;
  if (bay) return this.localRect(bay, x, z, rot);
  if (!BUILDINGS[kind].produces?.some((u) => UNITS[u].domain === "ground")) return null;
  const [bw, bd] = this.blockHalf(kind, rot);
  const [dx, dz] = doorDir(rot);
  return dz !== 0 ? [x, z + dz * (bd + EXIT_D / 2), EXIT_W / 2, EXIT_D / 2] : [x + dx * (bw + EXIT_D / 2), z, EXIT_D / 2, EXIT_W / 2];
}

/** Số ô cấm xây giữa hai nền móng: 0 nếu một bên là công trình lát theo ô (tường), không thì `RULES.buildPadCells`. */
function padBetween(this: World, a: BuildingId, b: BuildingId): number {
  return BUILDINGS[a].tile || BUILDINGS[b].tile ? 0 : RULES.buildPadCells;
}

/** Viền trong mô hình của công trình (m): đất trống xe đi được quanh thân nhà, tính vào nền móng khi bố trí. */
function marginOf(this: World, kind: BuildingId): number {
  return (BUILDINGS[kind].clearCells ?? RULES.buildMarginCells) * CELL;
}

/** Số ô của cả nền móng (thân + viền hai bên) theo x và z, để hiện bóng công trình khi đặt. */
function footCells(this: World, kind: BuildingId, rot = 0): [number, number] {
  const [nx, nz] = this.blockCells(kind, rot);
  const m = 2 * Math.round(this.marginOf(kind) / CELL);
  return [nx + m, nz + m];
}

/** Hình chữ nhật [x0, z0, x1, z1] trong khung mô hình đổi ra khung thế giới: [tâm x, tâm z, nửa rộng, nửa sâu]. */
function localRect(this: World, r: readonly [number, number, number, number], x: number, z: number, rot: number): [number, number, number, number] {
  const [ax, az] = rotOffset(r[0], r[1], rot);
  const [bx, bz] = rotOffset(r[2], r[3], rot);
  return [x + (ax + bx) / 2, z + (az + bz) / 2, Math.abs(bx - ax) / 2, Math.abs(bz - az) / 2];
}

/** Các ô lưới của lối ra trong nền móng (không bị nhà chặn). */
function bayCells(this: World, kind: BuildingId, x: number, z: number, rot: number): Set<number> {
  const bay = BUILDINGS[kind].bay;
  if (!bay) return new Set();
  const e = this.localRect(bay, x, z, rot);
  return new Set(this.grid.cellsInRect(e[0], e[1], e[2], e[3]));
}

/** Tâm cửa / bệ ráp thứ k của nhà có `bay` (giữa ô ráp xe, hoặc tâm bệ `pads`), theo khung thế giới. */
function doorPos(this: World, b: Building, k: number): [number, number] {
  const spec = BUILDINGS[b.kind];
  if (spec.pads) {
    const r = spec.pads[k % spec.pads.length];
    const [px, pz] = rotOffset((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, b.rot);
    return [b.x + px, b.z + pz];
  }
  const bay = spec.bay!;
  const n = spec.doors ?? 1;
  const lx = bay[0] + ((k % n) + 0.5) * ((bay[2] - bay[0]) / n);
  const lz = bay[1] + (spec.stall ?? bay[3] - bay[1]) / 2; // giữa ô ráp xe
  const [ox, oz] = rotOffset(lx, lz, b.rot);
  return [b.x + ox, b.z + oz];
}

/**
 * Từ ô cửa ra có ra được bãi trống không, coi như các ô `extra` cũng bị chắn (nền móng của nhà đang định đặt).
 * Loang theo 4 hướng trong cửa sổ ± `EXIT_ESCAPE` ô: chạm mép cửa sổ, hoặc vùng loang được từ `EXIT_ROOM` ô trở lên,
 * thì coi là thông. Kết quả chỉ là đúng / sai nên không phụ thuộc thứ tự loang (tất định, đối xứng giữa hai phe).
 */
function exitOpen(this: World, e: readonly [number, number, number, number], extra: ReadonlySet<number>): boolean {
  const g = this.grid;
  const ox = g.cellX(e[0]);
  const oz = g.cellZ(e[1]);
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const i of g.cellsInRect(e[0], e[1], e[2], e[3]))
    if (!g.blockedIdx(i) && !extra.has(i)) {
      seen.add(i);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const cx = i % g.cols;
    const cz = (i - cx) / g.cols;
    if (Math.max(Math.abs(cx - ox), Math.abs(cz - oz)) >= EXIT_ESCAPE || seen.size >= EXIT_ROOM) return true;
    for (const [dx, dz] of N4) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= g.cols || nz >= g.rows) continue;
      const j = nz * g.cols + nx;
      if (seen.has(j) || g.blockedIdx(j) || extra.has(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return false;
}

/**
 * Luật bố trí khi đặt nhà ở (x, z) (đã nằm trên lưới, nền móng đã trống): không đè lên cửa ra của nhà nào, cửa ra của
 * chính nó phải trống, và mọi cửa ra gần đó (kể cả của nó) vẫn thông ra bãi trống. Thay cho luật cũ "chừa lối 2 ô".
 */
function layoutError(this: World, kind: BuildingId, x: number, z: number, rot: number): string | null {
  const [hw, hd] = this.blockHalf(kind, rot);
  const exits: { name: string; e: [number, number, number, number] }[] = [];
  const myMargin = this.marginOf(kind);
  for (const b of this.buildings) {
    if (b.hp <= 0) continue;
    // hai thân nhà cách nhau ít nhất: viền nhà này + ô cấm xây (dùng chung) + viền nhà kia; công trình lát theo ô (tường)
    // không cần ô cấm xây
    const gap = myMargin + this.padBetween(kind, b.kind) * CELL + this.marginOf(b.kind);
    const [ow, od] = this.blockHalf(b.kind, b.rot);
    if (Math.abs(b.x - x) < hw + ow + gap - 1e-6 && Math.abs(b.z - z) < hd + od + gap - 1e-6) return `Phải cách ${BUILDINGS[b.kind].name} ít nhất ${Math.round(gap / CELL)} ô`;
    const e = this.exitRect(b.kind, b.x, b.z, b.rot);
    if (!e) continue;
    if (Math.abs(e[0] - x) < e[2] + hw - 1e-6 && Math.abs(e[1] - z) < e[3] + hd - 1e-6) return `Không được chắn cửa ra của ${BUILDINGS[b.kind].name}`;
    if (Math.abs(e[0] - x) <= hw + EXIT_ESCAPE * CELL && Math.abs(e[1] - z) <= hd + EXIT_ESCAPE * CELL) exits.push({ name: BUILDINGS[b.kind].name, e });
  }
  // nền móng nhà định đặt (trừ lối ra trong nền móng của chính nó: các ô đó xe vẫn đi được)
  const ownBay = this.bayCells(kind, x, z, rot);
  const foot = new Set(this.grid.cellsInRect(x, z, hw, hd).filter((i) => !ownBay.has(i)));
  const own = this.exitRect(kind, x, z, rot);
  if (own) {
    if (!this.map.fits(own[0], own[1], own[2], own[3])) return "Cửa ra nằm ngoài bản đồ";
    for (const i of this.grid.cellsInRect(own[0], own[1], own[2], own[3])) if (this.grid.blockedIdx(i)) return "Cửa ra bị chắn, xe không ra được";
    if (!this.exitOpen(own, foot)) return "Cửa ra bị vây kín, xe không ra được";
  }
  for (const { name, e } of exits) if (!this.exitOpen(e, foot)) return `Sẽ vây kín cửa ra của ${name}`;
  return null;
}

/**
 * Ô lưới có tâm (x, z) có bị cấm xây với mọi công trình không (chỉ để hiện lưới đỏ khi Tư lệnh đang chọn chỗ đặt; người
 * dùng 10/11/2026). Cùng luật với `canPlace`: ngoài vùng xây, vướng sông / đá / nhà / mỏ, sát mỏ, là ô cửa ra, hoặc nằm
 * trong đệm `clearCells` của nhà khác. Không thay đổi trạng thái.
 */
function cellForbidden(this: World, side: Side, x: number, z: number, kind?: BuildingId): boolean {
  if (this.grid.blockedAt(x, z) || this.map.rampApron(x, z)) return true;
  // trong bãi tài nguyên (tới đuôi xe đỗ) không xây
  for (const m of this.mines) if (dist2(m.x, m.z, x, z) < m.radius * m.radius) return true;
  let inZone = false;
  for (const b of this.buildings) {
    if (b.hp <= 0) continue;
    const e = this.exitRect(b.kind, b.x, b.z, b.rot);
    if (e && Math.abs(x - e[0]) < e[2] && Math.abs(z - e[1]) < e[3]) return true;
    // nền móng nhà kia (thân + viền) và ô cấm xây quanh nó: nền móng nhà mới (cả viền) không được đè lên
    const pad = this.marginOf(b.kind) + (kind ? this.padBetween(kind, b.kind) : RULES.buildPadCells) * CELL;
    const [ow, od] = this.blockHalf(b.kind, b.rot);
    if (Math.abs(x - b.x) < ow + pad && Math.abs(z - b.z) < od + pad) return true;
    const zone = BUILDINGS[b.kind].zone;
    if (!inZone && zone && b.side === side && b.built && dist2(b.x, b.z, x, z) <= zone * zone) inZone = true;
  }
  return !inZone;
}

/**
 * Nền móng có nằm trong vùng chơi không. Tường lát đúng một ô lưới: ô nào xe đi được (tâm ô cách mép ≥ WALL, như
 * `staticBlocked`) thì đặt được, để tường khép kín được vào mép bản đồ (trước đây còn hở một dải 2 m sát mép cho xe
 * lách qua). Nhà to thì cả nền móng phải cách mép thêm 1 m.
 */
function insideMap(this: World, kind: BuildingId, x: number, z: number, hw: number, hd: number): boolean {
  return BUILDINGS[kind].tile ? this.map.inset(x, z) >= WALL : this.map.fits(x, z, hw, hd);
}

/**
 * Nền móng (x ± hw, z ± hd) phải nằm trọn trên MỘT mặt phẳng: mọi ô cùng độ cao, không ô nào là dốc (người dùng chốt
 * 11/11/2026: công trình chỉ xây trên nền phẳng; ô mép vách đã bị chặn nên nhà không vắt qua vách được), và không ô nào
 * trong vùng cấm xây quanh khối dốc (để không nhà nào bịt được lối lên xuống tầng). null = được.
 */
function flatError(this: World, x: number, z: number, hw: number, hd: number): string | null {
  const m = this.map;
  let h: number | null = null;
  for (const i of this.grid.cellsInRect(x, z, hw, hd)) {
    const cx = this.grid.centerX(i % this.grid.cols);
    const cz = this.grid.centerZ(Math.floor(i / this.grid.cols));
    if (m.rampApron(cx, cz)) return "Không được xây trên dốc hay chắn chân, đỉnh dốc";
    const y = m.cellY[i];
    if (h === null) h = y;
    else if (y !== h) return "Chỉ xây được trên nền phẳng (không vắt qua hai tầng)";
  }
  return null;
}

/** null = được phép xây; ngược lại là lý do (tiếng Việt) để hiện cho người chơi. */
function canPlace(this: World, side: Side, kind: BuildingId, x: number, z: number, rotIn?: number): string | null {
  const rot = normRot(rotIn) ?? defaultRot(kind, z);
  [x, z] = this.snapBuilding(kind, x, z, rot);
  const [hw, hd] = this.blockHalf(kind, rot);
  if (!this.insideMap(kind, x, z, hw, hd)) return "Ngoài bản đồ";
  for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá, vách hoặc công trình";
  const flat = this.flatError(x, z, hw, hd);
  if (flat) return flat;
  const lay = this.layoutError(kind, x, z, rot);
  if (lay) return lay;
  const big = Math.max(hw, hd);
  for (const m of this.mines) if (dist2(m.x, m.z, x, z) < (m.radius + big) * (m.radius + big)) return "Quá gần mỏ";
  for (const u of this.units) {
    if (u.air !== "none" && u.air !== "parked") continue;
    const r = UNITS[u.kind].radius;
    if (Math.abs(u.x - x) < hw + r && Math.abs(u.z - z) < hd + r) return "Có xe đang đứng ở đó";
  }
  for (const b of this.buildings) {
    if (b.side !== side || !b.built || b.hp <= 0) continue;
    const zone = BUILDINGS[b.kind].zone;
    if (!zone) continue;
    const reach = zone + big;
    if (dist2(b.x, b.z, x, z) <= reach * reach) return null;
  }
  return "Phải xây trong vùng của Tổng Hành Dinh, Nhà Máy Điện hoặc Cột Điện";
}

const methods = { padPos, snapBuilding, blockCells, blockHalf, exitRect, padBetween, marginOf, footCells, localRect, bayCells, doorPos, exitOpen, layoutError, cellForbidden, insideMap, flatError, canPlace };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
