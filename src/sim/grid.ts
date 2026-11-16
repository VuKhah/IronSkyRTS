/**
 * Lưới ô 2 m × 2 m phủ bản đồ cho xe mặt đất (cols × rows ô, lấy từ GameMap; "Thung Lũng Sông Sắt" là 80 × 80).
 * Chỉ số ô: i = cz * cols + cx.
 *
 * - `terrain`: ô bị chặn vĩnh viễn (sông không có cầu, mỏm đá, vách bản đồ).
 * - `occ`: số công trình / mỏ đang chiếm ô (thay đổi khi xây hoặc phá công trình).
 * - `kind`: loại địa hình từng ô (chỉ số trong TERRAIN_KINDS), tính một lần lúc vào trận.
 * - `field(kiểu xe)`: hệ số tốc độ từng ô theo kiểu xe (bánh / xích, kháng làm chậm), dùng chung cho đi lẫn tìm đường.
 * - Tìm đường bằng A* (8 hướng, không cắt góc), rồi "kéo thẳng" đường đi bằng kiểm tra tầm nhìn
 *   để xe chạy theo đường chéo tự nhiên thay vì zíc zắc theo ô.
 * - Chính sách đường đi "nhanh nhất" (B3b): chi phí một ô = quãng đường ÷ hệ số tốc độ của ô theo kiểu xe, nên A* tìm
 *   đường TỐN ÍT THỜI GIAN nhất (vòng qua đường cái thay vì lội bùn). Bộ phận hậu cần tự chọn, người chơi không phải lo.
 *   Công tắc chiến thuật đường đi về sau (nấp rừng, đi thẳng…) = một cách tính chi phí ô khác, đặt cạnh `field()`.
 * Tất định: duyệt theo thứ tự cố định, chỉ dùng phép tính cơ bản.
 * Công bằng (B3b): trên bản đồ đối xứng, đường đi A → B và (−A) → (−B) là ảnh soi gương của nhau. Mọi chỗ phải
 * "chọn một trong hai thứ bằng nhau" (thứ tự xét 8 hướng, ô trống cách đều, điểm nằm đúng ranh giới hai ô) đều chọn
 * theo quy tắc đối xứng; nếu không, khi hai đường dài bằng nhau, một phe luôn được chọn đường đẹp hơn.
 */
import type { Mobility } from "./content";
import { SQRT2 } from "./fmath";
import { CELL, TERRAIN, TERRAIN_KINDS, terrainSpeed, type GameMap, type TerrainKind } from "./maps";

/** Hệ số tốc độ theo ô của một kiểu xe (tính một lần mỗi trận). */
export interface SpeedField {
  /** Hệ số tốc độ từng ô (cỏ = 1; ô bị chặn = 0). */
  k: Float64Array;
  /** Hệ số lớn nhất trên bản đồ (≥ mọi ô đi được): chia heuristic A* cho số này để A* vẫn đúng. */
  kMax: number;
}

/**
 * Lớp vật cản ĐỘNG (bước 2 kế hoạch đế, 16/11/2026): xe cùng phe đang đứng / hạ bệ, do World dựng mỗi tick (`World.standLayer`).
 * `clear[i]` = khoảng cách (m) từ tâm ô i tới vòng giãn của xe đứng gần nhất (Infinity = không có xe nào trong tầm in),
 * `owner[i]` = mã xe đó. `self` = mã xe đang tìm đường: ô mà xe gần nhất là chính nó thì bỏ qua lớp này (thân của chính mình
 * không chắn đường mình). A* và `los` coi `clear` như khoảng trống tĩnh: ô có min(khoảng trống, clear) < nửa bề ngang là chặn.
 */
export interface StandLayer {
  clear: Float32Array;
  owner: Int32Array;
  self: number;
  /**
   * Khoảng tối thiểu (m) từ tâm người tìm đường tới vòng in của xe đứng (A1a, luật lách mềm: SOFT_PASS × đế người đi). Bỏ trống =
   * dùng nửa bề ngang `half` như vật cản tĩnh (tiểu đội bộ binh).
   */
  need?: number;
  /**
   * Vòng in của từng xe đứng [x, z, r, mã xe] × n: `los` kiểm đoạn thẳng theo hình học chính xác (lưới 2 m quá thô cho khe lách
   * 1,6 m). Bỏ trống = tra theo ô như cũ.
   */
  discs?: Float64Array;
}

/** A* có lớp xe đứng mà duyệt quá chừng này ô thì thôi (đích bị xe đứng vây kín): người gọi tìm lại không có lớp này. */
export const STAND_SEARCH_MAX = 4000;

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [-1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, -1, SQRT2]
];

/** Điểm thuộc "nửa thứ nhất" của bản đồ (dùng để chọn thứ tự duyệt đối xứng): z > 0, hoặc z = 0 và x < 0. */
function canonPoint(x: number, z: number): boolean {
  return z > 0 || (z === 0 && x < 0);
}

/** Bài toán A → B thuộc chiều thứ nhất? Bài toán soi gương (−A → −B) luôn thuộc chiều kia. */
function canonPair(x0: number, z0: number, x1: number, z1: number): boolean {
  const mz = z0 + z1;
  if (mz !== 0) return mz > 0;
  const mx = x0 + x1;
  if (mx !== 0) return mx < 0;
  return canonPoint(x0, z0);
}

/** Hệ số "hành lang" theo khoảng cách (ô) tới vật cản cố định: sát vật cản coi như chậm hơn, từ 4 ô (8 m) trở ra như thường. */
const CORRIDOR = [0, 0.35, 0.55, 0.8, 1];

export class Grid {
  /** Số ô theo x (cột) và z (hàng). */
  readonly cols: number;
  readonly rows: number;
  /** Tổng số ô. */
  readonly size: number;
  readonly terrain: Uint8Array;
  readonly occ: Uint8Array;
  /** Loại địa hình từng ô: chỉ số trong TERRAIN_KINDS. */
  readonly kind: Uint8Array;
  /** Khoảng cách (số ô, kiểu bàn cờ vua, trần 255) tới ô bị chặn cố định gần nhất, tính một lần: xe xa vách khỏi dò thân. */
  readonly wallDist: Uint8Array;
  /**
   * Khoảng trống (m) từ tâm từng ô tới mép ô bị chặn gần nhất (vách, đá, nước sâu, nhà, khối quặng) hoặc mép bản đồ; 0 ở ô bị
   * chặn. Xe nửa bề ngang w chỉ đi được ô có khoảng trống ≥ w (cách các game RTS "phồng" vật cản lên bằng cỡ đơn vị). Tính
   * lại (lười) khi bản đồ chiếm chỗ đổi: xây / phá nhà. Đọc qua `clearance()`.
   */
  private clear: Float32Array;
  private clearDirty = true;
  /** Nhãn vùng liên thông theo từng nửa bề ngang xe (xem `regions`); xóa khi bảng khoảng trống tính lại. */
  private regionCache = new Map<number, Int32Array>();
  private nearX: Int16Array;
  private nearZ: Int16Array;
  private fields = new Map<string, SpeedField>();
  private readonly halfW: number;
  private readonly halfH: number;
  private g: Float64Array;
  private parent: Int32Array;
  private openGen: Uint32Array;
  private closedGen: Uint32Array;
  private gen = 0;
  private heapNode: Int32Array;
  private heapF: Float64Array;
  private heapSize = 0;

  constructor(map: GameMap) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.halfW = map.halfW;
    this.halfH = map.halfH;
    const n = (this.size = this.cols * this.rows);
    this.terrain = new Uint8Array(n);
    this.occ = new Uint8Array(n);
    this.kind = new Uint8Array(n);
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.openGen = new Uint32Array(n);
    this.closedGen = new Uint32Array(n);
    this.heapNode = new Int32Array(n * 8);
    this.heapF = new Float64Array(n * 8);
    this.clear = new Float32Array(n);
    this.nearX = new Int16Array(n);
    this.nearZ = new Int16Array(n);
    const index = new Map<TerrainKind, number>(TERRAIN_KINDS.map((k, i) => [k, i]));
    for (let cz = 0; cz < this.rows; cz++)
      for (let cx = 0; cx < this.cols; cx++) {
        const i = cz * this.cols + cx;
        const x = this.centerX(cx);
        const z = this.centerZ(cz);
        const kind = map.terrainAt(x, z);
        this.kind[i] = index.get(kind)!;
        // loại địa hình không đi được (nước sâu, vách núi) cũng chặn, phòng khi bản đồ tô vùng như vậy
        this.terrain[i] = map.staticBlocked(x, z) || TERRAIN[kind].speed.wheel === 0 ? 1 : 0;
      }
    // loang từ mọi ô bị chặn cố định (và mép lưới)
    this.wallDist = new Uint8Array(n).fill(255);
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      const cx = i % this.cols;
      const cz = (i - cx) / this.cols;
      if (this.terrain[i] || cx === 0 || cz === 0 || cx === this.cols - 1 || cz === this.rows - 1) {
        this.wallDist[i] = 0;
        q.push(i);
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const cx = i % this.cols;
      const cz = (i - cx) / this.cols;
      const d = this.wallDist[i] + 1;
      if (d >= 255) continue;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= this.cols || z >= this.rows) continue;
          const j = z * this.cols + x;
          if (this.wallDist[j] <= d) continue;
          this.wallDist[j] = d;
          q.push(j);
        }
    }
  }

  /** Loại địa hình của ô chứa điểm (x, z). */
  kindAt(x: number, z: number): TerrainKind {
    return TERRAIN_KINDS[this.kind[this.index(x, z)]];
  }

  /** Hệ số tốc độ theo ô cho một kiểu xe; tính lần đầu cần tới rồi giữ lại cả trận. */
  field(mob: Mobility, slowResist: boolean): SpeedField {
    const key = slowResist ? `${mob}+` : mob;
    let f = this.fields.get(key);
    if (!f) {
      const byKind = TERRAIN_KINDS.map((k) => terrainSpeed(k, mob, slowResist));
      const k = new Float64Array(this.size);
      let kMax = 0;
      for (let i = 0; i < this.size; i++) {
        const v = this.terrain[i] ? 0 : byKind[this.kind[i]];
        k[i] = v;
        if (v > kMax) kMax = v;
      }
      f = { k, kMax: kMax > 0 ? kMax : 1 };
      this.fields.set(key, f);
    }
    return f;
  }

  /**
   * Hệ số tốc độ "hành lang" cho người dẫn đầu đội hình và cho xe tự tìm đường (từ 12/11/2026, không thì xe lẻ men sát vách
   * từng ô, thân quẹt mép dốc): như `field` nhưng ô càng sát vật cản cố định (sông, đá, vách, mép
   * bản đồ) càng bị coi là chậm, nên đường A* đi giữa khoảng trống thay vì men sát vật cản (đội hình khỏi phải co / dạt vô
   * cớ). Hệ số chỉ giảm, không tăng, nên heuristic A* vẫn đúng. Tính một lần rồi giữ lại cả trận.
   */
  corridor(mob: Mobility, slowResist = false): SpeedField {
    const key = `${mob}${slowResist ? "+" : ""}#corridor`;
    let f = this.fields.get(key);
    if (!f) {
      const base = this.field(mob, slowResist);
      // khoảng cách (số ô, kiểu bàn cờ vua) tới ô bị chặn gần nhất: loang từ mọi ô chặn và mép lưới
      const d = new Int32Array(this.size).fill(-1);
      const q: number[] = [];
      for (let i = 0; i < this.size; i++) {
        const cx = i % this.cols;
        const cz = (i - cx) / this.cols;
        if (this.terrain[i] || cx === 0 || cz === 0 || cx === this.cols - 1 || cz === this.rows - 1) {
          d[i] = 0;
          q.push(i);
        }
      }
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        const cx = i % this.cols;
        const cz = (i - cx) / this.cols;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const z = cz + dz;
            if (x < 0 || z < 0 || x >= this.cols || z >= this.rows) continue;
            const j = z * this.cols + x;
            if (d[j] >= 0) continue;
            d[j] = d[i] + 1;
            q.push(j);
          }
      }
      const k = new Float64Array(this.size);
      for (let i = 0; i < this.size; i++) k[i] = base.k[i] * CORRIDOR[Math.min(d[i], CORRIDOR.length - 1)];
      f = { k, kMax: base.kMax };
      this.fields.set(key, f);
    }
    return f;
  }

  // Điểm nằm đúng ranh giới hai ô thì xếp vào ô gần tâm bản đồ hơn (đối xứng hai phía; làm tròn xuống thì không).
  cellX(x: number): number {
    const v = (x + this.halfW) / CELL;
    let c = Math.floor(v);
    if (c === v && x > 0) c--;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  cellZ(z: number): number {
    const v = (z + this.halfH) / CELL;
    let c = Math.floor(v);
    if (c === v && z > 0) c--;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }
  /**
   * Cột / hàng của điểm (x, z), đối xứng hoàn toàn: như cellX / cellZ, và điểm nằm đúng trên đường giữa bản đồ
   * (x = 0 hoặc z = 0) thì chọn ô theo tọa độ còn lại, để (x, z) và (−x, −z) luôn rơi vào hai ô soi gương.
   * (Riêng đúng tâm (0, 0) thì không thể đối xứng.)
   */
  colOf(x: number, z: number): number {
    const v = (x + this.halfW) / CELL;
    let c = Math.floor(v);
    if (c === v && (x > 0 || (x === 0 && canonPoint(x, z)))) c--;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  rowOf(x: number, z: number): number {
    const v = (z + this.halfH) / CELL;
    let c = Math.floor(v);
    if (c === v && (z > 0 || (z === 0 && canonPoint(x, z)))) c--;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }
  index(x: number, z: number): number {
    return this.rowOf(x, z) * this.cols + this.colOf(x, z);
  }
  centerX(cx: number): number {
    return -this.halfW + (cx + 0.5) * CELL;
  }
  centerZ(cz: number): number {
    return -this.halfH + (cz + 0.5) * CELL;
  }
  blockedIdx(i: number): boolean {
    return this.terrain[i] !== 0 || this.occ[i] !== 0;
  }
  blockedAt(x: number, z: number): boolean {
    if (x <= -this.halfW || x >= this.halfW || z <= -this.halfH || z >= this.halfH) return true;
    return this.blockedIdx(this.index(x, z));
  }

  /** Các ô có tâm nằm trong hình chữ nhật (x ± hw, z ± hd). */
  cellsInRect(x: number, z: number, hw: number, hd: number): number[] {
    const out: number[] = [];
    const x0 = this.cellX(x - hw + 0.01);
    const x1 = this.cellX(x + hw - 0.01);
    const z0 = this.cellZ(z - hd + 0.01);
    const z1 = this.cellZ(z + hd - 0.01);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) out.push(cz * this.cols + cx);
    return out;
  }

  block(cells: readonly number[], delta: 1 | -1): void {
    for (const i of cells) this.occ[i] = Math.max(0, this.occ[i] + delta);
    if (cells.length) this.clearDirty = true;
  }

  /** Khoảng trống (m) của ô chứa (x, z); xem `clear`. */
  clearanceAt(x: number, z: number): number {
    if (x <= -this.halfW || x >= this.halfW || z <= -this.halfH || z >= this.halfH) return 0;
    return this.clearance()[this.index(x, z)];
  }

  /**
   * Bảng khoảng trống, tính lại nếu bản đồ chiếm chỗ vừa đổi. Loang từ mọi ô bị chặn và mép bản đồ, mỗi ô nhớ ô chặn gần nhất
   * (cách "lan truyền ô gần nhất" của biến đổi khoảng cách); khoảng cách đo từ tâm ô tới mép ô chặn đó. Thứ tự loang cố định
   * nên tất định.
   */
  clearance(): Float32Array {
    if (!this.clearDirty) return this.clear;
    this.clearDirty = false;
    this.regionCache.clear();
    const C = this.cols;
    const R = this.rows;
    const d2 = new Float64Array(this.size).fill(Infinity);
    const q: number[] = [];
    // khoảng cách (ô) từ tâm ô (cx, cz) tới mép ô (ox, oz): bình phương
    const gap2 = (cx: number, cz: number, ox: number, oz: number): number => {
      const ax = Math.max(0, Math.abs(cx - ox) - 0.5);
      const az = Math.max(0, Math.abs(cz - oz) - 0.5);
      return ax * ax + az * az;
    };
    for (let i = 0; i < this.size; i++) {
      const cx = i % C;
      const cz = (i - cx) / C;
      if (this.blockedIdx(i)) {
        d2[i] = 0;
        this.nearX[i] = cx;
        this.nearZ[i] = cz;
        q.push(i);
        continue;
      }
      // mép bản đồ: coi như có ô chặn ngay bên ngoài
      if (cx === 0 || cz === 0 || cx === C - 1 || cz === R - 1) {
        const opts: [number, number][] = [
          [-1, cz],
          [C, cz],
          [cx, -1],
          [cx, R]
        ];
        for (const [ox, oz] of opts) {
          const v = gap2(cx, cz, ox, oz);
          if (v < d2[i]) {
            d2[i] = v;
            this.nearX[i] = ox;
            this.nearZ[i] = oz;
          }
        }
        q.push(i);
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const cx = i % C;
      const cz = (i - cx) / C;
      const ox = this.nearX[i];
      const oz = this.nearZ[i];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= C || z >= R) continue;
          const j = z * C + x;
          const v = gap2(x, z, ox, oz);
          if (v + 1e-9 >= d2[j]) continue;
          d2[j] = v;
          this.nearX[j] = ox;
          this.nearZ[j] = oz;
          q.push(j);
        }
    }
    for (let i = 0; i < this.size; i++) this.clear[i] = Math.sqrt(d2[i]) * CELL;
    return this.clear;
  }

  /**
   * Điểm đi được gần (x, z) nhất, tìm theo từng vòng ô; trả về chính (x, z) nếu nó đã đi được.
   * Hai ô cách đều thì ô xét trước thắng; nửa bản đồ bên kia xét theo thứ tự soi gương để công bằng.
   * `accept` (tùy chọn): chỉ nhận ô qua được điều kiện này (theo tâm ô), ví dụ cùng tầng với mỏ.
   */
  nearestFree(x: number, z: number, maxRing = 15, accept?: (cx: number, cz: number) => boolean): [number, number] | null {
    const cx0 = this.colOf(x, z);
    const cz0 = this.rowOf(x, z);
    const C = this.cols;
    if (!this.blockedIdx(cz0 * C + cx0) && Math.abs(x) < this.halfW && Math.abs(z) < this.halfH && (!accept || accept(x, z))) return [x, z];
    const s = canonPoint(x, z) ? 1 : -1;
    for (let r = 1; r <= maxRing; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++) {
          if (Math.abs(a) !== r && Math.abs(b) !== r) continue;
          const dz = a * s;
          const dx = b * s;
          const cx = cx0 + dx;
          const cz = cz0 + dz;
          if (cx < 0 || cz < 0 || cx >= C || cz >= this.rows) continue;
          const i = cz * C + cx;
          if (this.blockedIdx(i)) continue;
          const ddx = this.centerX(cx) - x;
          const ddz = this.centerZ(cz) - z;
          const d = ddx * ddx + ddz * ddz;
          if (d < bestD && (!accept || accept(this.centerX(cx), this.centerZ(cz)))) {
            bestD = d;
            best = i;
          }
        }
      if (best >= 0) return [this.centerX(best % C), this.centerZ(Math.floor(best / C))];
    }
    return null;
  }

  /** Hệ số tốc độ nhỏ nhất dọc đoạn thẳng A → B (lấy mẫu như `los`, theo tâm xe). */
  minSpeedAlong(f: SpeedField, x0: number, z0: number, x1: number, z1: number): number {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(d / (CELL * 0.35)));
    let min = Infinity;
    for (let i = 0; i <= steps; i++) {
      const k = f.k[this.index(x0 + (dx * i) / steps, z0 + (dz * i) / steps)];
      if (k < min) min = k;
    }
    return min;
  }

  /** Thời gian (đơn vị A*: cạnh ô ÷ hệ số tốc độ) để đi thẳng A → B, lấy mẫu dọc đoạn thẳng. */
  timeAlong(f: SpeedField, x0: number, z0: number, x1: number, z1: number): number {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(d / (CELL * 0.35)));
    const seg = d / steps / CELL;
    let t = 0;
    for (let i = 0; i < steps; i++) {
      const k = f.k[this.index(x0 + (dx * (i + 0.5)) / steps, z0 + (dz * (i + 0.5)) / steps)];
      t += k > 0 ? seg / k : Infinity;
    }
    return t;
  }

  /**
   * Một dải rộng 2 × `half` m từ A tới B có đi được hết không. `half` = nửa bề ngang của xe: trước 12/11/2026 dải chỉ rộng
   * ±0,7 m cho mọi xe, nên đường kéo thẳng sát góc vách, thân Titan (nửa ngang 1,9 m) quẹt vào mép dốc, trượt dọc mép mà mũi
   * cứ quay vào vách. Dò theo các đường song song cách nhau không quá 0,7 m (không lọt qua vách mỏng).
   */
  los(x0: number, z0: number, x1: number, z1: number, half = 0.7, stand?: StandLayer): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return !this.blockedAt(x0, z0);
    if (stand && !this.standClear(x0, z0, x1, z1, half, stand)) return false;
    const steps = Math.ceil(d / (CELL * 0.35));
    const lanes = Math.max(1, Math.ceil(half / 0.7));
    const px = -dz / d;
    const pz = dx / d;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = x0 + dx * k;
      const z = z0 + dz * k;
      if (this.blockedAt(x, z)) return false;
      for (let l = 1; l <= lanes; l++) {
        const o = (half * l) / lanes;
        if (this.blockedAt(x + px * o, z + pz * o) || this.blockedAt(x - px * o, z - pz * o)) return false;
      }
    }
    return true;
  }

  /**
   * Đoạn A → B không đi quá sát xe đứng nào (lớp `stand`, trừ chính xe tìm đường). Có `discs`: khoảng cách hình học từ đoạn tới
   * từng vòng in ≥ `need`; không thì mỗi ô dọc đoạn có clear ≥ half.
   */
  private standClear(x0: number, z0: number, x1: number, z1: number, half: number, st: StandLayer): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const L2 = dx * dx + dz * dz;
    if (st.discs) {
      const need = st.need ?? half;
      const D = st.discs;
      for (let i = 0; i < D.length; i += 4) {
        if (D[i + 3] === st.self) continue;
        const px = D[i] - x0;
        const pz = D[i + 1] - z0;
        let t = L2 > 1e-12 ? (px * dx + pz * dz) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - dx * t;
        const ez = pz - dz * t;
        const lim = D[i + 2] + need;
        if (ex * ex + ez * ez < lim * lim) return false;
      }
      return true;
    }
    const d = Math.sqrt(L2);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = x0 + dx * k;
      const z = z0 + dz * k;
      if (x <= -this.halfW || x >= this.halfW || z <= -this.halfH || z >= this.halfH) continue;
      const c = this.index(x, z);
      if (st.clear[c] < half && st.owner[c] !== st.self) return false;
    }
    return true;
  }

  private push(node: number, f: number): void {
    let i = this.heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heapF[p] <= f) break;
      this.heapF[i] = this.heapF[p];
      this.heapNode[i] = this.heapNode[p];
      i = p;
    }
    this.heapF[i] = f;
    this.heapNode[i] = node;
  }

  private pop(): number {
    const top = this.heapNode[0];
    const lastF = this.heapF[--this.heapSize];
    const lastN = this.heapNode[this.heapSize];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.heapSize) break;
      const r = l + 1;
      const c = r < this.heapSize && this.heapF[r] < this.heapF[l] ? r : l;
      if (this.heapF[c] >= lastF) break;
      this.heapF[i] = this.heapF[c];
      this.heapNode[i] = this.heapNode[c];
      i = c;
    }
    this.heapF[i] = lastF;
    this.heapNode[i] = lastN;
    return top;
  }

  /**
   * Nhãn vùng liên thông cho xe nửa bề ngang `half` (16/11/2026): ô không bị chặn, khoảng trống ≥ half, loang 8 hướng không cắt
   * góc (đúng luật đi của `findPath`); −1 = ô xe không đứng được. Tính một lần cho mỗi cỡ, tính lại khi bản đồ chiếm chỗ đổi.
   * Dùng để trả "không có đường" ngay, thay vì A* quét hết bản đồ mới biết (đế tròn làm lộ nhiều đích không tới được: bãi mỏ
   * trên bậc núi hẹp, lối 4 m; đo two-crossings 38 ms/tick, 83% thời gian ở A* thất bại).
   */
  private regions(half: number): Int32Array {
    const clr = this.clearance();
    let lab = this.regionCache.get(half);
    if (lab) return lab;
    const C = this.cols;
    const R = this.rows;
    lab = new Int32Array(this.size).fill(-2);
    const q: number[] = [];
    let next = 0;
    for (let i = 0; i < this.size; i++) {
      if (lab[i] !== -2) continue;
      if (this.blockedIdx(i) || clr[i] < half) {
        lab[i] = -1;
        continue;
      }
      const id = next++;
      lab[i] = id;
      q.length = 0;
      q.push(i);
      while (q.length) {
        const cur = q.pop() as number;
        const cx = cur % C;
        const cz = (cur - cx) / C;
        for (const [dx, dz] of NEIGHBORS) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= C || nz >= R) continue;
          const ni = nz * C + nx;
          if (lab[ni] !== -2) continue;
          if (this.blockedIdx(ni) || clr[ni] < half) continue;
          if (dx !== 0 && dz !== 0 && (this.blockedIdx(cz * C + nx) || this.blockedIdx(nz * C + cx))) continue;
          lab[ni] = id;
          q.push(ni);
        }
      }
    }
    this.regionCache.set(half, lab);
    return lab;
  }

  /**
   * Xe nửa bề ngang `half` từ ô s có thể tới ô t không (kiểm nhanh trước A*). A* cho đi qua ô hẹp trong 2 ô quanh chỗ đứng và
   * 1 ô quanh đích, nên lấy mọi nhãn trong 3 ô quanh s và 2 ô quanh t: không chung nhãn nào thì A* chắc chắn thất bại. Hai ô
   * gần nhau (vùng ngoại lệ chạm nhau) thì không kết luận.
   */
  private mayReach(s: number, t: number, half: number): boolean {
    const C = this.cols;
    const sx = s % C;
    const sz = (s - sx) / C;
    const tx = t % C;
    const tz = (t - tx) / C;
    if (Math.max(Math.abs(sx - tx), Math.abs(sz - tz)) <= 6) return true;
    const lab = this.regions(half);
    const near = (cx: number, cz: number, r: number, out: number[]): void => {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= C || z >= this.rows) continue;
          const l = lab[z * C + x];
          if (l >= 0 && !out.includes(l)) out.push(l);
        }
    };
    const a: number[] = [];
    const b: number[] = [];
    near(sx, sz, 3, a);
    near(tx, tz, 2, b);
    for (const l of a) if (b.includes(l)) return true;
    return false;
  }

  /**
   * Tìm đường từ (x0, z0) tới (x1, z1). Trả về dãy điểm [x, z, x, z, …] (không gồm điểm xuất phát),
   * hoặc null nếu không có đường. Đích bị chặn thì đi tới ô trống gần đích nhất.
   * `f`: hệ số tốc độ theo ô của kiểu xe (field()): có thì tìm đường nhanh nhất, không có thì đường ngắn nhất.
   * `half`: nửa bề ngang của xe, cho bước kéo thẳng (xem `los`): đoạn nối tắt phải chừa đủ chỗ cho cả thân xe.
   */
  findPath(x0: number, z0: number, x1: number, z1: number, f?: SpeedField, half = 0.7, stand?: StandLayer): number[] | null {
    // chiều của bài toán: bài toán soi gương (−A → −B) luôn rơi vào chiều kia và xét 8 hướng theo thứ tự soi gương
    const flip = canonPair(x0, z0, x1, z1) ? 1 : -1;
    let s = this.index(x0, z0);
    if (this.blockedIdx(s)) {
      const f = this.nearestFree(x0, z0, 4);
      if (!f) return null;
      s = this.index(f[0], f[1]);
    }
    let gx = x1;
    let gz = z1;
    let t = this.index(gx, gz);
    if (this.blockedAt(gx, gz)) {
      const f = this.nearestFree(gx, gz, 20);
      if (!f) return null;
      gx = f[0];
      gz = f[1];
      t = this.index(gx, gz);
    }
    // Tìm cho một xe cụ thể (nửa bề ngang `half` > 0,7 m): đi theo bảng khoảng trống (xem `clear`). Đích nằm trong chỗ hẹp hơn
    // thân xe thì dời tới ô gần nhất vừa thân.
    const sized = half > 0.7;
    const clr = sized ? this.clearance() : null;
    if (clr && clr[t] < half) {
      const f = this.nearestFree(gx, gz, 6, (x, z) => this.clearanceAt(x, z) >= half);
      if (f) {
        gx = f[0];
        gz = f[1];
        t = this.index(gx, gz);
      }
    }
    if (s === t) return [gx, gz];
    // Đi thẳng luôn nếu đường thẳng đi được và không băng qua ô chậm hơn hai đầu (và cỏ). Bản đồ có ô nhanh hơn cỏ
    // (đường cái) thì vẫn tìm, vì vòng theo đường có thể nhanh hơn; tìm xong sẽ so với đi thẳng (dưới).
    const straight = this.los(x0, z0, gx, gz, half, stand);
    if (straight) {
      if (!f) return [gx, gz];
      const need = Math.min(1, f.k[s], f.k[t]);
      if (f.kMax <= 1 && this.minSpeedAlong(f, x0, z0, gx, gz) >= need) return [gx, gz];
    }

    // đích nằm ở vùng xe cỡ này không thông tới: khỏi quét A*
    if (clr && !this.mayReach(s, t, half)) return null;
    this.gen++;
    const gen = this.gen;
    this.heapSize = 0;
    const C = this.cols;
    const R = this.rows;
    const tx = t % C;
    const tz = Math.floor(t / C);
    // heuristic: khoảng cách 8 hướng ÷ hệ số nhanh nhất trên bản đồ, để không bao giờ ước lượng quá chi phí thật
    const hk = f ? 1 / f.kMax : 1;
    const K = f?.k;
    const h = (i: number): number => {
      const dx = Math.abs((i % C) - tx);
      const dz = Math.abs(Math.floor(i / C) - tz);
      return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * hk;
    };
    this.g[s] = 0;
    this.parent[s] = -1;
    this.openGen[s] = gen;
    this.push(s, h(s));
    let found = false;
    let expanded = 0;
    const SC = stand?.clear;
    const SO = stand?.owner;
    const self = stand?.self ?? -1;
    const sNeed = stand?.need ?? half;
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closedGen[cur] === gen) continue;
      this.closedGen[cur] = gen;
      if (SC && ++expanded > STAND_SEARCH_MAX) return null;
      if (cur === t) {
        found = true;
        break;
      }
      const cx = cur % C;
      const cz = Math.floor(cur / C);
      for (const [ndx, ndz, cost] of NEIGHBORS) {
        const dx = ndx * flip;
        const dz = ndz * flip;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= C || nz >= R) continue;
        const ni = nz * C + nx;
        if (this.blockedIdx(ni) || this.closedGen[ni] === gen) continue;
        // không cắt góc: đi chéo thì hai ô cạnh phải trống
        if (dx !== 0 && dz !== 0 && (this.blockedIdx(cz * C + nx) || this.blockedIdx(nz * C + cx))) continue;
        // xe cụ thể: ô hẹp hơn thân là chặn (trừ vài ô quanh chỗ đứng và quanh đích, để xe đang đỗ sát vách / nhà ra được),
        // ô càng sát vật cản càng tính như chậm hơn ("hành lang": đường đi giữa lối, không men sát vách / nhà)
        let corr = 1;
        if (clr) {
          // xe đứng cùng phe (lớp động) tính như vật cản tĩnh: ô quá sát là chặn, ô gần thì chậm (đường chừa khoảng với xe đứng)
          // xe đứng so với ngưỡng riêng `need` (luật lách mềm), vật cản tĩnh so với nửa bề ngang
          const sm = SC && SO![ni] !== self ? SC[ni] - sNeed : Infinity;
          const m = Math.min(clr[ni] - half, sm);
          if (m < 0 && Math.max(Math.abs(nx - (s % C)), Math.abs(nz - Math.floor(s / C))) > 2 && Math.max(Math.abs(nx - tx), Math.abs(nz - tz)) > 1) continue;
          corr = m < 1 ? 0.4 : m < 2 ? 0.6 : m < 3 ? 0.85 : 1;
        }
        // chính sách "nhanh nhất": thời gian đi vào ô = quãng đường ÷ hệ số tốc độ của ô
        const ng = this.g[cur] + (K ? cost / K[ni] : cost) / corr;
        if (this.openGen[ni] === gen && ng >= this.g[ni]) continue;
        this.openGen[ni] = gen;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        this.push(ni, ng + h(ni));
      }
    }
    if (!found) return null;

    const cells: number[] = [];
    for (let c = t; c !== -1; c = this.parent[c]) cells.push(c);
    cells.reverse();
    const pts: number[] = [];
    for (let i = 1; i < cells.length; i++) pts.push(this.centerX(cells[i] % C), this.centerZ(Math.floor(cells[i] / C)));
    pts[pts.length - 2] = gx;
    pts[pts.length - 1] = gz;

    // Kéo thẳng: từ điểm hiện tại, nhảy tới điểm xa nhất còn nhìn thấy (trong cửa sổ 14 điểm).
    // Có hệ số tốc độ thì đoạn nối tắt không được băng qua ô chậm hơn mọi ô mà đường gốc đã đi trong khoảng đó
    // (không thì xe tự cắt ngang vào bùn mà A* vừa tránh, hoặc rời đường cái).
    const out: number[] = [];
    let ax = x0;
    let az = z0;
    let i = 0;
    const n = pts.length / 2;
    while (i < n) {
      let j = i;
      // dải rộng bằng thân xe (đã thử hạ dần độ rộng ở lối hẹp: đường lại sát góc, quẹt vách nhiều gấp 6; zíc zắc theo ô còn
      // đỡ hơn)
      for (let k = Math.min(n - 1, i + 14); k > i; k--) {
        if (!this.los(ax, az, pts[k * 2], pts[k * 2 + 1], half, stand)) continue;
        if (K) {
          let spanMin = K[this.index(ax, az)];
          for (let q = i; q <= k; q++) spanMin = Math.min(spanMin, K[cells[q + 1]]);
          if (this.minSpeedAlong(f!, ax, az, pts[k * 2], pts[k * 2 + 1]) < spanMin) continue;
        }
        j = k;
        break;
      }
      ax = pts[j * 2];
      az = pts[j * 2 + 1];
      out.push(ax, az);
      i = j + 1;
    }
    // A* chỉ đi theo 8 hướng nên đường của nó thường dài hơn đường chim bay: đo thời gian thật của cả hai
    // (cùng một cách lấy mẫu, tính từ chính điểm xuất phát) và đi thẳng nếu thẳng cũng nhanh bằng.
    if (straight && f) {
      let tPath = 0;
      let px = x0;
      let pz = z0;
      for (let q = 0; q < out.length; q += 2) {
        tPath += this.timeAlong(f, px, pz, out[q], out[q + 1]);
        px = out[q];
        pz = out[q + 1];
      }
      if (this.timeAlong(f, x0, z0, gx, gz) <= tPath + 1e-9) return [gx, gz];
    }
    return out;
  }
}
