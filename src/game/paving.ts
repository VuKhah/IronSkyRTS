/**
 * Mặt đường quanh công trình (người dùng 10/11/2026: "giữa các công trình là đường, vẽ đường lên luôn để cảm giác các
 * công trình được gắn vào nhau").
 *
 * Người dùng chốt cùng ngày (sau hai bản thử: lát kín lối đi, rồi vành đường bao quanh nhà): KHÔNG vẽ vành bao, chỉ vẽ
 *  - đường giữa hai tòa nhà nhìn thẳng vào nhau qua một lối đi (`RULES.buildGapCells` ô), nằm giữa lối, hai bên là cỏ
 *    `GRASS` m; kéo dài mỗi đầu (lối đi − `GRASS`) m để gặp đúng tim đường vuông góc ở ngã tư;
 *  - đường từ cửa chính (phía +z của mô hình, `doorSign`) đi thẳng ra tới khi gặp đường, không gặp thì là sân trước cửa;
 *  - công trình phòng thủ và Cột Điện không có đường.
 *
 * Tính theo ô 1 m chung của bản đồ (không vẽ từng tấm riêng chồng lên nhau) nên các dải nối liền không chớp hình (z-fighting).
 * Cả vùng lát là MỘT mesh (một lệnh vẽ), chỉ dựng lại khi danh sách công trình nhìn thấy thay đổi.
 */
import * as THREE from "three";
import { BUILDINGS, doorSign, RULES } from "../sim/content";
import { CELL, terrainSpeed, type GameMap } from "../sim/maps";
import type { Building } from "../sim/types";
import type { World } from "../sim/world";
import { groundRipple } from "./scene";

/** Mặt đường nổi trên mặt đất bao nhiêu (m): đủ để không bị cỏ xuyên qua, đủ thấp để không thấy là một tấm ván. */
const LIFT = 0.05;
/** Ô vẽ đường 1 m (nửa ô lưới sim 2 m, để có dải cỏ 1 m sát chân tường). */
const RES = 1;
/** Dải cỏ giữa chân tường và mép đường (m). Lối đi 4 m = 1 m cỏ + 2 m đường + 1 m cỏ. */
const GRASS = 1;
/** Bề rộng đường giữa hai nhà và đường cửa nhà nhỏ (m); nhà rộng từ 8 m có cửa rộng `DOOR_WIDE`. */
const ROAD = 2;
const DOOR_WIDE = 4;
/** Lối đi rộng nhất vẫn vẽ đường giữa hai nhà (m): xa hơn thì coi như hai nhà không đứng cạnh nhau. */
const MAX_LANE = 8;
/** Đường cửa đi xa nhất để tìm đường có sẵn (m); không gặp thì chỉ là sân trước cửa dài `DOOR_APRON` m. */
const DOOR_MAX = 12;
const DOOR_APRON = 4;
/** Bề rộng vạch sơn mép đường (m). */
const EDGE = 0.12;

/** Công trình phòng thủ (có vũ khí hoặc là công sự, trừ Tổng Hành Dinh) và Cột Điện không có đường (người dùng 10/11/2026). */
function hasRoads(b: Building): boolean {
  if (b.kind === "hq") return true;
  if (b.kind === "power-pylon") return false;
  const spec = BUILDINGS[b.kind];
  return !spec.fort && !spec.weapon;
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

  /** Gọi mỗi khung hình với các công trình người xem đang thấy / còn nhớ (không làm lộ nhà địch trong sương mù). */
  sync(world: World, buildings: readonly Building[]): void {
    let key = "";
    for (const b of buildings) key += `${b.id}:${b.x},${b.z};`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(world, buildings);
  }

  private rebuild(world: World, buildings: readonly Building[]): void {
    const map = this.map;
    const nx = Math.round(map.halfW * 2 / RES);
    const nz = Math.round(map.halfH * 2 / RES);
    const mark = new Uint8Array(nx * nz); // 1 = đường
    const gap = RULES.buildGapCells * CELL;
    /** Tô (v = 1) hoặc xóa (v = 0) mọi ô 1 m nằm trong hình chữ nhật [x0..x1] × [z0..z1]. */
    const rect = (x0: number, z0: number, x1: number, z1: number, v: number): void => {
      const i0 = Math.max(0, Math.round((x0 + map.halfW) / RES));
      const i1 = Math.min(nx, Math.round((x1 + map.halfW) / RES));
      const j0 = Math.max(0, Math.round((z0 + map.halfH) / RES));
      const j1 = Math.min(nz, Math.round((z1 + map.halfH) / RES));
      for (let j = j0; j < j1; j++) mark.fill(v, j * nx + i0, j * nx + Math.max(i0, i1));
    };
    const box = buildings.map((b) => {
      const [hw, hd] = world.blockHalf(b.kind);
      return { b, hw, hd, roads: hasRoads(b) };
    });

    // 1) đường giữa hai nhà nhìn thẳng vào nhau qua một lối đi (theo x hoặc theo z).
    // Thân đường dài bằng phần hai nhà phủ được; hai đầu kéo dài thêm (lối đi − GRASS) m để gặp tim đường vuông góc ở ngã tư,
    // nhưng chỉ kéo khi đầu đó chạm vào một đường khác: không thì thành đoạn cụt thò ra bãi cỏ.
    type R = readonly [number, number, number, number];
    const lanes: { core: R; ends: R[] }[] = [];
    for (let i = 0; i < box.length; i++)
      for (let j = i + 1; j < box.length; j++) {
        const A = box[i];
        const B = box[j];
        if (!A.roads || !B.roads) continue;
        for (const ax of [0, 1] as const) {
          // ax = 0: lối đi chạy dọc z, nằm giữa hai nhà theo x; ax = 1 ngược lại
          const ac = ax === 0 ? A.b.x : A.b.z;
          const bc = ax === 0 ? B.b.x : B.b.z;
          const ah = ax === 0 ? A.hw : A.hd;
          const bh = ax === 0 ? B.hw : B.hd;
          const lane = Math.abs(bc - ac) - ah - bh;
          if (lane < gap - 1e-6 || lane > MAX_LANE + 1e-6) continue;
          const ao = ax === 0 ? A.b.z : A.b.x;
          const bo = ax === 0 ? B.b.z : B.b.x;
          const aoh = ax === 0 ? A.hd : A.hw;
          const boh = ax === 0 ? B.hd : B.hw;
          if (Math.min(ao + aoh, bo + boh) - Math.max(ao - aoh, bo - boh) < CELL) continue; // không đối diện nhau
          const mid = ac < bc ? ac + ah + lane / 2 : bc + bh + lane / 2;
          const lo = Math.min(ao - aoh, bo - boh);
          const hi = Math.max(ao + aoh, bo + boh);
          const ext = gap - GRASS;
          const mk = (a: number, b: number): R => (ax === 0 ? [mid - ROAD / 2, a, mid + ROAD / 2, b] : [a, mid - ROAD / 2, b, mid + ROAD / 2]);
          lanes.push({ core: mk(lo, hi), ends: [mk(lo - ext, lo), mk(hi, hi + ext)] });
        }
      }
    const touch = (p: R, q: R): boolean => Math.min(p[2], q[2]) - Math.max(p[0], q[0]) > 1e-6 && Math.min(p[3], q[3]) - Math.max(p[1], q[1]) > 1e-6;
    for (const l of lanes) rect(l.core[0], l.core[1], l.core[2], l.core[3], 1);
    // 2) chừa dải cỏ quanh MỌI công trình (kể cả nhà không có đường): đường kéo dài ở ngã tư không được lấn vào chân nhà
    for (const { b, hw, hd } of box) rect(b.x - hw - GRASS, b.z - hd - GRASS, b.x + hw + GRASS, b.z + hd + GRASS, 0);
    // 3) đường từ cửa chính (phía +z của mô hình, nhà xưởng quay về giữa bản đồ) đi thẳng ra tới khi gặp đường
    const inOther = (self: Building, x: number, z: number): boolean =>
      box.some((o) => o.b !== self && Math.abs(x - o.b.x) < o.hw + GRASS && Math.abs(z - o.b.z) < o.hd + GRASS);
    const roadAt = (x: number, z: number): boolean => {
      const ix = Math.floor((x + map.halfW) / RES);
      const iz = Math.floor((z + map.halfH) / RES);
      return ix >= 0 && iz >= 0 && ix < nx && iz < nz && mark[iz * nx + ix] === 1;
    };
    const doors: R[] = [];
    for (const { b, hw, hd, roads } of box) {
      if (!roads) continue;
      const dir = doorSign(b.kind, b.z);
      const w = hw * 2 >= 8 ? DOOR_WIDE : ROAD;
      const edge = b.z + dir * hd;
      let len = 0;
      let reached = false;
      for (let s = 0; s < DOOR_MAX; s++) {
        const zc = edge + dir * (s + 0.5);
        if (roadAt(b.x, zc)) {
          reached = true;
          break;
        }
        if (inOther(b, b.x, zc)) break;
        len = s + 1;
      }
      if (!reached) len = Math.min(len, DOOR_APRON);
      if (len <= 0) continue;
      const z0 = Math.min(edge, edge + dir * len);
      const z1 = Math.max(edge, edge + dir * len);
      rect(b.x - w / 2, z0, b.x + w / 2, z1, 1);
      doors.push([b.x - w / 2, z0, b.x + w / 2, z1]);
    }
    // 4) đầu kéo dài của đường giữa nhà: giữ khi chạm một đường khác (thân hay đầu của lối khác, hoặc đường từ cửa)
    for (const l of lanes)
      for (const e of l.ends)
        if (doors.some((d) => touch(e, d)) || lanes.some((o) => o !== l && (touch(e, o.core) || o.ends.some((f) => touch(e, f))))) {
          // không lấn vào dải cỏ quanh nhà: tô từng ô rồi trả lại cỏ những ô sát chân công trình
          rect(e[0], e[1], e[2], e[3], 1);
          for (const { b, hw, hd } of box) {
            const x0 = Math.max(e[0], b.x - hw - GRASS);
            const x1 = Math.min(e[2], b.x + hw + GRASS);
            const z0 = Math.max(e[1], b.z - hd - GRASS);
            const z1 = Math.min(e[3], b.z + hd + GRASS);
            if (x1 > x0 && z1 > z0) rect(x0, z0, x1, z1, 0);
          }
        }
    const isRoad = (ix: number, iz: number): boolean => {
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || mark[iz * nx + ix] !== 1) return false;
      // không lát xuống sông, đá, vách núi (chỗ xe bánh không đi được)
      return terrainSpeed(map.terrainAt(-map.halfW + (ix + 0.5) * RES, -map.halfH + (iz + 0.5) * RES), "wheel", false) > 0;
    };

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
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
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
