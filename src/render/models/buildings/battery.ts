import * as THREE from "three";
import { box, cyl, group, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation } from "./shared";

/** Trạm Tích Điện: dãy khối pin, cột chỉ báo sáng theo % pin, tia điện chạy khi nạp / xả. */
export function buildBattery(p: Palette): Rig {
  const root = group(foundation(p, 3.4, 3));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const x of [-0.95, 0, 0.95])
    for (const z of [-0.55, 0.55]) {
      root.add(box(0.8, 1.3, 0.85, p.hullDark, x, 0.95, z), box(0.82, 0.12, 0.87, p.team, x, 1.66, z), cyl(0.08, 0.08, 0.2, p.metal, 6, x - 0.2, 1.8, z), cyl(0.08, 0.08, 0.2, p.metal, 6, x + 0.2, 1.8, z));
    }
  // cột chỉ báo mức pin
  root.add(box(0.3, 1.6, 0.3, p.metal, 1.55, 1.05, 1.15));
  const level = box(0.22, 1.5, 0.22, glow, 1.55, 1.05, 1.17);
  level.geometry.translate(0, 0.75, 0);
  level.position.y = 0.3;
  root.add(level);
  const sparks = group();
  for (const x of [-0.95, 0, 0.95]) sparks.add(box(0.05, 0.05, 1.3, glow, x, 1.9, 0));
  root.add(sparks);
  let lv = 0;
  let target = 0;
  const r = rig(root, [WORK], 2.4, [
    (_dt, t, a) => {
      lv += (target - lv) * 0.1;
      level.scale.y = Math.max(0.03, lv);
      sparks.visible = a.has("work") && Math.sin(t * 18) > -0.2;
      glow.emissiveIntensity = 0.6 + lv * 1.6;
    }
  ]);
  r.setLevel = (k) => (target = Math.max(0, Math.min(1, k)));
  r.setLevel(0.7);
  return r;
}
