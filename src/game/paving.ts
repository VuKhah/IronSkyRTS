/**
 * Đường nhựa trong căn cứ (chỉ để nhìn, không có trong sim).
 *
 * Người dùng chốt 10/11/2026 sau mấy bản thử (lát kín lối đi, vành bao quanh nhà, đường giữa mọi cặp nhà): "chỉ muốn có
 * đường cho xe đi, không xây quá nhiều đường; có những con đường chẳng dùng", và các đoạn đường phải tự nối vào nhau.
 * Nên đường bây giờ suy ra từ chỗ xe thật sự đi:
 *  - mỗi nhà có xe chạy ra (Tổng Hành Dinh, xưởng xe mặt đất) có một ô cửa ra (`World.exitRect`);
 *  - cửa ra đầu tiên của mỗi cụm căn cứ mở một TRỤC CHÍNH đi ra bãi trống về phía giữa bản đồ (tiền tuyến);
 *  - mỗi cửa ra khác tìm đường ngắn nhất, ít khúc rẽ, tới mạng đường đã có, nên mạng đường luôn liền một khối;
 *  - mỗi phe một mạng riêng (xem AI đấu AI thấy nhà cả hai phe, đường không được nối hai căn cứ).
 *
 * Tim đường chạy theo ĐƯỜNG KẺ LƯỚI 2 m của sim (góc ô), không theo tâm ô: nhà có cửa ra rộng 8 m nên tâm cửa nằm đúng trên
 * một đường kẻ, đường bắt đầu chính giữa cửa (người dùng: "đường nên bắt đầu từ đoạn giữa thay vì một nửa"). Một góc ô chỉ
 * có đường khi cả 4 ô quanh nó đi được, nên đường rộng 3 m không lấn vào chân tường, sông, đá.
 *
 * Mỗi điểm đường là một tấm 3 m vuông, tô lên lưới vẽ 0,5 m chung (không vẽ tấm riêng chồng nhau nên không chớp hình).
 * Cả mạng đường là MỘT mesh, chỉ dựng lại khi danh sách công trình nhìn thấy thay đổi; chỉ lấy nhà người xem thấy / còn
 * nhớ nên không làm lộ nhà địch trong sương mù.
 */
import * as THREE from "three";
import { BUILDINGS, doorDir } from "../sim/content";
import { CELL, type GameMap } from "../sim/maps";
import type { Building } from "../sim/types";
import { dirToCenter, type World } from "../sim/world";
import { groundRipple } from "./scene";

/** Mặt đường nổi trên mặt đất bao nhiêu (m): đủ để không bị cỏ xuyên qua, đủ thấp để không thấy là một tấm ván. */
const LIFT = 0.05;
/** Ô vẽ đường (m). */
const RES = 0.5;
/** Bề rộng đường (m; người dùng 10/11/2026: 3 m). */
const ROAD = 3;
/** Bề rộng vạch sơn mép đường (m). */
const EDGE = 0.12;
/** Trục chính dừng ở điểm cách mọi công trình ít nhất bấy nhiêu mét (đã ra tới bãi trống). */
const TRUNK_CLEAR = 10;
/** Chi phí tìm đường: mỗi lần rẽ, và mỗi điểm sát tường nhà (ưu tiên đi giữa lối). */
const TURN_COST = 3;
const WALL_COST = 0.6;
/** Giới hạn số trạng thái xét mỗi lần tìm đường (mạng đường của một căn cứ không bao giờ cần nhiều hơn). */
const MAX_EXPAND = 20000;
/** Cửa ra mà đường nối về mạng đắt hơn bấy nhiêu thì coi như thuộc cụm căn cứ khác (mở trục chính riêng). */
const CLUSTER_COST = 100;

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

type Rect = readonly [number, number, number, number];

/** Lưới góc ô: (cols + 1) × (rows + 1) điểm, điểm (cx, cz) ở tọa độ (−halfW + cx·2, −halfH + cz·2). */
class Corners {
  readonly w: number;
  readonly h: number;
  constructor(
    private g: World["grid"],
    private halfW: number,
    private halfH: number
  ) {
    this.w = g.cols + 1;
    this.h = g.rows + 1;
  }
  x(i: number): number {
    return -this.halfW + (i % this.w) * CELL;
  }
  z(i: number): number {
    return -this.halfH + Math.floor(i / this.w) * CELL;
  }
  at(x: number, z: number): number {
    const cx = Math.round((x + this.halfW) / CELL);
    const cz = Math.round((z + this.halfH) / CELL);
    return cx < 0 || cz < 0 || cx >= this.w || cz >= this.h ? -1 : cz * this.w + cx;
  }
  /** Cả 4 ô quanh góc đi được. */
  open(i: number): boolean {
    const cx = i % this.w;
    const cz = (i - cx) / this.w;
    if (cx <= 0 || cz <= 0 || cx >= this.g.cols || cz >= this.g.rows) return false;
    const c = this.g.cols;
    return !this.g.blockedIdx((cz - 1) * c + cx - 1) && !this.g.blockedIdx((cz - 1) * c + cx) && !this.g.blockedIdx(cz * c + cx - 1) && !this.g.blockedIdx(cz * c + cx);
  }
  /** Có công trình trong vòng một ô quanh 4 ô của góc (để ưu tiên đi giữa lối). */
  nearWall(i: number): boolean {
    const cx = i % this.w;
    const cz = (i - cx) / this.w;
    for (let z = cz - 2; z <= cz + 1; z++)
      for (let x = cx - 2; x <= cx + 1; x++)
        if (x >= 0 && z >= 0 && x < this.g.cols && z < this.g.rows && this.g.occ[z * this.g.cols + x] !== 0) return true;
    return false;
  }
}

export class Paving {
  private mesh: THREE.Mesh;
  private key = "";

  constructor(
    scene: THREE.Scene,
    private map: GameMap
  ) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      // đẩy mặt đường lên trước mặt đất trong bộ đệm độ sâu: chỗ đất gợn cao hơn một chút vẫn không xuyên qua
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Gọi mỗi khung hình với các công trình người xem đang thấy / còn nhớ. */
  sync(world: World, buildings: readonly Building[]): void {
    let key = "";
    for (const b of buildings) key += `${b.id}:${b.x},${b.z},${b.rot};`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(world, buildings);
  }

  /** Các góc ô có đường, và các đoạn nối từ chân cửa ra tới điểm đầu đường. */
  private plan(world: World, buildings: readonly Building[], cn: Corners): { pts: Set<number>; stubs: Rect[] } {
    const exits: { start: number; x: number; z: number; side: number; stub: Rect }[] = [];
    for (const b of buildings) {
      const e = world.exitRect(b.kind, b.x, b.z, b.rot);
      if (!e) continue;
      const [dx, dz] = doorDir(b.rot);
      // điểm đầu đường: giữa mép NGOÀI ô cửa ra (nằm trên đường kẻ lưới); đoạn nối từ chân tường ra tới đó, rộng bằng đường
      const ox = e[0] + dx * e[2];
      const oz = e[1] + dz * e[3];
      const start = cn.at(ox, oz);
      if (start < 0 || !cn.open(start)) continue;
      const ix = e[0] - dx * e[2];
      const iz = e[1] - dz * e[3];
      const hw = dz !== 0 ? ROAD / 2 : 0;
      const hd = dx !== 0 ? ROAD / 2 : 0;
      const stub: Rect = [Math.min(ix, ox) - hw, Math.min(iz, oz) - hd, Math.max(ix, ox) + hw, Math.max(iz, oz) + hd];
      // xưởng có lối ra trong nền móng (bay): sàn lối ra do mô hình vẽ, không cần đoạn nối
      exits.push({ start, x: ox, z: oz, side: b.side, stub: BUILDINGS[b.kind].bay ? [0, 0, 0, 0] : stub });
    }
    // gần Tổng Hành Dinh trước (cửa của nó mở trục chính), rồi xa dần: đường mọc từ trong ra
    const hqs = buildings.filter((b) => b.kind === "hq");
    const near = (x: number, z: number): number => Math.min(Infinity, ...hqs.map((h) => (h.x - x) ** 2 + (h.z - z) ** 2));
    exits.sort((a, b) => near(a.x, a.z) - near(b.x, b.z) || a.x - b.x || a.z - b.z);

    const rects = buildings.map((b) => {
      const [hw, hd] = world.blockHalf(b.kind, b.rot);
      return [b.x - hw, b.z - hd, b.x + hw, b.z + hd] as const;
    });
    const clearOf = (x: number, z: number): number => {
      let d = Infinity;
      for (const r of rects) {
        const dx = Math.max(r[0] - x, 0, x - r[2]);
        const dz = Math.max(r[1] - z, 0, z - r[3]);
        d = Math.min(d, Math.sqrt(dx * dx + dz * dz));
      }
      return d;
    };

    const nets = [new Set<number>(), new Set<number>()];
    const stubs: Rect[] = [];
    for (const ex of exits) {
      const road = nets[ex.side];
      stubs.push(ex.stub);
      if (road.size > 0 && this.route(cn, ex.start, (i) => road.has(i), CLUSTER_COST, road)) continue;
      // cụm căn cứ mới: trục chính từ cửa ra đi ra bãi trống, về phía giữa bản đồ
      road.add(ex.start);
      const [tx, tz] = dirToCenter(ex.x, ex.z);
      const goal = (i: number): boolean => {
        const x = cn.x(i);
        const z = cn.z(i);
        return (x - ex.x) * tx + (z - ex.z) * tz > 0 && clearOf(x, z) >= TRUNK_CLEAR;
      };
      this.route(cn, ex.start, goal, Infinity, road);
    }
    const pts = new Set<number>();
    for (const net of nets) for (const i of net) pts.add(i);
    return { pts, stubs };
  }

  /**
   * Tìm đường rẻ nhất trên lưới góc ô (4 hướng, phạt mỗi lần rẽ, phạt điểm sát tường) từ `from` tới điểm đầu tiên thỏa
   * `goal`; tìm thấy thì thêm cả đường vào `out` và trả về true. Trạng thái gồm cả hướng đang đi để tính chi phí rẽ.
   */
  private route(cn: Corners, from: number, goal: (i: number) => boolean, maxCost: number, out: Set<number>): boolean {
    const best = new Map<number, number>(); // trạng thái (điểm * 4 + hướng) → chi phí
    const prev = new Map<number, number>();
    const heap: [number, number][] = []; // hàng đợi ưu tiên [chi phí, trạng thái]
    const push = (c: number, s: number): void => {
      heap.push([c, s]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    for (let d = 0; d < 4; d++) {
      best.set(from * 4 + d, 0);
      push(0, from * 4 + d);
    }
    let expanded = 0;
    while (heap.length && expanded++ < MAX_EXPAND) {
      const [c, s] = pop();
      if (c > (best.get(s) ?? Infinity) || c > maxCost) continue;
      const i = s >> 2;
      if (c > 0 && goal(i)) {
        for (let t: number | undefined = s; t !== undefined; t = prev.get(t)) out.add(t >> 2);
        return true;
      }
      const dir = s & 3;
      const cx = i % cn.w;
      const cz = (i - cx) / cn.w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d][0];
        const nz = cz + DIRS[d][1];
        if (nx < 0 || nz < 0 || nx >= cn.w || nz >= cn.h) continue;
        const j = nz * cn.w + nx;
        if (!cn.open(j)) continue;
        const nc = c + 1 + (d !== dir ? TURN_COST : 0) + (cn.nearWall(j) ? WALL_COST : 0);
        const ns = j * 4 + d;
        if (nc >= (best.get(ns) ?? Infinity)) continue;
        best.set(ns, nc);
        prev.set(ns, s);
        push(nc, ns);
      }
    }
    return false;
  }

  private rebuild(world: World, buildings: readonly Building[]): void {
    const map = this.map;
    const cn = new Corners(world.grid, map.halfW, map.halfH);
    const nx = Math.round((map.halfW * 2) / RES);
    const nz = Math.round((map.halfH * 2) / RES);
    const mark = new Uint8Array(nx * nz); // 1 = đường
    let i0 = nx;
    let i1 = 0;
    let j0 = nz;
    let j1 = 0;
    const paint = (x0: number, z0: number, x1: number, z1: number): void => {
      const a = Math.max(0, Math.round((x0 + map.halfW) / RES));
      const b = Math.min(nx, Math.round((x1 + map.halfW) / RES));
      const p = Math.max(0, Math.round((z0 + map.halfH) / RES));
      const q = Math.min(nz, Math.round((z1 + map.halfH) / RES));
      for (let j = p; j < q; j++) mark.fill(1, j * nx + a, j * nx + Math.max(a, b));
      i0 = Math.min(i0, a);
      i1 = Math.max(i1, b);
      j0 = Math.min(j0, p);
      j1 = Math.max(j1, q);
    };
    const { pts, stubs } = this.plan(world, buildings, cn);
    for (const c of pts) paint(cn.x(c) - ROAD / 2, cn.z(c) - ROAD / 2, cn.x(c) + ROAD / 2, cn.z(c) + ROAD / 2);
    for (const r of stubs) paint(r[0], r[1], r[2], r[3]);
    const isRoad = (ix: number, iz: number): boolean => ix >= 0 && iz >= 0 && ix < nx && iz < nz && mark[iz * nx + ix] === 1;

    const pos: number[] = [];
    const col: number[] = [];
    const asphalt = new THREE.Color(0x50555a);
    const edge = new THREE.Color(0x8a8a84);
    const y = (x: number, z: number, up: number): number => map.terrainHeight(x, z) + groundRipple(x, z) + LIFT + up;
    /** Một tấm chữ nhật [ax..bx] × [az..bz], bám mặt đất ở bốn góc. */
    const quad = (ax: number, az: number, bx: number, bz: number, c: THREE.Color, up: number): void => {
      const p0 = [ax, y(ax, az, up), az];
      const p1 = [ax, y(ax, bz, up), bz];
      const p2 = [bx, y(bx, bz, up), bz];
      const p3 = [bx, y(bx, az, up), az];
      // hai tam giác, mặt quay lên trên
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    };
    for (let iz = j0; iz < j1; iz++)
      for (let ix = i0; ix < i1; ix++) {
        if (!isRoad(ix, iz)) continue;
        const x0 = -map.halfW + ix * RES;
        const z0 = -map.halfH + iz * RES;
        const x1 = x0 + RES;
        const z1 = z0 + RES;
        quad(x0, z0, x1, z1, asphalt, 0);
        // vạch sơn mép đường mảnh (chỗ giáp cỏ)
        if (!isRoad(ix - 1, iz)) quad(x0, z0, x0 + EDGE, z1, edge, 0.01);
        if (!isRoad(ix + 1, iz)) quad(x1 - EDGE, z0, x1, z1, edge, 0.01);
        if (!isRoad(ix, iz - 1)) quad(x0, z0, x1, z0 + EDGE, edge, 0.01);
        if (!isRoad(ix, iz + 1)) quad(x0, z1 - EDGE, x1, z1, edge, 0.01);
      }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}
