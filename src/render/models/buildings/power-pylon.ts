import * as THREE from "three";
import { box, cyl, group, sphere, type Palette, type Rig } from "../kit";
import { WORK, POWER, rig, groundRing } from "./shared";

export function buildPowerPylon(p: Palette): Rig {
  const root = group(box(1.8, 0.2, 1.8, p.concrete, 0, 0.1, 0));
  const H = 5;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = box(0.1, H, 0.1, p.metal, x * 0.42, H / 2, z * 0.42);
    leg.rotation.z = x * 0.12;
    leg.rotation.x = -z * 0.12;
    root.add(leg);
  }
  for (let i = 1; i <= 4; i++) {
    const y = (i / 5) * H;
    const s = 0.8 * (1 - (i / 5) * 0.55);
    root.add(box(s * 2 + 0.1, 0.06, 0.06, p.metal, 0, y, s), box(s * 2 + 0.1, 0.06, 0.06, p.metal, 0, y, -s), box(0.06, 0.06, s * 2 + 0.1, p.metal, s, y, 0), box(0.06, 0.06, s * 2 + 0.1, p.metal, -s, y, 0));
  }
  root.add(box(3.0, 0.14, 0.14, p.metal, 0, H - 0.3, 0), box(2.0, 0.12, 0.12, p.metal, 0, H - 1.1, 0), box(0.5, 0.25, 0.5, p.team, 0, H + 0.05, 0));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const cables: THREE.Mesh[] = [];
  for (const [x, y] of [[-1.4, H - 0.3], [1.4, H - 0.3], [-0.9, H - 1.1], [0.9, H - 1.1]] as const) {
    root.add(cyl(0.07, 0.07, 0.45, p.white, 6, x, y - 0.3, 0), sphere(0.08, glow, x, y - 0.55, 0, 6));
    // dây cáp võng xuống hai phía (đường cong Catmull-Rom → ống)
    for (const dir of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, y - 0.55, 0),
        new THREE.Vector3(x, y - 1.2, dir * 1.6),
        new THREE.Vector3(x, y - 1.35, dir * 3.2)
      ]);
      const c = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.025, 4), p.rubber);
      cables.push(c);
      root.add(c);
    }
  }
  const ring = groundRing(p, 5.5, "power");
  root.add(ring.mesh);
  return rig(root, [WORK, POWER], 3.8, [(_dt, t, a) => (glow.emissiveIntensity = a.has("work") ? 1 + Math.abs(Math.sin(t * 4)) * 1.6 : 0.3), ring.update]);
}
