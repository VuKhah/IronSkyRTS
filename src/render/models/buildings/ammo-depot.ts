/**
 * Kho Đạn & Trạm Đường Ray, bản 2 (09/11/2026), chân đế cỡ vừa 4,8 × 6,4 m, theo phong cách của Tổng Hành Dinh.
 * Hầm chứa bê tông mái vòm màu phe, cửa chống nổ, biển cảnh báo; đường ray ra sân trước, xe goòng chở đạn chạy ra chạy vào
 * (đầy khi ra, rỗng khi về). Bộ phận động: xe goòng, thùng đạn.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, part, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, oct, BASE_Y } from "./shared";

const ZC = -1.15;
const HALL_HZ = 1.85;
const WALL_TOP = 2.5;
const ROOF_R = 1.95;

export function buildAmmoDepot(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["ammo-depot"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const front = ZC + HALL_HZ;

  // ================================================================ 1. HẦM CHỨA
  add(part("Hầm chứa bê tông", facets([...oct(2.2, HALL_HZ + 0.1, 0.4, BASE_Y, ZC), ...oct(2.0, HALL_HZ, 0.34, WALL_TOP, ZC)], p.concrete)));
  const roof = part("Mái vòm (màu phe)", new THREE.Mesh(new THREE.CylinderGeometry(ROOF_R, ROOF_R, HALL_HZ * 2, 20, 1, false, Math.PI / 2, Math.PI), p.team));
  roof.castShadow = roof.receiveShadow = true;
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, WALL_TOP, ZC);
  roof.scale.z = 0.5; // sau khi xoay, trục z cục bộ là chiều cao vòm: vòm thấp, không phải nửa trụ tròn
  add(roof);
  for (const dz of [-1.3, 0, 1.3]) {
    const rib = part("Đai mái", new THREE.Mesh(new THREE.CylinderGeometry(ROOF_R + 0.04, ROOF_R + 0.04, 0.14, 20, 1, true, Math.PI / 2, Math.PI), p.hullDark));
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, WALL_TOP, ZC + dz);
    rib.scale.z = 0.5;
    add(rib);
  }
  add(part("Cửa chống nổ", box(1.9, 1.9, 0.1, p.metal, 0, BASE_Y + 0.95, front + 0.1)));
  add(part("Khe cửa", box(0.05, 1.9, 0.12, p.hullDark, 0, BASE_Y + 0.95, front + 0.11)));
  for (let i = 0; i < 7; i++) add(part("Sọc cảnh báo", box(0.34, 0.2, 0.06, i % 2 ? p.hullDark : p.warning, -1.02 + i * 0.34, BASE_Y + 2.02, front + 0.08)));
  // biển báo vật liệu nổ: hình thoi vàng trên hai vách hông
  for (const sx of [-1, 1]) {
    const sign = part("Biển vật liệu nổ", box(0.05, 0.56, 0.56, p.warning, sx * 2.14, 1.5, ZC));
    sign.rotation.x = Math.PI / 4;
    add(sign);
  }
  // cột thu lôi hai góc sau (kho đạn sợ sét)
  for (const sx of [-1, 1]) add(part("Cột thu lôi", cyl(0.025, 0.06, 3.1, p.metal, 5, sx * 2.1, BASE_Y + 1.55, -HZ + 0.25)));
  add(part("Ống thông gió", group(cyl(0.2, 0.24, 1.0, p.metal, 8, 1.3, WALL_TOP + 0.3, ZC - 1.1), cyl(0.28, 0.28, 0.08, p.hullDark, 8, 1.3, WALL_TOP + 0.84, ZC - 1.1))));

  // ================================================================ 2. ĐƯỜNG RAY, XE GOÒNG, THÙNG ĐẠN
  const railZ0 = front;
  const railLen = HZ - railZ0;
  const railMid = railZ0 + railLen / 2;
  for (const x of [-0.42, 0.42]) add(part("Ray", box(0.08, 0.1, railLen, p.metal, x, BASE_Y + 0.12, railMid)));
  for (let i = 0; i < 6; i++) add(part("Tà vẹt", box(1.2, 0.06, 0.2, p.wood, 0, BASE_Y + 0.04, railZ0 + 0.2 + i * ((railLen - 0.4) / 5))));
  for (const [x, z, s] of [[-1.7, 1.55, 0.6], [-1.15, 1.75, 0.5], [-1.65, 2.2, 0.55], [1.7, 1.6, 0.6], [1.6, 2.3, 0.5]] as const) add(part("Thùng đạn", group(box(s, s, s, p.wood, x, BASE_Y + s / 2, z), box(s + 0.02, 0.06, s + 0.02, p.team, x, BASE_Y + s, z))));

  const cart = part("Xe goòng", group(box(1.05, 0.34, 1.2, p.hullDark, 0, 0.55, 0), part("Thùng đạn trên xe", box(0.76, 0.42, 0.76, p.wood, 0, 0.92, 0)), box(0.78, 0.06, 0.78, p.team, 0, 1.15, 0)));
  for (const x of [-0.42, 0.42])
    for (const z of [-0.42, 0.42]) {
      const w = part("Bánh goòng", cyl(0.15, 0.15, 0.07, p.metal, 10, x, 0.42, z));
      w.rotation.z = Math.PI / 2;
      cart.add(w);
    }
  add(cart);
  const crate = cart.children[1]!;
  const lid = cart.children[2]!;
  const CART_MIN = front + 0.5;
  const CART_MAX = HZ - 0.65;
  let s = 0;
  return rig(root, [WORK], 6.2, [
    (dt, _t, a) => {
      if (a.has("work")) s += dt * 0.25;
      const k = 0.5 - 0.5 * Math.cos(s * Math.PI * 2);
      cart.position.z = CART_MIN + k * (CART_MAX - CART_MIN);
      // đi ra thì chở đạn, quay về thì thùng rỗng
      const loaded = Math.sin(s * Math.PI * 2) >= 0;
      crate.visible = loaded;
      lid.visible = loaded;
    }
  ]);
}
