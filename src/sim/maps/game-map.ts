/**
 * GameMap: dựng từ một MapDef lúc vào trận, trả lời mọi câu hỏi của sim và phần vẽ về bản đồ:
 * ô này đi được không, cao bao nhiêu, thuộc loại địa hình gì, có phải cầu / bãi cạn không.
 *
 * ĐỊA HÌNH BẬC THANG (11/11/2026): mặt đất là các tầng phẳng (0, 1, 2; mỗi bậc TIER_H mét) vẽ theo ô lưới 2 m, nối nhau
 * bằng khối dốc (`RampDef`). Lúc dựng, mọi ô được "rải" một lần (`rasterize`): độ cao, tầng tầm nhìn, dốc, ô bị chặn.
 * Hai ô cạnh nhau lệch quá STEP_MAX mà không qua dốc là vách: ô cao hơn thành "mép vách", bị chặn như đá.
 *
 * Chỉ dùng + − × ÷, trị tuyệt đối, min/max và sqrt (IEEE làm tròn đúng) nên tất định trên mọi máy.
 * Đừng thêm Math.sin/cos/atan2/hypot vào đây.
 */
import { DEFAULT_TERRAIN, type TerrainKind } from "./terrain";
import type { Blob, CrossingDef, MapDef, MineDef, RampDef, RampDir, RegionDef, RiverDef, TierDef, Vec2 } from "./types";
import { ACCEL_EPS, nearestOn, pointInPoly, polyBox, polyInset, segDist, type Box, type RiverHit, type Segment } from "./geometry";
import { mirrorDef } from "./mirror";

/** Cạnh ô lưới (m): tìm đường, sương mù, độ cao trong sim đều theo lưới này. */
export const CELL = 2;
/** Mỗi bậc tầng cao chừng này (m): tầng 0 = 0 m, tầng 1 = 5 m, tầng 2 = 10 m, tầng 3 = 15 m. ⚠️ Số tạm. */
export const TIER_H = 5;
/**
 * Khối dốc dài cố định chừng này (m) theo hướng leo (5 ô): độ dốc TIER_H / RAMP_LEN ≈ 27°. Người dùng chốt 11/11/2026 trên
 * Sa Bàn 3D: bậc 5 m, 3 tầng (5 / 10 / 15 m), mọi dốc là khối 10 × 10 m lên đúng một bậc (Docs/design/MAPS_PLAN.md).
 */
export const RAMP_LEN = 10;
/** Tầng cao nhất mà quân mặt đất đứng được. */
export const MAX_TIER = 3;
/**
 * Hai ô cạnh nhau (8 hướng) lệch nhau quá chừng này (m) mà không qua dốc thì là VÁCH: ô cao hơn thành "mép vách" (bị chặn).
 * Phải lớn hơn độ lệch giữa hai ô dốc liền nhau (TIER_H × CELL / RAMP_LEN = 1 m) và nhỏ hơn nửa bậc.
 */
const STEP_MAX = 1.2;
/**
 * Vùng cấm xây quanh khối dốc: chừng này ô trước chân dốc và sau đỉnh dốc, cộng một ô mỗi bên sườn. Khối dốc là lối duy nhất
 * lên xuống tầng, một nhà đặt sát đỉnh dốc là bịt kín cả cao nguyên (đo 11/11/2026: AI tự nhốt mình, 10.000 lần tìm đường hỏng).
 */
const RAMP_APRON = 3;
/** Vách bao quanh rìa vùng chơi cao hơn tầng của ô đó chừng này (m). */
const EDGE_H = 6;
/** Bản vẽ (cells): độ sâu lòng nước sâu / nước nông (m), như sông. */
const CELL_WATER_DEEP = 2.6;
const CELL_WATER_SHALLOW = 0.3;
/** Bản vẽ (cells): ký tự lớp mặt đất → loại địa hình (luật ở terrain.ts). */
const CELL_SURF: Record<string, TerrainKind> = { f: "forest", w: "deep", s: "shallow", m: "mud", o: "road" };
/** Tầng tầm nhìn của ô vách rìa: che hết. */
const VIS_WALL = 9;
/** Sát mép vùng chơi hơn chừng này (m) thì không đi được. */
export const WALL = 4;
/** Máy bay được bay ra tới cách mép bản đồ chừng này (m), xa hơn thì quay về. */
const AIR_MARGIN = 10;
/** Mặt cầu cao hơn mặt nước (m). */
const DECK = 0.45;

/**
 * Lưới khoang để trả lời nhanh trên bản đồ lớn (960 m = 230.400 ô, mỗi ô từng phải dò 170 đoạn sông). Khoảng cách tới
 * một đoạn thẳng đổi không quá 1 m khi đi 1 m, nên đo ở tâm khoang là biết chắc đoạn nào đủ gần để ảnh hưởng cả khoang.
 * Chỉ bỏ qua những phép tính biết trước kết quả: đáp số giống hệt cách tính đầy đủ.
 */
const BUCKET = 16;
/** Nửa đường chéo khoang, làm tròn lên. */
const BUCKET_R = BUCKET * 0.7072;
/** Tầm ảnh hưởng xa nhất của dòng sông mà các câu hỏi nhanh quan tâm, tính từ bờ (m). */
const RIVER_REACH = 0.5;

interface Accel {
  cols: number;
  rows: number;
  /** Theo từng sông, từng khoang: các đoạn sông đủ gần để có thể ảnh hưởng. */
  river: Segment[][][];
}

interface River {
  def: RiverDef;
  segs: Segment[];
  /** Vị trí dọc sông của từng lối qua. */
  cross: { along: number; def: CrossingDef }[];
}

/** Khối dốc đã bám lưới: hình chữ nhật [x0, x1] × [z0, z1], tầng chân dốc `low`. */
export interface Ramp {
  def: RampDef;
  dir: RampDir;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  low: number;
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
  /** Vùng tầng theo thứ tự khai báo (vùng sau đè vùng trước). */
  readonly tiers: readonly TierDef[];
  /** Khối dốc đã bám lưới. */
  readonly ramps: readonly Ramp[];
  readonly rocks: readonly Blob[];
  readonly regions: readonly RegionDef[];
  private readonly rivers: River[];
  private readonly accel: Accel | null;
  private readonly regionBox: (Box | null)[];
  private readonly tierBox: Box[];
  /**
   * Khối dốc dùng để dựng lưới ô. Bản đồ đối xứng: gồm cả dốc khai báo lẫn bản xoay 180° của chúng, vì lưới chỉ tính ở nửa
   * thứ nhất (z ≥ 0) rồi soi sang: trước 11/11/2026 chỉ có dốc khai báo, nên dốc khai báo ở nửa Bắc bị mất hẳn và dốc vắt qua
   * z = 0 chỉ còn nửa bề rộng (gặp khi dựng Bản Đồ Chuẩn: sống đá không có dốc nào).
   */
  private readonly rampsHalf: Ramp[];
  // ---- lưới ô dựng một lần lúc vào trận (cols × rows, chỉ số i = hàng × cols + cột)
  /** Độ cao mặt đất ở tâm ô (m); ô sông là đáy sông; ô dốc là độ cao ở tâm ô. */
  readonly cellY: Float64Array;
  /** Tầng tầm nhìn của ô: tầng đất (dốc = tầng chân dốc, sông = 0); đá cao hơn tầng của nó một bậc, vách rìa che hết. */
  readonly visTier: Int8Array;
  /** Ô thuộc khối dốc nào (chỉ số trong `rampsHalf`), -1 nếu không. */
  private readonly cellRamp: Int16Array;
  /** Ô bị chặn vĩnh viễn: vách rìa, đá, sông sâu, mép vách. */
  private readonly cellBlock: Uint8Array;
  /** Ô mép vách: đất tầng cao sát vách. */
  private readonly cellRim: Uint8Array;
  /** Ô thuộc vùng cấm xây quanh khối dốc (cả mặt dốc). */
  private readonly cellApron: Uint8Array;
  /** Ô mặt cầu (ô nước có cầu, xe đi được): xe đứng trên mặt cầu. Tính theo ô để khớp đúng với chỗ đi được. */
  private readonly cellDeck: Uint8Array;

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
    if (this.cols * CELL !== this.w || this.rows * CELL !== this.h) throw new Error(`Bản đồ "${def.id}": kích thước phải là bội số của ${CELL} m`);
    const rt = def.roundTop ?? 0;
    if (rt % CELL !== 0 || rt * (1 - Math.SQRT1_2) >= WALL) throw new Error(`roundTop ${rt} m: phải là bội số ${CELL} m và ≤ 12 m (phần cắt nằm trong dải sát mép)`);
    if (def.cells) {
      const ok = def.cells.rows.length === this.rows && def.cells.rows.every((r) => r.length === this.cols);
      if (!ok || (def.cells.surf && (def.cells.surf.length !== this.rows || def.cells.surf.some((r) => r.length !== this.cols))))
        throw new Error(`Bản đồ "${def.id}": lưới ô (cells) phải đúng ${this.rows} hàng × ${this.cols} cột`);
    }
    this.edgeX = this.halfW - WALL;
    this.edgeZ = this.halfH - WALL;
    this.airX = this.halfW - AIR_MARGIN;
    this.airZ = this.halfH - AIR_MARGIN;
    const full = def.symmetric ? mirrorDef(def) : def;
    this.bases = full.bases;
    this.mines = full.mines;
    this.points = full.points ?? [];
    this.tiers = full.tiers ?? [];
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
    this.tierBox = this.tiers.map((t) => polyBox(t.poly));
    this.accel = opts.accel === false ? null : this.buildAccel();
    const declared = (def.ramps ?? []).map((r) => this.snapRamp(r));
    this.rampsHalf = def.symmetric ? declared.flatMap((r) => [r, mirrorRamp(r)]) : declared;
    const n = this.cols * this.rows;
    this.cellY = new Float64Array(n);
    this.visTier = new Int8Array(n);
    this.cellRamp = new Int16Array(n);
    this.cellBlock = new Uint8Array(n);
    this.cellRim = new Uint8Array(n);
    this.cellApron = new Uint8Array(n);
    this.cellDeck = new Uint8Array(n);
    this.rasterize();
    this.ramps = this.rampsHalf;
  }

  private buildAccel(): Accel {
    const cols = Math.ceil(this.w / BUCKET);
    const rows = Math.ceil(this.h / BUCKET);
    const n = cols * rows;
    const river = this.rivers.map((r) => {
      const lists: Segment[][] = new Array<Segment[]>(n);
      const limit = Math.max(r.def.bank, r.def.half) + RIVER_REACH + BUCKET_R + ACCEL_EPS;
      this.eachBucket(cols, rows, (i, x, z) => {
        lists[i] = r.segs.filter((s) => segDist(s, x, z) <= limit);
      });
      return lists;
    });
    return { cols, rows, river };
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

  // ------------------------------------------------------------------ lưới tầng (địa hình bậc thang)

  /** Bám khối dốc vào lưới ô: bốn mép nằm đúng trên đường lưới. */
  private snapRamp(r: RampDef): Ramp {
    const ns = r.dir === "N" || r.dir === "S";
    const hx = (ns ? r.width : RAMP_LEN) / 2;
    const hz = (ns ? RAMP_LEN : r.width) / 2;
    const x0 = snapLine(r.x - hx, this.halfW);
    const z0 = snapLine(r.z - hz, this.halfH);
    return { def: r, dir: r.dir, x0, z0, x1: x0 + hx * 2, z1: z0 + hz * 2, low: 0 };
  }

  /** Bản đồ đối xứng: điểm thuộc nửa thứ hai (phía Đỏ) được tính ở điểm soi gương bên nửa phía Lam. */
  private secondHalf(x: number, z: number): boolean {
    return !!this.def.symmetric && (z < 0 || (z === 0 && x > 0));
  }

  /** Ký tự lưới ô (MapDef.cells) tại điểm: [lớp tầng, lớp mặt đất]. */
  private cellChars(x: number, z: number): [string, string] {
    const cells = this.def.cells!;
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x + this.halfW) / CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z + this.halfH) / CELL)));
    return [cells.rows[r][c], cells.surf ? cells.surf[r][c] : "."];
  }

  /** Tầng do các vùng tầng tô (chưa tính dốc, sông). Bản đồ dựng từ bản vẽ (cells): đọc thẳng tầng của ô. */
  private tierOf(x: number, z: number): number {
    if (this.def.cells) {
      const ch = this.cellChars(x, z)[0];
      return ch === "1" || ch === "2" || ch === "3" ? Number(ch) : 0;
    }
    let t = 0;
    for (let i = 0; i < this.tiers.length; i++) {
      const b = this.tierBox[i];
      if (x < b[0] || z < b[1] || x > b[2] || z > b[3]) continue;
      if (pointInPoly(this.tiers[i].poly, x, z)) t = this.tiers[i].tier;
    }
    return t;
  }

  private rasterize(): void {
    const C = this.cols;
    const R = this.rows;
    // tầng chân dốc: đo ở ô ngay sau chân dốc; ô ngay sau đỉnh dốc phải cao hơn đúng một bậc
    for (const r of this.rampsHalf) {
      const [lx, lz, hx, hz] = rampEnds(r);
      r.low = this.tierOf(lx, lz);
      const high = this.tierOf(hx, hz);
      if (high !== r.low + 1 || high > MAX_TIER)
        throw new Error(`Bản đồ "${this.id}": khối dốc (${r.def.x}, ${r.def.z}) hướng ${r.dir} không nối hai tầng liền nhau (chân tầng ${r.low}, đỉnh tầng ${high})`);
    }
    const walk = new Float64Array(C * R);
    for (let row = 0; row < R; row++)
      for (let col = 0; col < C; col++) {
        const i = row * C + col;
        let x = -this.halfW + (col + 0.5) * CELL;
        let z = -this.halfH + (row + 0.5) * CELL;
        if (this.secondHalf(x, z)) {
          x = -x;
          z = -z;
        }
        let tier = this.tierOf(x, z);
        let ramp = -1;
        for (let k = 0; k < this.rampsHalf.length; k++) {
          const r = this.rampsHalf[k];
          if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) ramp = k;
          const ns = r.dir === "N" || r.dir === "S";
          const ax = (ns ? 1 : RAMP_APRON) * CELL;
          const az = (ns ? RAMP_APRON : 1) * CELL;
          if (x > r.x0 - ax && x < r.x1 + ax && z > r.z0 - az && z < r.z1 + az) this.cellApron[i] = 1;
        }
        let y = tier * TIER_H;
        let vis = tier;
        let block = false;
        let deck = -Infinity;
        if (ramp >= 0) {
          tier = vis = this.rampsHalf[ramp].low;
          y = rampY(this.rampsHalf[ramp], x, z);
        }
        const water = this.waterHere(x, z);
        if (water) {
          ramp = -1;
          vis = 0;
          const c = water.crossing;
          if (c && c.kind === "ford") y = -water.river.fordDepth;
          else {
            y = -water.river.depth;
            if (c) deck = DECK;
            else block = true;
          }
        }
        for (const b of this.rocks) {
          const dx = x - b.x;
          const dz = z - b.z;
          if (dx * dx + dz * dz < b.r * b.r) {
            block = true;
            vis = tier + 1;
          }
        }
        if (this.def.cells) {
          // bản vẽ: ô đá chặn và che như mỏm đá; nước sâu chặn (lòng hồ), nước nông lội được
          const [ch, sf] = this.cellChars(x, z);
          if (ch === "r") {
            block = true;
            vis = tier + 1;
          }
          if (sf === "w" || sf === "s") {
            ramp = -1;
            vis = 0;
            y = sf === "w" ? -CELL_WATER_DEEP : -CELL_WATER_SHALLOW;
            if (sf === "w") block = true;
          }
        }
        if (this.inset(x, z) < WALL) {
          block = true;
          ramp = -1;
          vis = VIS_WALL;
          y = tier * TIER_H + EDGE_H;
        }
        this.cellY[i] = y;
        this.visTier[i] = vis;
        this.cellRamp[i] = ramp;
        this.cellBlock[i] = block ? 1 : 0;
        walk[i] = deck > y ? deck : y;
        if (deck > y && !block) this.cellDeck[i] = 1;
      }
    // Vách giữa hai tầng: hai ô đi được cạnh nhau (8 hướng) lệch quá STEP_MAX thì chặn ô cao hơn. Ô cao hơn là dốc (dốc
    // nhô ra khỏi khối tầng) thì chặn ô thấp cạnh sườn dốc, để xe không leo ngang lên sườn dốc.
    const rim = this.cellRim;
    for (let row = 0; row < R; row++)
      for (let col = 0; col < C; col++) {
        const i = row * C + col;
        if (this.cellBlock[i]) continue;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const c2 = col + dx;
            const r2 = row + dz;
            if ((dx === 0 && dz === 0) || c2 < 0 || r2 < 0 || c2 >= C || r2 >= R) continue;
            const j = r2 * C + c2;
            if (this.cellBlock[j] || walk[i] - walk[j] <= STEP_MAX) continue;
            if (this.cellRamp[i] < 0) rim[i] = 1;
            else if (this.cellRamp[j] < 0) rim[j] = 1;
          }
      }
    for (let i = 0; i < C * R; i++) if (rim[i]) this.cellBlock[i] = 1;
  }

  /** Chỉ số ô chứa điểm (bám vào ô sát mép nếu ở ngoài); điểm đúng ranh giới xếp đối xứng như Grid.colOf / rowOf. */
  cellIndex(x: number, z: number): number {
    return this.rowAt(x, z) * this.cols + this.colAt(x, z);
  }

  private colAt(x: number, z: number): number {
    const v = (x + this.halfW) / CELL;
    let c = Math.floor(v);
    if (c === v && (x > 0 || (x === 0 && canonPoint(x, z)))) c--;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private rowAt(x: number, z: number): number {
    const v = (z + this.halfH) / CELL;
    let c = Math.floor(v);
    if (c === v && (z > 0 || (z === 0 && canonPoint(x, z)))) c--;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  /** Tầng của ô chứa điểm (dốc = tầng chân dốc, sông = 0); ô đá / vách rìa trả về số lớn hơn tầng xung quanh. */
  tierAt(x: number, z: number): number {
    return this.visTier[this.cellIndex(x, z)];
  }

  /** Ô chứa điểm thuộc khối dốc không. */
  onRamp(x: number, z: number): boolean {
    return this.cellRamp[this.cellIndex(x, z)] >= 0;
  }

  /** Ô chứa điểm thuộc vùng cấm xây quanh khối dốc (mặt dốc, chân dốc, đỉnh dốc) không. */
  rampApron(x: number, z: number): boolean {
    return this.cellApron[this.cellIndex(x, z)] === 1;
  }

  /** Ô chứa điểm là mép vách (đất tầng cao sát vách, bị chặn) không. */
  rimAt(x: number, z: number): boolean {
    return this.cellRim[this.cellIndex(x, z)] === 1;
  }

  /**
   * Độ cao để VẼ mặt đất: như terrainHeight nhưng bỏ phần nâng của dải vách rìa (EDGE_H): bản đồ không vẽ thành ở mép
   * (người dùng 11/11/2026), sim vẫn chặn các ô đó như cũ.
   */
  drawGroundY(x: number, z: number): number {
    const y = this.terrainHeight(x, z);
    return this.inset(x, z) < WALL ? y - EDGE_H : y;
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

  /** Dòng sông có nước tại điểm (dòng khai báo trước thắng) và lối qua ở đó. */
  private waterHere(x: number, z: number): { river: RiverDef; crossing: CrossingDef | null } | null {
    const b = this.bucketOf(x, z);
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const r = this.rivers[ri];
      const hit = this.riverHitNear(ri, x, z, b);
      if (hit.dist < r.def.half) return { river: r.def, crossing: this.crossingOf(r, hit.along) };
    }
    return null;
  }

  /** Điểm này có nằm trong lòng sông (tính cả bờ nếu `withBank`) không; trả về lối qua nếu có. */
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

  /** Mép nước gần nhất trên mọi dòng sông: khoảng cách có dấu tới mép nước (âm = dưới nước) và bề rộng bờ của dòng đó. */
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

  /** Ô chứa điểm này xe mặt đất có đi được không (chưa tính công trình): vách rìa, đá, sông sâu, mép vách đều chặn. */
  staticBlocked(x: number, z: number): boolean {
    if (x <= -this.halfW || x >= this.halfW || z <= -this.halfH || z >= this.halfH) return true;
    return this.cellBlock[this.cellIndex(x, z)] === 1;
  }

  /**
   * Độ cao địa hình (m): mặt tầng của ô (phẳng tuyệt đối), mặt dốc (tuyến tính theo hướng leo), đáy sông, vách rìa.
   * Ngoài vùng chơi thì lấy ô sát mép (vách rìa).
   */
  terrainHeight(x: number, z: number): number {
    const i = this.cellIndex(x, z);
    const k = this.cellRamp[i];
    if (k < 0) return this.cellY[i];
    const cx = -this.halfW + ((i % this.cols) + 0.5) * CELL;
    const cz = -this.halfH + (Math.floor(i / this.cols) + 0.5) * CELL;
    return this.secondHalf(cx, cz) ? rampY(this.rampsHalf[k], -x, -z) : rampY(this.rampsHalf[k], x, z);
  }

  /**
   * Mặt cầu cho xe chạy trên cầu (null nếu không ở trên cầu). Tính theo Ô: ô nước có cầu là ô đi được, nên mọi điểm xe đứng
   * được trên cầu đều có mặt cầu (trước đây tính theo khoảng cách liên tục tới lối qua, mép cầu có chỗ đi được mà không có mặt
   * cầu, xe tụt xuống đáy sông).
   */
  deckHeight(x: number, z: number): number | null {
    if (x <= -this.halfW || x >= this.halfW || z <= -this.halfH || z >= this.halfH) return null;
    return this.cellDeck[this.cellIndex(x, z)] === 1 ? DECK : null;
  }

  /** Độ cao mặt đất xe đứng (cầu hoặc địa hình). */
  groundY(x: number, z: number): number {
    const d = this.deckHeight(x, z);
    const h = this.terrainHeight(x, z);
    return d !== null && d > h ? d : h;
  }

  // ------------------------------------------------------------------ loại địa hình (hiệu ứng ở terrain.ts)

  /** Loại địa hình tại điểm: vùng tô của bản đồ, rồi sông, đá, vách núi, mép vách. */
  terrainAt(x: number, z: number): TerrainKind {
    if (this.rimAt(x, z)) return "cliff";
    // Bản đồ đối xứng: luôn tính ở nửa phía Lam rồi soi sang, để điểm nằm đúng trên cạnh vùng tô
    // cũng được xếp loại giống hệt ở hai nửa (công bằng theo cách dựng, không nhờ may mắn).
    if (this.secondHalf(x, z)) {
      x = -x;
      z = -z;
    }
    if (this.inset(x, z) < WALL) return "cliff";
    if (this.def.cells) {
      const [ch, sf] = this.cellChars(x, z);
      if (ch === "r") return "cliff";
      return CELL_SURF[sf] ?? DEFAULT_TERRAIN;
    }
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

// ------------------------------------------------------------------ khối dốc

function snapLine(v: number, half: number): number {
  return -half + Math.round((v + half) / CELL) * CELL;
}

/** Quãng đã leo (m) từ chân dốc tới điểm (x, z), chặn trong [0, RAMP_LEN]. */
function rampRun(r: Ramp, x: number, z: number): number {
  const s = r.dir === "E" ? x - r.x0 : r.dir === "W" ? r.x1 - x : r.dir === "S" ? z - r.z0 : r.z1 - z;
  return s < 0 ? 0 : s > RAMP_LEN ? RAMP_LEN : s;
}

/** Độ cao mặt dốc tại (x, z). */
export function rampY(r: Ramp, x: number, z: number): number {
  return r.low * TIER_H + (TIER_H * rampRun(r, x, z)) / RAMP_LEN;
}

/** Tâm ô ngay sau chân dốc và ngay sau đỉnh dốc, trên trục giữa: [chân x, chân z, đỉnh x, đỉnh z]. */
function rampEnds(r: Ramp): [number, number, number, number] {
  const mx = (r.x0 + r.x1) / 2;
  const mz = (r.z0 + r.z1) / 2;
  const h = CELL / 2;
  if (r.dir === "E") return [r.x0 - h, mz, r.x1 + h, mz];
  if (r.dir === "W") return [r.x1 + h, mz, r.x0 - h, mz];
  if (r.dir === "S") return [mx, r.z0 - h, mx, r.z1 + h];
  return [mx, r.z1 + h, mx, r.z0 - h];
}

const OPPOSITE: Record<RampDir, RampDir> = { N: "S", S: "N", E: "W", W: "E" };

function mirrorRamp(r: Ramp): Ramp {
  const dir = OPPOSITE[r.dir];
  return { def: { ...r.def, x: -r.def.x, z: -r.def.z, dir }, dir, x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0, low: r.low };
}

/** Điểm thuộc "nửa thứ nhất" của bản đồ (giống Grid): z > 0, hoặc z = 0 và x < 0. */
function canonPoint(x: number, z: number): boolean {
  return z > 0 || (z === 0 && x < 0);
}
