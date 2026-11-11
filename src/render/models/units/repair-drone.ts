/**
 * Drone Sửa Chữa, bản 1 (11/11/2026). Vai trò (`ARMY_DESIGN.md` #18): bay theo mũi thọc sâu, hàn sửa xe tại trận.
 * Nhìn từ trên: khung chữ Y 3 cánh quạt (khác Drone Trinh Sát chữ X 4 cánh, Drone Khiên vòng lục giác 6 cánh), nóc màu phe.
 * Dưới bụng: cánh tay robot 2 khớp với mỏ hàn, hộp đồ nghề, vạch vàng cảnh báo. Không cất / hạ cánh nên không có càng đáp.
 * Bộ phận động: 3 cánh quạt, cánh tay (vươn ra và rung nhẹ khi hàn), đầu mỏ hàn chớp sáng khi hàn.
 * Không dùng hình chữ thập đỏ (biểu tượng được luật quốc tế bảo hộ).
 */
import * as THREE from "three";
import { approach, box, cyl, group, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { strut, type P3 } from "../buildings/shared";
import { droneRig, motor, rotor, type Rotor } from "./drone-parts";

const ARM = 0.95;
const ROTOR_R = 0.46;
const ROTOR_Y = 0.32;

export function buildRepairDrone(p: Palette): Rig {
  const frame = part("Thân drone", group());
  const add = (...o: THREE.Object3D[]) => frame.add(...o);

  // ================================================================ 1. THÂN: khối tròn dẹt + hộp đồ nghề phía sau
  add(part("Thân", cyl(0.34, 0.4, 0.3, p.hull, 12, 0, 0.04, 0)));
  add(part("Nóc (màu phe)", cyl(0.3, 0.32, 0.04, p.team, 12, 0, 0.21, 0)));
  add(part("Vòng cảnh báo", cyl(0.405, 0.405, 0.06, p.warning, 12, 0, -0.06, 0)));
  add(part("Hộp đồ nghề", box(0.36, 0.2, 0.26, p.hullDark, 0, 0.0, -0.42)));
  add(part("Nắp hộp (vạch vàng)", box(0.37, 0.03, 0.12, p.warning, 0, 0.115, -0.42)));
  add(part("Ăng-ten", cyl(0.012, 0.018, 0.4, p.metal, 4, 0.12, 0.42, -0.1)));

  // ================================================================ 2. KHUNG CHỮ Y + 3 CÁNH QUẠT (một tay đòn ra sau, hai tay chéo ra trước)
  const rotors: Rotor[] = [];
  for (const deg of [0, 120, 240]) {
    const a = (deg * Math.PI) / 180;
    const end: P3 = [Math.sin(a) * ARM, 0.12, -Math.cos(a) * ARM];
    add(part("Tay đòn", strut([Math.sin(a) * 0.3, 0.08, -Math.cos(a) * 0.3], end, 0.055, p.hullDark)));
    add(part("Vạch tay đòn (màu phe)", strut([Math.sin(a) * 0.5, 0.14, -Math.cos(a) * 0.5], [Math.sin(a) * 0.72, 0.15, -Math.cos(a) * 0.72], 0.03, p.team)));
    const m = motor(p, 0.1, 0.22);
    m.position.set(end[0], 0.18, end[2]);
    add(m);
    const r = rotor(p, ROTOR_R);
    r.g.position.set(end[0], ROTOR_Y, end[2]);
    add(r.g);
    rotors.push(r);
  }

  // ================================================================ 3. CÁNH TAY ROBOT + MỎ HÀN (dưới bụng, chĩa ra trước)
  const shoulder = part("Cánh tay hàn", group());
  shoulder.position.set(0, -0.14, 0.12);
  add(shoulder);
  shoulder.add(part("Khớp vai", sphere(0.09, p.metal, 0, 0, 0, 10)));
  shoulder.add(part("Tay trên", strut([0, 0, 0], [0, -0.26, 0.24], 0.045, p.hullDark)));
  const elbow = part("Khuỷu tay", group());
  elbow.position.set(0, -0.26, 0.24);
  shoulder.add(elbow);
  elbow.add(part("Khớp khuỷu", sphere(0.065, p.metal, 0, 0, 0, 10)));
  elbow.add(part("Tay dưới", strut([0, 0, 0], [0, -0.06, 0.3], 0.035, p.hullDark)));
  const torch = (p.warning as THREE.MeshStandardMaterial).clone();
  torch.color = new THREE.Color(0xffd27a);
  torch.emissive = new THREE.Color(0xffb347);
  torch.emissiveIntensity = 0.2;
  const nozzle = part("Mỏ hàn", tubeZ(0.03, 0.05, 0.14, p.metal, 8));
  nozzle.position.set(0, -0.06, 0.36);
  elbow.add(nozzle);
  const tip = part("Đầu mỏ hàn", sphere(0.045, torch, 0, -0.06, 0.45, 8));
  elbow.add(tip);

  let work = 0;
  return droneRig({
    frame,
    rotors,
    flyY: 3,
    radius: 2.4,
    actions: [{ id: "repair", label: "Hàn sửa" }],
    extra: (dt, t, a) => {
      const on = a.has("repair");
      work = approach(work, on ? 1 : 0, 3, dt);
      // vươn tay xuống trước khi hàn, rung nhẹ theo nhịp hàn
      shoulder.rotation.x = work * 0.35;
      elbow.rotation.x = work * (0.3 + Math.sin(t * 9) * 0.06);
      torch.emissiveIntensity = on ? (Math.sin(t * 31) > -0.2 ? 3 : 0.6) : 0.2;
    }
  });
}
