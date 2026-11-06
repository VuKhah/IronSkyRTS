/**
 * Mô hình Pháo Tự Hành (`artillery`), bản 5 (06/11/2026).
 * Người dùng chốt: tháp pháo ĐƠN NÒNG CỠ LỚN, THÂN THÁP CAO; lúc chạy là khối chữ nhật như xe thường; lúc HẠ BỆ ĐỠ thì
 * TÁCH THÂN XE dựng thành HÌNH CHỮ X như CÁI KÉO (góc trước nhỏ, góc sau lớn, chữ V phía sau dày hơn), không khối nào lướt
 * xuyên qua nhau; pháo DUỖI DÀI NÒNG khi cố định. Bản 4: THÂN THÁP NGÓC CÙNG NÒNG (tháp dao động); thân trước RỘNG gần
 * bằng xe, lúc chạy vẫn thấy, xoè càng trước thì lộ rõ hơn. Bản 5: càng trước trả về như bản 3; mũi chữ T; pháo trông đủ
 * sức bắn đạn hạng nặng (nòng to, ống dẫn nòng, 2 ống hãm giật, đầu hãm lớn).
 *
 * Ý đồ:
 * - Thân xe = 4 CÀNG (càng sau rộng và cao hơn: tay cầm cái kéo) + MŨI CHỮ T: đế thấp rộng 1,6 m nằm dưới hai càng trước,
 *   chìa ra trước; sống mũi (ghế lái) ở khe giữa, nóc ngang nóc càng; phần nối mũi kéo khối giữa tới đế mũi; 2 sống phụ
 *   thấp hơn hai bên sống mũi, nằm trong lòng càng trước (chỉ lộ khi càng trước mở). BẢN LỀ Ở MÉP NGOÀI ngang giữa xe: xoè ra thì phía trong mở, không càng nào cắt qua càng nào.
 *   Càng trước xoè 20° (góc trước 40°), càng sau 34° (góc sau 68°). Góc trong mỗi càng vát xiên chừa chỗ cột bệ tháp.
 * - Tâm xe: KHỐI GIỮA NỐI CÀNG (bát giác, ôm nửa dưới cột bệ tháp, nóc thấp hơn giáp càng; lúc chạy khuất trong các càng,
 *   xoè ra thì nối các càng thành một thân chung) + cột bệ tháp thon + vai đỡ.
 * - THÁP DAO ĐỘNG: tầng dưới (vành, bệ quay, 2 tai đỡ trục) chỉ xoay ngang; tầng trên là CẢ THÂN THÁP + nòng, ngóc quanh trục
 *   giữa 2 tai (trục cao để đuôi tháp không đập vào càng sau khi ngóc 36°).
 * - Hạ bệ (khớp luật `deploy.time` = 2 giây, `required`): 5–60% 4 càng xoè · 50–80% 4 lưỡi neo cắm đất ·
 *   65–100% nòng trong duỗi thêm 1,5 m (nòng ống lồng).
 * Bộ phận động: 4 càng, 4 lưỡi neo, bệ quay tháp, thân tháp + nòng ngóc + giật, nòng trong duỗi, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, surfaceTools, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

type P3 = [number, number, number];

/** Thời gian hạ bệ, khớp `UNITS.artillery.weapon.deploy.time` (sim chỉ cho bắn sau ngần ấy giây đứng yên). */
const DEPLOY_TIME = 2;
/** Góc xoè mỗi càng (rad): trước nhỏ, sau lớn — như cái kéo. */
const SPLAY_FRONT = 0.35;
const SPLAY_REAR = 0.6;
/** Nòng trong duỗi thêm bao nhiêu mét khi cố định. */
const BARREL_EXT = 1.5;
const HALF_W = 1.38; // mép ngoài thân xe (cũng là chỗ đặt bản lề càng)
const ARM_LEN = 2.6;
/** Lưỡi neo: bản lề cao 0,6 m, lưỡi dài 0,75 m, hạ quá phương ngang 0,9 rad thì mũi chạm đất. */
const SPADE_DIG = 0.9;
const PEDESTAL_TOP = 1.75;
/** Mép trong của càng bắt đầu từ z này: góc trong vát xiên, chừa chỗ cho cột bệ tháp (bán kính ≤ 0,65 m). */
const CUT_Z = 0.8;

/** Đặt vị trí trực tiếp (tubeZ đã xoay khối 90° nên translateY / translateZ đi sai trục). */
const at3 = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildArtillery(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);
  const wheels: { g: THREE.Object3D; r: number }[] = [];

  // ================================================================ 1. 4 CÀNG (bộ phận động: giữ ít màu)
  // Càng dựng trong hệ tọa độ của bản lề (mép ngoài, z = 0): x cục bộ từ −w (mép trong) tới 0 (mép ngoài), rồi lật theo sx.
  const arms: { g: THREE.Group; rot: number }[] = [];
  const spades: THREE.Group[] = [];
  for (const sx of [-1, 1])
    for (const sz of [1, -1]) {
      const rear = sz < 0;
      const w = rear ? 1.32 : 1.12; // càng sau rộng hơn (tay cầm cái kéo)
      const h = rear ? 1.24 : 1.08; // và cao hơn
      const z0 = 0.08;
      const z1 = ARM_LEN;
      const P = (x: number, y: number, z: number): P3 => [sx * x, y, sz * z];
      const arm = part(rear ? (sx < 0 ? "Càng sau trái" : "Càng sau phải") : sx < 0 ? "Càng trước trái" : "Càng trước phải", group());
      arm.position.set(sx * HALF_W, 0, 0);
      arm.add(
        part(
          "Giáp càng",
          facets(
            [
              // góc trong phía tâm vát xiên (chừa chỗ cho cột bệ tháp): mép trong bắt đầu từ z = CUT_Z
              P(-w + 0.02, 0.42, CUT_Z), P(-w + 0.62, 0.42, z0), P(-w + 0.1, h, CUT_Z + 0.05), P(-w + 0.66, h, z0 + 0.05),
              P(-0.02, 0.42, z0), P(-w + 0.02, 0.42, z1 - 0.25), P(-0.02, 0.42, z1 - 0.25),
              P(-0.08, h - 0.08, z0 + 0.05), P(-w + 0.1, h, z1 - 0.6), P(-0.08, h - 0.08, z1 - 0.6),
              P(-w + 0.08, 0.66, z1), P(-0.06, 0.66, z1), P(-w + 0.08, 0.9, z1 - 0.15), P(-0.06, 0.9, z1 - 0.15)
            ],
            p.hull
          )
        )
      );
      // dải xích + 2 bánh tì ở mép ngoài
      const tx = -0.3; // dải xích ở mép ngoài
      arm.add(part("Dải xích", box(0.5, 0.62, z1 - 0.3, p.hullDark, sx * tx, 0.31, sz * (z1 / 2))));
      for (const z of [0.7, 1.9]) {
        const wl = part("Bánh tì", wheel(0.3, 0.56, p.hullDark, p.hullDark));
        wl.position.set(sx * tx, 0.3, sz * z);
        arm.add(wl);
        wheels.push({ g: wl, r: 0.3 });
      }
      arm.add(part("Sọc càng (màu phe)", box(0.03, 0.08, z1 - 1.0, p.team, sx * 0.005, 0.85, sz * (z1 / 2))));
      if (rear) arm.add(part("Giáp đuôi dày (màu phe)", box(w - 0.4, 0.06, 1.0, p.team, sx * (-w / 2), h + 0.02, sz * 1.3)));
      else arm.add(part("Đèn pha", box(0.24, 0.1, 0.03, p.glass, sx * -0.35, 0.8, sz * (z1 + 0.01))));
      // lưỡi neo ở đầu ngoài: lúc chạy gập đứng, hạ bệ thì gập xuống cắm đất
      const mount = group();
      mount.position.set(sx * (-w / 2), 0.6, sz * (z1 - 0.02));
      mount.rotation.y = rear ? Math.PI : 0;
      const spade = part("Lưỡi neo", group(box(w - 0.3, 0.06, 0.75, p.hullDark, 0, 0, 0.375), box(0.06, 0.18, 0.6, p.hullDark, 0, 0.08, 0.3)));
      spade.rotation.x = -Math.PI / 2;
      mount.add(spade);
      arm.add(mount);
      spades.push(spade);
      add(arm);
      // xoè ra ngoài quanh bản lề mép ngoài: càng trước phải quay mũi về +x (quay +), càng sau phải quay đuôi về +x (quay −)
      arms.push({ g: arm, rot: sx * sz * (rear ? SPLAY_REAR : SPLAY_FRONT) });
    }

  // ================================================================ 2. TÂM XE: đế giữa, bệ tháp, mũi giữa (đứng yên)
  add(
    part("Cột bệ tháp", cyl(0.52, 0.62, PEDESTAL_TOP - 0.4, p.hull, 10, 0, (PEDESTAL_TOP + 0.4) / 2, 0)),
    part("Đai cột (màu phe)", cyl(0.56, 0.56, 0.08, p.team, 10, 0, 1.36, 0)),
    part("Vai đỡ tháp", cyl(0.85, 0.55, 0.3, p.hullDark, 10, 0, PEDESTAL_TOP - 0.15, 0)),
    part("Thang", group(...[0.8, 1.0, 1.2, 1.4].map((y) => box(0.32, 0.04, 0.06, p.metal, 0, y, -0.6))))
  );
  // Khối giữa nối càng: ôm nửa dưới cột bệ tháp, nóc thấp hơn mặt trên giáp càng; rộng tới sát 4 bản lề ở hai bên hông.
  // Lúc chạy nằm khuất trong các càng; xoè ra thì lấp khoảng trống giữa, các càng trông như mọc ra từ một thân chung.
  const HUB_TOP = 0.98;
  const hubPts: P3[] = [];
  for (const [x, z] of [[1.3, 0.38], [0.85, 1.15], [0.35, 1.3]] as const)
    for (const sz of [1, -1]) hubPts.push([x, 0.14, sz * z], [x - 0.06, HUB_TOP, sz * (z - 0.06)]);
  add(part("Khối giữa nối càng", facets(hubPts, p.hull, true)));
  add(part("Đai khối giữa (màu phe)", box(0.04, 0.1, 0.5, p.team, 1.27, 0.75, 0)), part("Đai khối giữa (màu phe)", box(0.04, 0.1, 0.5, p.team, -1.27, 0.75, 0)));
  add(part("Váy khối giữa", facets(hubPts.filter(([, y]) => y < 0.5).flatMap(([x, , z]): P3[] => [[x + 0.02, 0.1, z], [x + 0.02, 0.36, z]]), p.hullDark, true)));

  // Thân trước hình chữ T: ĐẾ THẤP RỘNG 1,6 m nằm DƯỚI hai càng trước (thấp hơn đáy càng nên xoè ra không chạm), chìa ra
  // trước thành mũi; SỐNG MŨI (ghế lái) ở khe giữa hai càng, nóc ngang nóc càng. Lúc chạy nhìn từ trước thấy mũi rộng gần bằng
  // xe, nhìn từ trên liền một khối; xoè càng trước thì cả chữ T lộ ra.
  const prow = part("Đế mũi", facets([[0.8, 0.12, 0.7], [0.8, 0.4, 0.7], [0.8, 0.12, 2.62], [0.8, 0.4, 2.78], [0.72, 0.2, 3.02], [0.72, 0.34, 3.0]], p.hull, true));
  const spine = part("Sống mũi (ghế lái)", facets([[0.25, 0.4, 0.7], [0.25, 1.06, 0.7], [0.25, 1.04, 2.0], [0.25, 0.4, 2.9], [0.24, 0.78, 2.55]], p.hull, true));
  add(prow, spine);
  // Phần nối mũi: khối giữa kéo dài về phía đế mũi, thấp dần (khuất dưới càng trước / sống mũi lúc chạy)
  add(part("Phần nối mũi", facets([[0.8, 0.14, 1.0], [0.74, 0.72, 1.0], [0.8, 0.14, 2.3], [0.74, 0.56, 2.1]], p.hull, true)));
  // 2 sống phụ hai bên sống mũi: thấp hơn, ngắn hơn, nằm gọn trong lòng càng trước (chỉ lộ khi càng trước mở);
  // đầu vát dốc xuống đế mũi, nóc màu phe, 3 khe tản nhiệt hông ngoài
  for (const sx of [-1, 1]) {
    const rib: P3[] = [[0.42, 0.4, 0.95], [0.72, 0.4, 0.95], [0.44, 0.86, 1.0], [0.7, 0.84, 1.0], [0.44, 0.84, 1.95], [0.7, 0.82, 1.9], [0.42, 0.4, 2.55], [0.72, 0.4, 2.5]];
    add(part("Sống phụ", facets(rib.map(([x, y, z]): P3 => [sx * x, y, z]), p.hull)));
    add(part("Nóc sống phụ (màu phe)", box(0.18, 0.03, 0.8, p.team, sx * 0.57, 0.86, 1.4)));
    for (const z of [1.2, 1.45, 1.7]) add(part("Khe tản nhiệt sống phụ", box(0.03, 0.22, 0.12, p.hullDark, sx * 0.725, 0.62, z)));
  }
  const ft = surfaceTools(body, [prow, spine]);
  add(ft.skin("Kính lái", [[-0.2, 2.42], [0.2, 2.42], [0.2, 2.12], [-0.2, 2.12]], p.glass, { lift: 0.02 }));
  add(ft.skin("Nóc sống mũi (màu phe)", [[-0.18, 1.85], [0.18, 1.85], [0.18, 0.9], [-0.18, 0.9]], p.team));
  add(ft.line("Chữ V đế mũi (màu phe)", [[-0.66, 2.62], [0, 2.92], [0.66, 2.62]], p.team, { w: 0.08 }));
  for (const sx of [-1, 1]) {
    add(ft.skin("Đèn pha", [[sx * 0.4, 0.2], [sx * 0.62, 0.2], [sx * 0.62, 0.3], [sx * 0.4, 0.3]], p.glass, { face: "front", lift: 0.02 }));
    add(part("Móc kéo", box(0.1, 0.1, 0.14, p.warning, sx * 0.5, 0.16, 3.0)));
  }

  // ================================================================ 3. THÁP DAO ĐỘNG: cả thân tháp ngóc cùng nòng
  // Tầng dưới (`turret`, chỉ xoay ngang): vành tháp, bệ quay, 2 tai đỡ trục + trục nâng.
  // Tầng trên (`gun`, ngóc lên quanh trục giữa 2 tai): CẢ THÂN THÁP + nóc + hộp đạn + kính ngắm + lá chắn + nòng.
  // Trục đặt cao (0,85 m trên vành) để khi ngóc 36°, đuôi tháp hạ xuống vẫn không đập vào các càng sau.
  const turret = part("Bệ quay tháp", group());
  turret.position.set(0, PEDESTAL_TOP, 0);
  const TRUNNION_Y = 0.85;
  const TRUNNION_Z = 0.1;
  turret.add(
    part("Vành tháp", cyl(1.0, 1.05, 0.14, p.hullDark, 16, 0, 0.03, -0.15)),
    part("Bệ quay", cyl(0.75, 0.9, 0.3, p.hull, 12, 0, 0.22, -0.15)),
    part("Trục nâng", cyl(0.13, 0.13, 2.4, p.metal, 10, 0, TRUNNION_Y, TRUNNION_Z).rotateZ(Math.PI / 2))
  );
  for (const sx of [-1, 1]) turret.add(part("Tai đỡ trục", facets([[sx * 1.0, 0.1, 0.5], [sx * 1.16, 0.1, 0.5], [sx * 1.0, 0.1, -0.4], [sx * 1.16, 0.1, -0.4], [sx * 1.0, TRUNNION_Y + 0.18, 0.28], [sx * 1.16, TRUNNION_Y + 0.18, 0.28], [sx * 1.0, TRUNNION_Y + 0.18, -0.08], [sx * 1.16, TRUNNION_Y + 0.18, -0.08]], p.hullDark)));

  const gun = part("Thân tháp + nòng (ngóc cùng nhau)", group());
  gun.position.set(0, TRUNNION_Y, TRUNNION_Z);
  // tọa độ dưới đây tính từ trục nâng
  gun.add(
    part("Thân tháp", facets([[0.96, -0.5, 0.95], [0.96, -0.5, -1.6], [0.9, 0.56, 0.7], [0.9, 0.6, -1.6], [0.64, -0.36, 1.18], [0.64, 0.46, 1.12]], p.hull, true)),
    part("Nóc tháp (màu phe)", box(1.35, 0.03, 1.5, p.team, 0, 0.61, -0.6)),
    part("Hộp đạn sau tháp", group(box(1.75, 0.62, 0.45, p.hullDark, 0, 0.0, -1.82), box(1.77, 0.05, 0.47, p.white, 0, 0.33, -1.82))),
    part("Nắp xe trưởng", group(cyl(0.22, 0.24, 0.12, p.hullDark, 10, 0.45, 0.66, -0.75), box(0.08, 0.06, 0.24, p.metal, 0.45, 0.74, -0.75))),
    part("Kính ngắm pháo", group(box(0.22, 0.22, 0.26, p.hullDark, -0.55, 0.7, 0.05), box(0.16, 0.1, 0.02, p.glass, -0.55, 0.72, 0.185))),
    part("Lá chắn nòng", facets([[0.48, -0.4, 1.0], [0.48, 0.42, 1.0], [0.42, -0.34, 1.48], [0.42, 0.36, 1.48]], p.hullDark, true)),
    // ống dẫn nòng (đứng yên, nòng giật lùi bên trong) + 2 ống hãm giật trên / dưới: dáng pháo hạng nặng
    part("Ống dẫn nòng", at3(tubeZ(0.3, 0.32, 1.15, p.hullDark, 12), 0, 0, 2.0)),
    part("Ống hãm giật", group(at3(tubeZ(0.09, 0.09, 1.25, p.metal, 8), 0, 0.36, 2.05), at3(tubeZ(0.09, 0.09, 1.25, p.metal, 8), 0, -0.34, 2.05)))
  );
  for (const sx of [-1, 1]) gun.add(part("Tấm hông tháp (màu phe)", box(0.03, 0.46, 1.3, p.team, sx * 0.955, 0.0, -0.6)));
  // Nòng ngoài (giật khi bắn, lùi vào trong ống dẫn) chứa nòng trong (duỗi ra khi cố định): nòng trong là con của nòng ngoài
  const outer = barrel(3.0, 0.2, p.metal, 0, 0, 1.4);
  const fume = part("Bầu hút khói", tubeZ(0.28, 0.28, 0.5, p.metal, 12));
  fume.position.z = 1.75;
  const band = part("Đai nòng (màu phe)", tubeZ(0.215, 0.215, 0.12, p.team, 12));
  band.position.z = 2.65;
  outer.add(fume, band);
  const inner = part("Nòng trong (duỗi ra)", group());
  const innerTube = tubeZ(0.155, 0.155, 2.0, p.metal, 10);
  innerTube.position.z = 1.0;
  const brake = part("Đầu hãm nòng", group(
    box(0.56, 0.4, 0.6, p.hullDark, 0, 0, 2.2),
    box(0.6, 0.08, 0.12, p.metal, 0, 0, 2.02), box(0.6, 0.08, 0.12, p.metal, 0, 0, 2.2), box(0.6, 0.08, 0.12, p.metal, 0, 0, 2.38)
  ));
  const flash = muzzleFlash(1.5, p.flash);
  flash.position.z = 2.9;
  inner.add(innerTube, brake, flash);
  inner.position.z = 0.95;
  outer.add(inner);
  gun.add(outer);
  turret.add(gun);
  add(turret);

  // ================================================================ 4. HOẠT ẢNH HẠ BỆ (tuyến tính, đúng DEPLOY_TIME giây)
  let dep = 0;
  return vehicleRig(
    "artillery",
    p,
    { body, wheels, turret, gun, barrels: [outer], muzzles: [inner], flashes: [flash], spinners: [], aimPitch: 0.62, recoil: 0.6 },
    4.3,
    [{ id: "deploy", label: "Hạ bệ chữ X" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const splay = smooth(0.05, 0.6, dep);
      for (const arm of arms) arm.g.rotation.y = arm.rot * splay;
      const down = smooth(0.5, 0.8, dep);
      for (const s of spades) s.rotation.x = -Math.PI / 2 + down * (Math.PI / 2 + SPADE_DIG);
      inner.position.z = 0.95 + smooth(0.65, 1, dep) * BARREL_EXT;
    }
  );
}
