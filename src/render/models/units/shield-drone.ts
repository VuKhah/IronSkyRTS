/**
 * Drone Khiên/Khói, bản 1 (09/11/2026): chưa có luật chơi, chỉ xem trong Xưởng Mô Hình.
 * Người dùng chốt: thiết kế BENZEN. Nhìn từ trên là ký hiệu Kekulé: khung lục giác, 3 vạch màu phe xen kẽ 3 cạnh, vòng tròn sáng ở giữa;
 * 6 cánh quạt ở 6 đỉnh. Vai trò (`ARMY_DESIGN.md` #23): tạo vùng khiên hoặc vùng khói; chọn loại lúc đúc nên ở đây có 2 nút xem thử.
 * Sải khoảng 6 m, bán kính vùng 7 m là số tạm. Bộ phận động: 6 cánh quạt, vùng khiên, khói.
 */
import * as THREE from "three";
import { approach, box, cyl, group, part, sphere, type Palette, type Rig } from "../kit";
import { strut, type P3 } from "../buildings/shared";
import { droneRig, motor, rotor, type Rotor } from "./drone-parts";

const R = 2.3;
const INNER = 1.78;
const ROTOR_R = 0.72;
const FIELD_R = 7;
const PUFFS = 18;

/** Đỉnh thứ i của lục giác bán kính r ở độ cao y, đỉnh 0 chĩa về mũi (+z). */
const hex = (i: number, r: number, y = 0): P3 => [r * Math.sin((i * Math.PI) / 3), y, r * Math.cos((i * Math.PI) / 3)];
const mix = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function buildShieldDrone(p: Palette): Rig {
  const frame = part("Thân drone", group());
  const add = (...o: THREE.Object3D[]) => frame.add(...o);
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;

  // ================================================================ 1. VÒNG BENZEN
  const rotors: Rotor[] = [];
  for (let i = 0; i < 6; i++) {
    const v = hex(i, R);
    add(part("Khung lục giác", strut(v, hex(i + 1, R), 0.13, p.hull)));
    add(part("Thanh nan", strut(hex(i, 0.62), hex(i, R - 0.1), 0.06, p.hullDark)));
    const m = motor(p, 0.17, 0.3);
    m.position.set(v[0], 0.13, v[2]);
    add(m);
    add(part("Nắp khớp (màu phe)", cyl(0.2, 0.2, 0.05, p.team, 10, v[0], 0.03, v[2])));
    const r = rotor(p, ROTOR_R);
    r.g.position.set(v[0], 0.34, v[2]);
    add(r.g);
    rotors.push(r);
  }
  // 3 vạch màu phe song song 3 cạnh xen kẽ (3 liên kết đôi của ký hiệu Kekulé)
  for (const i of [0, 2, 4]) add(part("Liên kết đôi (màu phe)", strut(mix(hex(i, INNER, 0.08), hex(i + 1, INNER, 0.08), 0.14), mix(hex(i, INNER, 0.08), hex(i + 1, INNER, 0.08), 0.86), 0.09, p.team)));
  const ring = part("Vòng tròn năng lượng", new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.09, 10, 36), glow));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  add(ring);

  // ================================================================ 2. LÕI PHÁT VÀ VÒI PHUN
  add(part("Lõi phát", cyl(0.62, 0.72, 0.36, p.hull, 16, 0, 0.02, 0)));
  const dome = part("Vòm phát", sphere(0.5, glow, 0, 0.22, 0, 14));
  dome.scale.y = 0.65;
  add(dome);
  add(part("Khối pin", box(0.9, 0.32, 0.9, p.hullDark, 0, -0.32, 0)));
  for (let i = 0; i < 6; i++) {
    const [x, , z] = hex(i + 0.5, 0.85);
    add(part("Vòi phun khói", cyl(0.07, 0.11, 0.24, p.metal, 8, x, -0.2, z)));
  }
  // 3 chân đáp dưới 3 đỉnh xen kẽ
  for (const i of [1, 3, 5]) {
    const [x, , z] = hex(i, R);
    add(part("Chân đáp", strut([x, -0.05, z], [x * 0.95, -0.72, z * 0.95], 0.04, p.metal)));
    add(part("Đế chân đáp", cyl(0.14, 0.16, 0.05, p.hullDark, 8, x * 0.95, -0.74, z * 0.95)));
  }

  // ================================================================ 3. VÙNG KHIÊN (vòm lục giác) VÀ VÙNG KHÓI, bám mặt đất
  const color = (glow.emissive as THREE.Color).getHex() || (glow.color as THREE.Color).getHex();
  const domeGeo = new THREE.SphereGeometry(FIELD_R, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const fieldMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
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
    parkY: 0.78,
    flyY: 4.2,
    radius: 5.5,
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
      fieldMat.opacity = 0.16 + Math.sin(t * 3) * 0.04;
      glow.emissiveIntensity = shield || fog ? 2.2 + Math.sin(t * 5) * 0.6 : 0.8;
      ring.rotation.z = t * (shield || fog ? 1.6 : 0.4);
      smoke.visible = fog;
      if (fog)
        for (const s of puffs) {
          const k = (t * 0.22 + (s.userData.phase as number)) % 1;
          const a0 = s.userData.angle as number;
          // tâm cụm + bán kính cụm không vượt ranh giới vùng, để khói cùng cỡ với vòm khiên
          const size = 0.8 + k * 1.4;
          const r = 1.5 + k * (FIELD_R - 1.5 - 2.2);
          s.position.set(Math.sin(a0) * r, 0.7 + (1 - k) * 2.6, Math.cos(a0) * r);
          s.scale.setScalar(size);
        }
    }
  });
}
