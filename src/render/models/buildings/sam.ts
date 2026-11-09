import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, FireClock, group, muzzleFlash, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, rig, foundation, turretUpdate } from "./shared";

export function buildSAM(p: Palette): Rig {
  const root = group(foundation(p, 3.6, 3.6));
  root.add(cyl(0.6, 0.7, 0.5, p.hullDark, 10, 0, 0.5, 0));
  const turret = group(box(1.6, 0.25, 1.6, p.hull, 0, 0.12, 0));
  turret.position.y = 0.75;
  const gun = group(box(1.45, 0.1, 2.3, p.hullDark, 0, 0.0, 1.1));
  gun.position.set(0, 0.42, -0.6);
  // bản lề phía sau + ty thủy lực phía trước đỡ cụm ống phóng
  turret.add(box(1.0, 0.3, 0.35, p.metal, 0, 0.35, -0.6));
  const piston = cyl(0.07, 0.07, 1, p.metal, 6);
  turret.add(piston);
  const tubes: THREE.Group[] = [];
  for (const [x, y] of [[-0.35, 0.3], [0.35, 0.3], [-0.35, 0.85], [0.35, 0.85]] as const) {
    const c = group(box(0.6, 0.5, 2.2, p.hull, 0, 0, 1.1), box(0.62, 0.52, 0.08, p.team, 0, 0, 2.2));
    c.position.set(x, y, 0);
    const m = group();
    m.position.z = 2.3;
    c.add(m);
    tubes.push(m);
    gun.add(c);
  }
  turret.add(gun);
  root.add(turret);
  // radar điều khiển hỏa lực trên cột riêng
  const radar = group(box(1.0, 0.7, 0.08, p.hullDark), box(0.8, 0.55, 0.09, p.teamGlow, 0, 0, 0.01));
  radar.position.set(-1.3, 2.3, -1.2);
  root.add(cyl(0.05, 0.06, 1.8, p.metal, 6, -1.3, 1.2, -1.2), radar);
  const shots: { o: THREE.Object3D; v: THREE.Vector3; life: number }[] = [];
  const clock = new FireClock(BUILDINGS["aa-sam"].weapon!.cooldown);
  const V = new THREE.Vector3();
  let next = 0;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  return rig(root, [WORK, AIM, FIRE], 3.4, [
    (dt, _t, a) => a.has("work") && (radar.rotation.y += dt * 1.6),
    turretUpdate(turret, gun, [], 1, 0.62, 0.9),
    () => {
      // ty thủy lực: từ chân trên mặt tháp tới điểm dưới bụng cụm ống (z = 1.3 trong khung nòng)
      pA.set(0, 0.25, 0.75);
      const th = gun.rotation.x;
      pB.set(0, gun.position.y - 1.3 * Math.sin(th), gun.position.z + 1.3 * Math.cos(th));
      piston.position.copy(pA).add(pB).multiplyScalar(0.5);
      piston.scale.y = Math.max(0.05, pA.distanceTo(pB));
      piston.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pB.sub(pA).normalize());
    },
    (dt, _t, a) => {
      if (clock.tick(dt, a.has("fire"))) {
        const from = tubes[next]!;
        next = (next + 1) % tubes.length;
        const m = group(tubeZ(0.1, 0.1, 1.0, p.white, 8), muzzleFlash(0.6, p.flash));
        (m.children[1] as THREE.Mesh).visible = true;
        (m.children[1] as THREE.Mesh).rotation.x = -Math.PI / 2;
        (m.children[1] as THREE.Mesh).position.z = -0.8;
        root.updateMatrixWorld(true);
        from.getWorldPosition(V);
        root.worldToLocal(V);
        m.position.copy(V);
        from.getWorldDirection(V);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), V);
        root.add(m);
        shots.push({ o: m, v: V.clone().multiplyScalar(14), life: 1.2 });
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!;
        s.o.position.addScaledVector(s.v, dt);
        if ((s.life -= dt) <= 0) {
          root.remove(s.o);
          s.o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
          shots.splice(i, 1);
        }
      }
    }
  ]);
}
