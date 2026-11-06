/**
 * Mô hình Pháo Tự Hành (`artillery`), bản 3 (06/11/2026).
 * Người dùng chốt: tháp pháo ĐƠN NÒNG CỠ LỚN, THÂN THÁP CAO; lúc chạy là khối chữ nhật như xe thường; lúc HẠ BỆ ĐỠ thì
 * TÁCH THÂN XE dựng thành HÌNH CHỮ X như CÁI KÉO: góc phía trước NHỎ, góc phía sau LỚN, chữ V phía sau DÀY hơn; pháo DUỖI
 * DÀI NÒNG khi cố định. Bản 3 sửa: hai khối không được lướt xuyên qua nhau; nâng nòng phải tự nhiên (đuôi nòng hạ vào
 * trong tháp — chính vì thế tháp mới to).
 *
 * Ý đồ:
 * - Thân xe = 4 CÀNG: mỗi nửa thân (trái / phải) gãy đôi ở giữa thành càng trước + càng sau. BẢN LỀ Ở MÉP NGOÀI, ngang giữa
 *   xe: xoè ra thì phía trong mở, không càng nào cắt qua càng nào. Càng trước xoè 20° (góc trước 40°), càng sau 34°
 *   (góc sau 68°); càng sau rộng và cao hơn (tay cầm của cái kéo).
 * - Ở tâm: ĐẾ GIỮA chạm đất + CỘT BỆ THÁP thon + vai đỡ (tháp to nằm trên như mũ nấm) + MŨI GIỮA có ghế lái. Góc trong của
 *   mỗi càng vát xiên chừa chỗ cho cột, nên lúc chạy hay lúc xoè không gì chạm nhau.
 * - Tháp to, cao; TRỤC NÂNG NÒNG SÂU BÊN TRONG THÁP, mặt trước có khe nâng nòng, LÁ CHẮN NÒNG to xoay theo nòng.
 * - Hạ bệ (khớp luật `deploy.time` = 2 giây, `required`): 5–60% 4 càng xoè · 50–80% 4 lưỡi neo cắm đất ·
 *   65–100% nòng trong duỗi thêm 1,5 m (nòng ống lồng).
 * Bộ phận động: 4 càng, 4 lưỡi neo, tháp xoay, cụm pháo nâng + giật, nòng trong duỗi, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, tubeZ, wheel, type Palette, type Rig } from "../kit";
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
      const w = rear ? 1.32 : 1.12; // càng sau rộng hơn
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
              P(-w + 0.02, 0.42, CUT_Z), P(-w + 0.62, 0.42, z0), P(-0.02, 0.42, z0), P(-w + 0.02, 0.42, z1 - 0.25), P(-0.02, 0.42, z1 - 0.25),
              P(-w + 0.1, h, CUT_Z + 0.05), P(-w + 0.66, h, z0 + 0.05), P(-0.08, h - 0.08, z0 + 0.05), P(-w + 0.1, h, z1 - 0.6), P(-0.08, h - 0.08, z1 - 0.6),
              P(-w + 0.08, 0.66, z1), P(-0.06, 0.66, z1), P(-w + 0.08, 0.9, z1 - 0.15), P(-0.06, 0.9, z1 - 0.15)
            ],
            p.hull
          )
        )
      );
      // dải xích + 2 bánh tì ở mép ngoài
      arm.add(part("Dải xích", box(0.5, 0.62, z1 - 0.3, p.hullDark, sx * -0.3, 0.31, sz * (z1 / 2))));
      for (const z of [0.7, 1.9]) {
        const wl = part("Bánh tì", wheel(0.3, 0.56, p.hullDark, p.hullDark));
        wl.position.set(sx * -0.3, 0.3, sz * z);
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
    part("Đế giữa", cyl(1.15, 1.3, 0.42, p.hullDark, 8, 0, 0.21, 0)),
    part("Cột bệ tháp", cyl(0.52, 0.62, PEDESTAL_TOP - 0.4, p.hull, 10, 0, (PEDESTAL_TOP + 0.4) / 2, 0)),
    part("Đai cột (màu phe)", cyl(0.56, 0.56, 0.08, p.team, 10, 0, 1.36, 0)),
    part("Vai đỡ tháp", cyl(0.85, 0.55, 0.3, p.hullDark, 10, 0, PEDESTAL_TOP - 0.15, 0)),
    part("Thang", group(...[0.8, 1.0, 1.2, 1.4].map((y) => box(0.32, 0.04, 0.06, p.metal, 0, y, -0.6))))
  );
  const nose = part("Mũi giữa (ghế lái)", facets([[0.24, 0.42, 0.9], [0.24, 0.42, 2.55], [0.24, 1.0, 0.9], [0.22, 0.95, 2.1], [0.22, 0.7, 2.6]], p.hull, true));
  const slit = part("Kính lái", box(0.36, 0.08, 0.03, p.glass, 0, 0.9, 2.18));
  slit.rotation.x = -0.6;
  add(nose, slit, part("Vạch mũi (màu phe)", box(0.46, 0.03, 0.5, p.team, 0, 1.0, 1.25)));

  // ================================================================ 3. THÁP CAO + CỤM PHÁO (trục nâng sâu trong tháp)
  const turret = part("Tháp pháo", group());
  turret.position.set(0, PEDESTAL_TOP, 0);
  turret.add(
    part("Thân tháp", facets([[0.88, 0, 1.0], [0.88, 0, -1.4], [0.84, 1.1, 0.88], [0.84, 1.12, -1.4], [0.6, 0.15, 1.1], [0.6, 1.0, 1.04]], p.hull, true)),
    part("Khe nâng nòng", box(0.5, 0.95, 0.03, p.rubber, 0, 0.55, 1.1)),
    part("Nóc tháp (màu phe)", box(1.25, 0.03, 1.4, p.team, 0, 1.13, -0.5)),
    part("Vành tháp", cyl(1.0, 1.05, 0.12, p.hullDark, 16, 0, 0.02, -0.15)),
    part("Hộp đạn sau tháp", group(box(1.6, 0.66, 0.45, p.hullDark, 0, 0.55, -1.6), box(1.62, 0.05, 0.47, p.white, 0, 0.9, -1.6))),
    part("Nắp xe trưởng", group(cyl(0.22, 0.24, 0.12, p.hullDark, 10, 0.42, 1.18, -0.6), box(0.08, 0.06, 0.24, p.metal, 0.42, 1.26, -0.6))),
    part("Kính ngắm pháo", group(box(0.22, 0.22, 0.26, p.hullDark, -0.5, 1.22, 0.2), box(0.16, 0.1, 0.02, p.glass, -0.5, 1.24, 0.335)))
  );
  for (const sx of [-1, 1]) turret.add(part("Tấm hông tháp (màu phe)", box(0.03, 0.42, 1.2, p.team, sx * 0.87, 0.55, -0.5)));

  // Trục nâng nằm sâu trong tháp (z = 0,5): ngóc nòng thì đuôi nòng hạ vào trong tháp, lá chắn to xoay theo che khe nâng.
  const gun = part("Cụm pháo", group());
  gun.position.set(0, 0.55, 0.5);
  gun.add(
    part("Lá chắn nòng", box(0.66, 0.66, 0.62, p.hullDark, 0, 0, 0.5)),
    part("Trục nâng", cyl(0.12, 0.12, 1.2, p.metal, 10, 0, 0, 0).rotateZ(Math.PI / 2)),
    part("Khóa nòng", box(0.4, 0.4, 0.6, p.metal, 0, 0, -0.3))
  );
  // Nòng ngoài (giật khi bắn) chứa nòng trong (duỗi ra khi cố định): nòng trong là con của nòng ngoài nên vẫn giật theo
  const outer = barrel(2.6, 0.15, p.metal, 0, 0, 0.8);
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
