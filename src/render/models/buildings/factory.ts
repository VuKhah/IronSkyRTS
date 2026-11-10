/**
 * Xưởng Xe Tăng, bản 3 (10/11/2026), dựng theo bản vẽ mặt bằng của người dùng.
 *
 * Nền móng 11 × 11 ô (22 × 22 m) = thân 9 × 9 ô + viền 1 ô bê tông xe đi được. Trong thân (cửa ở +z, nhìn bản vẽ với cửa
 * ở trên thì khu ráp nằm góc trước bên phải; trong khung mô hình là phía −x):
 *  - NHÀ XƯỞNG chữ L (phần gạch chéo): khối sau 18 × 10 m + cánh 6 × 8 m ở góc trước còn lại. Mặt trước khối sau có 3 cửa
 *    cuốn nhìn thẳng ra 3 sân ráp.
 *  - 3 SÂN RÁP 2 × 3 ô (4 × 6 m) ngoài trời, có giàn cầu trục phía trên: đang đúc xe gì thì trên sân là xe đó (hiện thẳng,
 *    không nâng dần); xong lô thì xe thật xuất hiện đúng chỗ đó (sim: `World.doorPos`). Sân không có xe thì bày máy móc.
 *  - DẢI ĐƯỜNG 1 × 6 ô trước 3 sân để xe chạy ra.
 * Mọi số đọc từ `BUILDINGS.factory` (half, bay, doors, stall) và `RULES.buildMarginCells` để mô hình khớp ô sim chặn.
 */
import * as THREE from "three";
import { BUILDINGS, RULES, type Faction, type UnitId } from "../../../sim/content";
import { CELL } from "../../../sim/maps";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig, productionSignals, strut, BASE_Y, type P3 } from "./shared";

const SPEC = BUILDINGS.factory;
const [BX, BZ] = SPEC.half; // nửa thân nhà: 9 × 9 m
const MARGIN = RULES.buildMarginCells * CELL; // viền trong mô hình
const BAY = SPEC.bay!; // [x0, z0, x1, z1]: khu ráp + dải đường
const DOORS = SPEC.doors ?? 3;
const STALL = SPEC.stall ?? 6;
const STALL_W = (BAY[2] - BAY[0]) / DOORS; // 4 m
const STALL_Z = BAY[1] + STALL / 2; // tâm sân ráp theo z (xe đứng ở đây, khớp World.doorPos)

const WALL_TOP = 7; // đỉnh tường nhà xưởng
const DOOR_W = 3.7; // cửa cuốn (Titan rộng 3,58 m, cao 3,35 m)
const DOOR_H = 4.6;
const WING_TOP = 5.6; // cánh văn phòng 2 tầng
const RAIL_Y = 6.3; // ray cầu trục trên sân ráp

export function buildFactory(p: Palette, faction: Faction): Rig {
  const slab = BX * 2 + MARGIN * 2;
  const root = group();
  const add = (...o: THREE.Object3D[]) => root.add(...o);

  // ================================================================ 0. NỀN: viền bê tông + thân
  add(part("Viền bê tông (xe đi được)", box(slab, BASE_Y, slab, p.concrete, 0, BASE_Y / 2, 0)));
  for (const s of [-1, 1]) {
    add(part("Mép nền (màu phe)", box(slab + 0.06, 0.06, 0.3, p.team, 0, BASE_Y + 0.01, s * (slab / 2 - 0.15))));
    add(part("Mép nền (màu phe)", box(0.3, 0.06, slab + 0.06, p.team, s * (slab / 2 - 0.15), BASE_Y + 0.01, 0)));
  }

  // ================================================================ 1. NHÀ XƯỞNG CHỮ L
  // khối sau: hết bề ngang thân, từ cạnh sau tới cạnh sau của khu ráp
  const HZ0 = -BZ;
  const HZ1 = BAY[1];
  const hallD = HZ1 - HZ0;
  const hallZ = (HZ0 + HZ1) / 2;
  add(part("Vỏ thép nhà xưởng", box(BX * 2, WALL_TOP - BASE_Y, hallD, p.hull, 0, (WALL_TOP + BASE_Y) / 2, hallZ)));
  add(part("Đai tường (màu phe)", box(BX * 2 + 0.05, 0.3, hallD + 0.05, p.team, 0, WALL_TOP - 0.25, hallZ)));
  for (let x = -BX; x <= BX + 1e-6; x += 3) {
    add(part("Cột thép", box(0.2, WALL_TOP - BASE_Y - 0.4, 0.2, p.hullDark, x, (WALL_TOP + BASE_Y - 0.4) / 2, HZ0 - 0.05)));
  }
  for (const sx of [-1, 1]) {
    for (let z = HZ0; z <= HZ1 + 1e-6; z += hallD / 3) add(part("Cột thép", box(0.2, WALL_TOP - BASE_Y - 0.4, 0.2, p.hullDark, sx * (BX + 0.05), (WALL_TOP + BASE_Y - 0.4) / 2, z)));
    add(part("Dải cửa sổ", box(0.04, 0.6, hallD - 1.2, p.glass, sx * (BX + 0.03), 5.4, hallZ)));
  }
  add(part("Dải cửa sổ", box(BX * 2 - 1.2, 0.6, 0.04, p.glass, 0, 5.4, HZ0 - 0.03)));

  // mái răng cưa 3 nhịp chạy dọc z: nhìn từ trên cao vẫn là 3 sọc màu phe, nhưng mỗi nhịp một việc riêng
  // (quạt hút tròn / hộp quạt thông gió / kính trời) để mái không thành 3 tấm phẳng giống hệt nhau
  const TEETH = 3;
  const TW = (BX * 2) / TEETH;
  const TH = 1.6;
  const SL = Math.hypot(TW, TH); // chiều dài mặt dốc
  const SLOPE = Math.atan2(TH, TW);
  for (let i = 0; i < TEETH; i++) {
    const x0 = -BX + i * TW;
    const x1 = x0 + TW;
    const wedge: P3[] = [];
    for (const z of [HZ0, HZ1]) wedge.push([x0, WALL_TOP, z], [x1, WALL_TOP, z], [x1, WALL_TOP + TH, z]);
    add(part("Mái răng cưa", facets(wedge, p.hullDark)));
    add(part("Dải kính lấy sáng", box(0.06, TH * 0.75, hallD - 0.6, p.glass, x1 + 0.04, WALL_TOP + TH * 0.45, hallZ)));
    for (let z = HZ0 + 0.6; z < HZ1; z += 1.6) add(part("Song kính", box(0.1, TH * 0.8, 0.08, p.hullDark, x1 + 0.06, WALL_TOP + TH * 0.45, z)));

    // khung nghiêng theo mặt dốc: trục x' chạy lên dốc (0..SL), y' vuông góc mặt mái, z giữ nguyên
    const s = group();
    s.position.set(x0, WALL_TOP, 0);
    s.rotation.z = SLOPE;
    add(s);
    const on = (...o: THREE.Object3D[]) => s.add(...o);
    // tấm màu phe chia 2 nửa trước / sau bằng dải tối, giữ sọc màu phe khi nhìn từ xa
    const halfD = (hallD - 0.9) / 2;
    for (const k of [-1, 1]) on(part("Mặt mái (màu phe)", box(SL - 0.45, 0.06, halfD, p.team, SL / 2, 0.05, hallZ + k * (halfD / 2 + 0.15))));
    // gân tôn sóng chạy theo dốc
    for (let z = HZ0 + 0.55; z < HZ1 - 0.3; z += 0.7) on(part("Gân tôn", box(SL - 0.45, 0.05, 0.06, p.hullDark, SL / 2, 0.1, z)));
    on(part("Nóc mái", box(0.32, 0.14, hallD + 0.1, p.metal, SL - 0.12, 0.08, hallZ)));
    on(part("Máng xối", box(0.3, 0.16, hallD + 0.2, p.hullDark, 0.1, 0.02, hallZ)));

    if (i === 0) {
      // hàng quạt hút gió tròn (turbine) dọc nóc
      for (let k = 0; k < 4; k++) {
        const z = HZ0 + 1.4 + k * ((hallD - 2.8) / 3);
        on(
          part(
            "Quạt hút gió tròn",
            group(
              cyl(0.28, 0.32, 0.4, p.hullDark, 10, SL * 0.62, 0.3, z),
              cyl(0.42, 0.42, 0.42, p.metal, 12, SL * 0.62, 0.72, z),
              sphere(0.42, p.metal, SL * 0.62, 0.93, z, 10)
            )
          )
        );
        on(part("Đai quạt (màu phe)", cyl(0.44, 0.44, 0.08, p.teamDark, 12, SL * 0.62, 0.72, z)));
      }
      // lối đi bảo trì dọc chân dốc
      on(part("Lối đi bảo trì", box(0.7, 0.06, hallD - 1, p.metal, 1.0, 0.16, hallZ)));
      for (let z = HZ0 + 0.8; z < HZ1 - 0.4; z += 2.2) on(part("Lan can", box(0.05, 0.6, 0.05, p.warning, 1.33, 0.46, z)));
      on(part("Lan can", box(0.05, 0.05, hallD - 1, p.warning, 1.33, 0.76, hallZ)));
    } else if (i === 1) {
      // 2 hộp quạt thông gió lớn, tránh chính giữa (chỗ thanh tiến độ)
      for (const z of [HZ0 + 1.9, HZ1 - 1.9]) {
        on(part("Hộp quạt thông gió", box(2.0, 0.7, 2.0, p.hull, SL * 0.45, 0.42, z)));
        on(part("Lưới quạt", box(1.6, 0.04, 1.6, p.rubber, SL * 0.45, 0.79, z)));
        on(part("Cánh quạt", box(1.5, 0.05, 0.22, p.metal, SL * 0.45, 0.82, z)));
        on(part("Cánh quạt", box(0.22, 0.05, 1.5, p.metal, SL * 0.45, 0.82, z)));
        on(part("Viền hộp quạt (màu phe)", box(2.04, 0.12, 2.04, p.teamDark, SL * 0.45, 0.72, z)));
      }
      // ống gió nối 2 hộp quạt, chạy dọc nhà
      on(part("Ống gió", box(0.5, 0.5, hallD - 6, p.metal, SL * 0.45, 0.4, hallZ)));
      for (const z of [hallZ - 1.4, hallZ + 1.4]) on(part("Đai ống gió", box(0.58, 0.58, 0.1, p.hullDark, SL * 0.45, 0.4, z)));
    } else {
      // ô kính trời trên mặt dốc (né chân ống khói ở góc sau)
      for (let k = 0; k < 3; k++) {
        const z = HZ0 + 3.1 + k * 2.3;
        on(part("Khung kính trời", box(2.4, 0.16, 1.7, p.hullDark, SL * 0.42, 0.12, z)));
        on(part("Kính trời", box(2.1, 0.06, 1.4, p.glass, SL * 0.42, 0.21, z)));
      }
      // tủ điện trên mái cạnh ống khói
      on(part("Tủ điện mái", box(1.2, 0.8, 0.9, p.hull, SL * 0.3, 0.45, HZ0 + 1.2)));
      on(part("Đèn tủ điện", box(0.3, 0.12, 0.05, p.warning, SL * 0.3, 0.6, HZ0 + 1.67)));
    }
  }

  // cánh văn phòng: góc trước bên kia khu ráp
  const WX0 = BAY[2];
  const WX1 = BX;
  const WZ0 = BAY[1];
  const WZ1 = BZ;
  const wingX = (WX0 + WX1) / 2;
  const wingZ = (WZ0 + WZ1) / 2;
  add(part("Cánh văn phòng", box(WX1 - WX0, WING_TOP - BASE_Y, WZ1 - WZ0, p.hull, wingX, (WING_TOP + BASE_Y) / 2, wingZ)));
  add(part("Mái văn phòng (màu phe)", box(WX1 - WX0 - 0.6, 0.12, WZ1 - WZ0 - 0.6, p.team, wingX, WING_TOP + 0.06, wingZ)));
  for (const y of [1.9, 4.2]) {
    add(part("Cửa sổ văn phòng", box(WX1 - WX0 - 1, 0.7, 0.04, p.glass, wingX, y, WZ1 + 0.03)));
    add(part("Cửa sổ văn phòng", box(0.04, 0.7, WZ1 - WZ0 - 1, p.glass, WX1 + 0.03, y, wingZ)));
  }
  // phòng điều khiển nhô ra phía sân ráp: kính lớn nhìn xuống 3 sân
  add(part("Phòng điều khiển", box(1.2, 1.8, 4.4, p.hullDark, WX0 - 0.6, 3.7, STALL_Z)));
  add(part("Kính phòng điều khiển", box(0.05, 1.2, 4.0, p.glass, WX0 - 1.22, 3.8, STALL_Z)));
  add(part("Cửa văn phòng", box(1.4, 2.4, 0.06, p.hullDark, wingX, BASE_Y + 1.2, WZ1 + 0.04)));
  // tường chắn mái quanh mép, mái có ô sàn kỹ thuật, máy điều hòa, nắp lên mái, cột ăng-ten
  const WW = WX1 - WX0;
  const WD = WZ1 - WZ0;
  for (const s of [-1, 1]) {
    add(part("Tường chắn mái", box(WW, 0.5, 0.18, p.hull, wingX, WING_TOP + 0.25, wingZ + s * (WD / 2 - 0.09))));
    add(part("Tường chắn mái", box(0.18, 0.5, WD, p.hull, wingX + s * (WW / 2 - 0.09), WING_TOP + 0.25, wingZ)));
    add(part("Mũ tường chắn", box(WW + 0.1, 0.06, 0.26, p.metal, wingX, WING_TOP + 0.53, wingZ + s * (WD / 2 - 0.09))));
    add(part("Mũ tường chắn", box(0.26, 0.06, WD + 0.1, p.metal, wingX + s * (WW / 2 - 0.09), WING_TOP + 0.53, wingZ)));
  }
  add(part("Sàn kỹ thuật", box(2.6, 0.08, 3.0, p.concreteDark, wingX - 0.9, WING_TOP + 0.16, wingZ - 1.4)));
  for (const [x, z] of [[wingX - 1.5, wingZ - 2.0], [wingX - 0.3, wingZ - 2.0], [wingX - 1.5, wingZ - 0.8]] as const) {
    add(part("Máy điều hòa", box(1.0, 0.6, 1.0, p.metal, x, WING_TOP + 0.5, z)));
    add(part("Quạt điều hòa", cyl(0.36, 0.36, 0.04, p.rubber, 10, x, WING_TOP + 0.82, z)));
  }
  add(part("Ống gió văn phòng", box(0.3, 0.3, 2.4, p.metal, wingX - 0.3, WING_TOP + 0.35, wingZ - 0.2)));
  add(part("Nắp lên mái", box(0.9, 0.35, 0.9, p.hullDark, wingX + 1.6, WING_TOP + 0.3, wingZ + 2.4)));
  add(part("Nắp lên mái", box(0.95, 0.06, 0.95, p.warning, wingX + 1.6, WING_TOP + 0.5, wingZ + 2.4)));
  const ANT_X = wingX + 1.7;
  const ANT_Z = wingZ - 2.4;
  add(part("Cột ăng-ten", cyl(0.06, 0.08, 3.2, p.metal, 6, ANT_X, WING_TOP + 1.7, ANT_Z)));
  for (const y of [0.9, 1.9]) add(part("Thanh ăng-ten", box(0.9, 0.04, 0.04, p.metal, ANT_X, WING_TOP + y, ANT_Z)));
  add(part("Đèn đỉnh ăng-ten", sphere(0.1, p.warning, ANT_X, WING_TOP + 3.35, ANT_Z, 6)));
  add(part("Chảo vệ tinh", group(cyl(0.45, 0.12, 0.18, p.white, 12, wingX + 0.6, WING_TOP + 0.75, wingZ + 0.6), box(0.1, 0.5, 0.1, p.metal, wingX + 0.6, WING_TOP + 0.4, wingZ + 0.6))));

  // ================================================================ 2. CỬA CUỐN: mỗi sân ráp một cửa
  const sig = productionSignals(p, 6);
  const doorY = BASE_Y + DOOR_H / 2;
  // 3 cửa cuốn nằm chung một khung (luôn mở cùng lúc): một bộ phận động thay vì ba, đỡ lệnh vẽ
  const doors = part("Cửa cuốn", group());
  doors.position.set(0, doorY, HZ1 + 0.09);
  add(doors);
  for (let k = 0; k < DOORS; k++) {
    const cx = BAY[0] + (k + 0.5) * STALL_W;
    add(part("Lòng xưởng", box(DOOR_W, DOOR_H, 0.05, p.hullDark, cx, doorY, HZ1 + 0.01)));
    add(part("Lò đúc (sáng khi đang đúc)", box(DOOR_W - 0.6, DOOR_H * 0.6, 0.03, sig.glow, cx, BASE_Y + DOOR_H * 0.35, HZ1 + 0.04)));
    doors.add(part("Cửa cuốn", box(DOOR_W, DOOR_H, 0.08, p.teamDark, cx, 0, 0)));
    for (let i = 0; i < 9; i++) doors.add(part("Nan cửa", box(DOOR_W - 0.08, 0.04, 0.03, p.metal, cx, -DOOR_H / 2 + 0.3 + i * 0.5, 0.055)));
    for (const sx of [-1, 1]) add(part("Khung cửa", box(0.24, DOOR_H + 0.1, 0.3, p.hullDark, cx + sx * (DOOR_W / 2 + 0.12), doorY + 0.05, HZ1 + 0.06)));
    for (let i = 0; i < 9; i++) add(part("Sọc cảnh báo", box(0.42, 0.26, 0.1, i % 2 ? p.hullDark : p.warning, cx - 1.68 + i * 0.42, BASE_Y + DOOR_H + 0.2, HZ1 + 0.08)));
  }

  // ================================================================ 3. SÂN RÁP + DẢI ĐƯỜNG
  for (let k = 0; k < DOORS; k++) {
    const cx = BAY[0] + (k + 0.5) * STALL_W;
    add(part("Sân ráp", box(STALL_W - 0.12, 0.05, STALL - 0.12, p.concreteDark, cx, BASE_Y + 0.025, STALL_Z)));
    add(part("Sàn nâng", box(STALL_W - 0.9, 0.03, STALL - 1.4, p.white, cx, BASE_Y + 0.06, STALL_Z)));
    for (const sx of [-1, 1]) add(part("Vạch sân ráp", box(0.12, 0.02, STALL - 0.3, p.warning, cx + sx * (STALL_W / 2 - 0.18), BASE_Y + 0.07, STALL_Z)));
    add(part("Số sân", box(0.9, 0.02, 0.5, p.white, cx, BASE_Y + 0.07, BAY[1] + 0.5)));
  }
  const roadZ = (BAY[1] + STALL + BAY[3]) / 2;
  const roadD = BAY[3] - (BAY[1] + STALL);
  add(part("Dải đường ra xe", box(BAY[2] - BAY[0], 0.05, roadD, p.white, (BAY[0] + BAY[2]) / 2, BASE_Y + 0.025, roadZ)));
  for (let k = 0; k < DOORS; k++) {
    const cx = BAY[0] + (k + 0.5) * STALL_W;
    // mũi tên trắng chỉ hướng xe ra
    const arrow: P3[] = [];
    for (const y of [BASE_Y + 0.06, BASE_Y + 0.08]) arrow.push([cx - 0.7, y, roadZ - 0.4], [cx + 0.7, y, roadZ - 0.4], [cx, y, roadZ + 0.6]);
    add(part("Mũi tên ra xe", facets(arrow, p.hullDark))); // đường trắng nên mũi tên tối
  }

  // giàn cầu trục trên 3 sân: cột ở mép sân, dầm chạy dọc x khi đang đúc
  for (const z of [BAY[1] + 0.25, BAY[1] + STALL - 0.25]) {
    add(part("Ray cầu trục", box(BAY[2] - BAY[0] + 0.3, 0.22, 0.24, p.metal, (BAY[0] + BAY[2]) / 2, RAIL_Y, z)));
    for (let k = 0; k <= DOORS; k++) add(part("Cột cầu trục", box(0.24, RAIL_Y - BASE_Y, 0.24, p.hullDark, BAY[0] + k * STALL_W, (RAIL_Y + BASE_Y) / 2, z)));
  }
  const crane = part("Dầm cầu trục", group(box(0.32, 0.34, STALL - 0.2, p.warning), box(0.7, 0.4, 0.8, p.hullDark, 0, -0.34, 0), box(0.05, 1.2, 0.05, p.rubber, 0, -1.1, 0), box(0.3, 0.16, 0.3, p.metal, 0, -1.75, 0)));
  crane.position.set(BAY[0] + STALL_W / 2, RAIL_Y + 0.28, STALL_Z);
  add(crane);

  // ================================================================ 4. XE ĐANG RÁP / MÁY MÓC TRÊN TỪNG SÂN
  const kinds = (SPEC.produces ?? []) as UnitId[];
  const stalls: { cars: Map<UnitId, THREE.Group>; tools: THREE.Group; spark: THREE.Mesh; head: THREE.Group; cx: number }[] = [];
  for (let k = 0; k < DOORS; k++) {
    const cx = BAY[0] + (k + 0.5) * STALL_W;
    const cars = new Map<UnitId, THREE.Group>();
    for (const kind of kinds) {
      const car = buildUnit(kind, faction).root;
      // xe trên sân ráp đứng yên hẳn: bỏ cờ bộ phận động (nòng giật, mâm xoay) để bake gộp cả xe thành vài lệnh vẽ
      car.traverse((o) => {
        delete o.userData.animated;
      });
      const g = part(`Xe đang ráp: ${kind}`, group(car));
      g.position.set(cx, BASE_Y, STALL_Z);
      g.visible = false;
      g.userData.animated = true; // ẩn / hiện + nâng theo tiến độ: bake không được gộp vào thân
      cars.set(kind, g);
      add(g);
    }
    // máy móc khi sân trống: giá phụ tùng, thùng linh kiện, xe nâng
    const tools = part(
      "Máy móc sân trống",
      group(
        part("Giá phụ tùng", box(0.5, 2.2, 3.2, p.metal, -1.2, BASE_Y + 1.1, -0.6)),
        part("Bánh xích dự phòng", box(0.42, 0.9, 2.6, p.metal, -1.2, BASE_Y + 2.0, -0.6)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, 0.7, BASE_Y + 0.4, -1.6)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, 0.7, BASE_Y + 1.2, -1.6)),
        part("Thùng linh kiện", box(1.1, 0.8, 1.1, p.wood, 0.7, BASE_Y + 0.4, -0.4)),
        part("Xe nâng", box(1.0, 0.9, 1.6, p.metal, 0.6, BASE_Y + 0.6, 1.4)),
        part("Càng xe nâng", box(0.9, 1.6, 0.1, p.metal, 0.6, BASE_Y + 0.9, 2.25))
      )
    );
    tools.position.set(cx, 0, STALL_Z);
    tools.userData.animated = true;
    add(tools);
    // đầu hàn treo trên ray, có tia lửa khi đang ráp
    const head = part("Đầu hàn", group(box(0.5, 0.5, 0.5, p.hullDark), box(0.08, 1.4, 0.08, p.metal, 0, -0.95, 0), box(0.2, 0.2, 0.3, p.metal, 0, -1.7, 0.1)));
    head.position.set(cx, RAIL_Y - 0.1, BAY[1] + 0.6);
    add(head);
    const spark = sphere(0.22, p.flash, cx, BASE_Y + 1.8, BAY[1] + 0.8, 6);
    spark.castShadow = false;
    spark.visible = false;
    add(part("Tia lửa hàn", spark));
    stalls.push({ cars, tools, spark, head, cx });
  }

  // ================================================================ 5. ỐNG KHÓI, BÌNH KHÍ, THANH TIẾN ĐỘ
  const CH_X = BX - 1;
  const CH_Z = HZ0 + 1.2;
  const CH_TOP = 11.5;
  add(part("Ống khói", cyl(0.4, 0.52, CH_TOP - BASE_Y, p.hullDark, 12, CH_X, (CH_TOP + BASE_Y) / 2, CH_Z)));
  add(part("Đai ống khói (màu phe)", cyl(0.45, 0.45, 0.35, p.team, 12, CH_X, CH_TOP - 0.6, CH_Z)));
  add(part("Miệng ống khói", cyl(0.45, 0.42, 0.18, p.metal, 12, CH_X, CH_TOP, CH_Z)));
  add(part("Giằng ống khói", strut([CH_X, WALL_TOP + TH, CH_Z], [CH_X - 1.5, WALL_TOP + 0.9, CH_Z], 0.06, p.metal)));
  for (let i = 0; i < 4; i++) {
    const z = HZ0 + 2 + i * 0.6;
    add(part("Bình khí hàn", group(cyl(0.25, 0.25, 1.4, p.hull, 10, -BX - 0.45, BASE_Y + 0.7, z), cyl(0.26, 0.2, 0.14, p.white, 10, -BX - 0.45, BASE_Y + 1.47, z))));
  }
  sig.bar.position.set(0, WALL_TOP + TH + 0.9, hallZ);
  add(sig.bar);
  for (const sx of [-1, 1]) add(part("Giá thanh tiến độ", box(0.14, 1.6, 0.14, p.metal, sx * 3.1, WALL_TOP + TH, hallZ)));
  for (const sx of [-1, 1]) add(part("Đèn cửa", sphere(0.16, sig.beacon, BAY[0] + 0.3 + (sx > 0 ? BAY[2] - BAY[0] - 0.6 : 0), BASE_Y + DOOR_H + 0.6, HZ1 + 0.15, 6)));

  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = sphere(0.5, p.smoke, CH_X, CH_TOP + 0.4, CH_Z, 7);
    s.castShadow = false;
    s.userData.phase = i / 4;
    puffs.push(s);
    add(s);
  }

  // ================================================================ hoạt ảnh
  // chiến trường báo xe đang ráp qua setAssembly; Xưởng Mô Hình không gọi thì bật "Vận hành" là ráp thử 2 Titan
  let external = false;
  let asmKind: UnitId | null = null;
  let asmCount = 0;
  let doorT = 0;
  let craneK = 0;
  const built = rig(root, [WORK], 16, [
    (dt, t, a) => {
      const on = a.has("work");
      const kind = external ? asmKind : on ? (kinds.includes("titan") ? "titan" : kinds[0]) ?? null : null;
      const count = external ? asmCount : 2;
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      doors.position.y = doorY + doorT * DOOR_H * 0.425;
      doors.scale.y = 1 - doorT * 0.85;
      let busy = 0;
      stalls.forEach((s, k) => {
        const used = kind !== null && k < count;
        for (const [ck, g] of s.cars) {
          // người dùng 10/11/2026: xưởng đang đúc thì xe hiện thẳng trên sân ráp, không nâng dần từ hầm
          g.visible = used && ck === kind;
        }
        s.tools.visible = !used;
        s.spark.visible = used && on && Math.sin(t * 23 + k * 2.1) > 0.2;
        if (used) busy++;
      });
      // dầm cầu trục đi qua lại trên các sân đang ráp
      const span = Math.max(1, busy) * STALL_W - STALL_W;
      craneK = on && busy ? (Math.sin(t * 0.5) * 0.5 + 0.5) * span : approach(craneK, 0, 2, dt);
      crane.position.x = BAY[0] + STALL_W / 2 + craneK;
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.35 + (s.userData.phase as number)) % 1;
        s.position.set(CH_X + k * 0.6, CH_TOP + 0.4 + k * 2.6, CH_Z + k * 0.3);
        s.scale.setScalar(0.5 + k * 1.5);
      }
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
