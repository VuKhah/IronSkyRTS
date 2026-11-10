/**
 * Mặt đường quanh công trình (người dùng 10/11/2026: "giữa các công trình là đường, vẽ đường lên luôn để cảm giác các
 * công trình được gắn vào nhau").
 *
 * Luật đặt nhà chừa đúng `RULES.buildGapCells` ô lưới giữa hai công trình làm lối cho xe. Người dùng góp ý cùng ngày: lát
 * kín cả lối trông không đẹp, phải chừa cỏ quanh nhà, đường chạy ở giữa. Nên mỗi nhà có một vành đường cách chân tường
 * `GRASS` m; hai nhà cách nhau đúng một lối đi thì hai vành trùng nhau thành một con đường giữa hai dải cỏ.
 *
 * Tính theo ô 1 m chung của bản đồ (không vẽ từng tấm riêng chồng lên nhau) nên các dải nối liền không chớp hình (z-fighting).
 * Cả vùng lát là MỘT mesh (một lệnh vẽ), chỉ dựng lại khi danh sách công trình nhìn thấy thay đổi.
 */
import * as THREE from "three";
import { RULES } from "../sim/content";
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
/** Bề rộng vạch sơn mép đường (m). */
const EDGE = 0.12;

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
    // 0 = cỏ, 1 = đường, 2 = sát nhà (chân nhà + dải cỏ): ô đã là 2 thì không bao giờ thành đường
    const mark = new Uint8Array(nx * nz);
    const gap = RULES.buildGapCells * CELL;
    const span = (lo: number, hi: number, half: number, n: number): [number, number] => [
      Math.max(0, Math.round((lo + half) / RES)),
      Math.min(n, Math.round((hi + half) / RES))
    ];
    const fill = (b: Building, grow: number, v: number): void => {
      const [bw, bd] = world.blockHalf(b.kind);
      const [x0, x1] = span(b.x - bw - grow, b.x + bw + grow, map.halfW, nx);
      const [z0, z1] = span(b.z - bd - grow, b.z + bd + grow, map.halfH, nz);
      for (let iz = z0; iz < z1; iz++)
        for (let ix = x0; ix < x1; ix++) {
          const i = iz * nx + ix;
          if (v === 2 || mark[i] === 0) mark[i] = v;
        }
    };
    // vành đường của mỗi nhà: từ GRASS tới (lối đi − GRASS) tính từ chân tường. Hai nhà cách nhau đúng một lối đi thì hai
    // vành trùng nhau thành MỘT con đường nằm giữa, hai bên là cỏ.
    for (const b of buildings) fill(b, gap - GRASS, 1);
    for (const b of buildings) fill(b, GRASS, 2);
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
