/**
 * Mô hình Pháo Tự Hành (`artillery`), bản 4 (06/11/2026).
 * Người dùng chốt: tháp pháo ĐƠN NÒNG CỠ LỚN, THÂN THÁP CAO; lúc chạy là khối chữ nhật như xe thường; lúc HẠ BỆ ĐỠ thì
 * TÁCH THÂN XE dựng thành HÌNH CHỮ X như CÁI KÉO (góc trước nhỏ, góc sau lớn, chữ V phía sau dày hơn), không khối nào lướt
 * xuyên qua nhau; pháo DUỖI DÀI NÒNG khi cố định. Bản 4: THÂN THÁP NGÓC CÙNG NÒNG (tháp dao động); thân trước RỘNG gần
 * bằng xe, lúc chạy vẫn thấy, xoè càng trước thì lộ rõ hơn.
 *
 * Ý đồ:
 * - Thân xe = thân trước rộng (khoang lái) + 4 CÀNG: càng trước là dải xích thon ôm hai bên thân trước, càng sau rộng và
 *   cao (tay cầm cái kéo). BẢN LỀ Ở MÉP NGOÀI ngang giữa xe: xoè ra thì phía trong mở, không càng nào cắt qua càng nào.
 *   Càng trước xoè 20° (góc trước 40°), càng sau 34° (góc sau 68°). Góc trong càng sau vát xiên chừa chỗ cột bệ tháp.
 * - Tâm xe: đế giữa chạm đất (lộ ra khi xoè), cột bệ tháp thon + vai đỡ.
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
/** Bề rộng càng trước (dải xích thon ôm hai bên thân trước). */
const FRONT_W = 0.52;

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
      const w = rear ? 1.32 : FRONT_W; // càng sau rộng (tay cầm cái kéo), càng trước là dải xích thon ôm thân trước
      const h = rear ? 1.24 : 1.0;
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
              // càng sau: góc trong phía tâm vát xiên (chừa chỗ cho cột bệ tháp), mép trong bắt đầu từ z = CUT_Z
              ...(rear
                ? [P(-w + 0.02, 0.42, CUT_Z), P(-w + 0.62, 0.42, z0), P(-w + 0.1, h, CUT_Z + 0.05), P(-w + 0.66, h, z0 + 0.05)]
                : [P(-w + 0.02, 0.42, z0), P(-w + 0.06, h - 0.04, z0 + 0.05)]),
              P(-0.02, 0.42, z0), P(-w + 0.02, 0.42, z1 - 0.25), P(-0.02, 0.42, z1 - 0.25),
              P(-0.08, h - 0.08, z0 + 0.05), P(-w + 0.1, h, z1 - 0.6), P(-0.08, h - 0.08, z1 - 0.6),
              P(-w + 0.08, 0.66, z1), P(-0.06, 0.66, z1), P(-w + 0.08, 0.9, z1 - 0.15), P(-0.06, 0.9, z1 - 0.15)
            ],
            p.hull
          )
        )
      );
      // dải xích + 2 bánh tì ở mép ngoài
      const tx = rear ? -0.3 : -w / 2; // dải xích ở mép ngoài
      arm.add(part("Dải xích", box(Math.min(0.5, w - 0.06), 0.62, z1 - 0.3, p.hullDark, sx * tx, 0.31, sz * (z1 / 2))));
      for (const z of [0.7, 1.9]) {
        const wl = part("Bánh tì", wheel(0.3, 0.56, p.hullDark, p.hullDark));
        wl.position.set(sx * tx, 0.3, sz * z);
        arm.add(wl);
        wheels.push({ g: wl, r: 0.3 });
      }
      arm.add(part("Sọc càng (màu phe)", box(0.03, 0.08, z1 - 1.0, p.team, sx * 0.005, 0.85, sz * (z1 / 2))));
      if (rear) arm.add(part("Giáp đuôi dày (màu phe)", box(w - 0.4, 0.06, 1.0, p.team, sx * (-w / 2), h + 0.02, sz * 1.3)));
      // lưỡi neo ở đầu ngoài: lúc chạy gập đứng, hạ bệ thì gập xuống cắm đất
      const mount = group();
      mount.position.set(sx * (-w / 2), 0.6, sz * (z1 - 0.02));
      mount.rotation.y = rear ? Math.PI : 0;
      const spade = part("Lưỡi neo", group(box(Math.max(w - 0.3, 0.46), 0.06, 0.75, p.hullDark, 0, 0, 0.375), box(0.06, 0.18, 0.6, p.hullDark, 0, 0.08, 0.3)));
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
    part("Đế giữa", cyl(1.15, 1.3, 0.42, p.hullDark, 8, 0, 0.21, 0)),
    part("Cột bệ tháp", cyl(0.52, 0.62, PEDESTAL_TOP - 0.4, p.hull, 10, 0, (PEDESTAL_TOP + 0.4) / 2, 0)),
    part("Đai cột (màu phe)", cyl(0.56, 0.56, 0.08, p.team, 10, 0, 1.36, 0)),
    part("Vai đỡ tháp", cyl(0.85, 0.55, 0.3, p.hullDark, 10, 0, PEDESTAL_TOP - 0.15, 0)),
    part("Thang", group(...[0.8, 1.0, 1.2, 1.4].map((y) => box(0.32, 0.04, 0.06, p.metal, 0, y, -0.6))))
  );
  // Thân trước rộng gần bằng xe (giữa hai dải xích trước): lúc chạy vẫn thấy rõ, xoè càng trước thì lộ hẳn ra
  const NW = HALF_W - FRONT_W - 0.02;
  const front = part("Thân trước (khoang lái)", facets([[NW, 0.42, 0.62], [NW, 0.42, 2.45], [NW, 1.1, 0.62], [NW - 0.04, 1.06, 1.75], [NW - 0.06, 0.72, 2.62], [NW - 0.06, 0.95, 2.5]], p.hull, true));
  add(front);
  const ft = surfaceTools(body, [front]);
  add(ft.skin("Kính lái", [[-0.6, 1.82], [0.6, 1.82], [0.55, 1.45], [-0.55, 1.45]], p.glass));
  add(ft.line("Khung kính", [[0, 1.84], [0, 1.43]], p.metal, { w: 0.07 }));
  add(ft.line("Chữ V mũi (màu phe)", [[-0.6, 1.08], [0, 1.32], [0.6, 1.08]], p.team, { w: 0.09 }));
  add(ft.skin("Nóc thân trước (màu phe)", [[-0.55, 1.2], [0.55, 1.2], [0.55, 0.75], [-0.55, 0.75]], p.team));
  for (const sx of [-1, 1]) add(ft.skin("Đèn pha", [[sx * 0.45, 0.76], [sx * 0.7, 0.76], [sx * 0.7, 0.86], [sx * 0.45, 0.86]], p.glass, { face: "front", lift: 0.02 }));
  for (const y of [0.55, 0.63]) add(ft.line("Lưới tản nhiệt", [[-0.4, y], [0.4, y]], p.hullDark, { face: "front", w: 0.04 }));
  for (const sx of [-1, 1]) add(part("Móc kéo", box(0.1, 0.12, 0.14, p.warning, sx * 0.55, 0.5, 2.62)));

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
    part("Trục nâng", cyl(0.11, 0.11, 2.1, p.metal, 10, 0, TRUNNION_Y, TRUNNION_Z).rotateZ(Math.PI / 2))
  );
  for (const sx of [-1, 1]) turret.add(part("Tai đỡ trục", facets([[sx * 0.9, 0.1, 0.45], [sx * 1.04, 0.1, 0.45], [sx * 0.9, 0.1, -0.35], [sx * 1.04, 0.1, -0.35], [sx * 0.9, TRUNNION_Y + 0.15, 0.25], [sx * 1.04, TRUNNION_Y + 0.15, 0.25], [sx * 0.9, TRUNNION_Y + 0.15, -0.05], [sx * 1.04, TRUNNION_Y + 0.15, -0.05]], p.hullDark)));

  const gun = part("Thân tháp + nòng (ngóc cùng nhau)", group());
  gun.position.set(0, TRUNNION_Y, TRUNNION_Z);
  // tọa độ dưới đây tính từ trục nâng
  gun.add(
    part("Thân tháp", facets([[0.86, -0.45, 0.9], [0.86, -0.45, -1.5], [0.82, 0.5, 0.75], [0.82, 0.52, -1.5], [0.6, -0.3, 1.05], [0.6, 0.4, 1.0]], p.hull, true)),
    part("Nóc tháp (màu phe)", box(1.25, 0.03, 1.4, p.team, 0, 0.53, -0.55)),
    part("Hộp đạn sau tháp", group(box(1.6, 0.6, 0.45, p.hullDark, 0, 0.0, -1.7), box(1.62, 0.05, 0.47, p.white, 0, 0.32, -1.7))),
    part("Nắp xe trưởng", group(cyl(0.22, 0.24, 0.12, p.hullDark, 10, 0.42, 0.58, -0.7), box(0.08, 0.06, 0.24, p.metal, 0.42, 0.66, -0.7))),
    part("Kính ngắm pháo", group(box(0.22, 0.22, 0.26, p.hullDark, -0.5, 0.62, 0.1), box(0.16, 0.1, 0.02, p.glass, -0.5, 0.64, 0.235))),
    part("Lá chắn nòng", box(0.66, 0.5, 0.32, p.hullDark, 0, 0.05, 1.08))
  );
  for (const sx of [-1, 1]) gun.add(part("Tấm hông tháp (màu phe)", box(0.03, 0.42, 1.2, p.team, sx * 0.855, 0.0, -0.55)));
  // Nòng ngoài (giật khi bắn) chứa nòng trong (duỗi ra khi cố định): nòng trong là con của nòng ngoài nên vẫn giật theo
  const outer = barrel(2.6, 0.15, p.metal, 0, 0.05, 1.2);
  const fume = part("Bầu hút khói", tubeZ(0.2, 0.2, 0.42, p.metal, 12));
  fume.position.z = 1.35;
  const band = part("Đai nòng (màu phe)", tubeZ(0.165, 0.165, 0.1, p.team, 12));
  band.position.z = 2.3;
  outer.add(fume, band);
  const inner = part("Nòng trong (duỗi ra)", group());
  const innerTube = tubeZ(0.11, 0.11, 1.8, p.metal, 10);
  innerTube.position.z = 0.9;
  const brake = part("Đầu hãm nòng", group(box(0.36, 0.26, 0.38, p.hullDark, 0, 0, 1.95), box(0.38, 0.06, 0.1, p.metal, 0, 0, 1.85), box(0.38, 0.06, 0.1, p.metal, 0, 0, 2.05)));
  const flash = muzzleFlash(1.0, p.flash);
  flash.position.z = 2.55;
  inner.add(innerTube, brake, flash);
  inner.position.z = 0.8;
  outer.add(inner);
  gun.add(outer);
  turret.add(gun);
  add(turret);

  // ================================================================ 4. HOẠT ẢNH HẠ BỆ (tuyến tính, đúng DEPLOY_TIME giây)
  let dep = 0;
  return vehicleRig(
    "artillery",
    p,
    { body, wheels, turret, gun, barrels: [outer], muzzles: [inner], flashes: [flash], spinners: [], aimPitch: 0.62, recoil: 0.45 },
    3.9,
    [{ id: "deploy", label: "Hạ bệ chữ X" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const splay = smooth(0.05, 0.6, dep);
      for (const arm of arms) arm.g.rotation.y = arm.rot * splay;
      const down = smooth(0.5, 0.8, dep);
      for (const s of spades) s.rotation.x = -Math.PI / 2 + down * (Math.PI / 2 + SPADE_DIG);
      inner.position.z = 0.8 + smooth(0.65, 1, dep) * BARREL_EXT;
    }
  );
}
