/**
 * Chiến trường 3D: renderer, ánh sáng, địa hình "Thung Lũng Sông Sắt", nước, cầu, đá, cây,
 * và lớp sương mù chiến tranh phủ lên địa hình.
 * Phần này chỉ để VẼ — được phép dùng Math.sin/Math.random vì không ảnh hưởng tới trận đấu.
 */
import * as THREE from "three";
import type { Side } from "../sim/content";
import { Rng } from "../sim/fmath";
import { BANK_HALF, CROSSINGS, crossingAt, fromUV, GRID, HILLS, HQ_POS, MAP_HALF, MINES, RIVER_HALF, ROCKS, terrainHeight, toU, toV } from "../sim/map";
import type { World } from "../sim/world";

const SIZE = 200;
const SEGS = 200;
const WATER_Y = -0.55;

export class BattleScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  private fogTex: THREE.DataTexture;
  private fogData: Uint8Array;
  private fogMesh: THREE.Mesh;
  private water: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
    this.sun.shadow.mapSize.set(2048, 2048);
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
      new THREE.PlaneGeometry(SIZE, SIZE),
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

    // Sương mù: một bản sao hình học địa hình, phủ màu tối với độ trong suốt lấy từ texture 80×80 ô.
    this.fogData = new Uint8Array(GRID * GRID * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, GRID, GRID, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    const fogGeo = terrainGeo.clone();
    const pos = fogGeo.getAttribute("position");
    const uv = fogGeo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + MAP_HALF) / (MAP_HALF * 2), (pos.getZ(i) + MAP_HALF) / (MAP_HALF * 2));
      pos.setY(i, pos.getY(i) + 0.25);
    }
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x04070c, transparent: true, alphaMap: this.fogTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.fogMesh = new THREE.Mesh(fogGeo, fogMat);
    this.fogMesh.renderOrder = 2;
    this.scene.add(this.fogMesh);
  }

  private buildTerrainGeometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
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
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let h = terrainHeight(x, z);
      // gợn nhỏ cho đất bớt phẳng lì (chỉ để nhìn)
      h += Math.sin(x * 0.37 + z * 0.11) * 0.08 + Math.sin(z * 0.29 - x * 0.17) * 0.07;
      pos.setY(i, h);
      const u = Math.abs(toU(x, z));
      const cr = crossingAt(toV(x, z));
      const noise = (Math.sin(x * 0.21) * Math.sin(z * 0.17) + 1) * 0.5;
      col.copy(grassA).lerp(grassB, noise);
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (h > 1.8) col.lerp(dry, Math.min(1, (h - 1.8) / 3));
      if (u < BANK_HALF + 1.5 && h < 0.4) col.copy(cr && cr.kind === "ford" ? gravel : sand);
      if (h < WATER_Y - 0.2) col.copy(bed);
      for (const r of ROCKS) {
        const d = Math.hypot(x - r.x, z - r.z);
        if (d < r.r + 1.2) col.copy(rock).lerp(cliff, noise);
      }
      if (e > 74) col.lerp(cliff, Math.min(1, (e - 74) / 6));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private addBridges(): void {
    const deck = new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3d434c, roughness: 0.5, metalness: 0.6 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffb547, roughness: 0.6 });
    for (const c of CROSSINGS) {
      if (c.kind !== "bridge") continue;
      const [x, z] = fromUV(0, c.v);
      const g = new THREE.Group();
      const len = (BANK_HALF + 1.5) * 2;
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
      for (const px of [-RIVER_HALF + 1, 0, RIVER_HALF - 1])
        for (const s of [-1, 1]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 3.2, 8), steel);
          pillar.position.set(px, -1.4, s * (w / 2 - 1));
          pillar.castShadow = true;
          g.add(pillar);
        }
      g.position.set(x, 0, z);
      g.rotation.y = Math.PI / 4;
      this.scene.add(g);
    }
  }

  private addRocks(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a736a, roughness: 0.95, flatShading: true });
    const rng = new Rng(99);
    for (const r of ROCKS) {
      for (let i = 0; i < 7; i++) {
        const s = r.r * (0.35 + rng.next() * 0.35);
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
        const a = rng.next() * Math.PI * 2;
        const d = rng.next() * r.r * 0.55;
        const x = r.x + Math.cos(a) * d;
        const z = r.z + Math.sin(a) * d;
        m.position.set(x, terrainHeight(x, z) + s * 0.2, z);
        m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
        m.scale.y = 0.8 + rng.next() * 0.6;
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
      }
    }
  }

  /** Rừng cây trang trí ở viền bản đồ và trên đồi (InstancedMesh: 1 lần vẽ cho hàng trăm cây). */
  private addTrees(): void {
    const rng = new Rng(7);
    const spots: { x: number; z: number; s: number }[] = [];
    const clear = (x: number, z: number): boolean => {
      for (const [hx, hz] of HQ_POS) if (Math.hypot(x - hx, z - hz) < 30) return false;
      for (const m of MINES) if (Math.hypot(x - m.x, z - m.z) < 12) return false;
      if (Math.abs(toU(x, z)) < BANK_HALF + 3) return false;
      return true;
    };
    for (let i = 0; i < 1600 && spots.length < 340; i++) {
      const x = (rng.next() * 2 - 1) * 96;
      const z = (rng.next() * 2 - 1) * 96;
      const e = Math.max(Math.abs(x), Math.abs(z));
      let ok = e > 70;
      for (const hl of HILLS) if (Math.hypot(x - hl.x, z - hl.z) < hl.r * 0.8) ok = ok || rng.next() < 0.5;
      if (!ok || !clear(x, z)) continue;
      spots.push({ x, z, s: 0.8 + rng.next() * 0.7 });
    }
    const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 4.2, 7), new THREE.MeshStandardMaterial({ color: 0x3b5e2b, roughness: 0.9, flatShading: true }), spots.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 5), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.9 }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    spots.forEach((p, i) => {
      const y = terrainHeight(p.x, p.z);
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
    HQ_POS.forEach(([x, z], s) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(20, 20.6, 64),
        new THREE.MeshBasicMaterial({ color: s === 0 ? 0x2e9eff : 0xf23d3d, transparent: true, opacity: 0.25, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, terrainHeight(x, z) + 0.12, z);
      this.scene.add(ring);
    });
  }

  /** Cập nhật lớp sương mù theo tầm nhìn của phe `viewer` (null = hiện tất cả). */
  updateFog(world: World, viewer: Side | null): void {
    this.fogMesh.visible = viewer !== null;
    if (viewer === null) return;
    const st = world.sides[viewer];
    const d = this.fogData;
    for (let i = 0; i < GRID * GRID; i++) {
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

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
  }

  render(cam: THREE.Camera): void {
    this.renderer.render(this.scene, cam);
  }
}
