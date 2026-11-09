/**
 * Mô hình Xe Phòng Không Cơ Động SkyGuard (`skyguard`), bản 1 (06/11/2026).
 * Người dùng chốt: GIỮ radar và hộp tên lửa (đúng ý); làm lại phần xe cho KIÊN CỐ khi cố định vị trí bắn.
 * Không dùng chân nhện. Lấy ý cơ chế "khi cố định tạo bệ hình gần giống vòng benzen" (người dùng thích),
 * hình khối là của Iron Sky.
 *
 * Ý đồ (bản 2 phần thân: người dùng muốn thân bên trong cũng là benzen):
 * - THÂN LỤC GIÁC đều nhìn từ trên (dải giáp đứng + mặt vát), đồng tâm với vành chân chống; 6 góc thân trùng 6 hướng chân.
 *   Cabin kính trên 2 mặt vát trước, lưới tản nhiệt máy phát trên 2 mặt vát sau (radar cần điện), giáp sườn mọi mặt.
 * - Sàn trên: bệ xoay lục giác + 3 vạch màu phe song song 3 cạnh xen kẽ (vòng benzen kiểu Kekulé) + mâm tròn ở giữa.
 * - CỐ ĐỊNH (Lockdown, sim: đứng yên `deploy.time` = 1,2 giây): 6 chân chống thò ra theo 6 hướng cách đều 60°,
 *   kích thủy lực hạ đế lục giác xuống đất, rồi vành giằng nối 6 chân thành hình lục giác trên mặt đất.
 *   Vành lục giác + mâm tròn ở giữa = vòng benzen. Hoạt ảnh dài đúng 1,2 giây để khớp luật.
 *
 * Bộ phận động: mâm xoay + radar quay, giá phóng ngóc, 4 chân chống chéo (ống trượt, kích, đế), vành giằng, xích.
 */
import * as THREE from "three";
import { box, cyl, facets, group, part, surfaceTools, tubeZ, type Palette, type Rig } from "../kit";
import { vehicleRig, tracks } from "./ground";

/** Thời gian hạ bệ, khớp `UNITS.skyguard.weapon.deploy.time` (sim tính Lockdown sau ngần ấy giây đứng yên). */
const DEPLOY_TIME = 1.2;
/** Thân lục giác đều nhìn từ trên, đỉnh chĩa trước / sau / 4 hướng chéo (trùng 6 hướng chân chống). */
const HEX_R = 1.85; // bán kính đỉnh dải giáp đứng
const DECK_R = 1.45; // bán kính đỉnh mặt sàn trên (sau mặt vát)
const BAND_Y0 = 0.8;
/** Váy giáp: tầng dưới vát vào trong, phủ xích xuống gần mặt đất. */
const SKIRT_R = 1.68;
const SKIRT_Y = 0.34;
const BAND_Y1 = 1.08;
const DECK_Y = 1.32;
/** Bán kính đặt 6 đế chân khi cố định (đỉnh của vành lục giác). */
const PAD_R = 2.75;
/** Độ cao trục chân chống (giữa dải giáp đứng). */
const ARM_Y = 0.95;
const PAD_STOW_Y = 0.84;
const PAD_GROUND_Y = 0.05;

type P2 = [number, number];
type P3 = [number, number, number];
/** Đỉnh thứ i của lục giác bán kính r, dạng [x, z]: 0 = mũi, 1 = trước phải, 2 = sau phải, 3 = đuôi… */
const hexV = (i: number, r: number): P2 => [r * Math.sin((i * Math.PI) / 3), r * Math.cos((i * Math.PI) / 3)];
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildSkyguard(p: Palette): Rig {
  const body = group();
  const add = (...o: THREE.Object3D[]) => body.add(...o);

  // ================================================================ 1. XÍCH + THÂN LỤC GIÁC
  // Xích ngắn nằm gọn dưới váy giáp lục giác, chỉ lộ nửa dưới bánh; bỏ tấm che xích màu phe (đã bị váy che)
  const tr = tracks(p, 0.95, 2.3, 0.3, 4);
  tr.g.children.filter((c) => (c as THREE.Mesh).material === p.teamDark).forEach((c) => tr.g.remove(c));
  add(tr.g);
  const hullPts: P3[] = [];
  for (let i = 0; i < 6; i++) {
    const [bx, bz] = hexV(i, HEX_R);
    const [dx, dz] = hexV(i, DECK_R);
    const [kx, kz] = hexV(i, SKIRT_R);
    hullPts.push([kx, SKIRT_Y, kz], [bx, BAND_Y0, bz], [bx, BAND_Y1, bz], [dx, DECK_Y, dz]);
  }
  const hull = part("Thân lục giác", facets(hullPts, p.hull));
  add(hull);
  const { line } = surfaceTools(body, [hull]);

  /** Điểm trên mặt vát thứ i (giữa đỉnh i và i+1): t dọc cạnh 0..1, s từ mép ngoài (0) vào mép sàn (1). */
  const slopePt = (i: number, t: number, s: number): P2 =>
    lerp2(lerp2(hexV(i, HEX_R), hexV(i + 1, HEX_R), t), lerp2(hexV(i, DECK_R), hexV(i + 1, DECK_R), t), s);
  /** Tấm dán lên dải giáp đứng thứ i (mặt phẳng đứng, tính thẳng không cần tia dò): t dọc cạnh, y cao độ. */
  const bandPanel = (name: string, i: number, t0: number, t1: number, y0: number, y1: number, mat: THREE.Material, out = 0.03) => {
    const a = hexV(i, HEX_R);
    const b = hexV(i + 1, HEX_R);
    const mid = lerp2(a, b, 0.5);
    const len = Math.sqrt(mid[0] ** 2 + mid[1] ** 2);
    const n: P2 = [mid[0] / len, mid[1] / len];
    const pts: P3[] = [];
    for (const t of [t0, t1])
      for (const y of [y0, y1])
        for (const o of [-0.01, out]) {
          const q = lerp2(a, b, t);
          pts.push([q[0] + n[0] * o, y, q[1] + n[1] * o]);
        }
    return part(name, facets(pts, mat));
  };

  // Giáp sườn tối trên mọi mặt đứng; sọc màu phe chạy quanh mép trên
  for (let i = 0; i < 6; i++) {
    const front = i === 0 || i === 5;
    add(bandPanel("Giáp sườn", i, front ? 0.42 : 0.16, 0.84, 0.85, 1.02, p.hullDark, 0.04));
    add(bandPanel("Sọc màu phe", i, 0.1, 0.9, 1.035, 1.075, p.team, 0.02));
  }
  // Lưới tản nhiệt máy phát (radar ăn điện) trên 2 mặt vát phía sau + 2 ống xả ở đuôi
  for (const i of [2, 3])
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) add(line("Lưới tản nhiệt", [slopePt(i, t, 0.12), slopePt(i, t, 0.85)], p.hullDark, { w: 0.06 }));
  for (const sx of [-1, 1]) add(part("Ống xả", cyl(0.06, 0.06, 0.45, p.metal, 6, sx * 0.45, DECK_Y + 0.12, -1.42)));
  // Ăng-ten roi ở 2 góc sau
  for (const i of [2, 4]) {
    const [x, z] = hexV(i, DECK_R - 0.12);
    add(part("Ăng-ten roi", group(cyl(0.05, 0.06, 0.08, p.metal, 6, x, DECK_Y + 0.04, z), cyl(0.012, 0.012, 1.3, p.metal, 4, x, DECK_Y + 0.68, z))));
  }

  // ================================================================ CABIN LÁI: cho biết đâu là đầu xe
  // Khối vát nhô ra ở góc trước (cao hơn sàn, mũi vượt khỏi thân), kính chắn gió vát, kính hông, mũi có đèn,
  // cản trước + móc kéo, dải màu phe ngang mũi; trên nóc: kính ngắm quang điện tử, đèn rọi; hai bên: ống phóng khói.
  const cab = part(
    "Cabin lái",
    facets([[0.48, 0.82, 2.34], [0.62, 1.14, 2.2], [0.56, 1.58, 1.66], [0.6, 1.58, 0.96], [0.7, 0.82, 0.96], [0.7, 0.82, 2.06]], p.hull, true)
  );
  add(cab);
  const cabTools = surfaceTools(body, [cab]);
  add(cabTools.skin("Kính chắn gió", [[-0.46, 1.2], [0.46, 1.2], [0.42, 1.5], [-0.42, 1.5]], p.glass, { face: "front", lift: 0.02 }));
  add(cabTools.line("Khung kính", [[0, 1.18], [0, 1.53]], p.metal, { face: "front", w: 0.07 }));
  for (const sx of [1, -1]) {
    const m = sx < 0;
    add(cabTools.skin("Kính hông cabin", [[2.0, 1.2], [1.25, 1.2], [1.25, 1.45], [1.75, 1.45]], p.glass, { face: "right", mirror: m, lift: 0.015 }));
    add(cabTools.skin("Đèn pha", [[0.26, 0.9], [0.44, 0.9], [0.44, 1.0], [0.26, 1.0]], p.glass, { face: "front", mirror: m, lift: 0.025 }));
    // ống phóng khói: 3 ống chếch lên phía trước ở hai bên cabin
    for (let k = 0; k < 3; k++) {
      const t = part("Ống phóng khói", tubeZ(0.05, 0.05, 0.22, p.metal, 6));
      t.position.set(sx * 0.74, 1.3 + k * 0.09, 1.55 - k * 0.05);
      t.rotation.set(-0.5, sx * 0.45, 0);
      add(t);
    }
  }
  // Hai khối giáp mũi kẹp hai bên mũi cabin (thay thanh cản mảnh): đầu xe đồ sộ, kiên cố; lưới tản nhiệt ở mặt trước,
  // nắp màu phe, móc kéo. Học ý "hai khối giáp chìa ra trước" từ bản vẽ tham chiếu người dùng thích.
  for (const sx of [1, -1]) {
    const blk: P3[] = [
      [0.42, 0.36, 1.55], [1.02, 0.36, 1.55], [0.42, 0.86, 1.55], [1.02, 0.86, 1.55],
      [0.44, 0.4, 2.42], [1.0, 0.4, 2.42], [0.44, 0.78, 2.3], [1.0, 0.78, 2.3]
    ];
    add(part("Khối giáp mũi", facets(blk.map(([x, y, z]): P3 => [sx * x, y, z]), p.hull)));
    const lid = part("Nắp khối mũi (màu phe)", box(0.5, 0.03, 0.66, p.team, sx * 0.72, 0.835, 1.93));
    lid.rotation.x = 0.106;
    add(lid);
    for (const y of [0.5, 0.58, 0.66]) add(part("Lưới khối mũi", box(0.46, 0.035, 0.03, p.hullDark, sx * 0.72, y, 2.42 - (y - 0.4) * 0.316 + 0.02)));
    add(part("Móc kéo", box(0.1, 0.12, 0.14, p.warning, sx * 0.72, 0.42, 2.46)));
    add(cabTools.line("Mép nóc cabin (trắng)", [[sx * 0.5, 1.0], [sx * 0.5, 1.62]], p.white, { w: 0.06 }));
  }
  add(cabTools.skin("Dải mũi (màu phe)", [[-0.5, 1.07], [0.5, 1.07], [0.5, 1.13], [-0.5, 1.13]], p.team, { face: "front", lift: 0.02 }));
  add(cabTools.skin("Nóc cabin (màu phe)", [[-0.4, 1.35], [0.4, 1.35], [0.4, 1.05], [-0.4, 1.05]], p.team));
  add(part("Kính ngắm quang điện tử", group(box(0.26, 0.22, 0.26, p.hullDark, 0.3, 1.71, 1.2), box(0.2, 0.13, 0.02, p.glass, 0.3, 1.72, 1.335), cyl(0.05, 0.05, 0.1, p.metal, 6, 0.3, 1.6, 1.2))));
  add(part("Đèn rọi", group(cyl(0.1, 0.1, 0.16, p.metal, 10, -0.32, 1.66, 1.25), box(0.16, 0.14, 0.02, p.glass, -0.32, 1.73, 1.34))));

  // ================================================================ THIẾT BỊ: tên lửa dự trữ dọc sườn, máy phát phụ sau đuôi
  for (const sx of [1, -1]) {
    // sườn (mặt vát số 1 / 4) trống từ khi chỉ còn 4 chân chéo: 2 ống tên lửa dự trữ nằm dọc, đai giữ màu phe
    for (const k of [0, 1]) {
      const x = sx * (1.5 - k * 0.24);
      const y = 1.17 + k * 0.12;
      const c = part("Ống tên lửa dự trữ", tubeZ(0.11, 0.11, 1.15, p.hullDark, 10));
      c.position.set(x, y, 0);
      add(c);
      for (const z of [-0.38, 0.38]) add(part("Đai giữ (màu phe)", cyl(0.125, 0.125, 0.06, p.team, 10, x, y, z).rotateX(Math.PI / 2)));
    }
  }
  const aux = part("Máy phát phụ", group(box(1.0, 0.46, 0.42, p.hullDark, 0, 0, 0), box(0.8, 0.06, 0.3, p.metal, 0, 0.26, 0), box(0.5, 0.12, 0.02, p.team, 0, 0.05, -0.22)));
  aux.position.set(0, 1.0, -2.02);
  add(aux);

  // Sàn trên: bệ xoay lục giác + 3 vạch màu phe song song 3 cạnh xen kẽ (3 liên kết đôi của vòng benzen kiểu Kekulé)
  // + mâm tròn của tháp ở giữa: nhìn từ trên là ký hiệu vòng benzen.
  const TURRET_Z = 0;
  add(part("Bệ xoay lục giác", cyl(0.9, 0.95, 0.1, p.hullDark, 6, 0, DECK_Y + 0.05, TURRET_Z)));
  for (const i of [1, 3, 5]) {
    const a = hexV(i, 1.16);
    const b = hexV(i + 1, 1.16);
    add(line("Vạch benzen (màu phe)", [lerp2(a, b, 0.2), lerp2(a, b, 0.8)], p.team, { w: 0.09 }));
  }

  // ================================================================ 2. CHÂN CHỐNG + VÀNH GIẰNG LỤC GIÁC
  // Mỗi bộ phận động chỉ một màu: không gộp được với phần đứng yên, thêm màu là thêm lệnh vẽ.
  // 4 chân chéo thò ra từ 4 góc thân lục giác (người dùng: 4 thay vì 6 để cabin lái không bị che); thu gọn thì đế nằm sát góc.
  const legs: { slide: THREE.Group; jack: THREE.Mesh; pad: THREE.Group }[] = [];
  const R_IN = HEX_R + 0.38;
  for (const i of [1, 2, 4, 5]) {
    const leg = group();
    leg.position.y = ARM_Y;
    leg.rotation.y = (i * Math.PI) / 3; // trục +z cục bộ chĩa ra góc thứ i
    leg.add(part("Hộp chân chống", box(0.44, 0.34, 0.42, p.hullDark, 0, 0, HEX_R - 0.02)));
    const slide = part("Ống trượt chân chống", group(box(0.24, 0.22, 1.5, p.hullDark, 0, 0, -0.75), box(0.34, 0.3, 0.3, p.hullDark, 0, 0, 0)));
    slide.position.z = R_IN;
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
    legs.push({ slide, jack, pad });
  }
  // Vành giằng: 6 thanh nối 6 đế thành lục giác trên mặt đất; vạch màu phe chỉ ở 3 cạnh xen kẽ (Kekulé), lệch vào trong
  const ring = part("Vành giằng lục giác", group());
  const apo = PAD_R * Math.cos(Math.PI / 6);
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * Math.PI) / 3;
    const bar = box(0.22, 0.09, PAD_R - 0.6, p.hullDark);
    bar.position.set(Math.sin(a) * apo, 0.04, Math.cos(a) * apo);
    bar.rotation.y = a + Math.PI / 2;
    ring.add(bar);
    if (i % 2 === 1) {
      const stripe = box(0.12, 0.05, PAD_R - 1.3, p.team);
      stripe.position.set(Math.sin(a) * (apo - 0.32), 0.03, Math.cos(a) * (apo - 0.32));
      stripe.rotation.y = bar.rotation.y;
      ring.add(stripe);
    }
  }
  // góc trước và góc sau của vành không có chân: khớp góc nằm trên đất
  for (const i of [0, 3]) {
    const [x, z] = hexV(i, PAD_R);
    ring.add(part("Khớp góc vành", cyl(0.3, 0.34, 0.12, p.hullDark, 6, x, 0.06, z)));
  }
  ring.visible = false;
  ring.scale.y = 0.01;
  add(ring);

  // ================================================================ 3. THÁP: mâm tròn (vòng tròn của ký hiệu benzen), bệ phóng, radar
  // Bộ phận động (giá phóng, 2 hộp tên lửa, radar quay) giữ ít màu: không gộp được, mỗi màu một lệnh vẽ.
  const turret = part("Mâm xoay", group(cyl(0.72, 0.78, 0.22, p.hullDark, 16, 0, 0.11, 0)));
  turret.position.set(0, DECK_Y + 0.1, TURRET_Z);
  turret.add(part("Viền mâm (màu phe)", cyl(0.8, 0.8, 0.05, p.team, 16, 0, 0.03, 0)));
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    turret.add(part("Bu lông mâm", box(0.07, 0.04, 0.07, p.metal, Math.sin(a) * 0.64, 0.24, Math.cos(a) * 0.64)));
  }
  // Khối nâng giữa hai hộp phóng + 2 tai đỡ trục
  turret.add(part("Khối nâng", group(box(0.6, 0.42, 0.8, p.hull, 0, 0.42, 0.02), box(0.66, 0.06, 0.84, p.hullDark, 0, 0.62, 0.02))));
  for (const sx of [-1, 1]) turret.add(part("Tai đỡ trục", box(0.14, 0.7, 0.4, p.hullDark, sx * 0.4, 0.57, 0.05)));
  // "Mặt" của tháp: nóc trắng, dải đèn trạng thái màu cam, ô cảm biến tối (học ý từ bản vẽ tham chiếu)
  turret.add(
    part("Nóc khối nâng (trắng)", box(0.5, 0.03, 0.6, p.white, 0, 0.665, 0.02)),
    part("Dải đèn trạng thái", box(0.5, 0.05, 0.02, p.warning, 0, 0.52, 0.43)),
    part("Ô cảm biến", box(0.32, 0.12, 0.02, p.metal, 0, 0.36, 0.43))
  );

  const gun = part("Giá phóng", group());
  gun.position.set(0, 0.86, 0.05);
  // trục nâng xuyên qua hai hộp + radar dẫn bắn nhỏ ngóc lên theo giá phóng
  const axle = part("Trục nâng", tubeZ(0.09, 0.09, 2.3, p.hullDark, 10));
  axle.rotation.y = Math.PI / 2;
  const fc = part("Radar dẫn bắn", group(cyl(0.24, 0.2, 0.08, p.hullDark, 12), cyl(0.15, 0.15, 0.09, p.teamGlow, 12), box(0.12, 0.22, 0.12, p.hullDark, 0, 0, -0.14)));
  fc.rotation.x = Math.PI / 2;
  fc.position.set(0, 0.3, 0.36);
  gun.add(axle, fc);

  const muzzles: THREE.Object3D[] = [];
  const barrels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    // Hộp tên lửa: thân + 3 gân nổi trắng, nóc và khung miệng màu phe, vạch phụt lửa sau đuôi, 6 ống + ống dẫn cáp
    const pod = part(side < 0 ? "Hộp tên lửa trái (6 ống)" : "Hộp tên lửa phải (6 ống)", group(box(0.6, 0.62, 1.5, p.hull)));
    for (const z of [-0.5, 0, 0.5]) pod.add(part("Gân hộp (trắng)", box(0.66, 0.68, 0.07, p.white, 0, 0, z)));
    pod.add(
      part("Nóc hộp (màu phe)", box(0.62, 0.05, 1.52, p.team, 0, 0.33, 0)),
      part("Khung miệng (màu phe)", group(box(0.62, 0.06, 0.04, p.team, 0, 0.29, 0.76), box(0.62, 0.06, 0.04, p.team, 0, -0.29, 0.76), box(0.06, 0.62, 0.04, p.team, 0.29, 0, 0.76), box(0.06, 0.62, 0.04, p.team, -0.29, 0, 0.76))),
      part("Vạch phụt lửa (màu phe)", box(0.5, 0.08, 0.03, p.team, 0, 0.18, -0.76)),
      part("Ống dẫn cáp", box(0.07, 0.07, 1.3, p.metal, -side * 0.3, -0.24, -0.05))
    );
    pod.position.set(side * 0.98, 0, 0.15);
    pod.scale.set(1.24, 1.24, 1.2); // hộp phóng to hơn (người dùng): 0,74 × 0,77 × 1,8 m
    // 6 ống mỗi hộp: 2 cột × 3 hàng
    for (const [dx, dy] of [[-0.13, -0.18], [0.13, -0.18], [-0.13, 0], [0.13, 0], [-0.13, 0.18], [0.13, 0.18]] as const) {
      const hole = part("Ống phóng", cyl(0.075, 0.075, 0.05, p.metal, 10, dx, dy, 0.75));
      hole.rotation.x = Math.PI / 2;
      pod.add(hole);
      const m = group();
      m.position.set(dx, dy, 0.8);
      pod.add(m);
      muzzles.push(m);
    }
    pod.userData.z0 = 0.15;
    barrels.push(pod);
    gun.add(pod);
  }
  turret.add(gun);
  // bắn xen kẽ hộp trái, hộp phải: giá phóng vặn qua lại theo từng quả
  const alternating = muzzles.slice(0, 6).flatMap((m, i) => [m, muzzles[6 + i]!]);

  // Radar dò tìm mảng pha: cột cao trên đế lục giác sau tháp, tấm radar to ngửa ra sau, mặt phát sáng chia ô,
  // khối xử lý phía sau, viền màu phe. Quay tròn liên tục (spinners).
  const MAST_Z = -0.62;
  turret.add(part("Đế cột radar", cyl(0.26, 0.3, 0.14, p.hullDark, 6, 0, 0.29, MAST_Z)), part("Cột radar", cyl(0.08, 0.11, 1.6, p.metal, 8, 0, 1.1, MAST_Z)));
  const radar = part("Radar dò tìm", group());
  radar.position.set(0, 2.0, MAST_Z);
  const tilt = group();
  tilt.rotation.x = -0.28; // ngửa ra sau
  tilt.add(
    part("Khung radar", box(1.44, 0.92, 0.1, p.hullDark)),
    part("Mặt radar mảng pha", box(1.28, 0.78, 0.03, p.teamGlow, 0, 0, 0.06)),
    part("Khối xử lý radar", box(0.62, 0.42, 0.32, p.hullDark, 0, -0.05, -0.2)),
    part("Viền radar (màu phe)", box(1.46, 0.06, 0.13, p.team, 0, 0.47, 0))
  );
  for (const x of [-0.32, 0, 0.32]) tilt.add(part("Ô mảng pha", box(0.03, 0.78, 0.03, p.hullDark, x, 0, 0.08)));
  for (const y of [-0.13, 0.13]) tilt.add(part("Ô mảng pha", box(1.28, 0.03, 0.03, p.hullDark, 0, y, 0.08)));
  for (const sx of [-1, 1]) tilt.add(part("Ăng-ten nhận dạng", box(0.06, 0.24, 0.06, p.hullDark, sx * 0.62, 0.58, 0)));
  radar.add(tilt);
  turret.add(radar);
  add(turret);

  // ================================================================ 4. HOẠT ẢNH CỐ ĐỊNH
  // t chạy tuyến tính 0 → 1 trong DEPLOY_TIME giây (khớp luật), thu về cũng mất ngần ấy.
  //   0 – 0,55: ống trượt thò ra · 0,45 – 0,9: kích hạ đế xuống đất · 0,8 – 1: vành giằng trồi lên.
  let dep = 0;
  return vehicleRig(
    "skyguard",
    p,
    { body, wheels: tr.wheels, turret, gun, barrels, muzzles: alternating, flashes: [], spinners: [radar], aimPitch: 0.6, recoil: 0, missiles: true, bounce: { hz: 5, damp: 0.42, hullTilt: 0.012, hullSlide: 0.02, hullSink: 0.018, unbraced: 1.7, gunHz: 8, gunClimb: 0.03, gunSlide: 0.1, gunTwist: 0.03 } },
    3.3,
    [{ id: "deploy", label: "Cố định (bệ lục giác)" }],
    (dt, _t, a) => {
      const target = a.has("deploy") ? 1 : 0;
      dep = target > dep ? Math.min(1, dep + dt / DEPLOY_TIME) : Math.max(0, dep - dt / DEPLOY_TIME);
      const ext = smooth(0, 0.55, dep);
      const drop = smooth(0.45, 0.9, dep);
      const padY = PAD_STOW_Y + (PAD_GROUND_Y - PAD_STOW_Y) * drop;
      for (const l of legs) {
        l.slide.position.z = R_IN + (PAD_R - R_IN) * ext;
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
