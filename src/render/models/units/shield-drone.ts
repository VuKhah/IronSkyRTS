/**
 * Drone Khiên/Khói, bản 2 (10/11/2026): chưa có luật chơi, chỉ xem trong Xưởng Mô Hình.
 * Người dùng chốt: thiết kế BENZEN, phải tạo cảm giác chắc chắn, bán kính vùng 12 m.
 * Nhìn từ trên là ký hiệu Kekulé: vành lục giác giáp dày liền khối, 3 tấm màu phe xen kẽ 3 cạnh, vòng tròn sáng quanh lõi giữa.
 * 6 quạt nằm trong vỏ bọc ở 6 đỉnh, lõi và khoang pin bọc giáp, càng đáp to. Vai trò (`ARMY_DESIGN.md` #23): vùng khiên hoặc vùng khói,
 * chọn loại lúc đúc nên ở đây có 2 nút xem thử. Bộ phận động: 6 cánh quạt, vùng khiên, khói.
 */
import * as THREE from "three";
import { approach, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { strut, type P3 } from "../buildings/shared";
import { droneRig, rotor, type Rotor } from "./drone-parts";

/** Bán kính ngoài / trong của vành giáp lục giác (tính tới đỉnh). */
const RO = 2.55;
const RI = 1.72;
const HALF_T = 0.26; // nửa bề dày vành
const POD = 3.15; // tâm vỏ quạt
const ROTOR_R = 0.72;
const FIELD_R = 12;
const PUFFS = 30;
const LEG = 1.15;

/** Đỉnh thứ i của lục giác bán kính r ở độ cao y, đỉnh 0 chĩa về mũi (+z). */
const hex = (i: number, r: number, y = 0): P3 => [r * Math.sin((i * Math.PI) / 3), y, r * Math.cos((i * Math.PI) / 3)];

/** 6 đỉnh lục giác bán kính r ở độ cao y (để ghép khối vát bằng `facets`). */
const hexRing = (r: number, y: number): P3[] => [0, 1, 2, 3, 4, 5].map((i) => hex(i, r, y));

/** Bốn góc tấm hình thang trên cạnh thứ i, từ bán kính r0 tới r1, ở độ cao y; `inset` co hai đầu dọc cạnh. */
const edgeQuad = (i: number, r0: number, r1: number, y: number, inset = 0): P3[] => {
  const pts: P3[] = [];
  for (const r of [r0, r1]) {
    const a = hex(i, r, y);
    const b = hex(i + 1, r, y);
    pts.push([a[0] + (b[0] - a[0]) * inset, y, a[2] + (b[2] - a[2]) * inset], [b[0] + (a[0] - b[0]) * inset, y, b[2] + (a[2] - b[2]) * inset]);
  }
  return pts;
};

/** Điểm tính theo trục toả ra góc a: r dọc trục, u ngang trục. */
const radial = (a: number, r: number, u: number, y: number): P3 => [r * Math.sin(a) + u * Math.cos(a), y, r * Math.cos(a) - u * Math.sin(a)];

export function buildShieldDrone(p: Palette): Rig {
  const frame = part("Thân drone", group());
  const add = (...o: THREE.Object3D[]) => frame.add(...o);
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const ductMat = (p.hullDark as THREE.MeshStandardMaterial).clone();
  ductMat.side = THREE.DoubleSide;

  const rotors: Rotor[] = [];
  for (let i = 0; i < 6; i++) {
    // ================================================================ 1. VÀNH GIÁP LỤC GIÁC (liền khối, mép vát)
    add(part("Vành giáp lục giác", facets([...edgeQuad(i, RI, RO - 0.14, HALF_T), ...edgeQuad(i, RI, RO, HALF_T - 0.1), ...edgeQuad(i, RI, RO, -HALF_T + 0.08), ...edgeQuad(i, RI + 0.1, RO - 0.2, -HALF_T)], p.hull)));
    add(part("Đường ghép giáp", strut(hex(i, RI + 0.02, HALF_T + 0.01), hex(i, RO - 0.16, HALF_T + 0.01), 0.025, p.hullDark)));
    const rivetA = hex(i, (RI + RO) / 2 + 0.28);
    const rivetB = hex(i + 1, (RI + RO) / 2 + 0.28);
    for (const t of [0.22, 0.78]) add(part("Đinh tán", cyl(0.07, 0.08, 0.05, p.metal, 8, rivetA[0] + (rivetB[0] - rivetA[0]) * t, HALF_T + 0.025, rivetA[2] + (rivetB[2] - rivetA[2]) * t)));

    // ================================================================ 2. VỎ QUẠT Ở 6 ĐỈNH
    const a = (i * Math.PI) / 3;
    const pod = hex(i, POD);
    const joint: P3[] = [];
    for (const [r, u] of [[RO - 0.12, 0.36], [RO - 0.12, -0.36], [POD - 0.72, 0.3], [POD - 0.72, -0.3]] as const) joint.push(radial(a, r, u, -0.2), radial(a, r, u, 0.2));
    add(part("Khớp nối vỏ quạt", facets(joint, p.hullDark)));
    const cap = hex(i, RO - 0.1);
    add(part("Nắp khớp (màu phe)", cyl(0.26, 0.3, 0.08, p.team, 8, cap[0], HALF_T + 0.02, cap[2])));
    const duct = part("Vỏ quạt", new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.56, 22, 1, true), ductMat));
    duct.castShadow = true;
    duct.position.set(pod[0], 0.06, pod[2]);
    add(duct);
    const rim = part("Vành vỏ quạt (màu phe)", new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.07, 8, 26), p.team));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(pod[0], 0.34, pod[2]);
    add(rim);
    const lip = part("Vành đáy vỏ quạt", new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.06, 8, 26), p.hull));
    lip.rotation.x = Math.PI / 2;
    lip.position.set(pod[0], -0.22, pod[2]);
    add(lip);
    // giá chữ thập đỡ động cơ trong lòng vỏ quạt
    for (const q of [a, a + Math.PI / 2]) {
      const dx = Math.sin(q) * 0.82;
      const dz = Math.cos(q) * 0.82;
      add(part("Giá động cơ", strut([pod[0] - dx, -0.05, pod[2] - dz], [pod[0] + dx, -0.05, pod[2] + dz], 0.05, p.metal)));
    }
    add(part("Động cơ", cyl(0.2, 0.26, 0.36, p.metal, 12, pod[0], 0, pod[2])));
    const r = rotor(p, ROTOR_R);
    r.g.position.set(pod[0], 0.2, pod[2]);
    add(r.g);
    rotors.push(r);
  }

  // 3 tấm màu phe trên 3 cạnh xen kẽ (3 liên kết đôi của ký hiệu Kekulé)
  for (const i of [0, 2, 4]) add(part("Liên kết đôi (màu phe)", facets([...edgeQuad(i, RI + 0.14, RO - 0.34, HALF_T + 0.01, 0.14), ...edgeQuad(i, RI + 0.14, RO - 0.34, HALF_T + 0.05, 0.14)], p.team)));

  // ================================================================ 3. LÕI GIỮA: vòng tròn sáng, lõi giáp, nan dày nối ra vành
  const HUB = 0.84;
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * Math.PI) / 3;
    const spoke: P3[] = [];
    for (const [r, u] of [[HUB - 0.08, 0.14], [HUB - 0.08, -0.14], [RI * 0.9, 0.2], [RI * 0.9, -0.2]] as const) spoke.push(radial(a, r, u, -0.18), radial(a, r, u, 0.14));
    add(part("Nan giáp", facets(spoke, p.hullDark)));
  }
  const ring = part("Vòng tròn năng lượng", new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.1, 10, 40), glow));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  add(ring);
  add(part("Lõi giáp", facets([...hexRing(HUB, -0.3), ...hexRing(HUB, 0.3), ...hexRing(HUB - 0.2, 0.46)], p.hull)));
  add(part("Đai lõi (màu phe)", cyl(0.68, 0.68, 0.06, p.team, 12, 0, 0.47, 0)));
  const dome = part("Vòm phát", sphere(0.54, glow, 0, 0.5, 0, 14));
  dome.scale.y = 0.6;
  add(dome);

  // ================================================================ 4. BỤNG: khoang pin giáp, vòi phun, càng đáp lớn
  add(part("Khoang pin", facets([...hexRing(1.05, -0.3), ...hexRing(1.05, -0.62), ...hexRing(0.72, -0.86)], p.hullDark)));
  add(part("Tấm đáy", cyl(0.62, 0.7, 0.06, p.metal, 12, 0, -0.89, 0)));
  for (let i = 0; i < 6; i++) {
    const [x, , z] = hex(i + 0.5, 0.92);
    add(part("Vòi phun khói", cyl(0.1, 0.15, 0.3, p.metal, 8, x, -0.72, z)));
  }
  for (const i of [1, 3, 5]) {
    const [x, , z] = hex(i, RI + 0.35);
    const fx = x * 1.14;
    const fz = z * 1.14;
    add(part("Càng đáp", strut([x, -HALF_T, z], [fx, -LEG, fz], 0.11, p.hullDark)));
    add(part("Ty giảm chấn", strut([x * 0.68, -0.3, z * 0.68], [fx, -LEG + 0.3, fz], 0.06, p.metal)));
    add(part("Đế càng đáp", cyl(0.34, 0.4, 0.1, p.hullDark, 8, fx, -LEG, fz)));
  }

  // ================================================================ 5. VÙNG KHIÊN (vòm lục giác) VÀ VÙNG KHÓI, bám mặt đất
  const color = (glow.emissive as THREE.Color).getHex() || (glow.color as THREE.Color).getHex();
  const domeGeo = new THREE.SphereGeometry(FIELD_R, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const fieldMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
  const field = part("Vùng khiên", group(new THREE.Mesh(domeGeo, fieldMat), new THREE.LineSegments(new THREE.EdgesGeometry(domeGeo), lineMat)));
  field.visible = false;
  const puffs: THREE.Mesh[] = [];
  const smoke = part("Vùng khói", group());
  for (let i = 0; i < PUFFS; i++) {
    const s = sphere(1, p.smoke, 0, 0, 0, 7);
    s.castShadow = false;
    s.userData.phase = i / PUFFS;
    s.userData.angle = i * 2.4; // góc vàng: rải đều quanh tâm, không xếp thành tia
    puffs.push(s);
    smoke.add(s);
  }
  smoke.visible = false;

  let grow = 0;
  return droneRig({
    frame,
    rotors,
    parkY: LEG + 0.05,
    flyY: 6,
    radius: 10.5, // đủ thấy trọn vùng khiên đường kính 24 m
    ground: [field, smoke],
    actions: [
      { id: "shield", label: "Bật khiên" },
      { id: "smoke", label: "Bật khói" }
    ],
    extra: (dt, t, a) => {
      const shield = a.has("shield");
      const fog = a.has("smoke") && !shield;
      grow = approach(grow, shield ? 1 : 0, 4, dt);
      field.visible = grow > 0.01;
      field.scale.setScalar(Math.max(0.01, grow));
      fieldMat.opacity = 0.14 + Math.sin(t * 3) * 0.04;
      glow.emissiveIntensity = shield || fog ? 2.2 + Math.sin(t * 5) * 0.6 : 0.8;
      ring.rotation.z = t * (shield || fog ? 1.6 : 0.4);
      smoke.visible = fog;
      if (fog)
        for (const s of puffs) {
          const k = (t * 0.2 + (s.userData.phase as number)) % 1;
          const a0 = s.userData.angle as number;
          // tâm cụm + bán kính cụm không vượt ranh giới vùng, để khói cùng cỡ với vòm khiên
          const size = 1 + k * 2;
          const r = 1.5 + k * (FIELD_R - 1.5 - 3);
          s.position.set(Math.sin(a0) * r, 0.8 + (1 - k) * 3.2, Math.cos(a0) * r);
          s.scale.setScalar(size);
        }
    }
  });
}
