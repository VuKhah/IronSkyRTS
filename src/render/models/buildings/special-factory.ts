/**
 * Xưởng Xe Chuyên Dụng, bản 2 (09/11/2026), chân đế 8 × 8 m, theo phong cách của Tổng Hành Dinh.
 * Đúc xe phóng tên lửa và pháo nòng dài: nhà cao nhất nhóm xưởng, cửa cuốn rộng 4,6 m cao 5,3 m (Pháo Tự Hành rộng 4,2 m, cao 5,1 m).
 * Nét riêng: nóc thông gió màu phe chạy dọc, giàn phóng thử sau nóc ngóc lên khi đang đúc, giá nòng pháo bên hông.
 * Bộ phận động: cửa cuốn, giàn phóng thử.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, facets, group, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, blinker, oct, strut, BASE_Y } from "./shared";

const HALL = 3.0;
const ZC = -0.6;
const WALL_TOP = 6.9;
const ROOF_Y = 7.05;
const DOOR_W = 4.6;
const DOOR_H = 5.3;
const COL_H = WALL_TOP - BASE_Y - 1.2;
const COL_Y = BASE_Y + COL_H / 2;

export function buildSpecialFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["special-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const front = ZC + HALL;

  // ================================================================ 1. THÂN NHÀ XƯỞNG
  add(part("Vỏ thép nhà xưởng", facets([...oct(HALL, HALL, 0.3, BASE_Y, ZC), ...oct(HALL, HALL, 0.3, WALL_TOP, ZC)], p.hull)));
  add(part("Đai tường (màu phe)", facets([...oct(HALL + 0.03, HALL + 0.03, 0.3, 6.15, ZC), ...oct(HALL + 0.03, HALL + 0.03, 0.3, 6.4, ZC)], p.team)));
  for (const sx of [-1, 1]) {
    for (const dz of [-2.0, -0.7, 0.7, 2.0]) add(part("Cột thép", box(0.14, COL_H, 0.16, p.hullDark, sx * (HALL + 0.04), COL_Y, ZC + dz)));
    add(part("Dải cửa sổ", box(0.04, 0.55, 3.8, p.glass, sx * (HALL + 0.02), 5.3, ZC)));
    add(part("Cột thép", box(0.16, COL_H, 0.14, p.hullDark, sx * 2.72, COL_Y, front + 0.04)));
  }
  for (const x of [-2, -0.7, 0.7, 2]) add(part("Cột thép", box(0.16, COL_H, 0.14, p.hullDark, x, COL_Y, ZC - HALL - 0.04)));

  // ================================================================ 2. MÁI: viền màu phe, nóc thông gió chạy dọc nửa trước
  add(part("Viền mái (màu phe)", facets([...oct(HALL + 0.14, HALL + 0.14, 0.34, WALL_TOP, ZC), ...oct(HALL + 0.14, HALL + 0.14, 0.34, ROOF_Y, ZC)], p.team)));
  add(part("Mặt mái", facets([...oct(HALL - 0.2, HALL - 0.2, 0.26, ROOF_Y, ZC), ...oct(HALL - 0.2, HALL - 0.2, 0.26, ROOF_Y + 0.08, ZC)], p.concreteDark)));
  const VENT_Z = ZC + 1.1;
  add(part("Nóc thông gió", facets([...oct(1.3, 1.7, 0.2, ROOF_Y + 0.08, VENT_Z), ...oct(1.1, 1.5, 0.2, ROOF_Y + 1.0, VENT_Z)], p.hull)));
  for (const sx of [-1, 1]) add(part("Kính nóc thông gió", box(0.04, 0.5, 2.5, p.glass, sx * 1.22, ROOF_Y + 0.55, VENT_Z)));
  add(part("Nóc màu phe", facets([...oct(1.2, 1.6, 0.22, ROOF_Y + 1.0, VENT_Z), ...oct(1.2, 1.6, 0.22, ROOF_Y + 1.12, VENT_Z)], p.team)));
  for (const dz of [-0.6, 0.2, 1.0]) add(part("Chữ V nóc (trắng)", group(...[-1, 1].map((sx) => {
    const bar = box(0.13, 0.03, 0.8, p.white, sx * 0.3, ROOF_Y + 1.13, VENT_Z + dz);
    bar.rotation.y = -sx * 0.8;
    return bar;
  }))));

  // ================================================================ 3. CỬA CUỐN + SÂN RA XE
  const doorY = BASE_Y + DOOR_H / 2;
  add(part("Lòng xưởng", box(DOOR_W, DOOR_H, 0.05, p.hullDark, 0, doorY, front + 0.01)));
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  add(part("Đèn trong xưởng", box(DOOR_W - 0.5, 0.08, 0.03, lamp, 0, BASE_Y + DOOR_H - 0.3, front + 0.05)));
  const door = part("Cửa cuốn", group(box(DOOR_W, DOOR_H, 0.08, p.teamDark)));
  for (let i = 0; i < 11; i++) door.add(part("Nan cửa", box(DOOR_W - 0.08, 0.04, 0.03, p.metal, 0, -DOOR_H / 2 + 0.3 + i * 0.47, 0.055)));
  door.position.set(0, doorY, front + 0.09);
  add(door);
  for (const sx of [-1, 1]) add(part("Khung cửa", box(0.28, DOOR_H + 0.1, 0.34, p.hullDark, sx * (DOOR_W / 2 + 0.14), BASE_Y + DOOR_H / 2 + 0.05, front + 0.03)));
  for (let i = 0; i < 13; i++) add(part("Sọc cảnh báo", box(0.42, 0.28, 0.1, i % 2 ? p.hullDark : p.warning, -2.52 + i * 0.42, BASE_Y + DOOR_H + 0.2, front + 0.08)));
  const yard = HZ - front;
  add(part("Sân ra xe", box(DOOR_W, 0.06, yard, p.concreteDark, 0, BASE_Y + 0.03, front + yard / 2)));
  for (let i = 0; i < 6; i++) add(part("Vạch sân", box(0.3, 0.02, yard * 0.75, p.warning, -1.9 + i * 0.76, BASE_Y + 0.07, front + yard / 2)));
  for (const sx of [-1, 1]) add(part("Đèn cửa", sphere(0.13, lamp, sx * (DOOR_W / 2 + 0.14), BASE_Y + DOOR_H + 0.5, front + 0.12, 6)));

  // ================================================================ 4. GIÀN PHÓNG THỬ SAU NÓC (ngóc lên khi đúc)
  const RACK_Z = ZC - HALL + 0.25;
  const rack = part("Giàn phóng thử", group());
  rack.add(part("Thân giàn", box(2.3, 0.86, 2.2, p.hullDark, 0, 0.43, 1.1)), part("Nắp giàn (màu phe)", box(2.34, 0.1, 2.24, p.team, 0, 0.9, 1.1)));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const tube = part("Ống phóng", cyl(0.2, 0.2, 0.05, p.metal, 10, -0.78 + c * 0.52, 0.22 + r * 0.42, 2.22));
      tube.rotation.x = Math.PI / 2;
      rack.add(tube);
    }
  rack.position.set(0, ROOF_Y + 0.08, RACK_Z);
  add(rack, part("Bệ giàn phóng", box(2.5, 0.2, 0.5, p.metal, 0, ROOF_Y + 0.18, RACK_Z)));

  // ================================================================ 5. GIÁ NÒNG PHÁO (trái), GIAN KỸ THUẬT (phải)
  const RACK_X = -3.56;
  for (const z of [ZC - 1.6, ZC + 1.6]) add(part("Giá đỡ nòng", box(0.7, 1.5, 0.16, p.hullDark, RACK_X, BASE_Y + 0.75, z)));
  for (const [x, y] of [[RACK_X - 0.17, 0.75], [RACK_X + 0.17, 0.75], [RACK_X, 1.2]] as const) {
    const bar = part("Nòng pháo chờ lắp", tubeZ(0.14, 0.16, 4.4, p.metal, 10));
    bar.position.set(x, BASE_Y + y, ZC);
    add(bar);
    const band = part("Đai nòng (màu phe)", tubeZ(0.17, 0.17, 0.14, p.team, 10));
    band.position.set(x, BASE_Y + y, ZC + 1.9);
    add(band);
  }
  const AX = 3.5;
  const AZ = ZC - 1.0;
  add(part("Gian kỹ thuật", box(0.96, 3.4, 3.2, p.hullDark, AX, BASE_Y + 1.7, AZ)));
  add(part("Mái gian kỹ thuật (màu phe)", box(1.04, 0.12, 3.28, p.team, AX, BASE_Y + 3.46, AZ)));
  add(part("Cửa sổ gian kỹ thuật", box(0.04, 0.5, 2.1, p.glass, AX + 0.49, BASE_Y + 2.5, AZ)));
  add(part("Cửa gian kỹ thuật", box(0.04, 1.8, 0.7, p.hull, AX + 0.49, BASE_Y + 0.9, AZ + 1.0)));
  add(part("Ống thông gió", cyl(0.2, 0.24, 1.3, p.metal, 8, AX + 0.1, BASE_Y + 4.15, AZ - 0.9)));
  add(part("Ống dẫn", strut([AX - 0.3, BASE_Y + 3.0, AZ + 1.7], [AX - 0.3, WALL_TOP - 0.4, AZ + 1.7], 0.07, p.metal)));

  let doorT = 0;
  let rackT = 0;
  return rig(root, [WORK], 9.5, [
    (dt, _t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = doorY + doorT * DOOR_H * 0.425;
      door.scale.y = 1 - doorT * 0.85;
      rackT = approach(rackT, on ? 1 : 0, 1.5, dt);
      rack.rotation.x = -rackT * 0.7; // miệng ống phóng (phía +z) ngóc lên
    },
    blinker(lamp, 3)
  ]);
}
