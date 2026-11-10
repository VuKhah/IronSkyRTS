/**
 * Nhà Máy Máy Bay, bản 3 (10/11/2026): NHÀ CHỨA CÓ SÀN PHÓNG TRÊN NÓC, máy bay cất cánh thẳng đứng từ giếng.
 *
 *  - NHÀ CHỨA 13 × 18 m, cả nóc là sàn phóng phẳng (độ cao `launch.deck`) như boong tàu sân bay, có lan can, đèn sàn, vạch an
 *    toàn, ống gió. Trên sàn có các GIẾNG PHÓNG đọc từ `BUILDINGS["aircraft-factory"].pads` (giếng lớn 8 × 8 m cho Valkyrie
 *    sải cánh 7,3 m, giếng nhỏ 6 × 6 m), sâu `launch.shaft`, lòng lót tối, đáy có bệ nâng.
 *  - Mỗi giếng đậy bằng CỬA CUỐN nằm ngang (nan cửa màu phe, chữ H, viền vàng); khi phóng, tấm cửa cuộn vào HỘP TRỤC ở mép
 *    giếng phía ngoài. Chiến trường mở từng cửa qua `setLaunch(k, open)` theo trạng thái máy bay `launch` trong sim; Xưởng Mô
 *    Hình dùng nút "Phóng" để mở cả hai.
 *  - THÁP ĐIỀU KHIỂN (góc trước, cao nhất 12,4 m): phòng kính có song, radar quay khi xưởng chạy, ăng-ten đèn đỏ.
 *  - XƯỞNG ĐỘNG CƠ (góc sau, thấp 5 m): ống xả thử động cơ, bồn nhiên liệu, ống dẫn sang nhà chứa, thanh tiến độ.
 * Không hiện máy bay đang ráp: máy bay thật (đơn vị sim) trồi lên từ giếng.
 */
import * as THREE from "three";
import { BUILDINGS, RULES } from "../../../sim/content";
import { CELL } from "../../../sim/maps";
import { approach, box, cyl, group, part, sphere, type Palette, type Rig, type RigAction } from "../kit";
import { WORK, rig, productionSignals, strut, BASE_Y } from "./shared";

const LAUNCH: RigAction = { id: "launch", label: "Phóng" };
const SPEC = BUILDINGS["aircraft-factory"];
const [BX, BZ] = SPEC.half; // 9 × 9 m
const MARGIN = RULES.buildMarginCells * CELL;
const DECK = SPEC.launch!.deck; // mặt sàn phóng
const FLOOR = DECK - SPEC.launch!.shaft; // đáy giếng (bệ nâng)
const PADS = SPEC.pads!;
const HX1 = 4; // nhà chứa: x −BX..HX1
const DR = 0.42; // bán kính hộp trục cuốn

export function buildAircraftFactory(p: Palette): Rig {
  const slab = BX * 2 + MARGIN * 2;
  const root = group();
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const sig = productionSignals(p, 5);
  const X0 = -BX;
  const Z0 = -BZ;
  const Z1 = BZ;
  const HXc = (X0 + HX1) / 2;

  // ================================================================ 0. NỀN
  add(part("Viền bê tông (xe đi được)", box(slab, BASE_Y, slab, p.concrete, 0, BASE_Y / 2, 0)));
  for (const s of [-1, 1]) {
    add(part("Mép nền (màu phe)", box(slab + 0.06, 0.06, 0.3, p.team, 0, BASE_Y + 0.01, s * (slab / 2 - 0.15))));
    add(part("Mép nền (màu phe)", box(0.3, 0.06, slab + 0.06, p.team, s * (slab / 2 - 0.15), BASE_Y + 0.01, 0)));
  }

  // ================================================================ 1. NHÀ CHỨA + SÀN PHÓNG
  add(part("Nhà chứa", box(HX1 - X0, FLOOR - BASE_Y, Z1 - Z0, p.hull, HXc, (FLOOR + BASE_Y) / 2, 0)));
  // từ đáy giếng lên mặt sàn: chia lưới theo mép giếng, ô nào không thuộc giếng thì là tường / sàn
  const xs = [X0, HX1, ...PADS.flatMap((r) => [r[0], r[2]])].sort((a, b) => a - b);
  const zs = [Z0, Z1, ...PADS.flatMap((r) => [r[1], r[3]])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < zs.length; j++) {
      const [a, b, c, d] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
      if (b - a < 1e-6 || d - c < 1e-6) continue;
      const cx = (a + b) / 2;
      const cz = (c + d) / 2;
      if (PADS.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3])) continue;
      add(part("Nhà chứa", box(b - a, DECK - FLOOR, d - c, p.hull, cx, (DECK + FLOOR) / 2, cz)));
      add(part("Mặt sàn phóng", box(b - a, 0.06, d - c, p.concreteDark, cx, DECK + 0.03, cz)));
    }
  // gờ mái kim loại + đai màu phe (4 dải quanh tường; khối đặc sẽ lấp miệng giếng)
  for (const z of [Z0, Z1]) {
    add(part("Đai tường (màu phe)", box(HX1 - X0 + 0.05, 0.4, 0.06, p.team, HXc, DECK - 0.45, z)));
    add(part("Gờ mái", box(HX1 - X0 + 0.2, 0.14, 0.3, p.metal, HXc, DECK + 0.07, z)));
  }
  for (const x of [X0, HX1]) {
    add(part("Đai tường (màu phe)", box(0.06, 0.4, Z1 - Z0 + 0.05, p.team, x, DECK - 0.45, 0)));
    add(part("Gờ mái", box(0.3, 0.14, Z1 - Z0 + 0.2, p.metal, x, DECK + 0.07, 0)));
  }
  // gân dọc thân nhà chứa (mặt bên trái và mặt sau), cột góc, dải cửa sổ
  for (let z = Z0 + 2; z < Z1 - 1; z += 2) add(part("Gân tường", box(0.16, DECK - BASE_Y - 0.8, 0.2, p.hullDark, X0 - 0.06, (DECK + BASE_Y - 0.8) / 2, z)));
  for (let x = X0 + 2; x < HX1 - 0.5; x += 2) add(part("Gân tường", box(0.2, DECK - BASE_Y - 0.8, 0.16, p.hullDark, x, (DECK + BASE_Y - 0.8) / 2, Z0 - 0.06)));
  for (const x of [X0, HX1]) for (const z of [Z0, Z1]) add(part("Cột thép", box(0.34, DECK - BASE_Y - 0.3, 0.34, p.hullDark, x, (DECK + BASE_Y - 0.3) / 2, z)));
  add(part("Dải cửa sổ (sáng khi đang đúc)", box(HX1 - X0 - 1.5, 0.6, 0.04, sig.glow, HXc, 5.8, Z0 - 0.08)));
  add(part("Dải cửa sổ (sáng khi đang đúc)", box(0.04, 0.6, Z1 - Z0 - 1.5, sig.glow, X0 - 0.08, 5.8, 0)));
  add(part("Dải cửa sổ (sáng khi đang đúc)", box(HX1 - X0 - 1.5, 0.6, 0.04, sig.glow, HXc, 5.8, Z1 + 0.03)));
  // mặt tiền: cửa nhà chứa lớn có vạch chéo màu phe
  const HDX = HXc - 0.5;
  add(part("Cửa nhà chứa", box(8, 4.2, 0.08, p.teamDark, HDX, BASE_Y + 2.1, Z1 + 0.05)));
  for (let i = 1; i < 4; i++) add(part("Khe cửa nhà chứa", box(0.06, 4.2, 0.04, p.hullDark, HDX - 4 + i * 2, BASE_Y + 2.1, Z1 + 0.1)));
  add(part("Khung cửa nhà chứa", box(8.6, 0.4, 0.3, p.hullDark, HDX, BASE_Y + 4.4, Z1 + 0.1)));
  for (let i = 0; i < 4; i++) {
    const chev = box(1.3, 0.24, 0.03, p.team, HDX - 3 + i * 2, BASE_Y + 3.6, Z1 + 0.11);
    chev.rotation.z = 0.5;
    add(part("Vạch chéo cửa (màu phe)", chev));
  }
  add(part("Cửa phụ", box(1.2, 2.3, 0.06, p.hullDark, X0 + 1.4, BASE_Y + 1.15, Z1 + 0.05)));
  // lan can quanh mép sàn (cột + thanh), chừa phía tháp
  for (const [x, z, w, d] of [[HXc, Z1 - 0.2, HX1 - X0 - 0.4, 0.06], [HXc, Z0 + 0.2, HX1 - X0 - 0.4, 0.06], [X0 + 0.2, 0, 0.06, Z1 - Z0 - 0.4]] as const) {
    add(part("Lan can sàn phóng", box(w, 0.06, d, p.warning, x, DECK + 1.0, z)));
    const n = Math.round(Math.max(w, d) / 2);
    for (let i = 0; i <= n; i++) {
      const t = -0.5 + i / n;
      add(part("Cột lan can", box(0.06, 1.0, 0.06, p.metal, x + (w > d ? t * w : 0), DECK + 0.5, z + (d > w ? t * d : 0))));
    }
  }
  // tường chắn luồng phụt giữa hai giếng
  const gapZ = (PADS[0][1] + PADS[1][3]) / 2;
  const padX = (PADS[0][0] + PADS[0][2]) / 2;
  add(part("Tường chắn luồng phụt (màu phe)", box(7, 1.3, 0.35, p.team, padX, DECK + 0.65, gapZ)));
  add(part("Mép tường chắn", box(7.1, 0.1, 0.45, p.metal, padX, DECK + 1.35, gapZ)));
  for (const x of [-3.3, 0, 3.3]) add(part("Chân tường chắn", box(0.3, 1.0, 1.0, p.hullDark, padX + x, DECK + 0.5, gapZ)));
  // ống gió trên sàn, góc trước bên trái
  const SOCK_X = X0 + 0.8;
  const SOCK_Z = Z1 - 0.9;
  add(part("Cột ống gió", cyl(0.05, 0.06, 2.4, p.metal, 6, SOCK_X, DECK + 1.2, SOCK_Z)));
  const sock = part("Ống gió", group());
  const sockTube = cyl(0.16, 0.07, 1.2, p.warning, 8, 0, 0, 0.6);
  sockTube.rotation.x = Math.PI / 2;
  sock.add(sockTube);
  sock.position.set(SOCK_X, DECK + 2.4, SOCK_Z);
  add(sock);

  // ================================================================ 2. GIẾNG PHÓNG + CỬA CUỐN
  const shutters: { g: THREE.Group; t: number; open: boolean }[] = [];
  PADS.forEach((r, k) => {
    const [x0, z0, x1, z1] = r;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const roll = cz > 0 ? 1 : -1; // hộp trục ở mép giếng phía ngoài nhà (chỗ sàn còn rộng)
    const edge = roll > 0 ? z1 : z0;
    const name = k === 0 ? "Giếng lớn" : "Giếng nhỏ";
    // lòng giếng lót tối để trông sâu; đáy là bệ nâng có vòng vàng, đèn chớp ở bốn góc miệng giếng
    const sh = DECK - FLOOR;
    for (const sz of [-1, 1]) add(part(`${name}: lòng giếng`, box(w, sh, 0.05, p.hullDark, cx, (DECK + FLOOR) / 2, cz + sz * (d / 2 - 0.03))));
    for (const sx of [-1, 1]) add(part(`${name}: lòng giếng`, box(0.05, sh, d, p.hullDark, cx + sx * (w / 2 - 0.03), (DECK + FLOOR) / 2, cz)));
    for (const y of [FLOOR + 1.6, FLOOR + 3.2])
      for (const sx of [-1, 1]) add(part(`${name}: đèn lòng giếng`, box(0.06, 0.12, d - 1, sig.glow, cx + sx * (w / 2 - 0.08), y, cz)));
    add(part(`${name}: bệ nâng`, box(w - 0.3, 0.12, d - 0.3, p.rubber, cx, FLOOR + 0.06, cz)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.36, 0.08, 4, 32), p.warning);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, FLOOR + 0.13, cz);
    add(part(`${name}: vòng bệ nâng`, ring));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(part(`${name}: đèn miệng giếng`, sphere(0.16, sig.beacon, cx + sx * (w / 2 + 0.25), DECK + 0.12, cz + sz * (d / 2 - 0.4), 6)));
    // vạch an toàn hai bên miệng giếng, số giếng sơn trên sàn
    for (const sx of [-1, 1]) add(part(`${name}: vạch an toàn`, box(0.14, 0.02, d + 0.6, p.warning, cx + sx * (w / 2 + 0.45), DECK + 0.07, cz)));
    for (let i = 0; i <= k; i++) add(part(`${name}: số giếng`, box(0.2, 0.02, 0.9, p.white, x1 + 0.9 + i * 0.36, DECK + 0.07, cz + roll * (d / 2 - 1))));
    // hộp trục cuốn ở mép giếng
    const dz = edge + roll * DR;
    const drum = cyl(DR, DR, w + 0.4, p.hullDark, 14, cx, DECK + DR, dz);
    drum.rotation.z = Math.PI / 2;
    add(part(`${name}: hộp trục cuốn`, drum));
    const band = cyl(DR + 0.02, DR + 0.02, 0.5, p.team, 14, cx, DECK + DR, dz);
    band.rotation.z = Math.PI / 2;
    add(part(`${name}: đai hộp trục (màu phe)`, band));
    for (const sx of [-1, 1]) add(part(`${name}: gối trục`, box(0.3, DR * 2 + 0.1, DR * 2 + 0.1, p.metal, cx + sx * (w / 2 + 0.3), DECK + DR, dz)));
    // tấm cửa nan: thu ngắn theo z về phía hộp trục khi mở
    const g = part(`${name}: cửa cuốn`, group());
    const mid = (-roll * d) / 2;
    g.add(part(`${name}: cửa cuốn`, box(w - 0.08, 0.12, d, p.teamDark, 0, -0.06, mid)));
    for (let z = 0.45; z < d - 0.2; z += 0.5) g.add(part(`${name}: nan cửa`, box(w - 0.12, 0.02, 0.05, p.hullDark, 0, 0.005, -roll * z)));
    const hh = Math.min(w, d) * 0.3;
    for (const sx of [-1, 1]) g.add(part(`${name}: chữ H`, box(0.4, 0.03, hh * 2, p.white, sx * hh * 0.55, 0.02, mid)));
    g.add(part(`${name}: chữ H`, box(hh * 1.1, 0.03, 0.4, p.white, 0, 0.02, mid)));
    for (const sx of [-1, 1]) g.add(part(`${name}: viền cửa`, box(0.2, 0.03, d, p.warning, sx * (w / 2 - 0.16), 0.02, mid)));
    g.add(part(`${name}: viền cửa`, box(w - 0.12, 0.03, 0.2, p.warning, 0, 0.02, -roll * (d - 0.14))));
    g.position.set(cx, DECK + 0.06, edge);
    g.userData.animated = true;
    add(g);
    shutters.push({ g, t: 0, open: false });
  });

  // ================================================================ 3. THÁP ĐIỀU KHIỂN (cao nhất)
  const TX = 6.6;
  const TZ = 5.6;
  const T_TOP = 11;
  add(part("Tháp điều khiển", box(3.6, T_TOP - BASE_Y, 4.2, p.hull, TX, (T_TOP + BASE_Y) / 2, TZ)));
  add(part("Đai tường (màu phe)", box(3.65, 0.3, 4.25, p.team, TX, 7.2, TZ)));
  for (const y of [3.2, 5.6, 8.6]) {
    add(part("Cửa sổ tháp", box(0.04, 0.6, 2.8, p.glass, TX + 1.82, y, TZ)));
    add(part("Cửa sổ tháp", box(2.4, 0.6, 0.04, p.glass, TX, y, TZ + 2.12)));
  }
  add(part("Cửa tháp", box(1.1, 2.2, 0.06, p.hullDark, TX - 0.8, BASE_Y + 1.1, TZ + 2.12)));
  add(part("Bệ phòng kính", box(4.8, 0.2, 5.2, p.hullDark, TX - 0.1, T_TOP + 0.1, TZ)));
  add(part("Phòng kính điều khiển", box(4.6, 1.3, 5.0, p.glass, TX - 0.1, T_TOP + 0.85, TZ)));
  for (const sx of [-1, 1])
    for (const t of [-1, -0.33, 0.33, 1]) {
      add(part("Song kính", box(0.08, 1.3, 0.08, p.hullDark, TX - 0.1 + sx * 2.3, T_TOP + 0.85, TZ + t * 2.5)));
      add(part("Song kính", box(0.08, 1.3, 0.08, p.hullDark, TX - 0.1 + t * 2.3, T_TOP + 0.85, TZ + sx * 2.5)));
    }
  add(part("Mái phòng kính (màu phe)", box(5.0, 0.2, 5.4, p.team, TX - 0.1, T_TOP + 1.6, TZ)));
  add(part("Cầu nối sàn phóng", box(1.0, 1.6, 2.4, p.hullDark, HX1 + 0.55, DECK - 0.4, TZ)));
  add(part("Cột radar", cyl(0.1, 0.12, 0.9, p.metal, 6, TX - 0.6, T_TOP + 2.15, TZ + 0.6)));
  const radar = part("Radar", group(box(2.0, 0.55, 0.14, p.white, 0, 0, 0.1), box(0.3, 0.3, 0.3, p.hullDark)));
  radar.position.set(TX - 0.6, T_TOP + 2.75, TZ + 0.6);
  add(radar);
  add(part("Cột ăng-ten", cyl(0.04, 0.06, 2.4, p.metal, 5, TX + 1.6, T_TOP + 2.9, TZ - 1.9)));
  add(part("Đèn đỉnh ăng-ten", sphere(0.12, sig.beacon, TX + 1.6, T_TOP + 4.15, TZ - 1.9, 6)));

  // ================================================================ 4. XƯỞNG ĐỘNG CƠ (thấp) + BỒN NHIÊN LIỆU
  const EX0 = HX1 + 0.4;
  const EZ0 = Z0;
  const EZ1 = 2.6;
  const E_TOP = 5;
  const EXc = (EX0 + BX) / 2;
  const EZc = (EZ0 + EZ1) / 2;
  add(part("Xưởng động cơ", box(BX - EX0, E_TOP - BASE_Y, EZ1 - EZ0, p.hull, EXc, (E_TOP + BASE_Y) / 2, EZc)));
  add(part("Đai tường (màu phe)", box(BX - EX0 + 0.05, 0.3, EZ1 - EZ0 + 0.05, p.team, EXc, E_TOP - 0.3, EZc)));
  add(part("Mặt nóc", box(BX - EX0 - 0.4, 0.08, EZ1 - EZ0 - 0.4, p.concreteDark, EXc, E_TOP + 0.04, EZc)));
  add(part("Dải cửa sổ (sáng khi đang đúc)", box(0.04, 0.6, EZ1 - EZ0 - 1.5, sig.glow, BX + 0.03, 3.4, EZc)));
  add(part("Cửa cuốn xưởng động cơ", box(0.06, 3, 3, p.teamDark, BX + 0.04, BASE_Y + 1.5, EZ0 + 3)));
  for (const z of [-7.4, -5.2]) {
    add(part("Ống xả thử động cơ", cyl(0.42, 0.5, 2.6, p.hullDark, 10, 7.6, E_TOP + 1.3, z)));
    add(part("Miệng ống xả", cyl(0.52, 0.46, 0.16, p.metal, 10, 7.6, E_TOP + 2.65, z)));
    add(part("Đai ống xả (màu phe)", cyl(0.47, 0.47, 0.16, p.team, 10, 7.6, E_TOP + 1.9, z)));
  }
  for (const z of [-2.4, 0.6]) {
    add(part("Bồn nhiên liệu", cyl(1.0, 1.0, 2.0, p.white, 14, 6.2, E_TOP + 1.0, z)));
    const cap = sphere(1.0, p.white, 6.2, E_TOP + 2.0, z, 10);
    cap.scale.set(1, 0.3, 1);
    add(part("Nắp bồn", cap));
    add(part("Đai bồn (màu phe)", cyl(1.03, 1.03, 0.2, p.team, 14, 6.2, E_TOP + 1.4, z)));
    add(part("Ống dẫn nhiên liệu", strut([5.2, E_TOP + 0.5, z], [HX1 + 0.02, E_TOP + 0.5, z], 0.08, p.metal)));
  }
  sig.bar.position.set(7.9, E_TOP + 0.13, -1); // đáy khung chạm mặt nóc
  sig.bar.rotation.y = Math.PI / 2;
  add(sig.bar);

  // ================================================================ hoạt ảnh
  let external = false;
  const built = rig(root, [WORK, LAUNCH], 16, [
    (dt, t, a) => {
      for (const s of shutters) {
        s.t = approach(s.t, (external ? s.open : a.has("launch")) ? 1 : 0, 1.4, dt);
        s.g.scale.z = Math.max(0.01, 1 - s.t); // cuộn hết vào hộp trục
      }
      if (a.has("work")) radar.rotation.y += dt * 1.6;
      sock.rotation.y = Math.sin(t * 0.7) * 0.5;
    },
    sig.update
  ]);
  built.setLevel = sig.setLevel;
  built.setLaunch = (k, open) => {
    external = true;
    if (shutters[k]) shutters[k].open = open;
  };
  return built;
}
