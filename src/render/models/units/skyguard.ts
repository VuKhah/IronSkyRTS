/**
 * Mô hình Xe Phòng Không Cơ Động SkyGuard (`skyguard`), bản 1 (06/11/2026).
 * Người dùng chốt: GIỮ radar và hộp tên lửa (đúng ý); làm lại phần xe cho KIÊN CỐ khi cố định vị trí bắn.
 * Không dùng chân nhện. Lấy ý cơ chế "khi cố định tạo bệ hình gần giống vòng benzen" (người dùng thích),
 * hình khối là của Iron Sky.
 *
 * Ý đồ:
 * - Xe xích thân thép dày, sườn giáp che xích, cabin kính phía trước, máy phát điện phía đuôi (radar cần điện).
 * - Bệ xoay lục giác trên nóc dưới mâm tròn: mô-típ vòng benzen ngay cả khi đang chạy.
 * - CỐ ĐỊNH (Lockdown, sim: đứng yên `deploy.time` = 1,2 giây): 6 chân chống thò ra theo 6 hướng cách đều 60°,
 *   kích thủy lực hạ đế lục giác xuống đất, rồi vành giằng nối 6 chân thành hình lục giác trên mặt đất.
 *   Vành lục giác + mâm tròn ở giữa = vòng benzen. Hoạt ảnh dài đúng 1,2 giây để khớp luật.
 *
 * Bộ phận động: mâm xoay + radar quay, giá phóng ngóc, 6 chân chống (ống trượt, kích, đế), vành giằng, xích.
 */
import * as THREE from "three";
import { box, cyl, facets, group, part, surfaceTools, type Palette, type Rig } from "../kit";
import { vehicleRig, tracks } from "./ground";

/** Thời gian hạ bệ, khớp `UNITS.skyguard.weapon.deploy.time` (sim tính Lockdown sau ngần ấy giây đứng yên). */
const DEPLOY_TIME = 1.2;
/** Bán kính đặt 6 đế chân khi cố định (đỉnh của vành lục giác). */
const PAD_R = 3.0;
/** Độ cao trục chân chống (ngang sườn xe). */
const ARM_Y = 0.95;
const PAD_STOW_Y = 0.84;
const PAD_GROUND_Y = 0.05;

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildSkyguard(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);

  // ================================================================ 1. XÍCH + THÂN THÉP
  const tr = tracks(p, 1.05, 4.3, 0.33, 5);
  add(tr.g);
  const hull = part(
    "Thân xe",
    facets(
      [
        [0.78, 0.3, 1.95], [0.78, 0.3, -2.0], // thân dưới giữa hai dải xích
        [1.32, 0.84, 2.15], [1.32, 0.84, -2.2], // sườn giáp che xích
        [1.32, 1.12, 1.9], [1.32, 1.15, -2.2],
        [1.15, 1.26, 1.35], [1.15, 1.26, -2.15], // mép sàn trên
        [0.95, 0.7, 2.5], [0.95, 0.98, 2.45] // mũi
      ],
      p.hull,
      true
    )
  );
  add(hull);
  const { skin, line, at } = surfaceTools(body, [hull]);

  // Cabin: kính chắn gió vát 2 ô + thanh khung; đèn pha
  for (const sx of [1, -1]) {
    const m = sx < 0;
    add(skin("Kính cabin", [[0.1, 2.3], [0.82, 2.2], [0.78, 1.72], [0.1, 1.78]], p.glass, { mirror: m }));
    add(skin("Đèn pha", [[0.55, 0.78], [0.82, 0.78], [0.82, 0.88], [0.55, 0.88]], p.glass, { face: "front", mirror: m }));
    // Sọc màu phe dọc sườn + tấm giáp sườn tối màu chia 3 phiến
    add(skin("Sọc màu phe", [[1.85, 1.02], [-2.05, 1.02], [-2.05, 1.08], [1.85, 1.08]], p.team, { face: "right", mirror: m }));
    for (const [a, b] of [[1.75, 0.55], [0.4, -0.8], [-0.95, -2.05]]) add(skin("Giáp sườn", [[a, 0.88], [b, 0.88], [b, 0.98], [a, 0.98]], p.hullDark, { face: "right", mirror: m, lift: 0.03, thick: 0.05 }));
    // Ăng-ten roi ở góc sau
    const [ax, ay, az] = at(0.95, -1.95, "top", 0, m);
    add(part("Ăng-ten roi", cyl(0.012, 0.012, 1.3, p.metal, 4, ax, ay + 0.65, az)));
  }
  add(line("Khung kính", [[0, 2.32], [0, 1.72]], p.metal, { w: 0.08 }));
  add(skin("Ô nhận diện (màu phe)", [[-0.3, 1.25], [0.3, 1.25], [0.3, 0.85], [-0.3, 0.85]], p.team));

  // Máy phát điện ở đuôi (radar ăn điện): khối tối + lưới tản nhiệt + 2 ống xả
  const gen = part("Máy phát điện", group(box(1.7, 0.38, 0.7, p.hullDark, 0, 0, 0)));
  gen.position.set(0, 1.45, -1.72);
  for (const x of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) gen.add(part("Lưới tản nhiệt", box(0.06, 0.03, 0.5, p.metal, x, 0.2, 0)));
  for (const sx of [-1, 1]) gen.add(part("Ống xả", cyl(0.05, 0.05, 0.4, p.metal, 6, sx * 0.72, 0.3, -0.22)));
  add(gen);

  // Bệ xoay lục giác dưới mâm tròn: lục giác + vòng tròn = mô-típ vòng benzen
  const TURRET_Z = -0.2;
  add(part("Bệ xoay lục giác", cyl(0.9, 0.95, 0.1, p.hullDark, 6, 0, 1.31, TURRET_Z)));
  add(part("Viền bệ (màu phe)", cyl(0.96, 0.96, 0.03, p.team, 6, 0, 1.27, TURRET_Z)));

  // ================================================================ 2. CHÂN CHỐNG + VÀNH GIẰNG LỤC GIÁC
  // Mỗi bộ phận động chỉ một màu: không gộp được với phần đứng yên, thêm màu là thêm lệnh vẽ.
  // 6 hướng cách đều 60°: trước, sau và 4 hướng chéo. Thu gọn thì đế lục giác nằm sát sườn / mũi / đuôi xe.
  const legs: { slide: THREE.Group; jack: THREE.Mesh; pad: THREE.Group; rIn: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const phi = (i * Math.PI) / 3;
    const rIn = i === 0 ? 2.78 : i === 3 ? 2.55 : 1.84;
    const leg = group();
    leg.position.y = ARM_Y;
    leg.rotation.y = phi; // trục +z cục bộ chĩa ra ngoài theo hướng phi
    // Hộp chân chống gắn trên thân (đứng yên): chỗ ống trượt thò ra
    const housingR = i === 0 ? 2.38 : i === 3 ? 2.2 : 1.45;
    leg.add(part("Hộp chân chống", box(0.44, 0.38, 0.4, p.hullDark, 0, 0, housingR)));
    const slide = part("Ống trượt chân chống", group(box(0.24, 0.22, 1.5, p.hullDark, 0, 0, -0.75), box(0.34, 0.3, 0.3, p.hullDark, 0, 0, 0)));
    slide.position.z = rIn;
    const jackGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 8);
    jackGeo.translate(0, -0.5, 0); // gốc ở đỉnh: scale.y = độ dài kích
    const jack = part("Kích thủy lực", new THREE.Mesh(jackGeo, p.metal));
    jack.castShadow = true;
    jack.scale.y = ARM_Y - PAD_STOW_Y;
    jack.visible = false;
    const pad = part("Đế chân lục giác", group(cyl(0.36, 0.42, 0.1, p.hullDark, 6, 0, 0, 0), cyl(0.24, 0.3, 0.16, p.hullDark, 6, 0, 0.06, 0)));
    pad.position.y = PAD_STOW_Y - ARM_Y;
    slide.add(jack, pad);
    leg.add(slide);
    add(leg);
    legs.push({ slide, jack, pad, rIn });
  }
  // Vành giằng: 6 thanh nối 6 đế thành lục giác trên mặt đất (một khối, trồi lên khi chân đã chạm đất)
  const ring = part("Vành giằng lục giác", group());
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * Math.PI) / 3;
    const bar = box(0.22, 0.09, PAD_R - 0.6, p.hullDark);
    bar.position.set(Math.sin(a) * PAD_R * Math.cos(Math.PI / 6), 0.04, Math.cos(a) * PAD_R * Math.cos(Math.PI / 6));
    bar.rotation.y = a + Math.PI / 2;
    const stripe = box(0.08, 0.02, PAD_R - 0.9, p.team);
    stripe.position.copy(bar.position).setY(0.09);
    stripe.rotation.y = bar.rotation.y;
    ring.add(bar, stripe);
  }
  ring.visible = false;
  ring.scale.y = 0.01;
  add(ring);

  // ================================================================ 3. THÁP: GIỮ NGUYÊN radar + 2 hộp tên lửa (người dùng ưng)
  const turret = part("Mâm xoay", group(cyl(0.55, 0.65, 0.4, p.hullDark, 10, 0, 0.2, 0)));
  turret.position.set(0, 1.36, TURRET_Z);
  const gun = group();
  gun.position.set(0, 0.6, 0);
  const muzzles: THREE.Object3D[] = [];
  const barrels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pod = part(side < 0 ? "Hộp tên lửa trái (4 ống)" : "Hộp tên lửa phải (4 ống)", group(box(0.5, 0.5, 1.2, p.hull), box(0.52, 0.08, 1.22, p.team, 0, 0.27, 0)));
    pod.position.set(side * 0.62, 0, 0.1);
    for (const [dx, dy] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
      const hole = cyl(0.08, 0.08, 0.05, p.metal, 8, dx, dy, 0.6);
      hole.rotation.x = Math.PI / 2;
      pod.add(hole);
      const m = group();
      m.position.set(dx, dy, 0.65);
      pod.add(m);
      muzzles.push(m);
    }
    pod.userData.z0 = 0.1;
    barrels.push(pod);
    gun.add(pod);
  }
  const radar = part("Radar dò tìm", group(box(0.9, 0.5, 0.06, p.hullDark), box(0.7, 0.35, 0.07, p.teamGlow, 0, 0, 0.01)));
  radar.position.set(0, 0.95, -0.45);
  turret.add(gun, part("Cột radar", cyl(0.05, 0.05, 0.5, p.metal, 6, 0, 0.65, -0.45)), radar);
  add(turret);

  // ================================================================ 4. HOẠT ẢNH CỐ ĐỊNH
  // t chạy tuyến tính 0 → 1 trong DEPLOY_TIME giây (khớp luật), thu về cũng mất ngần ấy.
  //   0 – 0,55: ống trượt thò ra · 0,45 – 0,9: kích hạ đế xuống đất · 0,8 – 1: vành giằng trồi lên.
  let dep = 0;
  return vehicleRig(
    "skyguard",
    p,
    { body, wheels: tr.wheels, turret, gun, barrels, muzzles, flashes: [], spinners: [radar], aimPitch: 0.6, recoil: 0.05, missiles: true },
    3.4,
    [{ id: "deploy", label: "Cố định (bệ lục giác)" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const ext = smooth(0, 0.55, dep);
      const drop = smooth(0.45, 0.9, dep);
      const padY = PAD_STOW_Y + (PAD_GROUND_Y - PAD_STOW_Y) * drop;
      for (const l of legs) {
        l.slide.position.z = l.rIn + (PAD_R - l.rIn) * ext;
        l.pad.position.y = padY - ARM_Y;
        l.jack.scale.y = Math.max(0.01, ARM_Y - padY);
        l.jack.visible = drop > 0.01; // thu gọn hẳn thì ẩn: đỡ một lệnh vẽ mỗi chân lúc xe chạy
      }
      const k = smooth(0.8, 1, dep);
      ring.visible = k > 0.01;
      ring.scale.y = Math.max(0.01, k);
    }
  );
}
