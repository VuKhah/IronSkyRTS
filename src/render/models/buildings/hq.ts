/**
 * Tổng Hành Dinh, bản 2 (09/11/2026): mẫu phong cách cho mọi công trình.
 * Phong cách người dùng chốt: căn cứ công nghiệp quân sự (bê tông, thép, ống dẫn), nóc mang màu phe, hình khối nhận ra ngay
 * từ trên cao. Giữ chân đế theo luật, làm cao và chi tiết hơn; chi tiết nào cũng có lý do theo công năng:
 * - Nhận hàng: khối hầm bê tông vát có cổng dỡ hàng vừa Xe Vận Tải (rộng 2,46 m, cao 2,94 m); sau nhà có bồn Dầu và phễu Sắt.
 * - Chỉ huy: tháp thép lùi về sau, trên cùng là đài kính xòe ra, radar quay, ăng-ten.
 * - Tự vệ: pháo kép trên mái hầm, nhìn thẳng ra cổng. Phát điện nền: trạm biến áp bên hông.
 * Từ trên cao: viền mái hầm và nóc đài màu phe, 2 chữ V trắng chỉ về phía cổng.
 * Bộ phận động: radar, tháp pháo, nòng; còn lại đứng yên nên được gộp gần như miễn phí.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, muzzleFlash, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, POWER, rig, foundation, groundRing, blinker, turretUpdate, type AimRef } from "./shared";

type P3 = [number, number, number];

/** Mặt cắt chữ nhật vát 4 góc (nhìn từ trên) ở độ cao y. */
const oct = (hx: number, hz: number, c: number, y: number, cz = 0): P3[] => {
  const pts: P3[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) pts.push([sx * (hx - c), y, cz + sz * hz], [sx * hx, y, cz + sz * (hz - c)]);
  return pts;
};

/** Thanh nối hai điểm (ống dẫn, thanh giằng, ăng-ten). */
const strut = (a: P3, b: P3, r: number, mat: THREE.Material): THREE.Mesh => {
  const m = cyl(r, r, 1, mat, 6);
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.scale.y = A.distanceTo(B);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
};

const BASE_Y = 0.25; // mặt nền móng
const BUNKER_TOP = 3.2;
const ROOF_Y = 3.42; // mặt mái hầm
const BUNKER_Z = 0.2;
const TOWER_Z = -0.45;

export function buildHQ(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS.hq.half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);

  // ================================================================ 1. KHỐI HẦM BÊ TÔNG
  add(part("Khối hầm bê tông", facets([...oct(2.75, 2.45, 0.55, BASE_Y, BUNKER_Z), ...oct(2.35, 2.05, 0.45, BUNKER_TOP, BUNKER_Z)], p.concrete)));
  add(part("Viền mái hầm (màu phe)", facets([...oct(2.5, 2.2, 0.5, 3.18, BUNKER_Z), ...oct(2.5, 2.2, 0.5, 3.34, BUNKER_Z)], p.team)));
  add(part("Mái hầm", facets([...oct(2.2, 1.9, 0.4, 3.34, BUNKER_Z), ...oct(2.2, 1.9, 0.4, ROOF_Y, BUNKER_Z)], p.concreteDark)));
  for (const sx of [-1, 1]) {
    for (const z of [-1.3, 1.5]) {
      const w = 0.24;
      const pts: P3[] = [[2.45, BASE_Y, z - w], [2.45, BASE_Y, z + w], [3.12, BASE_Y, z - w], [3.12, BASE_Y, z + w], [2.4, 2.9, z - w], [2.4, 2.9, z + w]];
      add(part("Trụ chống bê tông", facets(pts.map(([x, y, zz]): P3 => [sx * x, y, zz]), p.concreteDark)));
    }
    // lỗ châu mai trên vách vát: vách nghiêng 0,135 rad nên tấm nghiêng theo
    const slit = part("Lỗ châu mai", box(0.06, 0.34, 1.1, p.hullDark, sx * 2.49, 2.3, 0.15));
    slit.rotation.z = sx * 0.135;
    add(slit);
  }
  // sau nhà: 3 lỗ thông gió
  for (const x of [-1, 0, 1]) add(part("Lỗ thông gió", box(0.6, 0.3, 0.06, p.hullDark, x, 2.4, BUNKER_Z - 2.14)));

  // ================================================================ 2. CỔNG DỠ HÀNG (vừa Xe Vận Tải)
  const DOOR_W = 2.9;
  const DOOR_H = 3.0;
  const front = 2.95;
  add(part("Khối cổng", box(DOOR_W + 0.7, 3.3, 1.1, p.hull, 0, BASE_Y + 1.65, front - 0.55)));
  add(part("Cửa khoang dỡ hàng", box(DOOR_W, DOOR_H, 0.06, p.hullDark, 0, BASE_Y + DOOR_H / 2, front + 0.02)));
  for (let i = 0; i < 7; i++) add(part("Nan cửa", box(DOOR_W - 0.1, 0.04, 0.03, p.metal, 0, BASE_Y + 0.35 + i * 0.4, front + 0.06)));
  for (let i = 0; i < 9; i++) add(part("Sọc cảnh báo", box(0.38, 0.2, 0.04, i % 2 ? p.hullDark : p.warning, -1.52 + i * 0.38, BASE_Y + 3.14, front + 0.02)));
  for (const sx of [-1, 1]) add(part("Khung cổng", box(0.2, 3.3, 0.14, p.metal, sx * (DOOR_W / 2 + 0.12), BASE_Y + 1.65, front + 0.02)));
  add(part("Dốc xe vào", box(DOOR_W, 0.06, HZ - front, p.concreteDark, 0, BASE_Y + 0.03, (HZ + front) / 2)));
  for (const sx of [-1, 1]) add(part("Vạch dẫn xe", box(0.14, 0.02, HZ - front, p.warning, sx * (DOOR_W / 2 - 0.1), BASE_Y + 0.07, (HZ + front) / 2)));

  // ================================================================ 3. THÁP CHỈ HUY + ĐÀI KÍNH
  add(part("Tháp chỉ huy", facets([...oct(1.75, 1.35, 0.4, ROOF_Y, TOWER_Z), ...oct(1.6, 1.2, 0.35, 5.4, TOWER_Z)], p.hull)));
  const towerFront = TOWER_Z + 1.28;
  for (const y of [4.0, 4.75])
    for (const x of [-0.8, 0.8]) add(part("Cửa sổ tháp", box(0.62, 0.3, 0.05, p.glass, x, y, towerFront)));
  add(part("Sọc đứng tháp (màu phe)", box(0.4, 1.9, 0.05, p.team, 0, 4.4, towerFront)));
  for (const sx of [-1, 1])
    for (const y of [4.0, 4.75]) add(part("Cửa sổ tháp", box(0.05, 0.3, 1.1, p.glass, sx * 1.67, y, TOWER_Z)));
  add(part("Sàn đài", facets([...oct(1.75, 1.35, 0.4, 5.4, TOWER_Z), ...oct(1.75, 1.35, 0.4, 5.56, TOWER_Z)], p.hullDark)));
  const glassLow = oct(1.55, 1.15, 0.35, 5.56, TOWER_Z);
  const glassHigh = oct(1.95, 1.55, 0.45, 6.55, TOWER_Z);
  add(part("Đài kính chỉ huy", facets([...glassLow, ...glassHigh], p.glass)));
  glassLow.forEach((a, i) => add(part("Khung kính", strut(a, glassHigh[i]!, 0.035, p.metal))));
  add(part("Nóc đài (màu phe)", facets([...oct(2.05, 1.65, 0.48, 6.55, TOWER_Z), ...oct(2.05, 1.65, 0.48, 6.75, TOWER_Z)], p.team)));
  add(part("Mặt nóc đài", facets([...oct(1.6, 1.2, 0.38, 6.75, TOWER_Z), ...oct(1.5, 1.1, 0.34, 6.92, TOWER_Z)], p.hullDark)));
  // 2 chữ V trắng chỉ về phía cổng: nhìn từ trên biết ngay đây là Tổng Hành Dinh và mặt trước ở đâu
  for (const z of [0.2, 0.62])
    for (const sx of [-1, 1]) {
      const bar = part("Chữ V nóc đài (trắng)", box(0.16, 0.03, 0.82, p.white, sx * 0.27, 6.94, TOWER_Z + z));
      bar.rotation.y = -sx * 0.82;
      add(bar);
    }

  // ================================================================ 4. RADAR, ĂNG-TEN, ĐÈN HIỆU
  const MAST_Z = TOWER_Z - 0.6;
  add(part("Cột radar", cyl(0.07, 0.11, 1.7, p.metal, 8, 0, 7.77, MAST_Z)));
  const radar = part("Radar", group(box(0.3, 0.3, 0.3, p.hullDark, 0, 0, 0)));
  radar.position.set(0, 8.7, MAST_Z);
  const tilt = group(part("Khung radar", box(2.1, 0.74, 0.1, p.hullDark, 0, 0.1, 0.18)), part("Mặt radar", box(1.92, 0.58, 0.03, p.teamGlow, 0, 0.1, 0.24)));
  tilt.rotation.x = -0.25;
  radar.add(tilt);
  add(radar);
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const sx of [-1, 1]) {
    add(part("Ăng-ten roi", cyl(0.02, 0.04, 2.7, p.metal, 5, sx * 1.15, 8.27, TOWER_Z - 0.75)));
    add(part("Đèn hiệu", sphere(0.11, lamp, sx * 1.15, 9.68, TOWER_Z - 0.75, 8)));
  }

  // ================================================================ 5. HẬU CẦN SAU NHÀ, TRẠM BIẾN ÁP
  // bồn Dầu nằm ngang trên 2 giá đỡ, ống dẫn vào hầm
  const TANK_Z = -2.85;
  add(part("Bồn Dầu", cyl(0.5, 0.5, 2.3, p.hull, 14, -1.55, 0.95, TANK_Z).rotateZ(Math.PI / 2)));
  for (const x of [-2.25, -0.85]) {
    add(part("Giá đỡ bồn", box(0.16, 0.5, 0.9, p.hullDark, x, 0.5, TANK_Z)));
    add(part("Đai bồn (màu phe)", cyl(0.52, 0.52, 0.1, p.team, 14, x, 0.95, TANK_Z).rotateZ(Math.PI / 2)));
  }
  add(part("Ống dẫn Dầu", strut([-1.55, 1.42, TANK_Z], [-1.55, 1.42, -2.0], 0.07, p.metal)));
  // phễu Sắt trên 4 chân, máng đổ vào hầm
  const HOP_X = 1.6;
  const hop: P3[] = [[0.85, 2.3, 0.5], [0.85, 2.3, -0.5], [-0.85, 2.3, 0.5], [-0.85, 2.3, -0.5], [0.3, 1.25, 0.22], [0.3, 1.25, -0.22], [-0.3, 1.25, 0.22], [-0.3, 1.25, -0.22]];
  add(part("Phễu Sắt", facets(hop.map(([x, y, z]): P3 => [HOP_X + x, y, TANK_Z + 0.02 + z]), p.hullDark)));
  add(part("Miệng phễu (màu phe)", box(1.78, 0.08, 1.08, p.team, HOP_X, 2.32, TANK_Z + 0.02)));
  add(part("Sắt trong phễu", box(1.5, 0.05, 0.8, p.metal, HOP_X, 2.37, TANK_Z + 0.02)));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(part("Chân phễu", strut([HOP_X + sx * 0.75, BASE_Y, TANK_Z + sz * 0.42], [HOP_X + sx * 0.75, 2.3, TANK_Z + sz * 0.42], 0.05, p.metal)));
  add(part("Máng đổ", strut([HOP_X, 1.25, TANK_Z + 0.2], [HOP_X, 1.02, -2.1], 0.14, p.hullDark)));
  // trạm biến áp bên phải (phát điện nền), ống dẫn dọc vách trái
  const TX = 2.95;
  add(part("Trạm biến áp", box(0.62, 1.1, 1.2, p.hullDark, TX, BASE_Y + 0.55, 0.1)));
  add(part("Vạch trạm điện", box(0.03, 0.14, 1.0, p.warning, TX + 0.32, 1.45, 0.1)));
  for (const z of [-0.3, 0.1, 0.5]) add(part("Sứ cách điện", group(cyl(0.05, 0.09, 0.42, p.white, 8, TX, 1.6, z), sphere(0.06, p.teamGlow, TX, 1.86, z, 6))));
  for (const y of [0.85, 1.25]) add(part("Ống dẫn", strut([-2.86, y, -0.8], [-2.86, y, 1.05], 0.06, p.metal)));
  for (const z of [-0.5, 0.75]) add(part("Kẹp ống", box(0.18, 0.62, 0.1, p.hullDark, -2.82, 1.05, z)));

  // ================================================================ 6. PHÁO KÉP TỰ VỆ TRÊN MÁI HẦM
  const turret = part(
    "Pháo kép tự vệ",
    group(
      part("Vành tháp", cyl(0.72, 0.82, 0.22, p.hullDark, 12, 0, 0.11, 0)),
      part("Thân tháp", facets([[0.55, 0.22, 0.7], [0.55, 0.22, -0.65], [0.45, 0.78, 0.5], [0.45, 0.78, -0.6]], p.hull, true)),
      part("Nóc tháp (màu phe)", box(0.7, 0.04, 0.8, p.team, 0, 0.8, -0.05))
    )
  );
  turret.position.set(0, ROOF_Y, 1.55);
  const gun = part("Cụm nòng", group(part("Bệ nòng", box(0.85, 0.42, 0.25, p.hullDark, 0, 0, 0))));
  gun.position.set(0, 0.5, 0.65);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.2, 0.2]) {
    const b = part("Nòng pháo", tubeZ(0.085, 0.085, 1.4, p.metal, 8));
    b.position.set(x, 0, 0.7);
    const f = muzzleFlash(0.6, p.flash);
    f.position.set(x, 0, 1.55);
    gun.add(b, f);
    flashes.push(f);
  }
  turret.add(gun);
  add(turret);

  const ring = groundRing(p, 6.2, "power");
  add(ring.mesh);
  const w = BUILDINGS.hq.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, POWER],
    7.2,
    [(dt, _t, a) => a.has("work") && (radar.rotation.y += dt * 1.4), blinker(lamp, 5), turretUpdate(turret, gun, flashes, w.cooldown, 0.1, 1.2, aim), ring.update],
    ["work"],
    aim
  );
}
