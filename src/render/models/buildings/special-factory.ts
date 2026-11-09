import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, blinker } from "./shared";

/**
 * Xưởng Xe Chuyên Dụng: nhà xưởng dài và cao hơn Xưởng Xe Tăng (đủ chỗ cho xe phóng tên lửa và pháo nòng dài), cửa cao
 * phía trước (+z), cầu trục cổng chạy dọc nóc, và giàn ống phóng thử trên nóc ngóc lên khi xưởng đang đúc.
 */
export function buildSpecialFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["special-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const W = HX * 2 - 1.4;
  const D = HZ * 2 - 1.8;
  const H = 3.4;
  const zc = -0.4; // thân xưởng lùi về sau, chừa sân trước cửa
  root.add(part("Thân xưởng", box(W, H, D, p.hull, 0, 0.25 + H / 2, zc)));
  root.add(part("Dải màu phe", box(W + 0.04, 0.22, D + 0.04, p.team, 0, 0.25 + H - 0.5, zc)));
  root.add(part("Mái", box(W + 0.3, 0.16, D + 0.3, p.hullDark, 0, 0.25 + H + 0.08, zc)));
  // cửa cao giữa mặt trước, khung vàng đen
  const front = zc + D / 2;
  const DW = 3.4;
  const DH = 2.9;
  root.add(
    part(
      "Khung cửa",
      group(
        box(DW + 0.5, 0.3, 0.3, p.warning, 0, 0.25 + DH + 0.15, front + 0.05),
        box(0.3, DH, 0.3, p.hullDark, -DW / 2 - 0.1, 0.25 + DH / 2, front + 0.05),
        box(0.3, DH, 0.3, p.hullDark, DW / 2 + 0.1, 0.25 + DH / 2, front + 0.05)
      )
    )
  );
  const door = part("Cửa cuốn", box(DW, DH - 0.1, 0.12, p.teamDark, 0, 0.25 + DH / 2, front + 0.1));
  root.add(door);
  // sân trước có sọc cảnh báo
  const yardZ = (front + HZ) / 2;
  root.add(part("Dốc ra xe", box(DW, 0.08, HZ - front, p.concreteDark, 0, 0.29, yardZ)));
  for (let i = 0; i < 5; i++) root.add(part("Sọc cảnh báo", box(0.28, 0.03, (HZ - front) * 0.8, p.warning, -1.4 + i * 0.7, 0.34, yardZ)));
  // gian phụ thấp bên hông (phòng kỹ thuật)
  root.add(part("Gian kỹ thuật", box(1.2, 1.9, 2.4, p.hullDark, -W / 2 - 0.2, 0.25 + 0.95, zc - 0.8)));
  root.add(part("Cửa sổ", box(0.05, 0.4, 1.6, p.glass, -W / 2 - 0.82, 1.7, zc - 0.8)));
  // cầu trục cổng: 2 dầm ngang trên cột ở 4 góc nóc, xe con chạy dọc
  const top = 0.25 + H + 0.16;
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3])
    for (const z of [zc - D / 2 + 0.3, zc + D / 2 - 0.3]) root.add(part("Cột cầu trục", box(0.16, 1.1, 0.16, p.metal, x, top + 0.55, z)));
  for (const z of [zc - D / 2 + 0.3, zc + D / 2 - 0.3]) root.add(part("Dầm cầu trục", box(W - 0.4, 0.18, 0.18, p.warning, 0, top + 1.1, z)));
  const trolley = part(
    "Xe con cầu trục",
    group(box(0.4, 0.18, D - 0.4, p.metal, 0, 0, 0), box(0.5, 0.35, 0.5, p.hullDark, 0, -0.2, 0), cyl(0.03, 0.03, 0.6, p.rubber, 4, 0, -0.65, 0))
  );
  trolley.position.set(0, top + 1.25, zc);
  root.add(trolley);
  // giàn ống phóng thử trên nóc (phía sau): bản lề ở mép sau, ngóc lên khi đang đúc
  const rack = part("Giàn phóng thử", group());
  rack.add(box(1.6, 0.7, 1.9, p.hullDark, 0, 0.35, 0.95), part("Nắp giàn (màu phe)", box(1.64, 0.1, 1.94, p.team, 0, 0.72, 0.95)));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++) {
      const tube = part("Ống phóng", cyl(0.17, 0.17, 0.05, p.metal, 8, -0.5 + c * 0.5, 0.18 + r * 0.34, 1.91));
      tube.rotation.x = Math.PI / 2;
      rack.add(tube);
    }
  rack.position.set(W / 2 - 1.3, top, zc - D / 2 + 0.4);
  root.add(rack, part("Bệ giàn phóng", box(1.8, 0.2, 0.5, p.metal, W / 2 - 1.3, top + 0.1, zc - D / 2 + 0.4)));
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(
    part("Đèn cửa", group(sphere(0.12, lamp, -DW / 2 - 0.1, 0.25 + DH + 0.45, front + 0.12, 6), sphere(0.12, lamp, DW / 2 + 0.1, 0.25 + DH + 0.45, front + 0.12, 6)))
  );
  let doorT = 0;
  let rackT = 0;
  return rig(root, [WORK], Math.max(HX, HZ) + 0.6, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = 0.25 + DH / 2 + doorT * 1.2;
      door.scale.y = 1 - doorT * 0.8;
      rackT = approach(rackT, on ? 1 : 0, 1.5, dt);
      rack.rotation.x = -rackT * 0.7; // miệng ống phóng (phía +z) ngóc lên
      trolley.position.x = on ? Math.sin(t * 0.6) * (W / 2 - 0.8) : approach(trolley.position.x, 0, 2, dt);
    },
    blinker(lamp, 3)
  ]);
}
