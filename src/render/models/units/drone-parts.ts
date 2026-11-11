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
  /** Độ cao thân trong Xưởng Mô Hình (m); trong trận dùng độ cao của sim (`setHover`). */
  flyY: number;
  radius: number;
  actions: RigAction[];
  /** Vật thể đứng yên theo mặt đất, không nhún theo thân (vùng khiên, khói). */
  ground?: THREE.Object3D[];
  extra?: (dt: number, t: number, a: ReadonlySet<string>) => void;
}

/**
 * Khung drone: drone không cất / hạ cánh (người dùng chốt 11/11/2026), lúc nào cũng lơ lửng ở độ cao bay, nhún nhẹ, cánh
 * quạt quay đều. Gốc mô hình nằm trên mặt đất (vùng khiên, khói bám đất), thân treo ở độ cao bay.
 */
export function droneRig(d: DroneParts): Rig {
  const root = group(d.frame, ...(d.ground ?? []));
  let flyY = d.flyY;
  d.frame.position.y = flyY;
  for (const r of d.rotors) (r.disc.material as THREE.MeshBasicMaterial).opacity = 0.28;
  return {
    root,
    actions: d.actions,
    defaultOn: [],
    radius: d.radius,
    setHover(h: number) {
      flyY = h;
    },
    update(dt, t, a) {
      for (const r of d.rotors) r.g.rotation.y += 60 * dt;
      d.frame.position.y = approach(d.frame.position.y, flyY + Math.sin(t * 1.6) * 0.12, 2, dt);
      d.extra?.(dt, t, a);
    }
  };
}

/** Động cơ dưới cánh quạt. */
export function motor(p: Palette, r: number, h: number): THREE.Mesh {
  return part("Động cơ", cyl(r, r * 1.15, h, p.metal, 10, 0, 0, 0));
}
