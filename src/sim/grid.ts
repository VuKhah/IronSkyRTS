/**
 * Lưới ô 2 m × 2 m phủ bản đồ cho xe mặt đất (cols × rows ô, lấy từ GameMap; "Thung Lũng Sông Sắt" là 80 × 80).
 * Chỉ số ô: i = cz * cols + cx.
 *
 * - `terrain`: ô bị chặn vĩnh viễn (sông không có cầu, mỏm đá, vách bản đồ).
 * - `occ`: số công trình / mỏ đang chiếm ô (thay đổi khi xây hoặc phá công trình).
 * - Tìm đường bằng A* (8 hướng, không cắt góc), rồi "kéo thẳng" đường đi bằng kiểm tra tầm nhìn
 *   để xe chạy theo đường chéo tự nhiên thay vì zíc zắc theo ô.
 * Tất định: duyệt theo thứ tự cố định, chỉ dùng phép tính cơ bản.
 */
import { SQRT2 } from "./fmath";
import { CELL, type GameMap } from "./maps";

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

export class Grid {
  /** Số ô theo x (cột) và z (hàng). */
  readonly cols: number;
  readonly rows: number;
  /** Tổng số ô. */
  readonly size: number;
  readonly terrain: Uint8Array;
  readonly occ: Uint8Array;
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
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.openGen = new Uint32Array(n);
    this.closedGen = new Uint32Array(n);
    this.heapNode = new Int32Array(n * 8);
    this.heapF = new Float64Array(n * 8);
    for (let cz = 0; cz < this.rows; cz++)
      for (let cx = 0; cx < this.cols; cx++) this.terrain[cz * this.cols + cx] = map.staticBlocked(this.centerX(cx), this.centerZ(cz)) ? 1 : 0;
  }

  cellX(x: number): number {
    const c = Math.floor((x + this.halfW) / CELL);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  cellZ(z: number): number {
    const c = Math.floor((z + this.halfH) / CELL);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }
  index(x: number, z: number): number {
    return this.cellZ(z) * this.cols + this.cellX(x);
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

  /** Điểm đi được gần (x, z) nhất, tìm theo từng vòng ô; trả về chính (x, z) nếu nó đã đi được. */
  nearestFree(x: number, z: number, maxRing = 15): [number, number] | null {
    const cx0 = this.cellX(x);
    const cz0 = this.cellZ(z);
    const C = this.cols;
    if (!this.blockedIdx(cz0 * C + cx0) && Math.abs(x) < this.halfW && Math.abs(z) < this.halfH) return [x, z];
    for (let r = 1; r <= maxRing; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
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
   */
  findPath(x0: number, z0: number, x1: number, z1: number): number[] | null {
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
    if (s === t || this.los(x0, z0, gx, gz)) return [gx, gz];

    this.gen++;
    const gen = this.gen;
    this.heapSize = 0;
    const C = this.cols;
    const R = this.rows;
    const tx = t % C;
    const tz = Math.floor(t / C);
    const h = (i: number): number => {
      const dx = Math.abs((i % C) - tx);
      const dz = Math.abs(Math.floor(i / C) - tz);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
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
      for (const [dx, dz, cost] of NEIGHBORS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= C || nz >= R) continue;
        const ni = nz * C + nx;
        if (this.blockedIdx(ni) || this.closedGen[ni] === gen) continue;
        // không cắt góc: đi chéo thì hai ô cạnh phải trống
        if (dx !== 0 && dz !== 0 && (this.blockedIdx(cz * C + nx) || this.blockedIdx(nz * C + cx))) continue;
        const ng = this.g[cur] + cost;
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
    const out: number[] = [];
    let ax = x0;
    let az = z0;
    let i = 0;
    const n = pts.length / 2;
    while (i < n) {
      let j = i;
      for (let k = Math.min(n - 1, i + 14); k > i; k--) {
        if (this.los(ax, az, pts[k * 2], pts[k * 2 + 1])) {
          j = k;
          break;
        }
      }
      ax = pts[j * 2];
      az = pts[j * 2 + 1];
      out.push(ax, az);
      i = j + 1;
    }
    return out;
  }
}
