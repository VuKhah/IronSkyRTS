/**
 * Drone Trinh Sát, bản 1 (09/11/2026): chưa có luật chơi, chỉ xem trong Xưởng Mô Hình.
 * Người dùng chốt: 4 cánh quạt. Vai trò (`ARMY_DESIGN.md` #15): mắt thần tiền duyên, rẻ, có thể lao cảm tử nên mang đầu nổ dưới bụng.
 * Sải khoảng 2,6 m. Nhìn từ trên: chữ X, nóc màu phe. Bộ phận động: 4 cánh quạt, thân chúi khi lao cảm tử.
 */
import * as THREE from "three";
import { approach, box, cyl, facets, group, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { strut, type P3 } from "../buildings/shared";
import { droneRig, motor, rotor, type Rotor } from "./drone-parts";

const ARM = 0.82;
const ROTOR_R = 0.5;
const ROTOR_Y = 0.3;

export function buildScoutDrone(p: Palette): Rig {
  const frame = part("Thân drone", group());
  const add = (...o: THREE.Object3D[]) => frame.add(...o);

  // ================================================================ 1. THÂN
  const hull: P3[] = [[0.26, -0.08, 0.46], [0.26, -0.08, -0.46], [0.3, 0.1, 0.3], [0.3, 0.1, -0.38], [0.18, 0.2, 0.2], [0.18, 0.2, -0.3], [0.12, 0.02, 0.62]];
  add(part("Thân", facets(hull, p.hull, true)));
  add(part("Nóc (màu phe)", box(0.26, 0.02, 0.5, p.team, 0, 0.21, -0.05)));
  add(part("Ăng-ten", cyl(0.012, 0.018, 0.5, p.metal, 4, -0.1, 0.45, -0.25)));

  // ================================================================ 2. 4 CÁNH TAY + CÁNH QUẠT (chữ X)
  const rotors: Rotor[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const end: P3 = [sx * ARM, 0.1, sz * ARM];
      add(part("Tay đòn", strut([sx * 0.18, 0.06, sz * 0.22], end, 0.05, p.hullDark)));
      add(part("Vạch tay đòn (màu phe)", strut([sx * 0.42, 0.12, sz * 0.44], [sx * 0.66, 0.135, sz * 0.66], 0.03, p.team)));
      const m = motor(p, 0.1, 0.22);
      m.position.set(end[0], 0.16, end[2]);
      add(m);
      const r = rotor(p, ROTOR_R);
      r.g.position.set(end[0], ROTOR_Y, end[2]);
      add(r.g);
      rotors.push(r);
      // chân đáp thẳng dưới động cơ
      add(part("Chân đáp", cyl(0.02, 0.025, 0.42, p.metal, 5, end[0], -0.15, end[2])));
    }

  // ================================================================ 3. MẮT VÀ ĐẦU NỔ DƯỚI BỤNG
  add(part("Khớp camera", sphere(0.15, p.hullDark, 0, -0.16, 0.38, 10)));
  const lens = part("Ống kính", tubeZ(0.07, 0.08, 0.08, p.glass, 10));
  lens.position.set(0, -0.16, 0.53);
  add(lens);
  const danger = (p.warning as THREE.MeshStandardMaterial).clone();
  danger.emissive = new THREE.Color(0xff3a1a);
  danger.emissiveIntensity = 0;
  const warhead = part("Đầu nổ cảm tử", tubeZ(0.13, 0.16, 0.56, danger, 12));
  warhead.position.set(0, -0.22, -0.12);
  add(warhead);
  const cap = part("Mũi đầu nổ", cyl(0.02, 0.13, 0.14, danger, 12, 0, 0, 0));
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, -0.22, 0.23);
  add(cap);
  add(part("Đai đầu nổ", tubeZ(0.17, 0.17, 0.05, p.hullDark, 12)).translateY(-0.22).translateZ(-0.12));

  let dive = 0;
  return droneRig({
    frame,
    rotors,
    parkY: 0.37,
    flyY: 2.8,
    radius: 2.6,
    actions: [{ id: "kamikaze", label: "Lao cảm tử" }],
    extra: (dt, t, a) => {
      const on = a.has("kamikaze");
      dive = approach(dive, on ? 1 : 0, 3, dt);
      frame.rotation.x = dive * 0.75; // chúi mũi về phía trước
      danger.emissiveIntensity = on && Math.sin(t * 18) > 0 ? 2.5 : 0;
    }
  });
}
