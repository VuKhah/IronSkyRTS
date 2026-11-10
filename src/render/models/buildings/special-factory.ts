/**
 * Xưởng Xe Chuyên Dụng, bản 3 (10/11/2026), dựng theo bản vẽ mặt bằng của người dùng (ảnh xoay +90°).
 *
 * Nền móng 11 × 11 ô (22 × 22 m) = thân 9 × 9 ô + viền 1 ô bê tông. Trong khung mô hình cửa ở +z; nhìn bản vẽ với cửa ở trên
 * thì bên phải bản vẽ là phía −x (giống Xưởng Xe Tăng):
 *  - KHU RÁP 6 × 6 ô ở góc trước bên phải (`bay` [-9, -3, 3, 9]):
 *      · 2 BỆ RÁP 5 × 3 ô (10 × 6 m) nối nhau từ trước ra sau (`pads`). Xe tên lửa / pháo nòng dài đứng ngang trên bệ, đầu
 *        quay về phía hầm (`padFace` = −x). Đang đúc xe gì thì trên bệ hiện thẳng xe đó; xong lô thì xe thật ra đúng chỗ đó.
 *      · HẦM KIỂM CHUẨN 1 × 6 ô dọc mép ngoài (phía −x), chạy tới cạnh cửa: xe lăn sang hầm rồi chạy thẳng ra.
 *  - NHÀ CHỮ L (phần gạch chéo), ba khối ba chiều cao:
 *      · Nhà ráp chính (cánh 6 × 12 m sát hai bệ): cao nhất, tường 9 m, mái dốc hai bên, 2 cửa cuốn quay ra 2 bệ.
 *      · Kho linh kiện (khối sau, nửa phía +x): 6,6 m.
 *      · Xưởng gia công (khối sau, nửa phía −x, cuối hầm): 4,8 m, nóc có giàn phóng thử ngóc lên khi đúc và giá nòng pháo.
 * Mọi số khu ráp đọc từ `BUILDINGS["special-factory"]` (half, bay, pads) và `RULES.buildMarginCells`.
 */
import * as THREE from "three";
import { BUILDINGS, RULES, type Faction, type UnitId } from "../../../sim/content";
import { CELL } from "../../../sim/maps";
import { approach, box, cyl, facets, group, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig, productionSignals, BASE_Y, type P3 } from "./shared";

const SPEC = BUILDINGS["special-factory"];
const [BX, BZ] = SPEC.half; // nửa thân: 9 × 9 m
const MARGIN = RULES.buildMarginCells * CELL;
const BAY = SPEC.bay!; // [x0, z0, x1, z1]
const PADS = SPEC.pads!;
const PAD_X0 = Math.min(...PADS.map((r) => r[0])); // mép bệ phía hầm
const PAD_X1 = Math.max(...PADS.map((r) => r[2])); // mép bệ phía nhà ráp
const PIT_X0 = BAY[0];
const PIT_X1 = PAD_X0; // hầm kiểm chuẩn: phần khu ráp ngoài các bệ
const PIT_X = (PIT_X0 + PIT_X1) / 2;

// nhà ráp chính: phần thân từ mép bệ tới cạnh thân, dọc theo khu ráp
const AX0 = PAD_X1;
const AX1 = BX;
const AZ0 = BAY[1];
const AZ1 = BZ;
const AX = (AX0 + AX1) / 2;
const AZ = (AZ0 + AZ1) / 2;
const A_TOP = 9; // đỉnh tường nhà ráp
const A_RIDGE = 1.4; // mái dốc cao thêm
// khối sau: từ cạnh sau thân tới cạnh sau khu ráp, chia đôi ở x = KX
const HZ0 = -BZ;
const HZ1 = BAY[1];
const HZ = (HZ0 + HZ1) / 2;
const HD = HZ1 - HZ0;
const KX = -1;
const K_TOP = 6.6; // kho linh kiện
const G_TOP = 4.8; // xưởng gia công

const DOOR_W = 5.0; // cửa cuốn (Pháo Tự Hành dài, cao 5,1 m)
const DOOR_H = 6.0;
const RAIL_Y = 7.4; // ray cầu trục trên hai bệ

export function buildSpecialFactory(p: Palette, faction: Faction): Rig {
  const slab = BX * 2 + MARGIN * 2;
  const root = group();
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const sig = productionSignals(p, 8);

  // ================================================================ 0. NỀN: viền bê tông + mép màu phe
  add(part("Viền bê tông (xe đi được)", box(slab, BASE_Y, slab, p.concrete, 0, BASE_Y / 2, 0)));
  for (const s of [-1, 1]) {
    add(part("Mép nền (màu phe)", box(slab + 0.06, 0.06, 0.3, p.team, 0, BASE_Y + 0.01, s * (slab / 2 - 0.15))));
    add(part("Mép nền (màu phe)", box(0.3, 0.06, slab + 0.06, p.team, s * (slab / 2 - 0.15), BASE_Y + 0.01, 0)));
  }

  /** Khối nhà hộp: vỏ thép, đai màu phe sát đỉnh, cột thép ở 4 góc. */
  const block = (name: string, x0: number, x1: number, z0: number, z1: number, top: number) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    add(part(name, box(x1 - x0, top - BASE_Y, z1 - z0, p.hull, cx, (top + BASE_Y) / 2, cz)));
    add(part("Đai tường (màu phe)", box(x1 - x0 + 0.05, 0.3, z1 - z0 + 0.05, p.team, cx, top - 0.3, cz)));
    for (const x of [x0, x1]) for (const z of [z0, z1]) add(part("Cột thép", box(0.24, top - BASE_Y - 0.5, 0.24, p.hullDark, x, (top + BASE_Y - 0.5) / 2, z)));
  };

  // ================================================================ 1. NHÀ RÁP CHÍNH (cao nhất)
  block("Nhà ráp chính", AX0, AX1, AZ0, AZ1, A_TOP);
  for (let z = AZ0 + 2; z < AZ1 - 1; z += 2) add(part("Cột thép", box(0.2, A_TOP - BASE_Y - 0.5, 0.2, p.hullDark, AX1 + 0.05, (A_TOP + BASE_Y - 0.5) / 2, z)));
  add(part("Dải cửa sổ", box(0.04, 0.7, AZ1 - AZ0 - 1.4, p.glass, AX1 + 0.03, 7.4, AZ)));
  add(part("Dải cửa sổ", box(AX1 - AX0 - 1.2, 0.7, 0.04, p.glass, AX, 7.4, AZ1 + 0.03)));
  add(part("Biển xưởng (màu phe)", box(3.6, 1.2, 0.06, p.teamDark, AX, 5.4, AZ1 + 0.04)));
  for (let i = 0; i < 3; i++) add(part("Chữ V biển xưởng (trắng)", box(0.5, 0.12, 0.03, p.white, AX - 1 + i, 5.4, AZ1 + 0.08)));
  // mái dốc hai bên, nóc chạy dọc z; mỗi mặt dốc dựng trong khung nghiêng (x' lên dốc, y' vuông góc mái)
  const halfW = (AX1 - AX0) / 2;
  const SL = Math.hypot(halfW, A_RIDGE);
  const ANG = Math.atan2(A_RIDGE, halfW);
  const gable: P3[] = [];
  for (const z of [AZ0, AZ1]) gable.push([AX0, A_TOP, z], [AX1, A_TOP, z], [AX, A_TOP + A_RIDGE, z]);
  add(part("Mái dốc nhà ráp", facets(gable, p.hullDark)));
  const ad = AZ1 - AZ0;
  for (const side of [-1, 1]) {
    const s = group();
    // side −1: mặt dốc phía bệ (đi lên từ AX0); side +1: phía ngoài (xoay nửa vòng quanh trục đứng nên z đảo dấu, nội dung đối xứng)
    s.position.set(side < 0 ? AX0 : AX1, A_TOP, AZ);
    s.rotation.set(0, side < 0 ? 0 : Math.PI, ANG);
    add(s);
    s.add(part("Mặt mái (màu phe)", box(SL - 0.3, 0.06, ad - 0.4, p.team, SL / 2, 0.05, 0)));
    for (let z = -ad / 2 + 0.6; z < ad / 2 - 0.3; z += 0.8) s.add(part("Gân tôn", box(SL - 0.3, 0.05, 0.06, p.hullDark, SL / 2, 0.1, z)));
    s.add(part("Máng xối", box(0.3, 0.16, ad + 0.2, p.hullDark, 0.1, 0.02, 0)));
    for (const z of [-3.2, 0.4, 3.8]) {
      s.add(part("Khung kính trời", box(1.4, 0.14, 1.6, p.hullDark, SL * 0.45, 0.1, z)));
      s.add(part("Kính trời", box(1.15, 0.05, 1.35, p.glass, SL * 0.45, 0.19, z)));
    }
  }
  // nóc thông gió chạy dọc nóc mái; thanh tiến độ nằm trên nó (nhìn từ trên thấy ngay)
  const RV_Y = A_TOP + A_RIDGE;
  add(part("Nóc thông gió", box(1.4, 0.7, ad - 2, p.hull, AX, RV_Y + 0.25, AZ)));
  for (const sx of [-1, 1]) add(part("Kính nóc thông gió", box(0.04, 0.4, ad - 2.6, p.glass, AX + sx * 0.71, RV_Y + 0.3, AZ)));
  add(part("Nắp nóc thông gió (màu phe)", box(1.6, 0.1, ad - 1.8, p.team, AX, RV_Y + 0.65, AZ)));
  sig.bar.rotation.y = Math.PI / 2;
  sig.bar.position.set(AX, RV_Y + 0.75, AZ);
  add(sig.bar);

  // phòng điều khiển nhô ra phía hai bệ, giữa hai cửa cuốn
  const midZ = (PADS[0][1] + PADS[0][3] + PADS[1][1] + PADS[1][3]) / 4;
  add(part("Phòng điều khiển", box(1.3, 1.9, 2.6, p.hullDark, AX0 - 0.65, 7.6, midZ)));
  add(part("Kính phòng điều khiển", box(0.05, 1.2, 2.3, p.glass, AX0 - 1.32, 7.7, midZ)));

  // ================================================================ 2. CỬA CUỐN: mỗi bệ một cửa, mở cùng lúc nên chung một khung động
  const doorY = BASE_Y + DOOR_H / 2;
  const doors = part("Cửa cuốn", group());
  doors.position.set(AX0 - 0.09, doorY, 0);
  add(doors);
  for (const r of PADS) {
    const cz = (r[1] + r[3]) / 2;
    add(part("Lòng xưởng", box(0.05, DOOR_H, DOOR_W, p.hullDark, AX0 - 0.01, doorY, cz)));
    add(part("Lò đúc (sáng khi đang đúc)", box(0.03, DOOR_H * 0.6, DOOR_W - 0.7, sig.glow, AX0 - 0.04, BASE_Y + DOOR_H * 0.35, cz)));
    doors.add(part("Cửa cuốn", box(0.08, DOOR_H, DOOR_W, p.teamDark, 0, 0, cz)));
    for (let i = 0; i < 11; i++) doors.add(part("Nan cửa", box(0.03, 0.04, DOOR_W - 0.08, p.metal, -0.055, -DOOR_H / 2 + 0.3 + i * 0.52, cz)));
    for (const sz of [-1, 1]) add(part("Khung cửa", box(0.3, DOOR_H + 0.1, 0.24, p.hullDark, AX0 - 0.06, doorY + 0.05, cz + sz * (DOOR_W / 2 + 0.12))));
    for (let i = 0; i < 11; i++) add(part("Sọc cảnh báo", box(0.1, 0.26, 0.46, i % 2 ? p.hullDark : p.warning, AX0 - 0.08, BASE_Y + DOOR_H + 0.22, cz - 2.3 + i * 0.46)));
    add(part("Đèn cửa", sphere(0.16, sig.beacon, AX0 - 0.15, BASE_Y + DOOR_H + 0.65, cz, 6)));
  }

  // ================================================================ 3. KHỐI SAU: kho linh kiện (vừa) + xưởng gia công (thấp)
  block("Kho linh kiện", KX, BX, HZ0, HZ1, K_TOP);
  block("Xưởng gia công", -BX, KX, HZ0, HZ1, G_TOP);
  add(part("Dải cửa sổ", box(BX - KX - 1.2, 0.6, 0.04, p.glass, (KX + BX) / 2, 5.2, HZ0 - 0.03)));
  add(part("Dải cửa sổ", box(KX + BX - 1.2, 0.6, 0.04, p.glass, (KX - BX) / 2, 3.4, HZ0 - 0.03)));
  add(part("Dải cửa sổ", box(0.04, 0.6, HD - 1.2, p.glass, BX + 0.03, 5.2, HZ)));
  add(part("Dải cửa sổ", box(0.04, 0.6, HD - 1.2, p.glass, -BX - 0.03, 3.4, HZ)));
  // mặt trước xưởng gia công (nhìn ra hầm và bệ 2): cửa nhỏ, cửa sổ
  add(part("Cửa xưởng gia công", box(1.6, 2.6, 0.06, p.hullDark, (KX - BX) / 2 + 1.5, BASE_Y + 1.3, HZ1 + 0.04)));
  add(part("Dải cửa sổ", box(3, 0.6, 0.04, p.glass, (KX - BX) / 2 - 1.2, 3.4, HZ1 + 0.03)));
  // mái kho: viền màu phe, sàn mái tối, 2 quạt hút, máy điều hòa
  const KXc = (KX + BX) / 2;
  add(part("Mặt mái kho", box(BX - KX - 0.5, 0.08, HD - 0.5, p.concreteDark, KXc, K_TOP + 0.04, HZ)));
  for (const x of [KX + 1.6, KX + 3.6]) {
    add(part("Quạt hút gió tròn", group(cyl(0.3, 0.34, 0.5, p.hullDark, 10, x, K_TOP + 0.3, HZ - 1), cyl(0.44, 0.44, 0.44, p.metal, 12, x, K_TOP + 0.75, HZ - 1), sphere(0.44, p.metal, x, K_TOP + 0.97, HZ - 1, 10))));
  }
  for (const x of [KX + 1.4, KX + 3.4]) {
    add(part("Máy điều hòa", box(1.1, 0.6, 1.1, p.metal, x, K_TOP + 0.38, HZ + 1.3)));
    add(part("Quạt điều hòa", cyl(0.38, 0.38, 0.04, p.rubber, 10, x, K_TOP + 0.7, HZ + 1.3)));
  }
  // mái xưởng gia công: giàn phóng thử ngóc lên khi đúc, giá nòng pháo chờ lắp, ống xả
  const GXc = (KX - BX) / 2;
  add(part("Mặt mái xưởng gia công", box(KX + BX - 0.5, 0.08, HD - 0.5, p.concreteDark, GXc, G_TOP + 0.04, HZ)));
  const RACK_X = GXc + 1.2;
  const RACK_Z = HZ - 1.4;
  const rack = part("Giàn phóng thử", group());
  rack.add(part("Thân giàn", box(2.3, 0.86, 2.2, p.hullDark, 0, 0.43, 1.1)), part("Nắp giàn (màu phe)", box(2.34, 0.1, 2.24, p.team, 0, 0.9, 1.1)));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const tube = part("Ống phóng", cyl(0.2, 0.2, 0.05, p.metal, 10, -0.78 + c * 0.52, 0.22 + r * 0.42, 2.22));
      tube.rotation.x = Math.PI / 2;
      rack.add(tube);
    }
  rack.position.set(RACK_X, G_TOP + 0.08, RACK_Z);
  add(rack, part("Bệ giàn phóng", box(2.5, 0.2, 0.5, p.metal, RACK_X, G_TOP + 0.18, RACK_Z)));
  const BAR_X = GXc - 2.2;
  for (const z of [HZ - 1.6, HZ + 1.6]) add(part("Giá đỡ nòng", box(0.8, 1.0, 0.16, p.hullDark, BAR_X, G_TOP + 0.5, z)));
  for (const [dx, y] of [[-0.2, 0.55], [0.2, 0.55], [0, 0.95]] as const) {
    const bar = part("Nòng pháo chờ lắp", tubeZ(0.14, 0.16, 4.4, p.metal, 10));
    bar.position.set(BAR_X + dx, G_TOP + y, HZ);
    add(bar);
    const band = part("Đai nòng (màu phe)", tubeZ(0.17, 0.17, 0.14, p.team, 10));
    band.position.set(BAR_X + dx, G_TOP + y, HZ + 1.9);
    add(band);
  }
  for (const z of [HZ0 + 0.9, HZ0 + 1.9]) {
    add(part("Ống xả", cyl(0.22, 0.26, 2.2, p.hullDark, 10, -BX + 0.9, G_TOP + 1.1, z)));
    add(part("Miệng ống xả", cyl(0.27, 0.24, 0.14, p.metal, 10, -BX + 0.9, G_TOP + 2.25, z)));
  }

  // ================================================================ 4. HẦM KIỂM CHUẨN: lòng hầm có lưới, mép sọc, đèn đo, cột cảm biến cuối hầm
  const pitD = BAY[3] - BAY[1];
  const pitZ = (BAY[1] + BAY[3]) / 2;
  const pitW = PIT_X1 - PIT_X0;
  add(part("Lòng hầm kiểm chuẩn", box(pitW - 0.1, 0.05, pitD - 0.1, p.rubber, PIT_X, BASE_Y + 0.025, pitZ)));
  for (let z = BAY[1] + 0.4; z < BAY[3] - 0.2; z += 0.6) add(part("Lưới hầm", box(pitW - 0.5, 0.03, 0.08, p.metal, PIT_X, BASE_Y + 0.065, z)));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 12; i++) add(part("Mép hầm (sọc cảnh báo)", box(0.16, 0.04, 1.0, i % 2 ? p.hullDark : p.warning, PIT_X + sx * (pitW / 2 - 0.08), BASE_Y + 0.07, BAY[1] + 0.5 + i)));
    for (let i = 0; i < 5; i++) add(part("Đèn đo kiểm chuẩn", box(0.12, 0.08, 0.3, sig.beacon, PIT_X + sx * (pitW / 2 - 0.3), BASE_Y + 0.09, BAY[1] + 1.5 + i * 2.2)));
  }
  add(part("Cột cảm biến kiểm chuẩn", box(0.3, 3.6, 0.3, p.hullDark, PIT_X, BASE_Y + 1.8, HZ1 + 0.2)));
  add(part("Đầu cảm biến", box(0.7, 0.5, 0.45, p.metal, PIT_X, BASE_Y + 3.4, HZ1 + 0.5)));
  add(part("Mắt cảm biến", cyl(0.14, 0.14, 0.06, p.glass, 10, PIT_X, BASE_Y + 3.4, HZ1 + 0.74)).rotateX(Math.PI / 2));
  // mũi tên tối trên hầm chỉ hướng xe ra cửa
  for (const z of [BAY[1] + 3, BAY[3] - 2]) {
    const arrow: P3[] = [];
    for (const y of [BASE_Y + 0.06, BASE_Y + 0.085]) arrow.push([PIT_X - 0.55, y, z - 0.4], [PIT_X + 0.55, y, z - 0.4], [PIT_X, y, z + 0.5]);
    add(part("Mũi tên ra xe", facets(arrow, p.white)));
  }

  // ================================================================ 5. HAI BỆ RÁP + GIÀN CẦU TRỤC
  PADS.forEach((r, k) => {
    const cx = (r[0] + r[2]) / 2;
    const cz = (r[1] + r[3]) / 2;
    const w = r[2] - r[0];
    const d = r[3] - r[1];
    add(part("Bệ ráp", box(w - 0.12, 0.05, d - 0.12, p.concreteDark, cx, BASE_Y + 0.025, cz)));
    add(part("Sàn nâng", box(w - 1.4, 0.03, d - 0.9, p.white, cx, BASE_Y + 0.06, cz)));
    for (const sz of [-1, 1]) add(part("Vạch bệ ráp", box(w - 0.3, 0.02, 0.12, p.warning, cx, BASE_Y + 0.07, cz + sz * (d / 2 - 0.18))));
    for (let i = 0; i <= k; i++) add(part("Số bệ", box(0.18, 0.02, 0.7, p.hullDark, r[2] - 0.5 - i * 0.32, BASE_Y + 0.08, cz)));
  });
  // ray chạy dọc z: ray trong bắt vào tường nhà ráp, ray ngoài đứng trên 2 cột ở hai đầu (không cột nào giữa đường xe ra hầm)
  const R_IN = AX0 - 0.35;
  const R_OUT = PAD_X0 + 0.2;
  const rz0 = BAY[1] + 0.2;
  const rz1 = BAY[3] - 0.2;
  for (const x of [R_IN, R_OUT]) add(part("Ray cầu trục", box(0.26, 0.24, rz1 - rz0 + 0.3, p.metal, x, RAIL_Y, (rz0 + rz1) / 2)));
  for (const z of [rz0, rz1]) add(part("Cột cầu trục", box(0.3, RAIL_Y - BASE_Y, 0.3, p.hullDark, R_OUT, (RAIL_Y + BASE_Y) / 2, z)));
  for (let z = rz0 + 1; z < rz1; z += 3) add(part("Giá ray", box(0.4, 0.5, 0.2, p.hullDark, AX0 - 0.2, RAIL_Y - 0.3, z)));
  const span = R_IN - R_OUT;
  const crane = part("Dầm cầu trục", group(box(span, 0.36, 0.34, p.warning), box(0.9, 0.42, 0.8, p.hullDark, 0, -0.36, 0), box(0.05, 1.4, 0.05, p.rubber, 0, -1.2, 0), box(0.34, 0.16, 0.34, p.metal, 0, -1.95, 0)));
  const PAD_Z = PADS.map((r) => (r[1] + r[3]) / 2);
  crane.position.set((R_IN + R_OUT) / 2, RAIL_Y + 0.3, PAD_Z[0]);
  add(crane);

  // ================================================================ 6. XE ĐANG RÁP / MÁY MÓC TRÊN TỪNG BỆ
  const kinds = (SPEC.produces ?? []) as UnitId[];
  // nấc padFace n → rotation.y = n·90° (mũi +z quay thành sin/cos của góc đó: 1 = +x, 3 = −x), khớp doorDir(n) của sim
  const face = ((SPEC.padFace ?? 0) * Math.PI) / 2;
  const stalls: { cars: Map<UnitId, THREE.Group>; tools: THREE.Group; spark: THREE.Mesh }[] = [];
  PADS.forEach((r) => {
    const cx = (r[0] + r[2]) / 2;
    const cz = (r[1] + r[3]) / 2;
    const cars = new Map<UnitId, THREE.Group>();
    for (const kind of kinds) {
      const car = buildUnit(kind, faction).root;
      // xe trên bệ đứng yên hẳn: bỏ cờ bộ phận động để bake gộp cả xe
      car.traverse((o) => {
        delete o.userData.animated;
      });
      const g = part(`Xe đang ráp: ${kind}`, group(car));
      g.position.set(cx, BASE_Y, cz);
      g.rotation.y = face;
      g.visible = false;
      g.userData.animated = true; // ẩn / hiện theo xưởng: bake không được gộp vào thân
      cars.set(kind, g);
      add(g);
    }
    // máy móc khi bệ trống (khung bệ: x' dọc bệ, z' ngang bệ)
    const tools = part(
      "Máy móc bệ trống",
      group(
        part("Giá phụ tùng", box(4.2, 2.2, 0.5, p.metal, 1.2, BASE_Y + 1.1, -1.9)),
        part("Ống phóng dự phòng", box(3.6, 0.5, 0.5, p.hullDark, 1.2, BASE_Y + 2.45, -1.9)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, -2.6, BASE_Y + 0.4, -1.4)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, -2.6, BASE_Y + 1.2, -1.4)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, -1.3, BASE_Y + 0.4, -1.4)),
        part("Xe nâng", box(1.6, 0.9, 1.0, p.metal, 0.4, BASE_Y + 0.6, 1.3)),
        part("Càng xe nâng", box(0.1, 1.6, 0.9, p.metal, -0.45, BASE_Y + 0.9, 1.3))
      )
    );
    tools.position.set(cx, 0, cz);
    tools.userData.animated = true;
    add(tools);
    const spark = sphere(0.24, p.flash, cx + 1.5, BASE_Y + 2.2, cz - 1.4, 6);
    spark.castShadow = false;
    spark.visible = false;
    add(part("Tia lửa hàn", spark));
    stalls.push({ cars, tools, spark });
  });

  // ================================================================ hoạt ảnh
  // chiến trường báo xe đang ráp qua setAssembly; Xưởng Mô Hình không gọi thì bật "Vận hành" là ráp thử Xe Tên Lửa Loạt
  let external = false;
  let asmKind: UnitId | null = null;
  let asmCount = 0;
  let doorT = 0;
  let rackT = 0;
  let craneZ = PAD_Z[0];
  const built = rig(root, [WORK], 16, [
    (dt, t, a) => {
      const on = a.has("work");
      const kind = external ? asmKind : on ? kinds[0] ?? null : null;
      const count = external ? asmCount : 2;
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      doors.position.x = AX0 - 0.09;
      doors.position.y = doorY + doorT * DOOR_H * 0.425;
      doors.scale.y = 1 - doorT * 0.85;
      rackT = approach(rackT, on ? 1 : 0, 1.5, dt);
      rack.rotation.x = -rackT * 0.7; // miệng ống phóng (phía +z) ngóc lên
      let busy = 0;
      stalls.forEach((s, k) => {
        const used = kind !== null && k < count;
        // xưởng đang đúc thì xe hiện thẳng trên bệ, không nâng dần
        for (const [ck, g] of s.cars) g.visible = used && ck === kind;
        s.tools.visible = !used;
        s.spark.visible = used && on && Math.sin(t * 23 + k * 2.1) > 0.2;
        if (used) busy++;
      });
      // dầm cầu trục đi qua lại giữa các bệ đang ráp
      const zA = PAD_Z[0];
      const zB = PAD_Z[Math.max(0, busy - 1)];
      const target = on && busy ? zA + (zB - zA) * (Math.sin(t * 0.5) * 0.5 + 0.5) : zA;
      craneZ = on && busy ? target : approach(craneZ, target, 2, dt);
      crane.position.z = craneZ;
    },
    sig.update
  ]);
  built.setLevel = sig.setLevel;
  built.setAssembly = (kind, count) => {
    external = true;
    asmKind = kind;
    asmCount = count;
  };
  return built;
}
