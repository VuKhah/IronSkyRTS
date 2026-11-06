/**
 * Mô hình Thiết Giáp Trinh Sát Lynx (`lynx`), bản 1 (06/11/2026).
 * Người dùng chốt: xe trinh sát BỐN BÁNH, BỌC THÉP, HAI NÒNG nâng lên bắn máy bay / hạ xuống bắn ngang.
 *
 * Ý đồ hình khối:
 * - Thân vỏ thép nhiều mặt vát (`facets`), gầm chữ V (đẩy sóng nổ mìn ra hai bên), nóc thấp: nhanh, gọn, nhỏ hơn Titan rõ.
 * - 4 bánh lớn có chắn bùn vát; mũi xe dốc có lưới tản nhiệt, đèn pha có khung bảo vệ, cản trước + móc kéo.
 * - Tháp nhỏ mang giá hai nòng 20mm (bắn so le), hộp đạn hai bên giá súng, kính ngắm quang điện tử, ống phóng khói.
 * - Chất "trinh sát": kính ngắm trên tháp, 2 ăng-ten roi, cửa nóc xe trưởng.
 * - Màu phe theo nhịp: vạch dọc vai xe, chữ V mũi, tấm hông tháp, ô nhận diện trên nóc.
 *
 * Bộ phận động: tháp xoay, giá súng nâng hạ (ngang ↔ ngóc ~65° khi mục tiêu đang bay: `airPitch`),
 * hai nòng giật so le, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, surfaceTools, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

type P3 = [number, number, number];

const WHEEL_R = 0.5;
const WHEEL_X = 1.02;
const AXLES = [1.3, -1.2];

export function buildLynx(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);
  const both = (f: (sx: number) => void) => [1, -1].forEach(f);

  // ================================================================ 1. BÁNH + CHẮN BÙN
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const sx of [-1, 1])
    for (const z of AXLES) {
      const w = wheel(WHEEL_R, 0.4, p.rubber, p.metal);
      w.position.set(sx * WHEEL_X, WHEEL_R, z);
      add(w);
      wheels.push({ g: w, r: WHEEL_R });
      // chắn bùn vát ôm trên bánh
      const f: P3[] = [
        [0.8, 0.92, z + 0.66], [1.27, 0.92, z + 0.62], [0.8, 1.1, z + 0.34], [1.27, 1.08, z + 0.32],
        [0.8, 1.1, z - 0.34], [1.27, 1.08, z - 0.32], [0.8, 0.92, z - 0.66], [1.27, 0.92, z - 0.62]
      ];
      add(part("Chắn bùn", facets(f.map(([x, y, zz]): P3 => [sx * x, y, zz]), p.hullDark)));
    }

  // ================================================================ 2. THÂN BỌC THÉP
  const hull = part(
    "Thân bọc thép",
    facets(
      [
        [0, 0.42, 1.55], [0, 0.42, -1.6], // gầm chữ V
        [0.78, 0.62, 2.05], [0.8, 0.62, -2.0], // mép dưới hông
        [0.68, 0.72, 2.38], [0.7, 0.98, 2.3], // mũi
        [0.86, 1.16, 1.3], [0.9, 1.1, -1.95], // vai xe (chỗ rộng nhất)
        [0.66, 1.42, 0.6], [0.68, 1.45, -1.9] // nóc
      ],
      p.hull,
      true
    )
  );
  add(hull);
  const { skin, line, at } = surfaceTools(body, [hull]);

  // Kính chắn gió bọc thép: 2 ô vát + thanh khung giữa; kính hông dạng khe
  both((sx) => {
    add(skin("Kính chắn gió", [[0.08, 1.22], [0.6, 1.12], [0.54, 0.74], [0.08, 0.8]], p.glass, { mirror: sx < 0, lift: 0.02 }));
    add(skin("Kính hông", [[1.0, 1.2], [0.45, 1.24], [0.45, 1.33], [0.92, 1.3]], p.glass, { face: "right", mirror: sx < 0, lift: 0.015 }));
  });
  add(line("Khung kính", [[0, 1.28], [0, 0.72]], p.metal, { w: 0.08 }));

  // ================================================================ 3. MŨI XE: lưới tản nhiệt, đèn, cản, móc kéo, chữ V
  for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) add(line("Lưới tản nhiệt", [[x, 1.95], [x, 1.6]], p.hullDark, { w: 0.06 }));
  add(line("Chữ V mũi (màu phe)", [[-0.5, 1.98], [0, 2.22], [0.5, 1.98]], p.team, { w: 0.08 }));
  both((sx) => {
    add(skin("Đèn pha", [[0.34, 0.8], [0.58, 0.8], [0.58, 0.9], [0.34, 0.9]], p.glass, { face: "front", mirror: sx < 0, lift: 0.02 }));
    add(line("Khung bảo vệ đèn", [[0.32, 0.94], [0.6, 0.94]], p.metal, { face: "front", mirror: sx < 0, w: 0.035 }));
    add(part("Móc kéo", box(0.08, 0.12, 0.12, p.warning, sx * 0.45, 0.58, 2.48)));
  });
  add(part("Cản trước", box(1.36, 0.16, 0.14, p.metal, 0, 0.62, 2.42)));

  // ================================================================ 4. HÔNG + ĐUÔI
  both((sx) => {
    const m = sx < 0;
    // Vạch màu phe dọc vai xe, chia 2 đoạn như viền vai Titan
    add(skin("Vạch vai xe (màu phe)", [[1.15, 1.12], [0.25, 1.12], [0.25, 1.17], [1.15, 1.17]], p.team, { face: "right", mirror: m }));
    add(skin("Vạch vai xe (màu phe)", [[0.0, 1.13], [-1.8, 1.13], [-1.8, 1.18], [0.0, 1.18]], p.team, { face: "right", mirror: m }));
    // Tấm giáp hông giữa hai bánh + đường viền cửa hông
    add(skin("Giáp hông", [[0.62, 0.7], [-0.52, 0.7], [-0.52, 1.02], [0.62, 1.02]], p.hullDark, { face: "right", mirror: m, lift: 0.03, thick: 0.05 }));
    add(line("Cửa hông", [[0.5, 1.06], [0.5, 1.36], [-0.25, 1.38], [-0.25, 1.06]], p.hullDark, { face: "right", mirror: m, w: 0.03 }));
    // Đèn hậu, ăng-ten roi ở góc sau nóc
    add(skin("Đèn hậu", [[0.62, 0.9], [0.78, 0.9], [0.78, 1.0], [0.62, 1.0]], p.warning, { face: "back", mirror: m }));
    const [ax, ay, az] = at(0.55, -1.75, "top", 0, m);
    add(part("Ăng-ten roi", group(cyl(0.05, 0.06, 0.08, p.metal, 6, ax, ay + 0.04, az), cyl(0.012, 0.012, 1.5, p.metal, 4, ax, ay + 0.8, az))));
  });
  // Ống xả bên phải, bánh dự phòng + can dầu sau đuôi, viền cửa sau
  add(part("Ống xả", cyl(0.05, 0.05, 0.5, p.metal, 6, 0.9, 1.22, -1.62)));
  const spare = part("Bánh dự phòng", wheel(0.42, 0.22, p.rubber, p.metal));
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0.32, 1.02, -2.1);
  add(spare, part("Can dầu", box(0.3, 0.42, 0.12, p.hullDark, -0.42, 1.0, -2.04)));
  add(line("Cửa sau", [[-0.12, 0.66], [-0.12, 1.3], [0.62, 1.3]], p.hullDark, { face: "back", w: 0.03 }));

  // ================================================================ 5. NÓC: cửa xe trưởng, ô nhận diện
  const [hx, hy, hz] = at(0.36, -1.25);
  add(part("Cửa nóc xe trưởng", group(cyl(0.22, 0.24, 0.08, p.hullDark, 10, hx, hy + 0.03, hz), box(0.08, 0.06, 0.22, p.metal, hx, hy + 0.09, hz))));
  add(skin("Ô nhận diện (màu phe)", [[-0.6, -1.0], [-0.12, -1.0], [-0.12, -1.55], [-0.6, -1.55]], p.team));

  // ================================================================ 6. THÁP + GIÁ HAI NÒNG
  const turret = part("Tháp súng", group());
  turret.position.set(0, 1.44, -0.32);
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
  // Kính ngắm quang điện tử (trinh sát): hộp cảm biến trên nóc tháp, mặt kính quay ra trước
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

  return vehicleRig(
    "lynx",
    p,
    { body, wheels, turret, gun, barrels, muzzles: barrels, flashes, spinners: [], aimPitch: 0.05, airPitch: 1.15, recoil: 0.1 },
    2.8,
    [{ id: "aimAir", label: "Ngắm máy bay" }]
  );
}
