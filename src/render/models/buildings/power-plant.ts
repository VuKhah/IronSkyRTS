import * as THREE from "three";
import { box, cyl, group, sphere, type Palette, type Rig } from "../kit";
import { WORK, POWER, rig, foundation, groundRing } from "./shared";

export function buildPowerPlant(p: Palette): Rig {
  const root = group(foundation(p, 6, 4.6));
  root.add(box(2.8, 1.8, 3.2, p.hull, 1.3, 1.15, 0), box(2.84, 0.2, 3.24, p.team, 1.3, 2.05, 0));
  // tháp giải nhiệt dạng hyperboloid (LatheGeometry: xoay một đường cong quanh trục Y)
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * 3.6;
    const r = 1.05 - 0.45 * Math.sin((i / 10) * Math.PI * 0.85);
    profile.push(new THREE.Vector2(r, y));
  }
  const tower = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), p.concrete);
  tower.material = p.concrete;
  tower.castShadow = tower.receiveShadow = true;
  tower.position.set(-1.4, 0.25, 0);
  root.add(tower, cyl(0.8, 0.8, 0.12, p.team, 18, -1.4, 3.45, 0));
  const coil = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const z of [-0.9, 0, 0.9]) root.add(cyl(0.22, 0.22, 0.6, coil, 8, 2.2, 2.4, z));
  const fan = group(box(1.2, 0.05, 0.18, p.metal), box(0.18, 0.05, 1.2, p.metal));
  fan.position.set(0.8, 2.2, 0.7);
  root.add(fan, cyl(0.68, 0.68, 0.1, p.hullDark, 16, 0.8, 2.12, 0.7));
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = sphere(0.45, p.smoke, -1.4, 3.8, 0, 8);
    s.castShadow = false;
    s.userData.phase = i / 6;
    puffs.push(s);
    root.add(s);
  }
  const ring = groundRing(p, 5.5, "power");
  root.add(ring.mesh);
  return rig(root, [WORK, POWER], 3.8, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) fan.rotation.y += dt * 9;
      coil.emissiveIntensity = on ? 1.2 + Math.sin(t * 6) * 0.6 : 0.3;
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.25 + (s.userData.phase as number)) % 1;
        s.position.set(-1.4 + k * 0.6, 3.8 + k * 2.6, k * 0.3);
        s.scale.setScalar(0.5 + k * 1.3);
        (s.material as THREE.MeshStandardMaterial).opacity = 0.55;
      }
    },
    ring.update
  ]);
}
