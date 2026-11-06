/**
 * Mô hình Xe Tên Lửa Loạt (`rocket`), bản 2 (06/11/2026).
 * Người dùng chốt: thùng xe gồm 4 HỘP PHÓNG, mỗi hộp 2 × 3 đầu đạn (24 ống); bản 2: "làm xe thật wow, thấy rõ là
 * 4 cái hộp pháo gắn lại với nhau".
 *
 * Ý đồ:
 * - Cụm phóng: 4 hộp phóng LỘ HẲN (không còn thùng kín bao ngoài), khe hở rõ giữa các hộp, mỗi hộp có viền miệng màu phe,
 *   sọc trắng, tay xách riêng; 2 ĐAI KẸP quấn quanh cả cụm + GIÁ CHỮ THẬP ở đuôi + KHUNG ĐỠ bên dưới = 4 hộp kẹp thành một.
 * - Xe: xe tải 8 bánh nặng, cabin bọc thép vát (`facets`) có kính, lưới tản nhiệt, cản trước + tời, đèn hiệu trên nóc;
 *   chắn bùn + giáp hông che bánh, ống xả đứng sau cabin, bánh dự phòng, thùng đồ; mâm xoay có 2 tay nâng lớn.
 * - Luật hiện bắn loạt 12 quả (số tạm): một loạt xả hết 2 hộp.
 * Bộ phận động: bánh lăn, mâm xoay, cụm phóng ngóc lên, 4 chân chống hạ khi dựng dàn.
 */
import * as THREE from "three";
import { approach, box, cyl, facets, group, part, surfaceTools, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig } from "./ground";

type P3 = [number, number, number];

const AXLES = [1.75, 0.8, -0.75, -1.65];
const WHEEL_R = 0.48;

export function buildRocket(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);

  // ================================================================ 1. KHUNG + 8 BÁNH + CHẮN BÙN
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of AXLES) {
      const w = wheel(WHEEL_R, 0.4, p.rubber, p.metal);
      w.position.set(side * 1.04, WHEEL_R, z);
      add(w);
      wheels.push({ g: w, r: WHEEL_R });
    }
  add(part("Khung sàn", box(1.7, 0.34, 4.9, p.hullDark, 0, 0.8, 0.05)));
  for (const sx of [-1, 1]) {
    // chắn bùn vát ôm hai cặp bánh trước và hai cặp bánh sau
    for (const [z0, z1] of [[2.3, 0.25], [-0.2, -2.2]]) {
      const f: P3[] = [[0.82, 1.0, z0], [1.3, 1.0, z0 - 0.05], [0.82, 1.18, z0 - 0.3], [1.3, 1.16, z0 - 0.32], [0.82, 1.18, z1 + 0.3], [1.3, 1.16, z1 + 0.32], [0.82, 1.0, z1], [1.3, 1.0, z1 + 0.05]];
      add(part("Chắn bùn", facets(f.map(([x, y, z]): P3 => [sx * x, y, z]), p.hull)));
    }
    add(part("Vạch chắn bùn (màu phe)", box(0.04, 0.06, 1.6, p.team, sx * 1.31, 1.08, 1.28)));
    add(part("Giáp hông", box(0.06, 0.34, 0.42, p.hullDark, sx * 1.12, 0.95, 0.02)));
    add(part("Thùng đồ", group(box(0.5, 0.36, 0.42, p.hull, sx * 0.55, 1.15, -2.2), box(0.52, 0.05, 0.44, p.white, sx * 0.55, 1.35, -2.2))));
  }

  // ================================================================ 2. CABIN BỌC THÉP
  const cab = part(
    "Cabin bọc thép",
    facets([[0.98, 0.82, 2.62], [0.95, 1.42, 2.55], [0.82, 2.02, 2.1], [0.86, 2.06, 1.1], [1.0, 0.82, 1.1], [1.0, 1.5, 1.1]], p.hull, true)
  );
  add(cab);
  const { skin, line } = surfaceTools(body, [cab]);
  add(skin("Kính chắn gió", [[-0.75, 1.52], [0.75, 1.52], [0.65, 1.88], [-0.65, 1.88]], p.glass, { face: "front", lift: 0.02 }));
  add(line("Khung kính", [[0, 1.5], [0, 1.9]], p.metal, { face: "front", w: 0.07 }));
  for (const y of [0.98, 1.08, 1.18]) add(line("Lưới tản nhiệt", [[-0.55, y], [0.55, y]], p.hullDark, { face: "front", w: 0.05 }));
  for (const sx of [-1, 1]) {
    add(skin("Đèn pha", [[sx * 0.66, 1.0], [sx * 0.86, 1.0], [sx * 0.86, 1.14], [sx * 0.66, 1.14]], p.glass, { face: "front", lift: 0.025 }));
    add(skin("Kính hông cabin", [[2.15, 1.5], [1.3, 1.5], [1.3, 1.85], [1.9, 1.85]], p.glass, { face: "right", mirror: sx < 0, lift: 0.015 }));
    add(skin("Sọc cabin (màu phe)", [[2.45, 1.32], [1.15, 1.32], [1.15, 1.4], [2.45, 1.4]], p.team, { face: "right", mirror: sx < 0 }));
    add(part("Gương", group(box(0.04, 0.04, 0.3, p.metal, sx * 1.12, 1.7, 2.2), box(0.06, 0.22, 0.14, p.hullDark, sx * 1.24, 1.7, 2.32))));
  }
  add(skin("Nóc cabin (màu phe)", [[-0.6, 2.0], [0.6, 2.0], [0.6, 1.25], [-0.6, 1.25]], p.team));
  add(part("Đèn hiệu", group(box(0.9, 0.08, 0.16, p.hullDark, 0, 2.1, 1.75), box(0.16, 0.08, 0.14, p.warning, -0.3, 2.17, 1.75), box(0.16, 0.08, 0.14, p.warning, 0.3, 2.17, 1.75))));
  add(part("Cản trước", box(2.0, 0.22, 0.2, p.hullDark, 0, 0.78, 2.66)), part("Tời kéo", group(cyl(0.12, 0.12, 0.6, p.metal, 10, 0, 0.8, 2.82).rotateZ(Math.PI / 2), box(0.7, 0.06, 0.06, p.warning, 0, 0.66, 2.8))));
  for (const sx of [-1, 1]) add(part("Móc kéo", box(0.1, 0.12, 0.16, p.warning, sx * 0.82, 0.62, 2.78)));

  // 2 ống xả đứng ở hai góc sau cabin (ngoài bề ngang cụm phóng), bánh dự phòng dựng sau đuôi xe
  for (const sx of [-1, 1]) add(part("Ống xả", group(cyl(0.07, 0.07, 1.1, p.metal, 8, sx * 1.02, 1.6, 1.0), cyl(0.09, 0.09, 0.12, p.hullDark, 8, sx * 1.02, 2.12, 1.0))));
  const spare = part("Bánh dự phòng", wheel(0.44, 0.24, p.rubber, p.metal));
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, 1.1, -2.58);
  add(spare);

  // ================================================================ 3. CHÂN CHỐNG (hạ khi dựng dàn)
  const jacks = group();
  for (const sx of [-1, 1])
    for (const z of [0.3, -2.3]) {
      jacks.add(box(0.16, 0.75, 0.16, p.metal, sx * 1.16, 0, z), box(0.42, 0.07, 0.42, p.hullDark, sx * 1.16, -0.38, z));
    }
  jacks.position.y = 1.05;
  add(part("Chân chống (hạ khi dựng dàn)", jacks));

  // ================================================================ 4. MÂM XOAY + CỤM 4 HỘP PHÓNG
  const turret = part("Mâm xoay", group(cyl(0.78, 0.88, 0.26, p.hullDark, 14, 0, 0.13, 0), cyl(0.9, 0.9, 0.05, p.team, 14, 0, 0.03, 0)));
  turret.position.set(0, 0.97, -1.0);
  // 2 tay nâng lớn đỡ trục ngóc ở đuôi cụm phóng
  for (const sx of [-1, 1]) turret.add(part("Tay nâng", facets([[sx * 0.62, 0.2, 0.4], [sx * 0.82, 0.2, 0.4], [sx * 0.62, 0.2, -0.75], [sx * 0.82, 0.2, -0.75], [sx * 0.62, 0.78, -0.55], [sx * 0.82, 0.78, -0.55]], p.hull)));
  turret.add(part("Bộ nâng thủy lực", group(cyl(0.11, 0.11, 0.7, p.metal, 8, 0, 0.5, -0.1).rotateX(-0.9), box(0.5, 0.3, 0.4, p.hullDark, 0, 0.32, 0.25))));

  const gun = group();
  gun.position.set(0, 0.72, -0.62);
  const L = 2.5; // chiều dài hộp phóng
  const PW = 0.78; // rộng một hộp
  const PH = 0.48; // cao một hộp
  const GX = 0.45; // tâm hộp theo x (khe giữa 2 hộp = 2·GX − PW = 0,12 m)
  const GY = 0.3; // tâm hộp theo y (khe = 0,12 m)
  const cluster = part("Cụm 4 hộp phóng", group());
  cluster.userData.z0 = 0;
  const muzzles: THREE.Object3D[] = [];
  // thứ tự bắn: hộp trên trái → trên phải → dưới trái → dưới phải; trong mỗi hộp bắn lần lượt 6 ống
  for (const [bx, by] of [[-GX, GY], [GX, GY], [-GX, -GY], [GX, -GY]] as const) {
    const pod = part("Hộp phóng 6 ống (2 × 3)", group(box(PW, PH, L, p.hull, 0, 0, 0)));
    pod.position.set(bx, by, L / 2);
    const fz = L / 2;
    pod.add(
      part("Viền miệng hộp (màu phe)", group(box(PW + 0.02, 0.05, 0.06, p.team, 0, PH / 2 - 0.02, fz), box(PW + 0.02, 0.05, 0.06, p.team, 0, -PH / 2 + 0.02, fz), box(0.05, PH, 0.06, p.team, PW / 2 - 0.02, 0, fz), box(0.05, PH, 0.06, p.team, -PW / 2 + 0.02, 0, fz))),
      part("Viền đuôi hộp", group(box(PW + 0.02, 0.05, 0.05, p.hullDark, 0, PH / 2 - 0.02, -fz), box(PW + 0.02, 0.05, 0.05, p.hullDark, 0, -PH / 2 + 0.02, -fz))),
      part("Sọc hộp (trắng)", box(0.03, PH * 0.6, L * 0.5, p.white, Math.sign(bx) * (PW / 2 + 0.005), 0, 0.15)),
      part("Mặt hộp phóng", box(PW - 0.08, PH - 0.08, 0.03, p.hullDark, 0, 0, fz + 0.005))
    );
    // tay xách trên nóc (hộp trên) / dưới đáy (hộp dưới): hộp phóng thay được như băng đạn
    pod.add(part("Tay xách hộp", box(0.32, 0.05, 0.06, p.metal, 0, Math.sign(by) * (PH / 2 + 0.04), -0.3)));
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++) {
        const x = -0.23 + col * 0.23;
        const y = -0.09 + row * 0.18;
        const rim = part("Vành đầu đạn (màu phe)", cyl(0.085, 0.085, 0.03, p.team, 10, x, y, fz + 0.025));
        rim.rotation.x = Math.PI / 2;
        const hole = part("Đầu đạn", cyl(0.06, 0.06, 0.04, p.metal, 10, x, y, fz + 0.03));
        hole.rotation.x = Math.PI / 2;
        pod.add(rim, hole);
        const m = group();
        m.position.set(bx + x, by + y, L + 0.08);
        cluster.add(m);
        muzzles.push(m);
      }
    cluster.add(pod);
  }
  // Ghép 4 hộp thành một: 2 đai kẹp quấn quanh cụm, giá chữ thập ở đuôi, khung đỡ bên dưới
  const OW = 2 * GX + PW; // bề ngang cả cụm
  const OH = 2 * GY + PH;
  for (const z of [0.55, 1.85]) {
    cluster.add(
      part("Đai kẹp", group(
        box(OW + 0.08, 0.06, 0.16, p.metal, 0, OH / 2 + 0.03, z),
        box(OW + 0.08, 0.06, 0.16, p.metal, 0, -OH / 2 - 0.03, z),
        box(0.06, OH + 0.12, 0.16, p.metal, OW / 2 + 0.03, 0, z),
        box(0.06, OH + 0.12, 0.16, p.metal, -OW / 2 - 0.03, 0, z)
      )),
      part("Khóa đai (màu phe)", box(0.1, 0.14, 0.2, p.team, OW / 2 + 0.07, 0, z))
    );
  }
  cluster.add(
    part("Giá chữ thập", group(box(OW, 0.14, 0.12, p.hullDark, 0, 0, 0.0), box(0.14, OH, 0.12, p.hullDark, 0, 0, 0.0), box(0.3, 0.3, 0.16, p.metal, 0, 0, -0.02))),
    part("Khung đỡ", group(box(OW - 0.2, 0.08, L - 0.3, p.hullDark, 0, -OH / 2 - 0.09, L / 2), box(0.12, 0.12, L - 0.3, p.hullDark, -0.5, -OH / 2 - 0.15, L / 2), box(0.12, 0.12, L - 0.3, p.hullDark, 0.5, -OH / 2 - 0.15, L / 2))),
    part("Ống dẫn cáp", box(0.1, 0.1, 0.6, p.metal, 0.3, -OH / 2 - 0.2, 0.3))
  );
  gun.add(cluster);
  turret.add(gun);
  add(turret);

  return vehicleRig(
    "rocket",
    p,
    { body, wheels, turret, gun, barrels: [cluster], muzzles, flashes: [], spinners: [], aimPitch: 0.62, recoil: 0.04, missiles: true, fireEvery: 0.2 },
    3.6,
    [{ id: "deploy", label: "Dựng dàn" }],
    (dt, _t, a) => {
      jacks.position.y = approach(jacks.position.y, a.has("deploy") ? 0.42 : 1.05, 5, dt);
    }
  );
}
