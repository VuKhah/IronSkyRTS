/**
 * Mô hình Pháo Tự Hành (`artillery`), bản 1 (06/11/2026).
 * Người dùng chốt: tháp pháo ĐƠN NÒNG CỠ LỚN; lúc chạy là khối chữ nhật như xe thường; lúc HẠ BỆ ĐỠ thì xe TÁCH GIỮA
 * thành HÌNH CHỮ X, và pháo DUỖI DÀI NÒNG khi cố định vị trí.
 *
 * Ý đồ:
 * - Thân giữa (thấp, vát) mang tháp pháo; 4 CÀNG XÍCH (mỗi càng: đoạn xích + giáp che + lưỡi neo) bản lề ở đầu trong.
 *   Lúc chạy 4 càng nằm thẳng dọc thân, khép thành khối chữ nhật; khe mảnh giữa hai càng trước / sau là "đường tách".
 * - Hạ bệ (khớp luật: `deploy.time` = 2 giây, `required`): 0–55% 4 càng xoay ra 40° thành chữ X · 45–80% lưỡi neo gập
 *   xuống cắm đất · 65–100% nòng trong trượt ra thêm 1,5 m (nòng ống lồng). Thu về ngược lại.
 * - Tháp to vuông vức, mặt trước vát; nòng 155mm có bầu hút khói, đầu hãm nòng, giật mạnh khi bắn.
 * Bộ phận động: tháp xoay, nòng nâng + giật, nòng trong duỗi, 4 càng xoay, 4 lưỡi neo, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, surfaceTools, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

type P3 = [number, number, number];

/** Thời gian hạ bệ, khớp `UNITS.artillery.weapon.deploy.time` (sim chỉ cho bắn sau ngần ấy giây đứng yên). */
const DEPLOY_TIME = 2;
/** Góc xoay ra của mỗi càng khi thành chữ X (rad). */
const SPLAY = 0.7;
/** Nòng trong duỗi thêm bao nhiêu mét khi cố định. */
const BARREL_EXT = 1.5;
const ARM_LEN = 2.0; // chiều dài một càng xích
/** Lưỡi neo hạ quá phương ngang bao nhiêu (rad): bản lề cao 0,62 m, lưỡi dài 0,75 m → 0,9 rad thì mũi chạm đất. */
const SPADE_DIG = 0.9;
const PIVOT_X = 1.02;
const PIVOT_Z = 0.12;

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildArtillery(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);
  const wheels: { g: THREE.Object3D; r: number }[] = [];

  // ================================================================ 1. 4 CÀNG XÍCH (bản lề ở đầu trong, gần giữa xe)
  // Càng và lưỡi neo là bộ phận động (không gộp được): giữ ít màu (tối · thân · màu phe), mỗi màu thêm một lệnh vẽ.
  // Mỗi càng dựng dọc +z cục bộ; càng sau xoay sẵn 180°. Xoay thêm ±SPLAY quanh bản lề là ra chữ X.
  const arms: { g: THREE.Group; base: number; out: number; spade: THREE.Group }[] = [];
  for (const sx of [-1, 1])
    for (const sz of [1, -1]) {
      const arm = part("Càng xích", group());
      arm.position.set(sx * PIVOT_X, 0, sz * PIVOT_Z);
      const base = sz > 0 ? 0 : Math.PI;
      arm.rotation.y = base;
      // xích + 3 bánh tì (càng sau quay ngược 180° nên bánh lăn ngược chiều: bán kính âm để vẫn lăn đúng)
      arm.add(part("Dải xích", box(0.52, 0.66, ARM_LEN - 0.1, p.hullDark, 0, 0.33, ARM_LEN / 2)));
      for (const z of [0.4, 1.0, 1.6]) {
        const w = part("Bánh tì", wheel(0.3, 0.56, p.hullDark, p.hullDark));
        w.position.set(0, 0.3, z);
        arm.add(w);
        wheels.push({ g: w, r: sz > 0 ? 0.3 : -0.3 });
      }
      // giáp che xích vát hai đầu, sọc màu phe hông ngoài (càng sau xoay 180° nên hông ngoài đổi phía cục bộ)
      const outer = sx * (sz > 0 ? 1 : -1);
      const armor: P3[] = [[-0.34, 0.62, 0.1], [0.34, 0.62, 0.1], [-0.3, 0.86, 0.3], [0.3, 0.86, 0.3], [-0.34, 0.62, ARM_LEN - 0.05], [0.34, 0.62, ARM_LEN - 0.05], [-0.3, 0.86, ARM_LEN - 0.3], [0.3, 0.86, ARM_LEN - 0.3]];
      arm.add(part("Giáp càng", facets(armor, p.hull)));
      arm.add(part("Sọc càng (màu phe)", box(0.03, 0.08, ARM_LEN - 0.7, p.team, outer * 0.345, 0.72, ARM_LEN / 2)));
      // lưỡi neo ở đầu ngoài: lúc chạy gập đứng lên, hạ bệ thì gập xuống cắm đất
      const spade = part("Lưỡi neo", group(box(0.62, 0.06, 0.75, p.hullDark, 0, 0, 0.375), box(0.06, 0.18, 0.6, p.hullDark, 0, 0.08, 0.3)));
      spade.position.set(0, 0.62, ARM_LEN - 0.02);
      spade.rotation.x = -Math.PI / 2; // gập đứng
      arm.add(spade);
      add(arm);
      // càng phải phía trước xoay +, trái phía trước xoay −; phía sau ngược lại (vì đã xoay sẵn 180°)
      arms.push({ g: arm, base, out: sx * sz, spade });
    }

  // ================================================================ 2. THÂN GIỮA
  const hull = part(
    "Thân giữa",
    facets(
      [
        [0.72, 0.42, 1.9], [0.72, 0.42, -1.85], [0.76, 1.05, 1.55], [0.76, 1.1, -1.85], // hông
        [0.6, 0.62, 2.25], [0.62, 0.92, 2.15], // mũi vát
        [0.62, 1.2, 1.2], [0.64, 1.22, -1.75] // mép nóc
      ],
      p.hull,
      true
    )
  );
  add(hull);
  const { skin, line } = surfaceTools(body, [hull]);
  for (const sx of [-1, 1]) add(skin("Đèn pha", [[sx * 0.32, 0.72], [sx * 0.52, 0.72], [sx * 0.52, 0.82], [sx * 0.32, 0.82]], p.glass, { face: "front", lift: 0.02 }));
  add(skin("Kính lái", [[-0.45, 1.88], [0.0, 1.88], [0.0, 1.62], [-0.45, 1.62]], p.glass));
  add(line("Chữ V mũi (màu phe)", [[-0.45, 2.02], [0, 2.18], [0.45, 2.02]], p.team, { face: "top", w: 0.07 }));
  add(skin("Lưới tản nhiệt", [[-0.5, -1.25], [0.5, -1.25], [0.5, -1.7], [-0.5, -1.7]], p.hullDark));
  for (const x of [-0.3, -0.1, 0.1, 0.3]) add(line("Thanh lưới", [[x, -1.28], [x, -1.67]], p.metal, { w: 0.04 }));
  add(part("Khe tách (đường chia càng)", box(0.08, 0.02, 3.4, p.hullDark, 0, 1.22, 0.1)));

  // ================================================================ 3. THÁP PHÁO + NÒNG ỐNG LỒNG
  const turret = part("Tháp pháo", group());
  turret.position.set(0, 1.18, -0.25);
  turret.add(
    part("Thân tháp", facets([[0.82, 0, 0.95], [0.82, 0, -1.35], [0.78, 0.72, 0.6], [0.8, 0.74, -1.35], [0.55, 0.45, 1.3], [0.55, 0.05, 1.25]], p.hull, true)),
    part("Nóc tháp (màu phe)", box(1.2, 0.03, 1.2, p.team, 0, 0.745, -0.5)),
    part("Vành tháp", cyl(0.9, 0.95, 0.12, p.hullDark, 16, 0, -0.02, -0.2)),
    part("Hộp đạn sau tháp", group(box(1.5, 0.5, 0.45, p.hullDark, 0, 0.35, -1.55), box(1.52, 0.05, 0.47, p.white, 0, 0.62, -1.55))),
    part("Nắp xe trưởng", group(cyl(0.22, 0.24, 0.12, p.hullDark, 10, 0.4, 0.8, -0.6), box(0.08, 0.06, 0.24, p.metal, 0.4, 0.88, -0.6))),
    part("Kính ngắm pháo", group(box(0.22, 0.2, 0.26, p.hullDark, -0.45, 0.84, 0.1), box(0.16, 0.1, 0.02, p.glass, -0.45, 0.86, 0.235)))
  );
  for (const sx of [-1, 1]) turret.add(part("Tấm hông tháp (màu phe)", box(0.03, 0.3, 1.0, p.team, sx * 0.815, 0.38, -0.55)));

  const gun = part("Cụm pháo", group());
  gun.position.set(0, 0.42, 1.05);
  gun.add(part("Lá chắn nòng", box(0.62, 0.48, 0.3, p.hullDark, 0, 0, 0.05)));
  // Nòng ngoài (giật khi bắn) chứa nòng trong (duỗi ra khi cố định): nòng trong là con của nòng ngoài nên vẫn giật theo
  const outer = barrel(2.5, 0.14, p.metal, 0, 0, 0.15);
  const fume = part("Bầu hút khói", tubeZ(0.19, 0.19, 0.4, p.metal, 12));
  fume.position.z = 1.3;
  const band = part("Đai nòng (màu phe)", tubeZ(0.155, 0.155, 0.1, p.team, 12));
  band.position.z = 2.2;
  outer.add(fume, band);
  const inner = part("Nòng trong (duỗi ra)", group());
  const innerTube = tubeZ(0.105, 0.105, 1.75, p.metal, 10);
  innerTube.position.z = 1.75 / 2;
  const brake = part("Đầu hãm nòng", group(box(0.34, 0.24, 0.36, p.hullDark, 0, 0, 1.9), box(0.36, 0.06, 0.1, p.metal, 0, 0, 1.8), box(0.36, 0.06, 0.1, p.metal, 0, 0, 2.0)));
  const flash = muzzleFlash(1.0, p.flash);
  flash.position.z = 2.5;
  inner.add(innerTube, brake, flash);
  inner.position.z = 0.75;
  outer.add(inner);
  gun.add(outer);
  turret.add(gun);
  add(turret);

  // ================================================================ 4. HOẠT ẢNH HẠ BỆ (tuyến tính, đúng DEPLOY_TIME giây)
  let dep = 0;
  return vehicleRig(
    "artillery",
    p,
    { body, wheels, turret, gun, barrels: [outer], muzzles: [inner], flashes: [flash], spinners: [], aimPitch: 0.45, recoil: 0.45 },
    3.6,
    [{ id: "deploy", label: "Hạ bệ chữ X" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const splay = smooth(0, 0.55, dep) * SPLAY;
      const spadeDown = smooth(0.45, 0.8, dep);
      for (const arm of arms) {
        arm.g.rotation.y = arm.base + arm.out * splay;
        arm.spade.rotation.x = -Math.PI / 2 + spadeDown * (Math.PI / 2 + SPADE_DIG); // gập xuống quá ngang: mũi neo chạm đất
      }
      inner.position.z = 0.75 + smooth(0.65, 1, dep) * BARREL_EXT;
    }
  );
}
