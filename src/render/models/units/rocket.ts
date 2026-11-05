/** Mô hình Xe Tên Lửa Loạt (`rocket`). */
import * as THREE from "three";
import { approach, box, cyl, group, part, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig } from "./ground";

/**
 * Xe Tên Lửa Loạt: xe tải 6 bánh, cabin phía trước, mâm xoay phía sau mang hộp phóng 12 ống (3 hàng × 4).
 * Lúc chạy hộp phóng nằm ngang hướng ra trước; "Dựng dàn" thì hạ 4 chân chống xuống đất, khi ngắm thì ngóc hộp phóng lên.
 */
export function buildRocket(p: Palette): Rig {
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.6, 0.2, -1.15]) {
      const w = wheel(0.46, 0.38, p.rubber, p.metal);
      w.position.set(side * 1.02, 0.46, z);
      body.add(w);
      wheels.push({ g: w, r: 0.46 });
    }
  body.add(
    // khung sàn + cabin
    part("Khung sàn", box(1.86, 0.32, 4.5, p.hullDark, 0, 0.78, 0.05)),
    part("Cabin", box(1.9, 1.0, 1.2, p.hull, 0, 1.42, 1.72)),
    part("Nóc cabin (màu phe)", box(1.92, 0.12, 1.22, p.team, 0, 1.98, 1.72)),
    part("Kính cabin", box(1.55, 0.4, 0.06, p.glass, 0, 1.62, 2.33)),
    part("Cản trước", box(1.94, 0.16, 0.14, p.warning, 0, 0.82, 2.33)),
    // thùng thiết bị hai bên sàn sau
    part("Thùng thiết bị", box(0.36, 0.4, 2.4, p.hull, -0.78, 1.12, -0.6)),
    part("Thùng thiết bị", box(0.36, 0.4, 2.4, p.hull, 0.78, 1.12, -0.6))
  );
  // 4 chân chống (hạ xuống khi dựng dàn)
  const jacks = group();
  for (const sx of [-1, 1])
    for (const z of [1.05, -2.05]) {
      jacks.add(box(0.14, 0.75, 0.14, p.metal, sx * 1.12, 0, z), box(0.36, 0.06, 0.36, p.hullDark, sx * 1.12, -0.38, z));
    }
  jacks.position.y = 1.05;
  body.add(part("Chân chống (hạ khi dựng dàn)", jacks));
  // mâm xoay + hộp phóng (gốc xoay ở đuôi hộp để ngóc lên như dàn phóng thật)
  const turret = part("Mâm xoay", group(cyl(0.72, 0.82, 0.24, p.hullDark, 12, 0, 0.12, 0), part("Bộ nâng hộp phóng", box(0.5, 0.45, 0.5, p.hull, 0, 0.45, -0.55))));
  turret.position.set(0, 0.95, -0.7);
  const gun = group();
  gun.position.set(0, 0.62, -1.1);
  const pod = part("Hộp phóng 12 ống", group(box(1.62, 0.86, 2.6, p.hull, 0, 0, 1.3), box(1.64, 0.1, 2.0, p.team, 0, 0.46, 1.2), box(0.06, 0.6, 2.2, p.team, -0.83, 0, 1.3), box(0.06, 0.6, 2.2, p.team, 0.83, 0, 1.3)));
  pod.userData.z0 = 0;
  const muzzles: THREE.Object3D[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const x = -0.54 + col * 0.36;
      const y = -0.26 + row * 0.26;
      const hole = part("Miệng ống phóng", cyl(0.11, 0.11, 0.05, p.metal, 8, x, y, 2.61));
      hole.rotation.x = Math.PI / 2;
      pod.add(hole);
      const m = group();
      m.position.set(x, y, 2.7);
      pod.add(m);
      muzzles.push(m);
    }
  gun.add(pod);
  turret.add(gun);
  body.add(turret);
  return vehicleRig(
    "rocket",
    p,
    { body, wheels, turret, gun, barrels: [pod], muzzles, flashes: [], spinners: [], aimPitch: 0.62, recoil: 0.04, missiles: true, fireEvery: 0.2 },
    3.4,
    [{ id: "deploy", label: "Dựng dàn" }],
    (dt, _t, a) => {
      jacks.position.y = approach(jacks.position.y, a.has("deploy") ? 0.42 : 1.05, 5, dt);
    }
  );
}
