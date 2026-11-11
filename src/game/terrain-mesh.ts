/**
 * Lưới vẽ ĐỊA HÌNH BẬC THANG (11/11/2026): dựng theo đúng ô 2 m của GameMap, không lấy mẫu độ cao theo đỉnh lưới đều (lưới
 * đều làm vách thành sườn xiên răng cưa).
 * - Mặt tầng: các ô liền nhau cùng độ cao gộp thành hình chữ nhật lớn (gộp theo hàng rồi theo cột) để ít tam giác.
 * - Mặt dốc: mỗi ô dốc một tấm nghiêng, độ cao bốn góc lấy từ GameMap.terrainHeight.
 * - Vách: mặt đứng dựng đúng trên cạnh chung của hai ô lệch độ cao (cả sườn dốc nhô ra, bờ sông, vách rìa).
 * Màu mặt đất (cỏ, đường, rừng, cát, mép vách…) nằm trong một texture 1 điểm ảnh / m phủ theo tọa độ (x, z), nên gộp hình
 * không làm mất chi tiết màu. Vách dùng vật liệu đá riêng (màu theo đỉnh). Hai nhóm vật liệu: 0 = mặt, 1 = vách.
 * Chỉ để vẽ, không ảnh hưởng luật.
 */
import * as THREE from "three";
import { CELL, TERRAIN, type GameMap, type TerrainKind } from "../sim/maps";

/** Điểm ảnh texture màu mặt đất trên mỗi mét. */
const TEX_PER_M = 1;
/** Hai mặt lệch nhau dưới chừng này (m) thì coi như liền, không dựng vách. */
const STEP_EPS = 0.02;
/** Mặt nước (m), trùng với tấm nước của BattleScene. */
export const WATER_Y = -0.55;
/** Các loại địa hình do bản đồ tô (vùng `regions`) được phủ màu riêng lên mặt đất, minimap; độ đậm của lớp phủ. */
export const TINT: Partial<Record<TerrainKind, number>> = { road: 0.9, sand: 0.85, mud: 0.9, snow: 0.95, forest: 0.75 };

export interface TerrainMesh {
  geometry: THREE.BufferGeometry;
  /** Texture màu mặt đất, phủ hình chữ nhật [x0, x0 + w] × [z0, z0 + h]. */
  texture: THREE.DataTexture;
}

/**
 * Dựng lưới địa hình phủ vùng chơi cộng viền `skirt` mét mỗi bên (viền lấy độ cao ô sát mép: vách rìa).
 * uv của mọi đỉnh = vị trí (x, z) chuẩn hóa theo cả vùng vẽ, dùng chung cho texture màu.
 */
export function buildTerrainMesh(map: GameMap, skirt: number): TerrainMesh {
  const sk = Math.ceil(skirt / CELL);
  const C = map.cols + sk * 2;
  const R = map.rows + sk * 2;
  const x0 = -map.halfW - sk * CELL;
  const z0 = -map.halfH - sk * CELL;
  const W = C * CELL;
  const H = R * CELL;
  const e = 1e-3;
  // độ cao bốn góc của từng ô vẽ: [Tây Bắc, Đông Bắc, Đông Nam, Tây Nam]; ô ngoài vùng chơi lấy ô sát mép
  const corner = new Float32Array(C * R * 4);
  const ramp = new Uint8Array(C * R);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const ax = x0 + c * CELL;
      const az = z0 + r * CELL;
      const mx = ax + CELL / 2;
      const mz = az + CELL / 2;
      const inside = Math.abs(mx) < map.halfW && Math.abs(mz) < map.halfH;
      if (inside && map.onRamp(mx, mz)) {
        ramp[i] = 1;
        corner[i * 4] = map.terrainHeight(ax + e, az + e);
        corner[i * 4 + 1] = map.terrainHeight(ax + CELL - e, az + e);
        corner[i * 4 + 2] = map.terrainHeight(ax + CELL - e, az + CELL - e);
        corner[i * 4 + 3] = map.terrainHeight(ax + e, az + CELL - e);
      } else {
        const h = map.terrainHeight(mx, mz);
        corner.fill(h, i * 4, i * 4 + 4);
      }
    }

  const pos: number[] = [];
  const col: number[] = [];
  const white = [1, 1, 1];
  const tri = (a: number[], b: number[], c: number[], rgb: number[][]): void => {
    pos.push(...a, ...b, ...c);
    for (const k of rgb) col.push(k[0], k[1], k[2]);
  };
  /** Tấm bốn đỉnh a b c d (theo chiều kim đồng hồ khi nhìn từ phía mặt trước). */
  const quad = (a: number[], b: number[], c: number[], d: number[], rgb: number[][] = [white, white, white, white]): void => {
    tri(a, b, c, [rgb[0], rgb[1], rgb[2]]);
    tri(a, c, d, [rgb[0], rgb[2], rgb[3]]);
  };

  // ---- mặt tầng: gộp ô phẳng cùng độ cao theo hàng, rồi nối các đoạn giống hệt ở hàng dưới
  const used = new Uint8Array(C * R);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (used[i] || ramp[i]) continue;
      const h = corner[i * 4];
      let c1 = c + 1;
      while (c1 < C && !used[r * C + c1] && !ramp[r * C + c1] && corner[(r * C + c1) * 4] === h) c1++;
      let r1 = r + 1;
      for (; r1 < R; r1++) {
        let ok = true;
        for (let k = c; k < c1 && ok; k++) {
          const j = r1 * C + k;
          if (used[j] || ramp[j] || corner[j * 4] !== h) ok = false;
        }
        if (!ok) break;
      }
      for (let rr = r; rr < r1; rr++) used.fill(1, rr * C + c, rr * C + c1);
      const ax = x0 + c * CELL;
      const bx = x0 + c1 * CELL;
      const az = z0 + r * CELL;
      const bz = z0 + r1 * CELL;
      // mặt quay lên (+y): đi ngược chiều kim đồng hồ khi nhìn từ trên xuống (trục z hướng về phía người nhìn)
      quad([ax, h, az], [ax, h, bz], [bx, h, bz], [bx, h, az]);
    }
  // ---- mặt dốc
  for (let i = 0; i < C * R; i++) {
    if (!ramp[i]) continue;
    const c = i % C;
    const r = (i - c) / C;
    const ax = x0 + c * CELL;
    const az = z0 + r * CELL;
    const k = i * 4;
    quad([ax, corner[k], az], [ax, corner[k + 3], az + CELL], [ax + CELL, corner[k + 2], az + CELL], [ax + CELL, corner[k + 1], az]);
  }
  const groupTop = pos.length / 3;

  // ---- vách: cạnh chung của hai ô cạnh nhau lệch độ cao
  const rock = new THREE.Color();
  const shade = (y: number, top: number): number[] => {
    // đá sẫm dần xuống chân vách, có vân ngang theo độ cao cho đỡ phẳng
    const t = Math.max(0, Math.min(1, (top - y) / 8));
    const band = 0.94 + 0.06 * Math.sin(y * 2.3);
    rock.setHex(0x7d7266).multiplyScalar((1 - t * 0.35) * band);
    return [rock.r, rock.g, rock.b];
  };
  const wall = (p: number[], q: number[], hp: number, hq: number, lp: number, lq: number): void => {
    // p → q là cạnh nhìn từ phía thấp; hp/hq: độ cao phía cao ở hai đầu, lp/lq: phía thấp
    const top = Math.max(hp, hq);
    quad([p[0], lp, p[1]], [p[0], hp, p[1]], [q[0], hq, q[1]], [q[0], lq, q[1]], [shade(lp, top), shade(hp, top), shade(hq, top), shade(lq, top)]);
  };
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const k = i * 4;
      // cạnh Đông của ô i với ô bên phải j: góc ĐB, ĐN của i với góc TB, TN của j
      if (c + 1 < C) {
        const j = i + 1;
        const ia = corner[k + 1];
        const ib = corner[k + 2];
        const ja = corner[j * 4];
        const jb = corner[j * 4 + 3];
        const x = x0 + (c + 1) * CELL;
        const za = z0 + r * CELL;
        const zb = za + CELL;
        if (Math.abs(ia - ja) > STEP_EPS || Math.abs(ib - jb) > STEP_EPS) {
          // nhìn từ phía thấp hơn (lấy theo trung bình hai đầu)
          if (ia + ib > ja + jb) wall([x, zb], [x, za], ib, ia, jb, ja);
          else wall([x, za], [x, zb], ja, jb, ia, ib);
        }
      }
      // cạnh Nam của ô i với ô bên dưới j: góc TN, ĐN của i với góc TB, ĐB của j
      if (r + 1 < R) {
        const j = i + C;
        const ia = corner[k + 3];
        const ib = corner[k + 2];
        const ja = corner[j * 4];
        const jb = corner[j * 4 + 1];
        const z = z0 + (r + 1) * CELL;
        const xa = x0 + c * CELL;
        const xb = xa + CELL;
        if (Math.abs(ia - ja) > STEP_EPS || Math.abs(ib - jb) > STEP_EPS) {
          if (ia + ib > ja + jb) wall([xa, z], [xb, z], ia, ib, ja, jb);
          else wall([xb, z], [xa, z], jb, ja, ib, ia);
        }
      }
    }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const n = pos.length / 3;
  const uv = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    uv[v * 2] = (pos[v * 3] - x0) / W;
    uv[v * 2 + 1] = (pos[v * 3 + 2] - z0) / H;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.addGroup(0, groupTop, 0);
  geometry.addGroup(groupTop, n - groupTop, 1);
  geometry.computeVertexNormals();
  return { geometry, texture: groundTexture(map, x0, z0, W, H) };
}

/** Texture màu mặt đất 1 điểm ảnh / m: cỏ lốm đốm, tầng cao khô hơn, bờ sông cát, lòng sông, vùng tô, đá, mép vách, dốc. */
function groundTexture(map: GameMap, x0: number, z0: number, W: number, H: number): THREE.DataTexture {
  const nx = Math.round(W * TEX_PER_M);
  const nz = Math.round(H * TEX_PER_M);
  const data = new Uint8Array(nx * nz * 4);
  const col = new THREE.Color();
  const tint = new THREE.Color();
  const grassA = new THREE.Color(0x5f7f3c);
  const grassB = new THREE.Color(0x76913f);
  const dry = new THREE.Color(0x9a9a5c);
  const sand = new THREE.Color(0xc2b07c);
  const gravel = new THREE.Color(0x8d8576);
  const bed = new THREE.Color(0x4e5a4a);
  const rock = new THREE.Color(0x7b756c);
  const cliff = new THREE.Color(0x6a6158);
  const rimC = new THREE.Color(0x8a7f6c);
  const rampC = new THREE.Color(0x9b8a68);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) / TEX_PER_M;
      const z = z0 + (j + 0.5) / TEX_PER_M;
      const h = map.terrainHeight(x, z);
      const noise = (Math.sin(x * 0.21) * Math.sin(z * 0.17) + 1) * 0.5;
      col.copy(grassA).lerp(grassB, noise);
      const inside = Math.abs(x) < map.halfW && Math.abs(z) < map.halfH;
      const tier = inside ? Math.min(map.tierAt(x, z), 2) : 0;
      if (tier > 0) col.lerp(dry, 0.25 * tier);
      const river = map.nearRiver(x, z);
      if (river && river.dist < river.river.bank + 1.5 && h < 0.4 && h > WATER_Y) col.copy(river.crossing?.kind === "ford" ? gravel : sand);
      if (h < WATER_Y - 0.2) col.copy(bed);
      if (inside) {
        const kind = map.terrainAt(x, z);
        const k = TINT[kind];
        if (k) {
          const n = (Math.sin(x * 0.53 + z * 0.19) * Math.sin(z * 0.41 - x * 0.23) + 1) * 0.5;
          tint.setHex(TERRAIN[kind].color).multiplyScalar(0.88 + n * 0.22);
          col.lerp(tint, k);
        }
        if (map.onRamp(x, z)) col.lerp(rampC, 0.55);
        if (map.rimAt(x, z)) col.copy(rimC).lerp(cliff, noise * 0.6);
      }
      for (const r of map.rocks) {
        const dx = x - r.x;
        const dz = z - r.z;
        if (dx * dx + dz * dz < (r.r + 1.2) * (r.r + 1.2)) col.copy(rock).lerp(cliff, noise);
      }
      const inset = map.inset(x, z);
      if (inset < 6) col.lerp(cliff, Math.min(1, (6 - inset) / 6));
      const o = (j * nx + i) * 4;
      // texture lưu theo không gian màu sRGB (giống màu đỉnh cũ đã qua chuyển đổi của Color)
      col.convertLinearToSRGB();
      data[o] = Math.round(col.r * 255);
      data[o + 1] = Math.round(col.g * 255);
      data[o + 2] = Math.round(col.b * 255);
      data[o + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
