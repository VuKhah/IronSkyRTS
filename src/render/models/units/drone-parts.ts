/** Phần dùng chung của các drone: cánh quạt và khung bay lơ lửng. */
import * as THREE from "three";
import { approach, box, cyl, group, part, type Palette, type Rig, type RigAction } from "../kit";

export interface Rotor {
  g: THREE.Group;
  disc: THREE.Mesh;
}

/** Cánh quạt 2 lá và đĩa mờ (khi quay nhanh mắt chỉ thấy một đĩa). Trục quay là Y. */
export function rotor(p: Palette, r: number): Rotor {
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.01, 20), mat);
  const g = part("Cánh quạt", group(box(r * 2, 0.02, r * 0.16, p.hullDark), box(r * 0.2, 0.06, r * 0.2, p.metal), disc));
  return { g, disc };
}

export interface DroneParts {
  frame: THREE.Group;
  rotors: Rotor[];
  parkY: number;
  flyY: number;
  radius: number;
  actions: RigAction[];
  /** Vật thể đứng yên theo mặt đất, không nhún theo thân (vùng khiên, khói). */
  ground?: THREE.Object3D[];
  extra?: (dt: number, t: number, a: ReadonlySet<string>) => void;
}

const FLY: RigAction = { id: "fly", label: "Bay" };

/** Khung drone: "Bay" nâng thân lên độ cao lơ lửng, nhún nhẹ; cánh quạt tăng tốc dần, tắt máy thì chậm lại rồi dừng. */
export function droneRig(d: DroneParts): Rig {
  const root = group(d.frame, ...(d.ground ?? []));
  d.frame.position.y = d.parkY;
  let spin = 0;
  return {
    root,
    actions: [FLY, ...d.actions],
    defaultOn: ["fly"],
    radius: d.radius,
    update(dt, t, a) {
      const on = a.has("fly");
      spin = approach(spin, on ? 1 : 0, on ? 2.5 : 1.5, dt);
      for (const r of d.rotors) {
        r.g.rotation.y += spin * 60 * dt;
        (r.disc.material as THREE.MeshBasicMaterial).opacity = spin * 0.28;
      }
      const y = on ? d.flyY + Math.sin(t * 1.6) * 0.12 : d.parkY;
      d.frame.position.y = approach(d.frame.position.y, y, 2, dt);
      d.extra?.(dt, t, a);
    }
  };
}

/** Động cơ dưới cánh quạt. */
export function motor(p: Palette, r: number, h: number): THREE.Mesh {
  return part("Động cơ", cyl(r, r * 1.15, h, p.metal, 10, 0, 0, 0));
}
