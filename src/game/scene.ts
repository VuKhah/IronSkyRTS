/**
 * Chiến trường 3D: renderer, ánh sáng, địa hình của bản đồ (GameMap), nước, cầu, đá, cây,
 * và lớp sương mù chiến tranh phủ lên địa hình. Mọi kích thước / vị trí lấy từ GameMap, không viết cứng.
 * Phần này chỉ để VẼ — được phép dùng Math.sin/Math.random vì không ảnh hưởng tới trận đấu.
 */
import * as THREE from "three";
import { PaperMap } from "./paper-map";
import type { Side } from "../sim/content";
import { Rng } from "../sim/fmath";
import { TERRAIN, type GameMap, type TerrainKind } from "../sim/maps";
import type { World } from "../sim/world";

/** Địa hình vẽ rộng hơn vùng chơi chừng này (m) mỗi bên, để mép bản đồ không lộ khoảng trống. */
const SKIRT = 20;
/** Số mắt lưới địa hình trên mỗi mét. */
const SEG_PER_M = 1;
/** Trần số ô lưới địa hình mỗi cạnh: bản đồ lớn thưa lưới đi thay vì tăng tam giác theo diện tích (960 m ở 1 ô/m là 3,7 triệu tam giác kể cả lớp sương mù). */
const MAX_TERRAIN_SEG = 320;
/** Trần số cây trang trí: mọi cây nằm chung một lệnh vẽ nên số tam giác tăng theo số cây. */
const MAX_TREES = 3500;
const WATER_Y = -0.55;
/** Các loại địa hình do bản đồ tô (vùng `regions`) được phủ màu riêng lên mặt đất, minimap; độ đậm của lớp phủ. */
const TINT: Partial<Record<TerrainKind, number>> = { road: 0.9, sand: 0.85, mud: 0.9, snow: 0.95, forest: 0.75 };

export class BattleScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  private fogTex: THREE.DataTexture;
  private fogData: Uint8Array;
  private fogMesh: THREE.Mesh;
  private paper: PaperMap | undefined;
  private water: THREE.Mesh;
  readonly mobile: boolean;
  /** Mức chất lượng tự hạ khi máy chậm: 0 = đầy đủ, 1 = giảm độ phân giải, 2 = tắt bóng đổ, 3 = độ phân giải thấp. */
  quality = 0;

  /** Kích thước tấm địa hình vẽ (m): vùng chơi cộng viền. */
  private readonly sizeW: number;
  private readonly sizeH: number;

  constructor(
    canvas: HTMLCanvasElement,
    private map: GameMap
  ) {
    this.sizeW = map.w + SKIRT * 2;
    this.sizeH = map.h + SKIRT * 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // điện thoại / màn cảm ứng: khởi đầu ở mức nhẹ hơn
    this.mobile = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const sky = new THREE.Color(0x9db4cc);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 170, 360);
    this.scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x4b5a3a, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -70;
    c.right = c.top = 70;
    c.near = 1;
    c.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    const terrainGeo = this.buildTerrainGeometry();
    const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.sizeW, this.sizeH),
      new THREE.MeshStandardMaterial({ color: 0x2f6f96, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.86 })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    this.addBridges();
    this.addRocks();
    this.addTrees();
    this.addBaseMarks();

    // Sương mù: một bản sao hình học địa hình, phủ màu tối với độ trong suốt lấy từ texture, mỗi điểm ảnh một ô lưới.
    this.fogData = new Uint8Array(map.cols * map.rows * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, map.cols, map.rows, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    const fogGeo = terrainGeo.clone();
    const pos = fogGeo.getAttribute("position");
    const uv = fogGeo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + map.halfW) / map.w, (pos.getZ(i) + map.halfH) / map.h);
      pos.setY(i, pos.getY(i) + 0.25);
    }
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x04070c, transparent: true, alphaMap: this.fogTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.fogMesh = new THREE.Mesh(fogGeo, fogMat);
    this.fogMesh.renderOrder = 2;
    this.scene.add(this.fogMesh);
  }

  private buildTerrainGeometry(): THREE.BufferGeometry {
    const map = this.map;
    const seg = Math.min(SEG_PER_M, MAX_TERRAIN_SEG / Math.max(this.sizeW, this.sizeH));
    const geo = new THREE.PlaneGeometry(this.sizeW, this.sizeH, Math.round(this.sizeW * seg), Math.round(this.sizeH * seg));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const grassA = new THREE.Color(0x5f7f3c);
    const grassB = new THREE.Color(0x76913f);
    const dry = new THREE.Color(0x9a9a5c);
    const sand = new THREE.Color(0xc2b07c);
    const gravel = new THREE.Color(0x8d8576);
    const bed = new THREE.Color(0x4e5a4a);
    const rock = new THREE.Color(0x7b756c);
    const cliff = new THREE.Color(0x6a6158);
    const tint = this.regionTint(geo);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let h = map.terrainHeight(x, z);
      // gợn nhỏ cho đất bớt phẳng lì (chỉ để nhìn)
      h += Math.sin(x * 0.37 + z * 0.11) * 0.08 + Math.sin(z * 0.29 - x * 0.17) * 0.07;
      pos.setY(i, h);
      const river = map.nearRiver(x, z);
      const noise = (Math.sin(x * 0.21) * Math.sin(z * 0.17) + 1) * 0.5;
      col.copy(grassA).lerp(grassB, noise);
      const inset = map.inset(x, z);
      if (h > 1.8) col.lerp(dry, Math.min(1, (h - 1.8) / 3));
      if (river && river.dist < river.river.bank + 1.5 && h < 0.4) col.copy(river.crossing?.kind === "ford" ? gravel : sand);
      if (h < WATER_Y - 0.2) col.copy(bed);
      // lớp màu loại địa hình (đường, bùn, rừng…), mép đã làm mờ
      const tw = tint.w[i];
      if (tw > 0) {
        col.r = col.r * (1 - tw) + tint.rgb[i * 3];
        col.g = col.g * (1 - tw) + tint.rgb[i * 3 + 1];
        col.b = col.b * (1 - tw) + tint.rgb[i * 3 + 2];
      }
      for (const r of map.rocks) {
        const d = Math.hypot(x - r.x, z - r.z);
        if (d < r.r + 1.2) col.copy(rock).lerp(cliff, noise);
      }
      if (inset < 6) col.lerp(cliff, Math.min(1, (6 - inset) / 6));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Lớp màu của các loại địa hình do bản đồ tô, theo từng đỉnh của lưới mặt đất: độ đậm `w` và màu đã nhân độ đậm `rgb`.
   * Làm mờ 3×3 để mép vùng mềm, không thành bậc thang theo ô.
   */
  private regionTint(geo: THREE.PlaneGeometry): { w: Float32Array; rgb: Float32Array } {
    const map = this.map;
    const pos = geo.getAttribute("position");
    const nx = geo.parameters.widthSegments + 1;
    const nz = geo.parameters.heightSegments + 1;
    const w0 = new Float32Array(pos.count);
    const c0 = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    let any = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const kind = map.terrainAt(x, z);
      const k = TINT[kind];
      if (!k) continue;
      any = true;
      // màu loại địa hình, gợn sáng tối nhẹ cho đỡ phẳng
      const n = (Math.sin(x * 0.53 + z * 0.19) * Math.sin(z * 0.41 - x * 0.23) + 1) * 0.5;
      col.setHex(TERRAIN[kind].color).multiplyScalar(0.88 + n * 0.22);
      w0[i] = k;
      c0[i * 3] = col.r * k;
      c0[i * 3 + 1] = col.g * k;
      c0[i * 3 + 2] = col.b * k;
    }
    if (!any) return { w: w0, rgb: c0 };
    const w = new Float32Array(pos.count);
    const rgb = new Float32Array(pos.count * 3);
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        let sw = 0;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
            const j = jz * nx + jx;
            sw += w0[j];
            sr += c0[j * 3];
            sg += c0[j * 3 + 1];
            sb += c0[j * 3 + 2];
            n++;
          }
        const i = iz * nx + ix;
        w[i] = sw / n;
        rgb[i * 3] = sr / n;
        rgb[i * 3 + 1] = sg / n;
        rgb[i * 3 + 2] = sb / n;
      }
    return { w, rgb };
  }

  private addBridges(): void {
    const deck = new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3d434c, roughness: 0.5, metalness: 0.6 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffb547, roughness: 0.6 });
    for (const { def: c, river, dirX, dirZ } of this.map.crossings()) {
      if (c.kind !== "bridge") continue;
      const g = new THREE.Group();
      // trục dài của cầu (trục x của nhóm) nằm ngang dòng sông
      const len = (river.bank + 1.5) * 2;
      const w = c.half * 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, w), deck);
      slab.position.y = 0.2;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.25), steel);
        rail.position.set(0, 0.7, (s * w) / 2);
        rail.castShadow = true;
        const line = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.02, 0.15), stripe);
        line.position.set(0, 0.46, s * (w / 2 - 0.6));
        g.add(rail, line);
      }
      for (const px of [-river.half + 1, 0, river.half - 1])
        for (const s of [-1, 1]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 3.2, 8), steel);
          pillar.position.set(px, -1.4, s * (w / 2 - 1));
          pillar.castShadow = true;
          g.add(pillar);
        }
      g.position.set(c.x, 0, c.z);
      // xoay trục x của nhóm về hướng (dirZ, -dirX), vuông góc với dòng chảy
      g.rotation.y = Math.atan2(dirX, dirZ);
      this.scene.add(g);
    }
  }

  private addRocks(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a736a, roughness: 0.95, flatShading: true });
    const rng = new Rng(99);
    for (const r of this.map.rocks) {
      for (let i = 0; i < 7; i++) {
        const s = r.r * (0.35 + rng.next() * 0.35);
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
        const a = rng.next() * Math.PI * 2;
        const d = rng.next() * r.r * 0.55;
        const x = r.x + Math.cos(a) * d;
        const z = r.z + Math.sin(a) * d;
        m.position.set(x, this.map.terrainHeight(x, z) + s * 0.2, z);
        m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
        m.scale.y = 0.8 + rng.next() * 0.6;
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
      }
    }
  }

  /** Rừng cây trang trí ở viền bản đồ và trên đồi (InstancedMesh: 1 lần vẽ cho hàng trăm cây). */
  private addTrees(): void {
    const map = this.map;
    const rng = new Rng(7);
    const spots: { x: number; z: number; s: number }[] = [];
    const clear = (x: number, z: number): boolean => {
      for (const [hx, hz] of map.bases) if (Math.hypot(x - hx, z - hz) < 30) return false;
      for (const m of map.mines) if (Math.hypot(x - m.x, z - m.z) < 12) return false;
      const river = map.nearRiver(x, z);
      if (river && river.dist < river.river.bank + 3) return false;
      return true;
    };
    // số cây theo diện tích (bản 160 m: 340 cây); rải tới cả phần viền ngoài vùng chơi
    const area = (map.w * map.h) / (160 * 160);
    const maxTrees = Math.round(340 * area);
    for (let i = 0; i < 1600 * area && spots.length < maxTrees; i++) {
      const x = (rng.next() * 2 - 1) * (map.halfW + SKIRT - 4);
      const z = (rng.next() * 2 - 1) * (map.halfH + SKIRT - 4);
      let ok = map.inset(x, z) < 10;
      for (const hl of map.hills) if (Math.hypot(x - hl.x, z - hl.z) < hl.r * 0.8) ok = ok || rng.next() < 0.5;
      if (!ok || !clear(x, z)) continue;
      spots.push({ x, z, s: 0.8 + rng.next() * 0.7 });
    }
    // rừng do bản đồ tô: cây dày theo lưới có xô lệch, cây thấp hơn cây viền để còn thấy quân bên dưới
    const forestStep = 3.6;
    for (let z = -map.halfH; z < map.halfH; z += forestStep)
      for (let x = -map.halfW; x < map.halfW; x += forestStep) {
        const px = x + rng.next() * forestStep;
        const pz = z + rng.next() * forestStep;
        if (map.terrainAt(px, pz) !== "forest") continue;
        spots.push({ x: px, z: pz, s: 0.55 + rng.next() * 0.3 });
      }
    // quá trần thì bỏ đều cây (chỉ là trang trí, không ảnh hưởng luật)
    if (spots.length > MAX_TREES) {
      const keep = spots.length / MAX_TREES;
      const thin = Array.from({ length: MAX_TREES }, (_, i) => spots[Math.floor(i * keep)]);
      spots.length = 0;
      spots.push(...thin);
    }
    const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 4.2, 7), new THREE.MeshStandardMaterial({ color: 0x3b5e2b, roughness: 0.9, flatShading: true }), spots.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 5), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.9 }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    spots.forEach((p, i) => {
      const y = map.terrainHeight(p.x, p.z);
      sc.setScalar(p.s);
      m.compose(new THREE.Vector3(p.x, y + 2.6 * p.s, p.z), q, sc);
      foliage.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, y + 0.6 * p.s, p.z), q, sc);
      trunk.setMatrixAt(i, m);
    });
    foliage.castShadow = trunk.castShadow = true;
    foliage.receiveShadow = true;
    this.scene.add(foliage, trunk);
  }

  /** Đường viền căn cứ hai phe (vẽ nhẹ trên mặt đất cho dễ nhận ra đâu là nhà). */
  private addBaseMarks(): void {
    this.map.bases.forEach(([x, z], s) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(20, 20.6, 64),
        new THREE.MeshBasicMaterial({ color: s === 0 ? 0x2e9eff : 0xf23d3d, transparent: true, opacity: 0.25, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, this.map.terrainHeight(x, z) + 0.12, z);
      this.scene.add(ring);
    });
  }

  /** Cập nhật lớp sương mù theo tầm nhìn của phe `viewer` (null = hiện tất cả). */
  updateFog(world: World, viewer: Side | null): void {
    this.fogMesh.visible = viewer !== null;
    if (viewer === null) return;
    const st = world.sides[viewer];
    const d = this.fogData;
    for (let i = 0; i < st.vis.length; i++) {
      const a = st.vis[i] ? 0 : st.explored[i] ? 120 : 215;
      const k = i * 4;
      d[k] = d[k + 1] = d[k + 2] = a;
      d[k + 3] = 255;
    }
    this.fogTex.needsUpdate = true;
  }

  /** Bóng đổ chỉ tính trong vùng quanh camera để nét hơn. */
  followSun(x: number, z: number): void {
    this.sun.position.set(x + 55, 110, z + 35);
    this.sun.target.position.set(x, 0, z);
  }

  /** Hạ một bậc chất lượng; trả về mô tả để báo cho người chơi (null nếu đã thấp nhất). */
  lowerQuality(): string | null {
    if (this.quality >= 3) return null;
    this.quality++;
    if (this.quality === 1) this.renderer.setPixelRatio(1);
    if (this.quality === 2) this.sun.castShadow = false;
    if (this.quality === 3) this.renderer.setPixelRatio(0.75);
    return ["", "giảm độ phân giải", "tắt bóng đổ", "độ phân giải thấp"][this.quality];
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
  }

  /**
   * `strategic`: 0 = chỉ cảnh 3D, giữa 0 và 1 = bản đồ giấy phủ mờ dần lên cảnh 3D, 1 = chỉ bản đồ giấy (không vẽ cảnh 3D, máy rất nhẹ).
   */
  render(cam: THREE.Camera, strategic = 0): void {
    if (strategic < 1) this.renderer.render(this.scene, cam);
    if (strategic <= 0) return;
    this.paper ??= new PaperMap(this.map, this.fogTex, this.renderer.capabilities.getMaxAnisotropy());
    this.paper.set(strategic, this.fogMesh.visible);
    this.renderer.autoClear = strategic >= 1;
    this.renderer.render(this.paper.scene, cam);
    this.renderer.autoClear = true;
  }
}
