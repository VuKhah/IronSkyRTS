/**
 * Mặt đường quanh công trình (người dùng 10/11/2026: "giữa các công trình là đường, vẽ đường lên luôn để cảm giác các
 * công trình được gắn vào nhau").
 *
 * Luật đặt nhà chừa đúng `RULES.buildGapCells` ô lưới giữa hai công trình làm lối cho xe. Ở đây lát nhựa mọi ô lưới nằm
 * trong dải rộng bằng lối đó quanh mỗi công trình: hai nhà đứng cạnh nhau thì hai dải chạm nhau thành một con đường liền.
 * Mép ngoài của vùng lát có một vệt bê tông sáng như bó vỉa.
 *
 * Tính theo ô lưới chung của bản đồ (không vẽ từng tấm riêng chồng lên nhau) nên các dải nối liền không chớp hình (z-fighting).
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
/** Bề rộng vệt bó vỉa ở mép vùng lát (m). */
const CURB = 0.3;
/** Mỗi ô lưới 2 m chia mấy đoạn theo mỗi chiều để mặt đường bám theo gợn đất. */
const SUB = 2;

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
    const nx = Math.round((map.halfW * 2) / CELL);
    const nz = Math.round((map.halfH * 2) / CELL);
    const paved = new Uint8Array(nx * nz);
    const gap = RULES.buildGapCells * CELL;
    for (const b of buildings) {
      const [bw, bd] = world.blockHalf(b.kind);
      const x0 = Math.max(0, Math.round((b.x - bw - gap + map.halfW) / CELL));
      const x1 = Math.min(nx, Math.round((b.x + bw + gap + map.halfW) / CELL));
      const z0 = Math.max(0, Math.round((b.z - bd - gap + map.halfH) / CELL));
      const z1 = Math.min(nz, Math.round((b.z + bd + gap + map.halfH) / CELL));
      for (let iz = z0; iz < z1; iz++)
        for (let ix = x0; ix < x1; ix++) {
          const i = iz * nx + ix;
          if (paved[i]) continue;
          // không lát xuống sông, đá, vách núi (chỗ xe bánh không đi được)
          const cx = -map.halfW + (ix + 0.5) * CELL;
          const cz = -map.halfH + (iz + 0.5) * CELL;
          if (terrainSpeed(map.terrainAt(cx, cz), "wheel", false) <= 0) continue;
          paved[i] = 1;
        }
    }

    const pos: number[] = [];
    const col: number[] = [];
    const asphalt = new THREE.Color(0x4d5257);
    const asphaltB = new THREE.Color(0x565b60);
    const curb = new THREE.Color(0x9c9a92);
    const tmp = new THREE.Color();
    const y = (x: number, z: number, up: number): number => map.terrainHeight(x, z) + groundRipple(x, z) + LIFT + up;
    /** Một tấm chữ nhật [ax..bx] × [az..bz] chia SUB × SUB đoạn, bám mặt đất. */
    const quad = (ax: number, az: number, bx: number, bz: number, c: THREE.Color, up: number): void => {
      for (let j = 0; j < SUB; j++)
        for (let i = 0; i < SUB; i++) {
          const x0 = ax + ((bx - ax) * i) / SUB;
          const x1 = ax + ((bx - ax) * (i + 1)) / SUB;
          const z0 = az + ((bz - az) * j) / SUB;
          const z1 = az + ((bz - az) * (j + 1)) / SUB;
          const a = [x0, y(x0, z0, up), z0];
          const b = [x0, y(x0, z1, up), z1];
          const cc = [x1, y(x1, z1, up), z1];
          const d = [x1, y(x1, z0, up), z0];
          // hai tam giác, mặt quay lên trên (ngược chiều kim đồng hồ khi nhìn từ trên xuống)
          pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
          for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
        }
    };
    const isPaved = (ix: number, iz: number): boolean => ix >= 0 && iz >= 0 && ix < nx && iz < nz && paved[iz * nx + ix] === 1;
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        if (!isPaved(ix, iz)) continue;
        const x0 = -map.halfW + ix * CELL;
        const z0 = -map.halfH + iz * CELL;
        const x1 = x0 + CELL;
        const z1 = z0 + CELL;
        // nhựa đường hơi loang theo ô cho đỡ phẳng màu (tất định theo vị trí, chỉ để nhìn)
        tmp.copy(asphalt).lerp(asphaltB, ((ix * 7 + iz * 13) % 5) / 4);
        quad(x0, z0, x1, z1, tmp, 0);
        if (!isPaved(ix - 1, iz)) quad(x0, z0, x0 + CURB, z1, curb, 0.01);
        if (!isPaved(ix + 1, iz)) quad(x1 - CURB, z0, x1, z1, curb, 0.01);
        if (!isPaved(ix, iz - 1)) quad(x0, z0, x1, z0 + CURB, curb, 0.01);
        if (!isPaved(ix, iz + 1)) quad(x0, z1 - CURB, x1, z1, curb, 0.01);
      }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}
