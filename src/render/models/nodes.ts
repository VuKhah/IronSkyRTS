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
