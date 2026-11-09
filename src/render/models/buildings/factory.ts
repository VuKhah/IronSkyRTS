import * as THREE from "three";
import { approach, box, cyl, group, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, blinker } from "./shared";

/** Xưởng Xe Tăng: nhà xưởng mái răng cưa, cửa cuốn mở khi đang đúc xe, ống khói và cầu trục. */
export function buildFactory(p: Palette): Rig {
  const root = group(foundation(p, 7, 6.2));
  root.add(box(5.4, 2.6, 4.4, p.hull, -0.2, 1.55, -0.5), box(5.44, 0.18, 4.44, p.team, -0.2, 2.15, -0.5));
  // mái răng cưa: 3 tấm nghiêng có dải kính lấy sáng
  for (let i = 0; i < 3; i++) {
    const x = -1.95 + i * 1.75;
    const roof = box(1.75, 0.12, 4.4, p.hullDark, x, 3.2, -0.5);
    roof.rotation.z = 0.42;
    const glass = box(0.08, 0.7, 4.3, p.glass, x + 0.82, 3.2, -0.5);
    root.add(roof, glass);
  }
  // khung cửa và cửa cuốn
  root.add(box(3.2, 0.3, 0.3, p.warning, -0.2, 2.65, 1.75), box(0.3, 2.4, 0.3, p.hullDark, -1.75, 1.45, 1.75), box(0.3, 2.4, 0.3, p.hullDark, 1.35, 1.45, 1.75));
  const door = box(2.9, 2.2, 0.12, p.teamDark, -0.2, 1.35, 1.8);
  root.add(door);
  // dốc ra xe có sọc cảnh báo
  const ramp = box(3, 0.1, 1.2, p.concreteDark, -0.2, 0.3, 2.5);
  ramp.rotation.x = 0.08;
  root.add(ramp);
  for (let i = 0; i < 4; i++) root.add(box(0.28, 0.03, 1.1, p.warning, -1.25 + i * 0.7, 0.37, 2.5));
  // ống khói + khói
  root.add(cyl(0.32, 0.38, 2.6, p.hullDark, 10, 2.55, 2.85, -2.0), cyl(0.36, 0.36, 0.18, p.team, 10, 2.55, 4.05, -2.0));
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = sphere(0.35, p.smoke, 2.55, 4.3, -2.0, 7);
    s.castShadow = false;
    s.userData.phase = i / 4;
    puffs.push(s);
    root.add(s);
  }
  // cầu trục trên nóc
  const crane = group(box(0.14, 0.14, 4.6, p.warning, 0, 0, 0), box(0.4, 0.3, 0.4, p.hullDark, 0, -0.2, 0));
  crane.position.set(-0.2, 3.75, -0.5);
  root.add(box(0.15, 0.9, 0.15, p.metal, -2.6, 3.3, -2.6), box(0.15, 0.9, 0.15, p.metal, 2.2, 3.3, -2.6), box(4.9, 0.14, 0.14, p.metal, -0.2, 3.75, -2.6));
  root.add(crane);
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(sphere(0.12, lamp, -1.9, 2.95, 1.85, 6), sphere(0.12, lamp, 1.5, 2.95, 1.85, 6));
  let doorT = 0;
  return rig(root, [WORK], 4.4, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = 1.35 + doorT * 1.9;
      door.scale.y = 1 - doorT * 0.85;
      crane.position.x = -0.2 + (on ? Math.sin(t * 0.8) * 2 : 0);
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.35 + (s.userData.phase as number)) % 1;
        s.position.set(2.55 + k * 0.5, 4.3 + k * 2.2, -2.0 + k * 0.2);
        s.scale.setScalar(0.5 + k * 1.4);
      }
    },
    blinker(lamp, 4)
  ]);
}
