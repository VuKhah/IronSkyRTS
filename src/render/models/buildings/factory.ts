/**
 * Xưởng Xe Tăng, bản 2 (09/11/2026), theo phong cách của Tổng Hành Dinh.
 * Giữ chân đế theo luật. Nhà xưởng cao, cửa cuốn đủ cho Titan (rộng 3,58 m, cao 3,35 m) mở khi đang đúc.
 * Từ trên cao: 3 răng cưa mái màu phe. Bộ phận động: cửa cuốn, dầm cầu trục, khói.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, blinker, strut, BASE_Y, type P3 } from "./shared";

const HALL_HX = 2.7;
const HALL_HZ = 2.3;
const ZC = -0.35;
const WALL_TOP = 5.2;
const DOOR_W = 3.9;
const DOOR_H = 4.3;

export function buildFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS.factory.half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const front = ZC + HALL_HZ;

  // ================================================================ 1. THÂN NHÀ XƯỞNG
  add(part("Bệ tường bê tông", box(HALL_HX * 2 + 0.1, 1.1, HALL_HZ * 2 + 0.1, p.concrete, 0, BASE_Y + 0.55, ZC)));
  add(part("Vỏ thép nhà xưởng", box(HALL_HX * 2, WALL_TOP - 1.35, HALL_HZ * 2, p.hull, 0, (WALL_TOP + 1.35) / 2, ZC)));
  add(part("Đai tường (màu phe)", box(HALL_HX * 2 + 0.04, 0.24, HALL_HZ * 2 + 0.04, p.team, 0, 5.0, ZC)));
  for (const sx of [-1, 1]) {
    for (const z of [-2.1, -0.7, 0.7, 2.1]) add(part("Cột thép", box(0.14, 3.7, 0.16, p.hullDark, sx * (HALL_HX + 0.04), 3.1, ZC + z)));
    add(part("Dải cửa sổ", box(0.04, 0.5, 3.6, p.glass, sx * (HALL_HX + 0.02), 4.05, ZC)));
    add(part("Cột thép", box(0.2, 3.7, 0.16, p.hullDark, sx * 2.45, 3.1, front + 0.04)));
  }
  for (const x of [-2, -0.7, 0.7, 2]) add(part("Cột thép", box(0.16, 3.7, 0.14, p.hullDark, x, 3.1, ZC - HALL_HZ - 0.04)));

  // ================================================================ 2. MÁI RĂNG CƯA: nhận ra từ trên cao
  const TOOTH_W = 1.8;
  const TOOTH_H = 0.95;
  const ZA = ZC - HALL_HZ;
  const ZB = ZC + HALL_HZ;
  for (let i = 0; i < 3; i++) {
    const x0 = -HALL_HX + i * TOOTH_W;
    const x1 = x0 + TOOTH_W;
    const wedge: P3[] = [];
    for (const z of [ZA, ZB]) wedge.push([x0, WALL_TOP, z], [x1, WALL_TOP, z], [x1, WALL_TOP + TOOTH_H, z]);
    add(part("Mái răng cưa", facets(wedge, p.hullDark)));
    // mặt mái dốc: 2 mảng màu phe dán sát mặt nghiêng, chừa dải tối giữa nhà để mái không xanh kín cả mặt
    const y = (x: number) => WALL_TOP + ((x - x0) / TOOTH_W) * TOOTH_H;
    for (const [za, zb] of [[ZA + 0.14, ZA + 1.5], [ZB - 1.5, ZB - 0.14]] as const) {
      const panel: P3[] = [];
      for (const z of [za, zb])
        for (const x of [x0 + 0.1, x1 - 0.08]) panel.push([x, y(x) + 0.01, z], [x, y(x) + 0.06, z]);
      add(part("Mặt mái (màu phe)", facets(panel, p.team)));
    }
    add(part("Dải kính lấy sáng", box(0.05, 0.72, HALL_HZ * 2 - 0.3, p.glass, x1 + 0.03, WALL_TOP + 0.44, ZC)));
  }

  // ================================================================ 3. CỬA CUỐN + SÂN RA XE
  const doorY = BASE_Y + DOOR_H / 2;
  add(part("Lòng xưởng", box(DOOR_W, DOOR_H, 0.05, p.hullDark, 0, doorY, front + 0.01)));
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  add(part("Đèn trong xưởng", box(DOOR_W - 0.5, 0.08, 0.03, lamp, 0, BASE_Y + DOOR_H - 0.3, front + 0.05)));
  const door = part("Cửa cuốn", group(box(DOOR_W, DOOR_H, 0.08, p.teamDark)));
  for (let i = 0; i < 9; i++) door.add(part("Nan cửa", box(DOOR_W - 0.08, 0.04, 0.03, p.metal, 0, -DOOR_H / 2 + 0.3 + i * 0.47, 0.055)));
  door.position.set(0, doorY, front + 0.09);
  add(door);
  for (const sx of [-1, 1]) add(part("Khung cửa", box(0.3, DOOR_H + 0.1, 0.34, p.hullDark, sx * (DOOR_W / 2 + 0.15), BASE_Y + DOOR_H / 2 + 0.05, front + 0.03)));
  for (let i = 0; i < 11; i++) add(part("Sọc cảnh báo", box(0.42, 0.28, 0.1, i % 2 ? p.hullDark : p.warning, -2.1 + i * 0.42, BASE_Y + DOOR_H + 0.2, front + 0.08)));
  const yard = HZ - front;
  add(part("Sân ra xe", box(DOOR_W, 0.06, yard, p.concreteDark, 0, BASE_Y + 0.03, front + yard / 2)));
  for (let i = 0; i < 5; i++) add(part("Vạch sân", box(0.3, 0.02, yard * 0.75, p.warning, -1.5 + i * 0.75, BASE_Y + 0.07, front + yard / 2)));

  // ================================================================ 4. CẦU TRỤC TRÊN NÓC
  const RAIL_Y = 6.75;
  for (const z of [ZA + 0.18, ZB - 0.18]) {
    add(part("Ray cầu trục", box(HALL_HX * 2 + 0.1, 0.16, 0.18, p.metal, 0, RAIL_Y, z)));
    for (const sx of [-1, 1]) add(part("Cột cầu trục", box(0.18, RAIL_Y - WALL_TOP, 0.18, p.hullDark, sx * (HALL_HX - 0.05), (RAIL_Y + WALL_TOP) / 2, z)));
  }
  const crane = part("Dầm cầu trục", group(box(0.2, 0.22, HALL_HZ * 2 - 0.1, p.warning), box(0.46, 0.3, 0.5, p.hullDark, 0, -0.24, 0.3), box(0.04, 0.34, 0.04, p.rubber, 0, -0.54, 0.3), box(0.18, 0.1, 0.18, p.metal, 0, -0.72, 0.3)));
  crane.position.set(0, RAIL_Y + 0.18, ZC);
  add(crane);

  // ================================================================ 5. ỐNG KHÓI, BÌNH KHÍ, ỐNG THÔNG GIÓ, ĐÈN CỬA
  const CH_X = 3.03;
  const CH_Z = -2.3;
  const CH_TOP = 8.2;
  add(part("Ống khói", cyl(0.27, 0.36, CH_TOP - BASE_Y, p.hullDark, 12, CH_X, (CH_TOP + BASE_Y) / 2, CH_Z)));
  add(part("Đai ống khói (màu phe)", cyl(0.31, 0.31, 0.26, p.team, 12, CH_X, CH_TOP - 0.45, CH_Z)));
  add(part("Miệng ống khói", cyl(0.31, 0.29, 0.14, p.metal, 12, CH_X, CH_TOP, CH_Z)));
  for (const y of [2.5, 4.6]) add(part("Giằng ống khói", strut([HALL_HX, y, CH_Z], [CH_X, y, CH_Z], 0.05, p.metal)));
  for (const z of [-1.4, -0.85, -0.3, 0.25])
    add(part("Bình khí hàn", group(cyl(0.2, 0.2, 1.2, p.hull, 10, -3.08, BASE_Y + 0.6, z), cyl(0.21, 0.16, 0.12, p.white, 10, -3.08, BASE_Y + 1.26, z))));
  add(part("Giá bình khí", box(0.08, 0.08, 2.2, p.metal, -3.3, 1.1, -0.55)));
  add(part("Ống thông gió", box(0.34, 3.4, 0.5, p.metal, 2.87, 3.2, 0.5)));
  add(part("Miệng thông gió", box(0.5, 0.3, 0.66, p.hullDark, 2.92, 5.0, 0.5)));
  for (const sx of [-1, 1]) add(part("Đèn cửa", sphere(0.13, lamp, sx * (DOOR_W / 2 + 0.15), BASE_Y + DOOR_H + 0.5, front + 0.12, 6)));

  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = sphere(0.35, p.smoke, CH_X, CH_TOP + 0.3, CH_Z, 7);
    s.castShadow = false;
    s.userData.phase = i / 4;
    puffs.push(s);
    add(s);
  }

  let doorT = 0;
  return rig(root, [WORK], 7, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = doorY + doorT * DOOR_H * 0.425;
      door.scale.y = 1 - doorT * 0.85;
      crane.position.x = on ? Math.sin(t * 0.8) * (HALL_HX - 0.5) : approach(crane.position.x, 0, 2, dt);
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.35 + (s.userData.phase as number)) % 1;
        s.position.set(CH_X + k * 0.5, CH_TOP + 0.3 + k * 2.2, CH_Z + k * 0.2);
        s.scale.setScalar(0.5 + k * 1.4);
      }
    },
    blinker(lamp, 4)
  ]);
}
