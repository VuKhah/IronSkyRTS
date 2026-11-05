/**
 * GameMap: dựng từ một MapDef lúc vào trận, trả lời mọi câu hỏi của sim và phần vẽ về bản đồ:
 * ô này đi được không, cao bao nhiêu, thuộc loại địa hình gì, có phải cầu / bãi cạn không.
 *
 * Chỉ dùng + − × ÷, trị tuyệt đối, min/max và sqrt (IEEE làm tròn đúng) nên tất định trên mọi máy.
 * Đừng thêm Math.sin/cos/atan2/hypot vào đây.
 */
import { DEFAULT_TERRAIN, type TerrainKind } from "./terrain";
import type { Blob, CrossingDef, MapDef, MineDef, RegionDef, RiverDef, Vec2 } from "./types";

/** Cạnh ô lưới (m): tìm đường, sương mù, độ cao trong sim đều theo lưới này. */
export const CELL = 2;
/** Vách núi quanh rìa: dốc dựng trong dải này (m) tính từ mép vùng chơi vào trong. */
const CLIFF_BAND = 8;
const CLIFF_HEIGHT = 7;
/** Sát mép vùng chơi hơn chừng này (m) thì không đi được. */
export const WALL = 4;
/** Máy bay được bay ra tới cách mép bản đồ chừng này (m), xa hơn thì quay về. */
const AIR_MARGIN = 10;
/** Mặt cầu cao hơn mặt nước (m). */
const DECK = 0.45;

function smooth01(t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

interface Segment {
  ax: number;
  az: number;
  /** Hướng đơn vị và độ dài đoạn. */
  dx: number;
  dz: number;
  len: number;
  /** Độ dài dọc sông tính tới đầu đoạn này. */
  cum: number;
}

interface River {
  def: RiverDef;
  segs: Segment[];
  /** Vị trí dọc sông của từng lối qua. */
  cross: { along: number; def: CrossingDef }[];
}

/** Khoảng cách tới dòng sông và vị trí dọc sông của điểm gần nhất. */
interface RiverHit {
  dist: number;
  along: number;
}

export class GameMap {
  readonly def: MapDef;
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly halfW: number;
  readonly halfH: number;
  /** Số ô lưới theo x (cột) và z (hàng). */
  readonly cols: number;
  readonly rows: number;
  /** Xe / công trình phải nằm trong |x| ≤ edgeX, |z| ≤ edgeZ (khung chữ nhật, chưa tính hình dáng `bounds`). */
  readonly edgeX: number;
  readonly edgeZ: number;
  /** Máy bay bay trong |x| ≤ airX, |z| ≤ airZ. */
  readonly airX: number;
  readonly airZ: number;
  // Các danh sách dưới đây đã ĐỦ cả hai nửa (MapDef.symmetric chỉ khai báo một nửa).
  readonly bases: readonly Vec2[];
  readonly mines: readonly MineDef[];
  readonly hills: readonly Blob[];
  readonly rocks: readonly Blob[];
  readonly regions: readonly RegionDef[];
  private readonly rivers: River[];

  constructor(def: MapDef) {
    this.def = def;
    this.id = def.id;
    this.w = def.size.w;
    this.h = def.size.h;
    this.halfW = this.w / 2;
    this.halfH = this.h / 2;
    this.cols = Math.round(this.w / CELL);
    this.rows = Math.round(this.h / CELL);
    this.edgeX = this.halfW - WALL;
    this.edgeZ = this.halfH - WALL;
    this.airX = this.halfW - AIR_MARGIN;
    this.airZ = this.halfH - AIR_MARGIN;
    const full = def.symmetric ? mirrorDef(def) : def;
    this.bases = full.bases;
    this.mines = full.mines;
    this.hills = full.hills;
    this.rocks = full.rocks;
    this.regions = full.regions ?? [];
    this.rivers = full.rivers.map((r) => {
      const segs: Segment[] = [];
      let cum = 0;
      for (let i = 0; i + 1 < r.path.length; i++) {
        const [ax, az] = r.path[i];
        const [bx, bz] = r.path[i + 1];
        const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
        segs.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, cum });
        cum += len;
      }
      const river: River = { def: r, segs, cross: [] };
      for (const c of r.crossings) river.cross.push({ along: this.riverHit(river, c.x, c.z).along, def: c });
      return river;
    });
  }

  // ------------------------------------------------------------------ hình dáng vùng chơi

  /** Khoảng cách (m) từ điểm vào tới mép vùng chơi: dương ở trong, âm ở ngoài. */
  inset(x: number, z: number): number {
    const b = this.def.bounds;
    if (!b) return Math.min(this.halfW - Math.abs(x), this.halfH - Math.abs(z));
    let inside = false;
    let best = Infinity;
    for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
      const [xi, zi] = b[i];
      const [xj, zj] = b[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi;
      const ez = zj - zi;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 0 ? ((x - xi) * ex + (z - zi) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = xi + ex * t - x;
      const pz = zi + ez * t - z;
      const d2 = px * px + pz * pz;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    return inside ? d : -d;
  }

  /** Hình chữ nhật (x ± hw, z ± hd) có nằm gọn trong vùng chơi, cách vách núi ít nhất `margin` m không. */
  fits(x: number, z: number, hw: number, hd: number, margin = 1): boolean {
    const m = WALL + margin;
    return this.inset(x - hw, z - hd) >= m && this.inset(x + hw, z - hd) >= m && this.inset(x - hw, z + hd) >= m && this.inset(x + hw, z + hd) >= m;
  }

  // ------------------------------------------------------------------ sông

  private riverHit(r: River, x: number, z: number): RiverHit {
    let best = Infinity;
    let along = 0;
    for (const s of r.segs) {
      const px = x - s.ax;
      const pz = z - s.az;
      const t = px * s.dx + pz * s.dz;
      let d: number;
      let a: number;
      if (t <= 0) {
        d = Math.sqrt(px * px + pz * pz);
        a = s.cum;
      } else if (t >= s.len) {
        const qx = x - (s.ax + s.dx * s.len);
        const qz = z - (s.az + s.dz * s.len);
        d = Math.sqrt(qx * qx + qz * qz);
        a = s.cum + s.len;
      } else {
        d = Math.abs(px * s.dz - pz * s.dx);
        a = s.cum + t;
      }
      if (d < best) {
        best = d;
        along = a;
      }
    }
    return { dist: best, along };
  }

  private crossingOf(r: River, along: number): CrossingDef | null {
    for (const c of r.cross) if (Math.abs(along - c.along) < c.def.half) return c.def;
    return null;
  }

  /** Điểm này có nằm trong lòng sông (tính cả bờ dốc nếu `withBank`) không; trả về lối qua nếu có. */
  waterAt(x: number, z: number, withBank = false): { crossing: CrossingDef | null; dist: number } | null {
    for (const r of this.rivers) {
      const hit = this.riverHit(r, x, z);
      if (hit.dist < (withBank ? r.def.bank : r.def.half)) return { crossing: this.crossingOf(r, hit.along), dist: hit.dist };
    }
    return null;
  }

  /** Dòng sông gần nhất: khoảng cách tới dòng chảy, lối qua ở đó (nếu có). null nếu bản đồ không có sông. */
  nearRiver(x: number, z: number): { dist: number; river: RiverDef; crossing: CrossingDef | null } | null {
    let best: { dist: number; river: RiverDef; crossing: CrossingDef | null } | null = null;
    for (const r of this.rivers) {
      const hit = this.riverHit(r, x, z);
      if (!best || hit.dist < best.dist) best = { dist: hit.dist, river: r.def, crossing: this.crossingOf(r, hit.along) };
    }
    return best;
  }

  /** Tất cả lối qua sông (cho phần vẽ cầu). */
  crossings(): { def: CrossingDef; river: RiverDef; dirX: number; dirZ: number }[] {
    const out: { def: CrossingDef; river: RiverDef; dirX: number; dirZ: number }[] = [];
    for (const r of this.rivers)
      for (const c of r.cross) {
        let seg = r.segs[r.segs.length - 1];
        for (const s of r.segs) if (c.along <= s.cum + s.len) {
          seg = s;
          break;
        }
        out.push({ def: c.def, river: r.def, dirX: seg.dx, dirZ: seg.dz });
      }
    return out;
  }

  // ------------------------------------------------------------------ luật đi lại, độ cao

  /** Ô này xe mặt đất có đi được không (chưa tính công trình). */
  staticBlocked(x: number, z: number): boolean {
    if (this.inset(x, z) < WALL) return true;
    for (const r of this.rivers) {
      const hit = this.riverHit(r, x, z);
      if (hit.dist < r.def.half && !this.crossingOf(r, hit.along)) return true;
    }
    for (const b of this.rocks) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return true;
    }
    return false;
  }

  /** Độ cao địa hình (m): đồi, đá, lòng sông, vách núi quanh rìa. */
  terrainHeight(x: number, z: number): number {
    let h = 0;
    for (const b of this.hills) {
      const dx = x - b.x;
      const dz = z - b.z;
      const d2 = dx * dx + dz * dz;
      const r2 = b.r * b.r;
      if (d2 < r2) {
        const k = 1 - d2 / r2;
        h += b.h * k * k;
      }
    }
    for (const b of this.rocks) {
      const dx = x - b.x;
      const dz = z - b.z;
      const d2 = dx * dx + dz * dz;
      const r2 = (b.r + 1.5) * (b.r + 1.5);
      if (d2 < r2) h += b.h * smooth01((1 - d2 / r2) * 1.6);
    }
    for (const r of this.rivers) {
      const hit = this.riverHit(r, x, z);
      const R = r.def;
      if (hit.dist < R.bank) {
        const s = smooth01((R.bank - hit.dist) / (R.bank - R.half + 1.5));
        const c = this.crossingOf(r, hit.along);
        const depth = c && c.kind === "ford" ? R.fordDepth : R.depth;
        h = h * (1 - s) - depth * s;
      }
    }
    const inset = Math.max(-10, this.inset(x, z));
    if (inset < CLIFF_BAND) {
      const k = (CLIFF_BAND - inset) / CLIFF_BAND;
      h += k * k * CLIFF_HEIGHT;
    }
    return h;
  }

  /** Mặt cầu cho xe chạy trên cầu (null nếu không ở trên cầu). */
  deckHeight(x: number, z: number): number | null {
    for (const r of this.rivers) {
      const hit = this.riverHit(r, x, z);
      if (hit.dist >= r.def.bank + 0.5) continue;
      const c = this.crossingOf(r, hit.along);
      if (c && c.kind === "bridge") return DECK;
    }
    return null;
  }

  /** Độ cao mặt đất xe đứng (cầu hoặc địa hình). */
  groundY(x: number, z: number): number {
    const d = this.deckHeight(x, z);
    const h = this.terrainHeight(x, z);
    return d !== null && d > h ? d : h;
  }

  // ------------------------------------------------------------------ loại địa hình (hiệu ứng ở terrain.ts)

  /** Loại địa hình tại điểm: vùng tô của bản đồ, rồi sông, đá, vách núi. */
  terrainAt(x: number, z: number): TerrainKind {
    // Bản đồ đối xứng: luôn tính ở nửa phía Lam rồi soi sang, để điểm nằm đúng trên cạnh vùng tô
    // cũng được xếp loại giống hệt ở hai nửa (công bằng theo cách dựng, không nhờ may mắn).
    if (this.def.symmetric && (z < 0 || (z === 0 && x > 0))) {
      x = -x;
      z = -z;
    }
    if (this.inset(x, z) < WALL) return "cliff";
    for (const b of this.rocks) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return "cliff";
    }
    const water = this.waterAt(x, z);
    if (water) {
      if (!water.crossing) return "deep";
      if (water.crossing.kind === "ford") return "shallow";
    }
    let kind: TerrainKind = DEFAULT_TERRAIN;
    for (const g of this.regions) {
      if (g.circle) {
        const dx = x - g.circle.x;
        const dz = z - g.circle.z;
        if (dx * dx + dz * dz <= g.circle.r * g.circle.r) kind = g.kind;
      } else if (g.poly && pointInPoly(g.poly, x, z)) kind = g.kind;
    }
    return kind;
  }
}

// ------------------------------------------------------------------ bộ vẽ tự đối xứng

const EPS = 1e-9;
const atCenter = (x: number, z: number): boolean => Math.abs(x) < EPS && Math.abs(z) < EPS;
const flip = ([x, z]: Vec2): Vec2 => [-x, -z];
/** Mỗi phần tử kèm bản xoay 180° ngay sau nó (giữ thứ tự khai báo); phần tử nằm đúng tâm không nhân đôi. */
function withTwins<T extends { x: number; z: number }>(list: readonly T[], twin: (e: T) => T): T[] {
  const out: T[] = [];
  for (const e of list) {
    out.push(e);
    if (!atCenter(e.x, e.z)) out.push(twin(e));
  }
  return out;
}

/** Sông tự đối xứng: xoay 180° rồi đảo chiều thì trùng chính nó (ví dụ sông chảy qua tâm theo đường thẳng). */
function selfSymmetric(path: readonly Vec2[]): boolean {
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = path[i];
    const [mx, mz] = path[n - 1 - i];
    if (Math.abs(x + mx) > EPS || Math.abs(z + mz) > EPS) return false;
  }
  return true;
}

/**
 * Dựng đủ bản đồ từ một nửa (MapDef.symmetric): mọi thứ được thêm bản xoay 180° quanh tâm, (x, z) → (-x, -z),
 * mỏ đổi chủ Lam ↔ Đỏ. Sông tự đối xứng (chảy qua tâm) thì chỉ nhân đôi lối qua; sông khác thì nhân đôi cả sông.
 */
function mirrorDef(def: MapDef): MapDef {
  const swap = (o: MineDef["owner"]): MineDef["owner"] => (o === 0 ? 1 : o === 1 ? 0 : -1);
  const blob = (b: Blob): Blob => ({ ...b, x: -b.x, z: -b.z });
  const rivers: RiverDef[] = [];
  for (const r of def.rivers) {
    const crossings = withTwins(r.crossings, (c) => ({ ...c, x: -c.x, z: -c.z }));
    if (selfSymmetric(r.path)) rivers.push({ ...r, crossings });
    else rivers.push(r, { ...r, path: r.path.map(flip), crossings: r.crossings.map((c) => ({ ...c, x: -c.x, z: -c.z })) });
  }
  const regions: RegionDef[] = [];
  for (const g of def.regions ?? []) {
    regions.push(g);
    if (g.circle && !atCenter(g.circle.x, g.circle.z)) regions.push({ ...g, circle: { ...g.circle, x: -g.circle.x, z: -g.circle.z } });
    if (g.poly) regions.push({ ...g, poly: g.poly.map(flip) });
  }
  return {
    ...def,
    bases: def.bases.flatMap((b) => [b, flip(b)]),
    mines: withTwins(def.mines, (m) => ({ ...m, x: -m.x, z: -m.z, owner: swap(m.owner) })),
    hills: withTwins(def.hills, blob),
    rocks: withTwins(def.rocks, blob),
    rivers,
    regions
  };
}

function pointInPoly(p: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

