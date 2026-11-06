/** Mô hình Xe Tên Lửa Loạt (`rocket`). */
import * as THREE from "three";
import { approach, box, cyl, group, part, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig } from "./ground";

/**
 * Xe Tên Lửa Loạt: xe tải 6 bánh, cabin phía trước, mâm xoay phía sau mang THÙNG PHÓNG chứa 4 hộp phóng (2 × 2),
 * mỗi hộp 6 đầu đạn (2 hàng × 3 cột) = 24 ống (người dùng chốt 06/11/2026). Luật hiện bắn loạt 12 quả (số tạm):
 * một loạt xả hết 2 hộp.
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
  // Thùng phóng: khung ngoài (nóc, đáy, 2 vách, tấm hậu, mép miệng màu phe) chứa 4 hộp phóng xếp 2 × 2;
  // mỗi hộp phóng là một hộp 2 hàng × 3 cột đầu đạn (tổng 24 ống). Gốc xoay ở đuôi thùng để ngóc lên như dàn phóng thật.
  const L = 2.6; // chiều dài thùng
  const W = 1.72;
  const H = 1.06;
  const pod = part(
    "Thùng phóng (4 hộp)",
    group(
      box(W, 0.07, L, p.hull, 0, H / 2 - 0.035, L / 2),
      box(W, 0.07, L, p.hull, 0, -H / 2 + 0.035, L / 2),
      box(0.07, H, L, p.hull, W / 2 - 0.035, 0, L / 2),
      box(0.07, H, L, p.hull, -W / 2 + 0.035, 0, L / 2),
      box(W, H, 0.08, p.hull, 0, 0, 0.04)
    )
  );
  pod.add(
    part("Nóc thùng (màu phe)", box(W + 0.02, 0.03, L - 0.6, p.team, 0, H / 2 + 0.01, L / 2 - 0.1)),
    part("Mép miệng thùng (màu phe)", group(box(W + 0.02, 0.07, 0.06, p.team, 0, H / 2 - 0.035, L), box(W + 0.02, 0.07, 0.06, p.team, 0, -H / 2 + 0.035, L), box(0.07, H, 0.06, p.team, W / 2 - 0.035, 0, L), box(0.07, H, 0.06, p.team, -W / 2 + 0.035, 0, L))),
    part("Gân thùng", group(box(W + 0.04, 0.05, 0.08, p.hullDark, 0, H / 2 + 0.02, 0.9), box(W + 0.04, 0.05, 0.08, p.hullDark, 0, H / 2 + 0.02, 1.8)))
  );
  pod.userData.z0 = 0;
  const muzzles: THREE.Object3D[] = [];
  // 4 hộp phóng: thứ tự bắn hộp trên trái → trên phải → dưới trái → dưới phải; trong mỗi hộp bắn lần lượt 6 ống
  for (const [bx, by] of [[-0.41, 0.25], [0.41, 0.25], [-0.41, -0.25], [0.41, -0.25]] as const) {
    const box6 = part("Hộp phóng 6 ống (2 × 3)", group(box(0.76, 0.44, L - 0.16, p.hullDark, 0, 0, 0)));
    box6.position.set(bx, by, L / 2 + 0.03);
    box6.add(part("Mặt hộp phóng", box(0.72, 0.4, 0.03, p.hull, 0, 0, (L - 0.16) / 2 + 0.01)));
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++) {
        const x = -0.23 + col * 0.23;
        const y = -0.09 + row * 0.18;
        const z = (L - 0.16) / 2 + 0.03;
        const rim = part("Vành đầu đạn (màu phe)", cyl(0.085, 0.085, 0.03, p.team, 10, x, y, z));
        rim.rotation.x = Math.PI / 2;
        const hole = part("Đầu đạn", cyl(0.06, 0.06, 0.04, p.metal, 10, x, y, z + 0.005));
        hole.rotation.x = Math.PI / 2;
        box6.add(rim, hole);
        const m = group();
        m.position.set(bx + x, by + y, L + 0.08);
        pod.add(m);
        muzzles.push(m);
      }
    pod.add(box6);
  }
  // Ống dẫn cáp điều khiển chạy từ tấm hậu xuống mâm xoay
  pod.add(part("Ống dẫn cáp", box(0.1, 0.1, 0.5, p.metal, 0.55, -H / 2 - 0.05, 0.3)));
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
