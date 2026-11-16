/**
 * Mô hình Thiết Giáp Lynx (`lynx`), bản 2 (15/11/2026): xe thiết giáp SÁU BÁNH, HAI NÒNG. Từ 16/11/2026 lọt đế Nhẹ Ø 3,6 m
 * (thu ×S, xem dưới); trước đó đế lõi Ø 4,5 m.
 * Người dùng chốt 06/11: bọc thép, hai nòng nâng lên bắn máy bay / hạ xuống bắn ngang. 15/11: 6 bánh, thân 1,6 : 1.
 *
 * Ý đồ hình khối:
 * - Thân 2,3 × 3,7 m (đường chéo vừa trong vòng Ø 4,5): hộp thép nhiều mặt vát (`facets`), gầm chữ V, vai rộng phủ trên bánh,
 *   mũi dốc có lưới tản nhiệt, chữ V màu phe, đèn pha có khung bảo vệ, cản trước + móc kéo.
 * - 6 bánh chia đều thân, giáp hông liền một dải phủ nửa trên cả ba bánh (chắc, nặng hơn bản trinh sát 4 bánh).
 * - Tháp nhỏ ĐẶT ĐÚNG TÂM xe (nòng quay hướng nào cũng thò ra bằng nhau), giá hai nòng 20mm bắn so le.
 * - Đuôi: cửa sau lớn (xe chở được tổ lái + trinh sát), hai hộp đồ ở góc sau, đèn hậu, 2 ăng-ten roi.
 *
 * Bộ phận động: tháp xoay, giá súng nâng hạ (ngang ↔ ngóc ~65° khi mục tiêu đang bay: `airPitch`),
 * hai nòng giật so le, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, surfaceTools, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

type P3 = [number, number, number];

/**
 * Thu đều cả xe (16/11/2026, người dùng: Lynx nhỏ hơn Titan): đế Nhẹ Ø 3,6 (bodyR 1,8). Mọi số trong file là số TRƯỚC khi thu;
 * tầm với lớn nhất 2,06 m (móc kéo) × S = 1,75 m < 1,8.
 */
const S = 0.85;

const WHEEL_R = 0.42;
const WHEEL_X = 0.96;
const AXLES = [1.22, 0.06, -1.1];
/** Độ cao nóc thân, chỗ đặt tháp. */
const ROOF_Y = 1.36;

export function buildLynx(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);
  const both = (f: (sx: number) => void) => [1, -1].forEach(f);

  // ================================================================ 1. SÁU BÁNH
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const sx of [-1, 1])
    for (const z of AXLES) {
      const w = wheel(WHEEL_R, 0.36, p.rubber, p.metal);
      w.position.set(sx * WHEEL_X, WHEEL_R, z);
      add(w);
      wheels.push({ g: w, r: WHEEL_R });
    }

  // ================================================================ 2. THÂN BỌC THÉP
  const hull = part(
    "Thân bọc thép",
    facets(
      [
        [0, 0.36, 1.4], [0, 0.36, -1.45], // gầm chữ V
        [0.7, 0.56, 1.72], [0.72, 0.56, -1.78], // mép dưới hông
        [0.6, 0.64, 1.86], [0.64, 0.94, 1.8], // mũi
        [0.9, 1.08, 1.05], [0.92, 1.04, -1.76], // vai xe (chỗ rộng nhất)
        [0.7, ROOF_Y, 0.42], [0.72, ROOF_Y + 0.02, -1.72] // nóc
      ],
      p.hull,
      true
    )
  );
  add(hull);
  const { skin, line, at } = surfaceTools(body, [hull]);

  // Giáp hông liền một dải phủ trên cả ba bánh: tấm trên nằm ngang + tấm đứng vát vào ở hai đầu
  both((sx) => {
    const top: P3[] = [
      [0.74, 0.9, 1.78], [1.15, 0.9, 1.62], [0.74, 1.04, 1.5], [1.15, 1.02, 1.4],
      [0.74, 1.04, -1.6], [1.15, 1.02, -1.5], [0.74, 0.9, -1.8], [1.15, 0.9, -1.66]
    ];
    add(part("Giáp hông", facets(top.map(([x, y, z]): P3 => [sx * x, y, z]), p.hullDark)));
    // vạch màu phe chạy dọc mép ngoài giáp hông, chia 2 đoạn
    add(part("Vạch vai xe (màu phe)", box(0.05, 0.06, 1.2, p.team, sx * 1.16, 0.97, 0.72)));
    add(part("Vạch vai xe (màu phe)", box(0.05, 0.06, 1.2, p.team, sx * 1.16, 0.97, -0.72)));
  });

  // Kính chắn gió bọc thép: 2 ô vát + thanh khung giữa; kính hông dạng khe
  both((sx) => {
    add(skin("Kính chắn gió", [[0.08, 1.2], [0.56, 1.12], [0.5, 0.78], [0.08, 0.84]], p.glass, { mirror: sx < 0, lift: 0.02 }));
    add(skin("Kính hông", [[0.9, 1.12], [0.45, 1.15], [0.45, 1.25], [0.86, 1.19]], p.glass, { face: "right", mirror: sx < 0, lift: 0.015 }));
  });
  add(line("Khung kính", [[0, 1.26], [0, 0.76]], p.metal, { w: 0.08 }));

  // ================================================================ 3. MŨI XE: lưới tản nhiệt, đèn, cản, móc kéo, chữ V
  for (const x of [-0.28, -0.14, 0, 0.14, 0.28]) add(line("Lưới tản nhiệt", [[x, 1.72], [x, 1.42]], p.hullDark, { w: 0.06 }));
  add(line("Chữ V mũi (màu phe)", [[-0.46, 1.62], [0, 1.82], [0.46, 1.62]], p.team, { w: 0.08 }));
  both((sx) => {
    add(skin("Đèn pha", [[0.32, 0.74], [0.54, 0.74], [0.54, 0.84], [0.32, 0.84]], p.glass, { face: "front", mirror: sx < 0, lift: 0.02 }));
    add(line("Khung bảo vệ đèn", [[0.3, 0.88], [0.56, 0.88]], p.metal, { face: "front", mirror: sx < 0, w: 0.035 }));
    add(part("Móc kéo", box(0.08, 0.12, 0.12, p.warning, sx * 0.42, 0.52, 1.95)));
  });
  add(part("Cản trước", box(1.2, 0.16, 0.12, p.metal, 0, 0.58, 1.9)));

  // ================================================================ 4. HÔNG + ĐUÔI
  both((sx) => {
    const m = sx < 0;
    // Cửa hông trên mặt vát giữa vai và nóc, sau kính hông
    add(line("Cửa hông", [[-0.2, 1.1], [-0.2, 1.3], [-0.9, 1.3], [-0.9, 1.1]], p.hullDark, { face: "right", mirror: m, w: 0.03 }));
    // Đèn hậu, hộp đồ ở góc sau, ăng-ten roi ở góc sau nóc
    add(skin("Đèn hậu", [[0.58, 0.86], [0.74, 0.86], [0.74, 0.96], [0.58, 0.96]], p.warning, { face: "back", mirror: m }));
    add(part("Hộp đồ", box(0.3, 0.3, 0.26, p.hullDark, sx * 0.55, 1.5, -1.5)));
    const [ax, ay, az] = at(0.55, -1.62, "top", 0, m);
    add(part("Ăng-ten roi", group(cyl(0.05, 0.06, 0.08, p.metal, 6, ax, ay + 0.04, az), cyl(0.012, 0.012, 1.4, p.metal, 4, ax, ay + 0.75, az))));
  });
  // Cửa sau lớn + tay nắm, ống xả bên phải
  add(line("Cửa sau", [[-0.4, 0.62], [-0.4, 1.24], [0.4, 1.24], [0.4, 0.62]], p.hullDark, { face: "back", w: 0.035 }));
  add(part("Tay nắm cửa sau", box(0.18, 0.05, 0.05, p.metal, 0.22, 0.95, -1.82)));
  add(part("Ống xả", cyl(0.05, 0.05, 0.45, p.metal, 6, 0.84, 1.2, -1.45)));

  // ================================================================ 5. NÓC: cửa xe trưởng, ô nhận diện
  const [hx, hy, hz] = at(0.4, -1.05);
  add(part("Cửa nóc xe trưởng", group(cyl(0.2, 0.22, 0.08, p.hullDark, 10, hx, hy + 0.03, hz), box(0.08, 0.06, 0.2, p.metal, hx, hy + 0.09, hz))));
  add(skin("Ô nhận diện (màu phe)", [[-0.58, -0.82], [-0.14, -0.82], [-0.14, -1.3], [-0.58, -1.3]], p.team));

  // ================================================================ 6. THÁP (đúng tâm xe) + GIÁ HAI NÒNG
  const turret = part("Tháp súng", group());
  turret.position.set(0, ROOF_Y, 0);
  turret.add(part("Vành tháp", cyl(0.5, 0.52, 0.1, p.metal, 14, 0, 0.03, 0)));
  const shell = part(
    "Thân tháp",
    facets([[0.5, 0.05, 0.55], [0.56, 0.05, -0.62], [0.4, 0.32, 0.32], [0.46, 0.33, -0.58], [0.22, 0.38, 0.05], [0.3, 0.12, 0.72]], p.hull, true)
  );
  turret.add(shell);
  for (const sx of [-1, 1]) {
    // Tấm hông tháp màu phe
    const plate: P3[] = [[0.53, 0.09, 0.3], [0.56, 0.09, -0.5], [0.47, 0.28, 0.2], [0.5, 0.28, -0.48], [0.47, 0.09, 0.3], [0.5, 0.09, -0.5]];
    turret.add(part("Tấm hông tháp (màu phe)", facets(plate.map(([x, y, z]): P3 => [sx * (x + 0.02), y, z]), p.team)));
    // Ống phóng khói: 3 ống chếch lên phía trước ở góc trước tháp
    for (let i = 0; i < 3; i++) {
      const t = part("Ống phóng khói", tubeZ(0.045, 0.045, 0.2, p.metal, 6));
      t.position.set(sx * (0.44 + i * 0.07), 0.3, 0.32 - i * 0.04);
      t.rotation.set(-0.6, sx * 0.5, 0);
      turret.add(t);
    }
  }
  // Kính ngắm quang điện tử: hộp cảm biến trên nóc tháp, mặt kính quay ra trước
  turret.add(part("Kính ngắm quang điện tử", group(box(0.24, 0.2, 0.24, p.hullDark, -0.26, 0.48, -0.25), box(0.18, 0.12, 0.02, p.glass, -0.26, 0.5, -0.12), cyl(0.04, 0.04, 0.1, p.metal, 6, -0.26, 0.4, -0.25))));

  // Giá súng: trục nâng ở trước tháp; nòng, hộp đạn, tấm chắn đều nằm trong giá nên ngóc lên cùng nhau
  const gun = part("Giá súng", group());
  gun.position.set(0, 0.24, 0.42);
  gun.add(box(0.3, 0.2, 0.46, p.hullDark, 0, 0, -0.02), part("Tấm chắn giá súng", box(0.56, 0.24, 0.08, p.hull, 0, 0, 0.22)));
  const barrels: THREE.Group[] = [];
  const flashes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const b = barrel(1.1, 0.045, p.metal, sx * 0.17, 0.02, 0.22);
    const brake = part("Đầu hãm nòng", tubeZ(0.068, 0.068, 0.14, p.metal, 8));
    brake.position.z = 1.12;
    const f = muzzleFlash(0.35, p.flash);
    f.position.z = 1.3;
    b.add(brake, f);
    gun.add(b, part("Hộp đạn", box(0.14, 0.24, 0.36, p.hullDark, sx * 0.37, -0.02, -0.02)), part("Máng nạp đạn", box(0.06, 0.06, 0.2, p.metal, sx * 0.27, 0.06, 0.02)));
    barrels.push(b);
    flashes.push(f);
  }
  turret.add(gun);
  add(turret);

  // thu đều cả xe cho lọt đế Nhẹ Ø 3,6 (16/11/2026); bánh lăn theo bán kính thật sau khi thu
  const shrink = group(...[...body.children]);
  shrink.scale.setScalar(S);
  body.add(shrink);
  for (const w of wheels) w.r *= S;

  return vehicleRig(
    "lynx",
    p,
    { body, wheels, turret, gun, barrels, muzzles: barrels, flashes, spinners: [], aimPitch: 0.05, airPitch: 1.15, recoil: 0.1 },
    2.6 * S,
    [{ id: "aimAir", label: "Ngắm máy bay" }]
  );
}
