/**
 * Mô hình Pháo Tự Hành (`artillery`), bản 2 (06/11/2026).
 * Người dùng chốt: tháp pháo ĐƠN NÒNG CỠ LỚN, THÂN THÁP CAO; lúc chạy là khối chữ nhật như xe thường; lúc HẠ BỆ ĐỠ thì
 * TÁCH CẢ THÂN XE ra thành HÌNH CHỮ X (bản 1 chỉ xoè 4 góc là sai ý), và pháo DUỖI DÀI NÒNG khi cố định.
 *
 * Ý đồ:
 * - Thân xe = 2 NỬA THÂN (trái, phải), mỗi nửa dài trọn chiều xe, dải xích ở mép ngoài. Lúc chạy áp sát nhau: khối chữ nhật,
 *   đường tách chạy dọc giữa nóc.
 * - Hạ bệ (khớp luật `deploy.time` = 2 giây, `required`): 15–60% hai nửa vừa trượt vào giữa vừa xoay ngược chiều nhau như
 *   lưỡi kéo, bắt chéo tại tâm thành chữ X · 50–80% 4 lưỡi neo ở 4 đầu cắm đất · 65–100% nòng trong duỗi thêm 1,5 m.
 * - BỆ THÁP hình trụ cao ở giữa (đứng yên): tháp đặt trên đó, và nó che chỗ hai nửa thân chồng nhau khi bắt chéo.
 * - Tháp to cao, mặt trước vát; nòng 155mm ống lồng, bầu hút khói, đầu hãm nòng, giật mạnh khi bắn.
 * Bộ phận động: 2 nửa thân, 4 lưỡi neo, tháp xoay, nòng nâng + giật, nòng trong duỗi, bánh lăn.
 */
import * as THREE from "three";
import { box, cyl, facets, group, muzzleFlash, part, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

/** Thời gian hạ bệ, khớp `UNITS.artillery.weapon.deploy.time` (sim chỉ cho bắn sau ngần ấy giây đứng yên). */
const DEPLOY_TIME = 2;
/** Mỗi nửa thân xoay bao nhiêu khi bắt chéo (rad); hai nửa lệch nhau gấp đôi. */
const SCISSOR = 0.6;
/** Nòng trong duỗi thêm bao nhiêu mét khi cố định. */
const BARREL_EXT = 1.5;
const HALF_LEN = 5.2; // chiều dài một nửa thân
const HALF_OFF = 0.68; // tâm nửa thân cách trục giữa khi chạy
/** Lưỡi neo: bản lề cao 0,6 m, lưỡi dài 0,75 m, hạ quá phương ngang 0,9 rad thì mũi chạm đất. */
const SPADE_DIG = 0.9;
const PEDESTAL_TOP = 1.7;

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildArtillery(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);
  const wheels: { g: THREE.Object3D; r: number }[] = [];

  // ================================================================ 1. HAI NỬA THÂN (mỗi nửa là bộ phận động: giữ ít màu)
  const halves: { g: THREE.Group; sx: number }[] = [];
  const spades: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const half = part(sx < 0 ? "Nửa thân trái" : "Nửa thân phải", group());
    half.position.x = sx * HALF_OFF;
    const L = HALF_LEN / 2;
    half.add(
      part(
        "Giáp nửa thân",
        facets(
          [
            [0.62, 0.4, L - 0.3], [0.62, 0.4, -(L - 0.3)], [0.66, 0.96, L - 0.4], [0.66, 0.98, -(L - 0.3)],
            [0.56, 1.1, L - 0.8], [0.56, 1.12, -(L - 0.4)], [0.56, 0.64, L], [0.56, 0.92, L - 0.12], [0.56, 0.7, -L]
          ],
          p.hull,
          true
        )
      )
    );
    // dải xích + 4 bánh tì ở mép ngoài
    half.add(part("Dải xích", box(0.5, 0.62, HALF_LEN - 0.5, p.hullDark, sx * 0.48, 0.31, 0)));
    for (const z of [-1.65, -0.55, 0.55, 1.65]) {
      const w = part("Bánh tì", wheel(0.3, 0.56, p.hullDark, p.hullDark));
      w.position.set(sx * 0.48, 0.3, z);
      half.add(w);
      wheels.push({ g: w, r: 0.3 });
    }
    half.add(part("Sọc hông (màu phe)", box(0.03, 0.08, HALF_LEN - 1.4, p.team, sx * 0.67, 0.86, 0)));
    half.add(part("Nóc nửa thân (màu phe)", box(0.5, 0.03, 1.2, p.team, 0, 1.13, -1.6)));
    // đèn pha ở đầu trước; kính lái ở nửa trái
    half.add(part("Đèn pha", box(0.26, 0.1, 0.03, p.glass, sx * 0.25, 0.78, L + 0.01)));
    if (sx < 0) {
      const glass = part("Kính lái", box(0.6, 0.03, 0.42, p.glass, 0.05, 1.03, L - 0.42));
      glass.rotation.x = 0.32;
      half.add(glass);
    }
    // lưỡi neo ở hai đầu: lúc chạy gập đứng, hạ bệ thì gập xuống cắm đất
    for (const end of [1, -1]) {
      const mount = group();
      mount.position.set(0, 0.6, end * (L - 0.02));
      mount.rotation.y = end > 0 ? 0 : Math.PI;
      const spade = part("Lưỡi neo", group(box(0.66, 0.06, 0.75, p.hullDark, 0, 0, 0.375), box(0.06, 0.18, 0.6, p.hullDark, 0, 0.08, 0.3)));
      spade.rotation.x = -Math.PI / 2;
      mount.add(spade);
      half.add(mount);
      spades.push(spade);
    }
    add(half);
    halves.push({ g: half, sx });
  }

  // ================================================================ 2. BỆ THÁP CAO Ở GIỮA (đứng yên)
  add(
    part("Bệ tháp", cyl(0.95, 1.12, PEDESTAL_TOP - 0.35, p.hull, 10, 0, (PEDESTAL_TOP + 0.35) / 2, 0)),
    part("Đai bệ tháp (màu phe)", cyl(1.0, 1.0, 0.08, p.team, 10, 0, 1.3, 0)),
    part("Cửa bệ tháp", box(0.5, 0.7, 0.04, p.hullDark, 0, 1.05, -1.06)),
    part("Thang", group(...[0.75, 0.95, 1.15, 1.35].map((y) => box(0.4, 0.04, 0.06, p.metal, 0, y, -1.12))))
  );

  // ================================================================ 3. THÁP PHÁO CAO + NÒNG ỐNG LỒNG
  const turret = part("Tháp pháo", group());
  turret.position.set(0, PEDESTAL_TOP, 0);
  turret.add(
    part("Thân tháp", facets([[0.86, 0, 0.95], [0.86, 0, -1.35], [0.8, 1.02, 0.55], [0.82, 1.04, -1.35], [0.56, 0.62, 1.3], [0.56, 0.05, 1.25]], p.hull, true)),
    part("Nóc tháp (màu phe)", box(1.2, 0.03, 1.3, p.team, 0, 1.05, -0.5)),
    part("Vành tháp", cyl(1.0, 1.05, 0.12, p.hullDark, 16, 0, 0.02, -0.15)),
    part("Hộp đạn sau tháp", group(box(1.55, 0.6, 0.45, p.hullDark, 0, 0.5, -1.55), box(1.57, 0.05, 0.47, p.white, 0, 0.82, -1.55))),
    part("Nắp xe trưởng", group(cyl(0.22, 0.24, 0.12, p.hullDark, 10, 0.4, 1.1, -0.6), box(0.08, 0.06, 0.24, p.metal, 0.4, 1.18, -0.6))),
    part("Kính ngắm pháo", group(box(0.22, 0.22, 0.26, p.hullDark, -0.45, 1.14, 0.1), box(0.16, 0.1, 0.02, p.glass, -0.45, 1.16, 0.235)))
  );
  for (const sx of [-1, 1]) turret.add(part("Tấm hông tháp (màu phe)", box(0.03, 0.4, 1.1, p.team, sx * 0.85, 0.5, -0.55)));

  const gun = part("Cụm pháo", group());
  gun.position.set(0, 0.55, 1.05);
  gun.add(part("Lá chắn nòng", box(0.66, 0.56, 0.3, p.hullDark, 0, 0, 0.05)));
  // Nòng ngoài (giật khi bắn) chứa nòng trong (duỗi ra khi cố định): nòng trong là con của nòng ngoài nên vẫn giật theo
  const outer = barrel(2.6, 0.15, p.metal, 0, 0, 0.15);
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
    { body, wheels, turret, gun, barrels: [outer], muzzles: [inner], flashes: [flash], spinners: [], aimPitch: 0.45, recoil: 0.45 },
    3.8,
    [{ id: "deploy", label: "Hạ bệ chữ X" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const slide = smooth(0.15, 0.6, dep); // trượt cùng nhịp với xoay: hai nửa không lúc nào chồng khít lên nhau
      const turn = smooth(0.15, 0.6, dep) * SCISSOR;
      for (const h of halves) {
        h.g.position.x = h.sx * HALF_OFF * (1 - slide);
        h.g.rotation.y = h.sx * turn; // hai nửa xoay ngược chiều nhau: bắt chéo như lưỡi kéo
      }
      const down = smooth(0.5, 0.8, dep);
      for (const s of spades) s.rotation.x = -Math.PI / 2 + down * (Math.PI / 2 + SPADE_DIG);
      inner.position.z = 0.8 + smooth(0.65, 1, dep) * BARREL_EXT;
    }
  );
}
