/**
 * Sân Đáp, chân đế 12 × 16 m (người dùng chốt 09/11/2026): lưới 2 cột × 3 hàng ô 5,6 × 5,2 m vừa khít sân; 5 ô đáp, ô thứ sáu
 * (hàng sau, khớp `CONTROL_CELL`) là trạm điều khiển. Máy bay đậu quay mũi về +z. Sân Đáp chỉ cất / hạ cánh, nạp dầu, sửa chữa;
 * máy bay đúc ở Nhà Máy Máy Bay. Bản này mới chốt bố cục, phần hình làm lại theo phong cách chung ở đợt sau.
 */
import { BUILDINGS, CONTROL_CELL, PAD_OFFSETS, type Faction } from "../../../sim/content";
import { box, cyl, group, part, type Palette, type Rig } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig } from "./shared";

const CELL_W = 5.6;
const CELL_D = 5.2;

export function buildAirfield(p: Palette, faction: Faction, showcase: boolean): Rig {
  const [HX, HZ] = BUILDINGS.airfield.half;
  const root = group(part("Nền sân", box(HX * 2, 0.18, HZ * 2, p.concreteDark, 0, 0.09, 0)));

  // 5 ô đáp: mặt bê tông, viền trắng 4 góc, vòng tròn màu phe ở tâm, số hiệu ô, trụ nạp dầu
  PAD_OFFSETS.forEach(([x, z], i) => {
    const pad = part(`Ô đáp ${i + 1}`, group(box(CELL_W, 0.04, CELL_D, p.concrete, 0, 0, 0)));
    pad.position.set(x, 0.2, z);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pad.add(box(0.9, 0.03, 0.12, p.white, cx * 2.3, 0.03, cz * 2.45), box(0.12, 0.03, 0.9, p.white, cx * 2.69, 0.03, cz * 2.1));
    }
    pad.add(part("Vòng tâm ô (màu phe)", cyl(0.75, 0.75, 0.025, p.team, 16, 0, 0.03, 0)), cyl(0.6, 0.6, 0.03, p.concrete, 16, 0, 0.035, 0));
    for (let k = 0; k <= i; k++) pad.add(box(0.1, 0.03, 0.42, p.white, -Math.sign(x) * (2.0 - k * 0.2), 0.03, -1.9));
    pad.add(part("Trụ nạp dầu", group(box(0.34, 0.6, 0.3, p.hullDark, 0, 0.32, 0), box(0.36, 0.1, 0.32, p.team, 0, 0.5, 0), cyl(0.03, 0.03, 0.5, p.rubber, 4, -Math.sign(x) * 0.2, 0.25, 0.1))).translateX(Math.sign(x) * 2.45).translateZ(-2.25));
    root.add(pad);
  });

  // ô thứ sáu: trạm điều khiển
  const [CX, CZ] = CONTROL_CELL;
  root.add(part("Nền trạm điều khiển", box(CELL_W, 0.04, CELL_D, p.concrete, CX, 0.2, CZ)));
  const tower = group(cyl(0.6, 0.75, 3.6, p.hull, 8, 0, 1.8, 0), cyl(1.15, 0.9, 0.85, p.glass, 8, 0, 4.0, 0), cyl(1.2, 1.2, 0.14, p.team, 8, 0, 4.5, 0));
  const beacon = group(box(0.6, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0));
  beacon.position.y = 4.8;
  tower.add(beacon);
  tower.position.set(CX + 1.1, 0.22, CZ - 0.5);
  root.add(part("Trạm điều khiển", tower));
  root.add(part("Nhà điều hành", group(box(2.1, 1.5, 3.4, p.hull, CX - 1.45, 0.97, CZ + 0.2), box(2.2, 0.12, 3.5, p.team, CX - 1.45, 1.78, CZ + 0.2))));

  // Xưởng Mô Hình: trưng một chiếc Falcon đậu ở ô số 3 (trong trận thì máy bay thật đậu ở các ô)
  if (showcase) {
    const falcon = buildUnit("falcon", faction);
    const [fx, fz] = PAD_OFFSETS[2]!;
    falcon.root.position.set(fx, 0.2, fz);
    root.add(falcon.root);
  }
  return rig(root, [WORK], 10, [
    (dt, _t, a) => {
      if (a.has("work")) beacon.rotation.y += dt * 3;
    }
  ]);
}
