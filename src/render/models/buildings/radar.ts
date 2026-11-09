import * as THREE from "three";
import { approach, box, cyl, group, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, blinker } from "./shared";

/** Trạm Radar: tháp lưới, chảo radar quay khi có điện, đèn báo. */
export function buildRadar(p: Palette): Rig {
  const root = group(cyl(1.6, 1.8, 0.3, p.concrete, 8, 0, 0.15, 0), box(1.6, 1.0, 1.6, p.hullDark, 0, 0.8, 0), box(1.64, 0.12, 1.64, p.team, 0, 1.3, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = box(0.1, 2.6, 0.1, p.metal, x * 0.5, 2.6, z * 0.5);
    leg.rotation.z = x * 0.12;
    leg.rotation.x = -z * 0.12;
    root.add(leg);
  }
  root.add(box(1.2, 0.1, 1.2, p.metal, 0, 3.9, 0));
  const head = group(cyl(0.12, 0.12, 0.6, p.metal, 6, 0, 0.3, 0));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), p.white);
  dish.rotation.x = -Math.PI / 2 - 0.35;
  dish.position.set(0, 1.0, 0.2);
  dish.castShadow = true;
  const feed = cyl(0.04, 0.04, 1.1, p.metal, 4, 0, 1.1, 0.75);
  feed.rotation.x = 1.2;
  head.add(dish, feed, sphere(0.1, p.teamGlow, 0, 1.25, 1.2, 6));
  head.position.y = 3.95;
  root.add(head);
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(sphere(0.1, lamp, 0.7, 1.45, 0.7, 6));
  let spin = 0;
  return rig(root, [WORK], 3, [
    (dt, _t, a) => {
      spin = approach(spin, a.has("work") ? 1.4 : 0, 2, dt);
      head.rotation.y += spin * dt;
    },
    blinker(lamp, 3)
  ]);
}
