/**
 * Mỏ tài nguyên trên bản đồ (BẢN NHẸ): mỏ Sắt (bãi quặng) và giàn Dầu (tháp khoan + bồn).
 * Không thuộc phe nào cố định: vòng cờ dưới chân đổi màu theo chủ sở hữu hiện tại.
 */
import * as THREE from "three";
import type { Res, Side } from "../../sim/content";
import { box, cyl, group, palette, sphere } from "./kit";

export interface NodeRig {
  root: THREE.Group;
  setOwner(owner: Side | -1): void;
  /** Phần trữ lượng còn lại (0..1): quặng vơi dần. */
  setAmount(frac: number): void;
  update(dt: number, t: number): void;
}

const OWNER_COLOR: Record<string, number> = { "-1": 0xb9c0cc, "0": 0x2e9eff, "1": 0xf23d3d };

let mats: { rock: THREE.MeshStandardMaterial; ore: THREE.MeshStandardMaterial; oil: THREE.MeshStandardMaterial } | null = null;

/** Một khối của bãi tài nguyên (theo tâm bãi): vị trí khối và hướng xe đỗ (mũi vào khối). */
export interface FieldDeposit {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

/**
 * BÃI TÀI NGUYÊN (người dùng 12/11/2026): vòng chủ sở hữu bán kính `radius` m, cột cờ ở tâm, và mỗi khối quặng / giếng ở đúng ô
 * của nó (sim: Mine.spots). Sắt: cụm đá + tinh thể quặng (thấp dần khi vơi). Dầu: đầu giếng có cần bơm gật gù, xoay theo
 * hướng xe đỗ. Gốc mô hình đặt ở tâm bãi, mặt đất y = 0.
 */
export function buildField(res: Res, deposits: readonly FieldDeposit[], radius: number): NodeRig {
  mats ??= {
    rock: new THREE.MeshStandardMaterial({ color: 0x6c645c, roughness: 0.95, flatShading: true }),
    ore: new THREE.MeshStandardMaterial({ color: 0x8fb4d9, roughness: 0.35, metalness: 0.7, emissive: 0x1b3550, emissiveIntensity: 0.6, flatShading: true }),
    oil: new THREE.MeshStandardMaterial({ color: 0x241b2e, roughness: 0.2, metalness: 0.4, flatShading: true })
  };
  const p = palette("lam");
  const root = group();
  const ringMat = new THREE.MeshBasicMaterial({ color: OWNER_COLOR["-1"], transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.35, radius, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);
  const flagMat = new THREE.MeshStandardMaterial({ color: OWNER_COLOR["-1"], roughness: 0.6, flatShading: true });
  // cột cờ chủ sở hữu ở tâm bãi; tâm có khối thì cắm vào khe giữa hai khối gần tâm nhất
  let fx = 0;
  let fz = 0;
  const near = [...deposits].sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z));
  if (near.length >= 2 && near[0].x * near[0].x + near[0].z * near[0].z < 2.25) {
    fx = (near[0].x + near[1].x) / 2;
    fz = (near[0].z + near[1].z) / 2;
  }
  root.add(cyl(0.06, 0.06, 3.2, p.metal, 6, fx, 1.6, fz), box(0.9, 0.5, 0.04, flagMat, fx + 0.45, 2.9, fz));
  const scaled: THREE.Object3D[] = [];
  const beams: THREE.Object3D[] = [];
  deposits.forEach((d, i) => {
    const g = group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = Math.atan2(d.fx, d.fz);
    if (res === "iron") {
      for (const [x, z, s] of [[0, 0, 0.85], [0.6, 0.35, 0.5], [-0.55, 0.3, 0.55], [0.15, -0.6, 0.5]] as const) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mats!.rock);
        rock.position.set(x, s * 0.45, z);
        rock.rotation.set(x * 2 + i, z * 3, s + i);
        rock.castShadow = rock.receiveShadow = true;
        g.add(rock);
      }
      const crystals = group();
      for (const [x, z, h] of [[0.1, 0.2, 1.1], [-0.35, 0.05, 0.8], [0.4, -0.25, 0.85]] as const) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 5), mats!.ore);
        c.position.set(x, 0.6 + h * 0.4, z);
        c.rotation.set(x * 0.5, 0, z * 0.6);
        c.castShadow = true;
        crystals.add(c);
      }
      g.add(crystals);
      scaled.push(crystals);
    } else {
      // đầu giếng Dầu: bệ, khung chữ A, cần bơm gật gù, ống nối
      g.add(box(1.7, 0.25, 1.7, p.concreteDark, 0, 0.125, 0));
      g.add(box(0.12, 1.3, 0.12, p.metal, -0.25, 0.9, 0), box(0.12, 1.3, 0.12, p.metal, 0.25, 0.9, 0));
      const beam = group(box(0.14, 0.14, 1.9, p.metal), box(0.3, 0.45, 0.25, p.metal, 0, -0.2, -0.95), box(0.35, 0.35, 0.35, mats!.oil, 0, 0, 0.85));
      beam.position.y = 1.6;
      g.add(beam);
      beams.push(beam);
      const tank = cyl(0.32, 0.32, 0.7, mats!.oil, 10, 0.55, 0.6, 0.55);
      g.add(tank);
      scaled.push(tank);
    }
    root.add(g);
  });
  return {
    root,
    setOwner(owner) {
      const c = OWNER_COLOR[String(owner)] ?? OWNER_COLOR["-1"]!;
      ringMat.color.setHex(c);
      flagMat.color.setHex(c);
    },
    setAmount(frac) {
      const k = 0.25 + 0.75 * Math.max(0, Math.min(1, frac));
      for (const o of scaled) o.scale.set(1, k, 1);
    },
    update(_dt, t) {
      beams.forEach((b, i) => (b.rotation.x = Math.sin(t * 1.6 + i * 1.3) * 0.28));
    }
  };
}

export function buildNode(res: Res): NodeRig {
  mats ??= {
    rock: new THREE.MeshStandardMaterial({ color: 0x6c645c, roughness: 0.95, flatShading: true }),
    ore: new THREE.MeshStandardMaterial({ color: 0x8fb4d9, roughness: 0.35, metalness: 0.7, emissive: 0x1b3550, emissiveIntensity: 0.6, flatShading: true }),
    oil: new THREE.MeshStandardMaterial({ color: 0x241b2e, roughness: 0.2, metalness: 0.4, flatShading: true })
  };
  const p = palette("lam");
  const root = group();
  const ringMat = new THREE.MeshBasicMaterial({ color: OWNER_COLOR["-1"], transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.75, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);
  const flagMat = new THREE.MeshStandardMaterial({ color: OWNER_COLOR["-1"], roughness: 0.6, flatShading: true });
  const scaled: THREE.Object3D[] = [];
  let spin: THREE.Object3D | null = null;
  let beam: THREE.Object3D | null = null;

  if (res === "iron") {
    for (const [x, z, s] of [[0, 0, 1.3], [1.2, 0.7, 0.8], [-1.1, 0.5, 0.9], [0.3, -1.2, 0.85], [-0.6, -0.9, 0.6]] as const) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mats.rock);
      rock.position.set(x, s * 0.45, z);
      rock.rotation.set(x * 2, z * 3, s);
      rock.castShadow = rock.receiveShadow = true;
      root.add(rock);
    }
    const crystals = group();
    for (const [x, z, h] of [[0.2, 0.3, 1.6], [-0.5, 0.1, 1.1], [0.6, -0.4, 1.2], [-0.1, -0.6, 0.9], [0.9, 0.5, 0.8]] as const) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, h, 5), mats.ore);
      c.position.set(x, 0.9 + h * 0.4, z);
      c.rotation.set(x * 0.5, 0, z * 0.6);
      c.castShadow = true;
      crystals.add(c);
    }
    root.add(crystals);
    scaled.push(crystals);
    // cột cờ chủ sở hữu
    root.add(cyl(0.04, 0.04, 2.4, p.metal, 5, 2.2, 1.2, -1.6), box(0.7, 0.4, 0.03, flagMat, 2.55, 2.2, -1.6));
  } else {
    // giàn khoan Dầu: sàn, tháp khoan lưới, bồn chứa, đèn
    root.add(box(3.6, 0.3, 3.6, p.concreteDark, 0, 0.15, 0));
    const H = 4.2;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const leg = box(0.1, H, 0.1, p.metal, x * 0.55, H / 2 + 0.3, z * 0.55);
      leg.rotation.z = x * 0.1;
      leg.rotation.x = -z * 0.1;
      root.add(leg);
    }
    for (let i = 1; i <= 3; i++) {
      const y = 0.3 + (i / 4) * H;
      const s = 0.62 * (1 - (i / 4) * 0.55);
      root.add(box(s * 2, 0.05, 0.05, p.metal, 0, y, s), box(s * 2, 0.05, 0.05, p.metal, 0, y, -s), box(0.05, 0.05, s * 2, p.metal, s, y, 0), box(0.05, 0.05, s * 2, p.metal, -s, y, 0));
    }
    root.add(box(0.5, 0.3, 0.5, flagMat, 0, H + 0.45, 0));
    spin = group(box(0.9, 0.1, 0.1, p.metal), cyl(0.06, 0.06, 1.2, p.metal, 6, 0, -0.6, 0));
    spin.position.y = 1.4;
    root.add(spin);
    const tank = cyl(0.75, 0.75, 1.5, mats.oil, 14, -1.1, 1.05, 1.0);
    root.add(tank, cyl(0.77, 0.77, 0.15, flagMat, 14, -1.1, 1.5, 1.0));
    scaled.push(tank);
    const lamp = sphere(0.1, p.warning, 0, H + 0.75, 0, 6);
    root.add(lamp);
    beam = lamp;
  }

  return {
    root,
    setOwner(owner) {
      const c = OWNER_COLOR[String(owner)] ?? OWNER_COLOR["-1"]!;
      ringMat.color.setHex(c);
      flagMat.color.setHex(c);
    },
    setAmount(frac) {
      const k = 0.25 + 0.75 * Math.max(0, Math.min(1, frac));
      for (const o of scaled) o.scale.set(1, k, 1);
    },
    update(dt, t) {
      if (spin) spin.rotation.y += dt * 1.8;
      if (beam) beam.visible = Math.sin(t * 4) > 0;
    }
  };
}
