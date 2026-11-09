import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, FireClock, group, sphere, type Palette, type Rig } from "../kit";
import { WORK, FIRE, rig } from "./shared";

export function buildEMP(p: Palette): Rig {
  const root = group(cyl(1.7, 1.9, 0.3, p.concrete, 8, 0, 0.15, 0), cyl(1.1, 1.3, 0.8, p.hullDark, 8, 0, 0.7, 0));
  root.add(cyl(0.3, 0.45, 4.2, p.hull, 10, 0, 3.1, 0), box(0.5, 0.5, 0.5, p.team, 0, 1.3, 0.38));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const top = sphere(0.55, glow, 0, 5.5, 0, 14);
  root.add(top);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.9 - i * 0.15, 0.07, 6, 24), glow);
    r.rotation.x = Math.PI / 2;
    r.userData.base = 2.2 + i * 1.0;
    rings.push(r);
    root.add(r);
  }
  const pulseMat = new THREE.MeshBasicMaterial({ color: (glow.color as THREE.Color).getHex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), pulseMat);
  pulse.position.y = 5.5;
  root.add(pulse);
  const clock = new FireClock(BUILDINGS["aa-emp"].weapon!.cooldown);
  return rig(root, [WORK, FIRE], 3.6, [
    (dt, t, a) => {
      const on = a.has("work") || a.has("fire");
      rings.forEach((r, i) => {
        r.position.y = (r.userData.base as number) + (on ? Math.sin(t * 2 + i * 1.2) * 0.25 : 0);
        if (on) r.rotation.z += dt * (1 + i * 0.6);
      });
      glow.emissiveIntensity = on ? 1.3 + Math.sin(t * 5) * 0.5 : 0.3;
      clock.tick(dt, a.has("fire"));
      const k = clock.since / 0.6;
      pulse.visible = k < 1;
      if (pulse.visible) {
        pulse.scale.setScalar(0.6 + k * 3.2);
        pulseMat.opacity = 0.45 * (1 - k);
      }
    }
  ]);
}
