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
  }

  /**
   * Điểm đi được gần (x, z) nhất, tìm theo từng vòng ô; trả về chính (x, z) nếu nó đã đi được.
   * Hai ô cách đều thì ô xét trước thắng; nửa bản đồ bên kia xét theo thứ tự soi gương để công bằng.
   */
  nearestFree(x: number, z: number, maxRing = 15): [number, number] | null {
    const cx0 = this.colOf(x, z);
    const cz0 = this.rowOf(x, z);
    const C = this.cols;
    if (!this.blockedIdx(cz0 * C + cx0) && Math.abs(x) < this.halfW && Math.abs(z) < this.halfH) return [x, z];
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
          if (d < bestD) {
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

  /** Đường thẳng từ A tới B có đi được không (kiểm tra cả hai mép, để xe không cạ vào vách). */
  los(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return !this.blockedAt(x0, z0);
    const steps = Math.ceil(d / (CELL * 0.35));
    const ox = (-dz / d) * 0.7;
    const oz = (dx / d) * 0.7;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = x0 + dx * k;
      const z = z0 + dz * k;
      if (this.blockedAt(x, z) || this.blockedAt(x + ox, z + oz) || this.blockedAt(x - ox, z - oz)) return false;
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
   * Tìm đường từ (x0, z0) tới (x1, z1). Trả về dãy điểm [x, z, x, z, …] (không gồm điểm xuất phát),
   * hoặc null nếu không có đường. Đích bị chặn thì đi tới ô trống gần đích nhất.
   * `f`: hệ số tốc độ theo ô của kiểu xe (field()): có thì tìm đường nhanh nhất, không có thì đường ngắn nhất.
   */
  findPath(x0: number, z0: number, x1: number, z1: number, f?: SpeedField): number[] | null {
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
    if (s === t) return [gx, gz];
    // Đi thẳng luôn nếu đường thẳng đi được và không băng qua ô chậm hơn hai đầu (và cỏ). Bản đồ có ô nhanh hơn cỏ
    // (đường cái) thì vẫn tìm, vì vòng theo đường có thể nhanh hơn; tìm xong sẽ so với đi thẳng (dưới).
    const straight = this.los(x0, z0, gx, gz);
    if (straight) {
      if (!f) return [gx, gz];
      const need = Math.min(1, f.k[s], f.k[t]);
      if (f.kMax <= 1 && this.minSpeedAlong(f, x0, z0, gx, gz) >= need) return [gx, gz];
    }

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
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closedGen[cur] === gen) continue;
      this.closedGen[cur] = gen;
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
        // chính sách "nhanh nhất": thời gian đi vào ô = quãng đường ÷ hệ số tốc độ của ô
        const ng = this.g[cur] + (K ? cost / K[ni] : cost);
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
      for (let k = Math.min(n - 1, i + 14); k > i; k--) {
        if (!this.los(ax, az, pts[k * 2], pts[k * 2 + 1])) continue;
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
