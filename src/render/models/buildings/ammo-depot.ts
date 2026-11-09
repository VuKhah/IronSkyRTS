import * as THREE from "three";
import { box, cyl, group, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation } from "./shared";

export function buildAmmoDepot(p: Palette): Rig {
  const root = group(foundation(p, 5.4, 4.4));
  root.add(box(4, 1.6, 3.2, p.hull, 0, 1.05, -0.4));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 4.04, 14, 1, false, 0, Math.PI), p.team);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, 1.85, -0.4);
  roof.scale.set(1, 1, 0.45);
  roof.castShadow = true;
  root.add(roof, box(1.4, 1.2, 0.08, p.metal, 0, 0.85, 1.22), box(1.5, 0.1, 0.1, p.warning, 0, 1.5, 1.24));
  for (const [x, z] of [[-2.2, 1.5], [-1.7, 1.6], [-2.0, 1.1]] as const) root.add(box(0.45, 0.45, 0.45, p.wood, x, 0.48, z));
  // đường ray: 2 thanh thép + tà vẹt gỗ, chạy ra khỏi kho
  const len = 7;
  const rail = group();
  for (const x of [-0.35, 0.35]) rail.add(box(0.07, 0.1, len, p.metal, x, 0.32, 0));
  for (let i = 0; i < 14; i++) rail.add(box(1.0, 0.06, 0.18, p.wood, 0, 0.26, -len / 2 + 0.25 + i * 0.5));
  rail.position.set(0, 0, 1.2 + len / 2 - 0.4);
  root.add(rail);
  const cart = group(box(0.85, 0.3, 1.0, p.hullDark, 0, 0.55, 0), box(0.6, 0.35, 0.6, p.wood, 0, 0.88, 0), box(0.62, 0.06, 0.62, p.team, 0, 1.07, 0));
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) {
    const w = cyl(0.12, 0.12, 0.06, p.metal, 8, x, 0.42, z);
    w.rotation.z = Math.PI / 2;
    cart.add(w);
  }
  root.add(cart);
  const crate = cart.children[1]!;
  let s = 0;
  return rig(root, [WORK], 4.8, [
    (dt, _t, a) => {
      if (a.has("work")) s += dt * 0.25;
      const k = 0.5 - 0.5 * Math.cos(s * Math.PI * 2);
      cart.position.z = 1.5 + k * (len - 1.6);
      // đi ra thì chở đạn, quay về thì thùng rỗng
      crate.visible = Math.sin(s * Math.PI * 2) >= 0;
    }
  ]);
}
