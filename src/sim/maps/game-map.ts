/**
 * GameMap: dựng từ một MapDef lúc vào trận, trả lời mọi câu hỏi của sim và phần vẽ về bản đồ:
 * ô này đi được không, cao bao nhiêu, thuộc loại địa hình gì, có phải cầu / bãi cạn không.
 *
 * Chỉ dùng + − × ÷, trị tuyệt đối, min/max và sqrt (IEEE làm tròn đúng) nên tất định trên mọi máy.
 * Đừng thêm Math.sin/cos/atan2/hypot vào đây.
 */
import { DEFAULT_TERRAIN, type TerrainKind } from "./terrain";
import type { Blob, CrossingDef, MapDef, MineDef, PlateauDef, RegionDef, RiverDef, Vec2 } from "./types";

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

/**
 * Lưới khoang để trả lời nhanh trên bản đồ lớn (960 m = 230.400 ô, mỗi ô từng phải dò hơn 500 cạnh cao nguyên và 170 đoạn
 * sông). Khoảng cách có dấu tới một đa giác đổi không quá 1 m khi đi 1 m, nên đo ở tâm khoang là biết chắc cả khoang nằm
 * hẳn trong hay hẳn ngoài vùng ảnh hưởng. Chỉ bỏ qua những phép tính biết trước kết quả: đáp số giống hệt cách tính đầy đủ.
 */
const BUCKET = 16;
/** Nửa đường chéo khoang, làm tròn lên. */
const BUCKET_R = BUCKET * 0.7072;
/** Dư thêm cho sai số làm tròn số thực. */
const ACCEL_EPS = 1e-6;
/** Tầm ảnh hưởng xa nhất của dòng sông mà các câu hỏi nhanh quan tâm, tính từ bờ dốc (m). */
const RIVER_REACH = 0.5;

interface Accel {
  cols: number;
  rows: number;
  /** Theo từng cao nguyên, từng khoang: 0 = hẳn ngoài, 1 = hẳn trong, 2 = phải tính. */
  plateau: Uint8Array[];
  /** Theo từng sông, từng khoang: các đoạn sông đủ gần để có thể ảnh hưởng. */
  river: Segment[][][];
}

/** Hộp bao của vùng tô đa giác: x0, z0, x1, z1. */
type Box = readonly [number, number, number, number];

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
  /** Vị trí các Đài Liên Lạc (điểm chiếm). */
  readonly points: readonly Vec2[];
  readonly hills: readonly Blob[];
  readonly plateaus: readonly PlateauDef[];
  readonly rocks: readonly Blob[];
  readonly regions: readonly RegionDef[];
  private readonly rivers: River[];
  private readonly accel: Accel | null;
  private readonly regionBox: (Box | null)[];

  /** `opts.accel = false`: tắt lưới khoang, chỉ dùng trong kiểm thử để so với cách tính đầy đủ. */
  constructor(def: MapDef, opts: { accel?: boolean } = {}) {
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
    this.points = full.points ?? [];
    this.hills = full.hills;
    this.plateaus = full.plateaus ?? [];
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
    this.regionBox = this.regions.map((g) => (g.poly ? polyBox(g.poly) : null));
    this.accel = opts.accel === false ? null : this.buildAccel();
  }

  private buildAccel(): Accel {
    const cols = Math.ceil(this.w / BUCKET);
    const rows = Math.ceil(this.h / BUCKET);
    const n = cols * rows;
    const plateau = this.plateaus.map((p) => {
      const state = new Uint8Array(n);
      const reach = p.edge / 2 + BUCKET_R + ACCEL_EPS;
      this.eachBucket(cols, rows, (i, x, z) => {
        const d = polyInset(p.poly, x, z);
        state[i] = d >= reach ? 1 : d <= -reach ? 0 : 2;
      });
      return state;
    });
    const river = this.rivers.map((r) => {
      const lists: Segment[][] = new Array<Segment[]>(n);
      const limit = Math.max(r.def.bank, r.def.half) + RIVER_REACH + BUCKET_R + ACCEL_EPS;
      this.eachBucket(cols, rows, (i, x, z) => {
        lists[i] = r.segs.filter((s) => segDist(s, x, z) <= limit);
      });
      return lists;
    });
    return { cols, rows, plateau, river };
  }

  private eachBucket(cols: number, rows: number, fn: (i: number, x: number, z: number) => void): void {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn(r * cols + c, -this.halfW + (c + 0.5) * BUCKET, -this.halfH + (r + 0.5) * BUCKET);
  }

  /** Số khoang chứa điểm, -1 nếu điểm nằm ngoài bản đồ (phần vẽ có hỏi vùng ngoài rìa). */
  private bucketOf(x: number, z: number): number {
    const a = this.accel;
    if (!a || x < -this.halfW || z < -this.halfH || x >= this.halfW || z >= this.halfH) return -1;
    const c = Math.floor((x + this.halfW) / BUCKET);
    const r = Math.floor((z + this.halfH) / BUCKET);
    return c < a.cols && r < a.rows ? r * a.cols + c : -1;
  }

  // ------------------------------------------------------------------ hình dáng vùng chơi

  /** Khoảng cách (m) từ điểm vào tới mép vùng chơi: dương ở trong, âm ở ngoài. */
  inset(x: number, z: number): number {
    const b = this.def.bounds;
    if (!b) return Math.min(this.halfW - Math.abs(x), this.halfH - Math.abs(z));
    return polyInset(b, x, z);
  }

  /** Hình chữ nhật (x ± hw, z ± hd) có nằm gọn trong vùng chơi, cách vách núi ít nhất `margin` m không. */
  fits(x: number, z: number, hw: number, hd: number, margin = 1): boolean {
    const m = WALL + margin;
    return this.inset(x - hw, z - hd) >= m && this.inset(x + hw, z - hd) >= m && this.inset(x - hw, z + hd) >= m && this.inset(x + hw, z + hd) >= m;
  }

  // ------------------------------------------------------------------ sông

  private riverHit(r: River, x: number, z: number): RiverHit {
    return nearestOn(r.segs, x, z);
  }

  /**
   * Như `riverHit` nhưng chỉ xét các đoạn sông gần khoang `b`: đáp số đúng khi điểm cách sông dưới `bank + RIVER_REACH`, xa
   * hơn thì khoảng cách trả về vẫn không nhỏ hơn mức đó (có thể là Infinity). Chỉ dùng cho câu hỏi "có ở gần sông không".
   */
  private riverHitNear(ri: number, x: number, z: number, b: number): RiverHit {
    const r = this.rivers[ri];
    if (b < 0) return this.riverHit(r, x, z);
    return nearestOn((this.accel as Accel).river[ri][b], x, z);
  }

  private crossingOf(r: River, along: number): CrossingDef | null {
    for (const c of r.cross) if (Math.abs(along - c.along) < c.def.half) return c.def;
    return null;
  }

  /** Điểm này có nằm trong lòng sông (tính cả bờ dốc nếu `withBank`) không; trả về lối qua nếu có. */
  waterAt(x: number, z: number, withBank = false): { crossing: CrossingDef | null; dist: number } | null {
    const b = this.bucketOf(x, z);
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const r = this.rivers[ri];
      const hit = this.riverHitNear(ri, x, z, b);
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

  /** Mép nước gần nhất trên mọi dòng sông: khoảng cách có dấu tới mép nước (âm = dưới nước) và bề rộng bờ dốc của dòng đó. */
  waterEdge(x: number, z: number): { d: number; bank: number } {
    let d = Infinity;
    let bank = 0;
    for (const r of this.rivers) {
      const e = this.riverHit(r, x, z).dist - r.def.half;
      if (e < d) {
        d = e;
        bank = r.def.bank - r.def.half;
      }
    }
    return { d, bank };
  }

  /** Mọi dòng sông, đã đủ cả hai nửa bản đồ (cho phần vẽ). */
  get riverDefs(): readonly RiverDef[] {
    return this.rivers.map((r) => r.def);
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
    const bucket = this.bucketOf(x, z);
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const r = this.rivers[ri];
      const hit = this.riverHitNear(ri, x, z, bucket);
      if (hit.dist < r.def.half && !this.crossingOf(r, hit.along)) return true;
    }
    for (const b of this.rocks) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return true;
    }
    return false;
  }

  /** Độ cao địa hình (m): đồi, cao nguyên, đá, lòng sông, vách núi quanh rìa. */
  terrainHeight(x: number, z: number): number {
    let h = 0;
    const bucket = this.bucketOf(x, z);
    for (let pi = 0; pi < this.plateaus.length; pi++) {
      const p = this.plateaus[pi];
      const state = bucket < 0 ? 2 : (this.accel as Accel).plateau[pi][bucket];
      if (state === 0) continue;
      if (state === 1) {
        h += p.h * 1;
        continue;
      }
      const d = polyInset(p.poly, x, z);
      if (d > -p.edge / 2) h += p.h * smooth01(d / p.edge + 0.5);
    }
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
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const r = this.rivers[ri];
      const hit = this.riverHitNear(ri, x, z, bucket);
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
    const b = this.bucketOf(x, z);
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const r = this.rivers[ri];
      const hit = this.riverHitNear(ri, x, z, b);
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
    for (let i = 0; i < this.regions.length; i++) {
      const g = this.regions[i];
      const box = this.regionBox[i];
      if (box && (x < box[0] || z < box[1] || x > box[2] || z > box[3])) continue;
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
    points: (def.points ?? []).flatMap((p) => (atCenter(p[0], p[1]) ? [p] : [p, flip(p)])),
    hills: withTwins(def.hills, blob),
    plateaus: (def.plateaus ?? []).flatMap((p) => [p, { ...p, poly: p.poly.map(flip) }]),
    rocks: withTwins(def.rocks, blob),
    rivers,
    regions
  };
}

/** Khoảng cách có dấu (m) từ điểm tới viền đa giác: dương ở trong, âm ở ngoài. */
/** Điểm gần nhất trên danh sách đoạn sông (giữ đúng thứ tự duyệt, để hai đoạn cách đều vẫn chọn như nhau). */
function nearestOn(segs: readonly Segment[], x: number, z: number): RiverHit {
  let best = Infinity;
  let along = 0;
  for (const s of segs) {
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

function segDist(s: Segment, x: number, z: number): number {
  return nearestOn([s], x, z).dist;
}

function polyBox(p: readonly Vec2[]): Box {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const v of p) {
    x0 = Math.min(x0, v[0]);
    z0 = Math.min(z0, v[1]);
    x1 = Math.max(x1, v[0]);
    z1 = Math.max(z1, v[1]);
  }
  return [x0 - ACCEL_EPS, z0 - ACCEL_EPS, x1 + ACCEL_EPS, z1 + ACCEL_EPS];
}

function polyInset(b: readonly Vec2[], x: number, z: number): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const pi = b[i];
    const pj = b[j];
    const xi = pi[0];
    const zi = pi[1];
    const xj = pj[0];
    const zj = pj[1];
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

function pointInPoly(p: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i];
    const b = p[j];
    const xi = a[0];
    const zi = a[1];
    const xj = b[0];
    const zj = b[1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

