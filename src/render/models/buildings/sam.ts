/**
 * Tên Lửa Tầm Xa Patriot, bản 2 (09/11/2026), chân đế 4 × 4 m, công sự.
 * Nét riêng: 4 hộp phóng dài ngóc chéo trên bệ xoay, ty thủy lực đỡ, radar mảng pha trên cột sau bệ.
 * Bộ phận động: bệ xoay, cụm hộp phóng ngóc, ty thủy lực, radar quay.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, FireClock, group, muzzleFlash, part, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, rig, turretUpdate, fortBase, oct, BASE_Y, type AimRef } from "./shared";

const POD_L = 2.9;
const LOCAL_FRONT = 2.0; // điểm dưới bụng cụm ống mà ty thủy lực đỡ (tính trong khung cụm nòng)

export function buildSAM(p: Palette): Rig {
  const root = group(fortBase(p));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  add(part("Bệ bê tông", facets([...oct(1.72, 1.72, 0.5, BASE_Y), ...oct(1.5, 1.5, 0.42, 0.9)], p.concrete)));
  add(part("Viền bệ (màu phe)", facets([...oct(1.56, 1.56, 0.44, 0.9), ...oct(1.56, 1.56, 0.44, 1.02)], p.team)));
  add(part("Trục bệ xoay", cyl(0.7, 0.85, 0.4, p.hullDark, 12, 0, 1.22, 0)));

  const turret = part("Bệ xoay", group(part("Mặt bệ xoay", box(2.5, 0.28, 2.5, p.hull, 0, 0.14, 0)), part("Nóc bệ (màu phe)", box(2.2, 0.03, 0.8, p.team, 0, 0.3, 0.7))));
  turret.position.y = 1.42;
  turret.add(part("Bản lề", box(2.2, 0.4, 0.5, p.metal, 0, 0.42, -1.0)));
  const piston = part("Ty thủy lực", cyl(0.09, 0.09, 1, p.metal, 8));
  turret.add(piston);

  const gun = part("Cụm hộp phóng", group(part("Khung đỡ", box(2.0, 0.1, POD_L, p.hullDark, 0, 0, POD_L / 2))));
  gun.position.set(0, 0.62, -1.0);
  const tubes: THREE.Group[] = [];
  for (const [x, y] of [[-0.5, 0.42], [0.5, 0.42], [-0.5, 1.12], [0.5, 1.12]] as const) {
    const c = part("Hộp phóng", group(box(0.86, 0.66, POD_L, p.hull, 0, 0, POD_L / 2), part("Miệng hộp (màu phe)", box(0.9, 0.7, 0.1, p.team, 0, 0, POD_L)), part("Đầu tên lửa", cyl(0.2, 0.2, 0.04, p.white, 12, 0, 0, POD_L + 0.06).rotateX(Math.PI / 2))));
    // nóc 2 hộp trên sơn màu phe: từ trên cao vẫn nhận ra phe
    if (y > 1) c.add(part("Nóc hộp (màu phe)", box(0.7, 0.03, POD_L - 0.5, p.team, 0, 0.345, POD_L / 2)));
    c.position.set(x, y, 0);
    const m = group();
    m.position.z = POD_L + 0.15;
    c.add(m);
    tubes.push(m);
    gun.add(c);
  }
  turret.add(gun);
  add(turret);

  // radar điều khiển hỏa lực trên cột riêng ở góc sau
  const MX = -1.25; // radar quay rộng 1,34 m: cột phải lùi vào để không thò ra ngoài chân đế
  const MZ = -1.25;
  add(part("Cột radar", cyl(0.07, 0.11, 3.7, p.metal, 8, MX, BASE_Y + 1.85, MZ)));
  const radar = part("Radar", group(box(1.3, 0.9, 0.1, p.hullDark), box(1.12, 0.74, 0.03, p.teamGlow, 0, 0, 0.06), box(1.34, 0.08, 0.14, p.team, 0, 0.48, 0)));
  radar.position.set(MX, BASE_Y + 4.1, MZ);
  add(radar);

  const shots: { o: THREE.Object3D; v: THREE.Vector3; life: number }[] = [];
  const clock = new FireClock(BUILDINGS["aa-sam"].weapon!.cooldown);
  const V = new THREE.Vector3();
  let next = 0;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const aim: AimRef = { yaw: null };
  const built = rig(
    root,
    [WORK, AIM, FIRE],
    4.6,
    [
      (dt, _t, a) => a.has("work") && (radar.rotation.y += dt * 1.6),
      turretUpdate(turret, gun, [], 1, 0.62, 0.9, aim),
      () => {
        // ty thủy lực: từ chân trên mặt bệ tới điểm dưới bụng cụm ống
        pA.set(0, 0.28, 0.85);
        const th = gun.rotation.x;
        pB.set(0, gun.position.y - LOCAL_FRONT * Math.sin(th), gun.position.z + LOCAL_FRONT * Math.cos(th));
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
    ],
    ["work"],
    aim
  );
  built.muzzlePoints = tubes;
  return built;
}
