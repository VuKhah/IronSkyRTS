/**
 * Sân Đáp, bản 2 (09/11/2026), chân đế 12 × 16 m: lưới 2 cột × 3 hàng ô 5,6 × 5,2 m vừa khít sân; 5 ô đáp, ô thứ sáu
 * (hàng sau, khớp `CONTROL_CELL`) là trạm điều khiển theo phong cách của Tổng Hành Dinh. Máy bay đậu quay mũi về +z.
 * Sân Đáp chỉ cất / hạ cánh, nạp dầu, sửa chữa; máy bay đúc ở Nhà Máy Máy Bay.
 * Đèn ô đáp chỉ sáng khi sân có điện. Bộ phận động: radar.
 */
import * as THREE from "three";
import { BUILDINGS, CONTROL_CELL, PAD_OFFSETS, type Faction } from "../../../sim/content";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig, oct, strut, type P3 } from "./shared";

const CELL_W = 5.6;
const CELL_D = 5.2;
const SLAB = 0.18;
const PAD_Y = 0.2;

export function buildAirfield(p: Palette, faction: Faction, showcase: boolean): Rig {
  const [HX, HZ] = BUILDINGS.airfield.half;
  const root = group(part("Nền sân", box(HX * 2, SLAB, HZ * 2, p.concreteDark, 0, SLAB / 2, 0)));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  for (const sz of [-1, 1]) add(part("Viền sân (màu phe)", box(HX * 2 + 0.06, 0.08, 0.3, p.team, 0, SLAB, sz * (HZ - 0.15))));

  // ================================================================ 1. 5 Ô ĐÁP
  const lights = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, emissive: 0x7dff9a, emissiveIntensity: 0 });
  PAD_OFFSETS.forEach(([x, z], i) => {
    const pad = part(`Ô đáp ${i + 1}`, group(box(CELL_W, 0.04, CELL_D, p.concrete, 0, 0, 0)));
    pad.position.set(x, PAD_Y, z);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pad.add(box(0.9, 0.03, 0.12, p.white, cx * 2.3, 0.03, cz * 2.45), box(0.12, 0.03, 0.9, p.white, cx * 2.69, 0.03, cz * 2.1));
      pad.add(part("Đèn ô đáp", sphere(0.1, lights, cx * 2.62, 0.1, cz * 2.38, 6)));
    }
    pad.add(part("Vòng tâm ô (màu phe)", cyl(0.75, 0.75, 0.025, p.team, 16, 0, 0.03, 0)), cyl(0.6, 0.6, 0.03, p.concrete, 16, 0, 0.035, 0));
    for (let k = 0; k <= i; k++) pad.add(box(0.1, 0.03, 0.42, p.white, -Math.sign(x) * (2.0 - k * 0.2), 0.03, -1.9));
    pad.add(part("Trụ nạp dầu", group(box(0.34, 0.6, 0.3, p.hullDark, 0, 0.32, 0), box(0.36, 0.1, 0.32, p.team, 0, 0.5, 0), cyl(0.03, 0.03, 0.5, p.rubber, 4, -Math.sign(x) * 0.2, 0.25, 0.1))).translateX(Math.sign(x) * 2.2).translateZ(-2.1));
    add(pad);
  });

  // ================================================================ 2. Ô THỨ SÁU: TRẠM ĐIỀU KHIỂN
  const [CX, CZ] = CONTROL_CELL;
  add(part("Nền trạm điều khiển", box(CELL_W, 0.04, CELL_D, p.concrete, CX, PAD_Y, CZ)));
  const FLOOR = PAD_Y + 0.02;
  // nhà điều hành thấp, mái màu phe, dọc mép ngoài
  const OX = CX - 1.35;
  add(part("Nhà điều hành", facets([...oct(1.25, 2.3, 0.3, FLOOR, CZ, OX), ...oct(1.15, 2.2, 0.28, FLOOR + 2.0, CZ, OX)], p.concrete)));
  add(part("Mái nhà điều hành (màu phe)", facets([...oct(1.28, 2.33, 0.3, FLOOR + 2.0, CZ, OX), ...oct(1.28, 2.33, 0.3, FLOOR + 2.16, CZ, OX)], p.team)));
  add(part("Dải cửa sổ", box(0.04, 0.5, 3.2, p.glass, OX + 1.2, FLOOR + 1.35, CZ)));
  add(part("Cửa nhà điều hành", box(0.04, 1.3, 0.8, p.hullDark, OX + 1.21, FLOOR + 0.65, CZ + 1.8)));
  // tháp điều khiển kiểu đài kính xòe ra như Tổng Hành Dinh, đứng ở góc trong
  const TX = CX + 1.25;
  const TZ = CZ - 0.6;
  const BODY_TOP = 5.0;
  add(part("Thân tháp điều khiển", facets([...oct(0.95, 0.95, 0.24, FLOOR, TZ, TX), ...oct(0.72, 0.72, 0.2, BODY_TOP, TZ, TX)], p.hull)));
  add(part("Sàn đài", facets([...oct(1.0, 1.0, 0.26, BODY_TOP, TZ, TX), ...oct(1.0, 1.0, 0.26, BODY_TOP + 0.14, TZ, TX)], p.hullDark)));
  const low = oct(0.88, 0.88, 0.22, BODY_TOP + 0.14, TZ, TX);
  const high = oct(1.22, 1.22, 0.3, BODY_TOP + 1.02, TZ, TX);
  add(part("Đài kính điều khiển", facets([...low, ...high], p.glass)));
  low.forEach((a, i) => add(part("Khung kính", strut(a as P3, high[i]!, 0.03, p.metal))));
  add(part("Nóc đài (màu phe)", facets([...oct(1.3, 1.3, 0.32, BODY_TOP + 1.02, TZ, TX), ...oct(1.3, 1.3, 0.32, BODY_TOP + 1.2, TZ, TX)], p.team)));
  add(part("Cột radar", cyl(0.05, 0.07, 0.7, p.metal, 6, TX, BODY_TOP + 1.55, TZ)));
  const radar = part("Radar", group(box(1.1, 0.34, 0.08, p.hullDark, 0, 0, 0.06), box(0.98, 0.24, 0.03, p.teamGlow, 0, 0, 0.11), box(0.2, 0.2, 0.16, p.hullDark)));
  radar.position.set(TX, BODY_TOP + 1.95, TZ);
  add(radar);

  // Xưởng Mô Hình: trưng một chiếc Falcon đậu ở ô số 3 (trong trận thì máy bay thật đậu ở các ô)
  if (showcase) {
    const falcon = buildUnit("falcon", faction);
    const [fx, fz] = PAD_OFFSETS[2]!;
    falcon.root.position.set(fx, PAD_Y, fz);
    add(falcon.root);
  }
  let powered = 0;
  return rig(root, [WORK], 10.5, [
    (dt, t, a) => {
      const on = a.has("work");
      powered = approach(powered, on ? 1 : 0, 4, dt);
      lights.emissiveIntensity = powered * (1.5 + Math.sin(t * 3) * 0.7);
      if (on) radar.rotation.y += dt * 2.4;
    }
  ]);
}
