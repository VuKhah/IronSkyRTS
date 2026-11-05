/** Mô hình Falcon (`falcon`). */
import * as THREE from "three";
import { box, cyl, FireClock, group, muzzleFlash, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { missileMesh } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

export function buildFalcon(p: Palette): Rig {
  const frame = group();
  frame.add(
    tubeZ(0.26, 0.32, 3.0, p.hull, 10),
    part("Cửa hút gió", box(0.34, 0.3, 1.1, p.hullDark, -0.3, -0.05, 0.1)),
    part("Cửa hút gió", box(0.34, 0.3, 1.1, p.hullDark, 0.3, -0.05, 0.1))
  );
  const nose = part("Mũi máy bay", new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 10), p.hull));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.05;
  nose.castShadow = true;
  const canopy = part("Buồng lái", sphere(0.22, p.glass, 0, 0.22, 0.95));
  canopy.scale.set(1, 0.8, 2.4);
  frame.add(nose, canopy);
  for (const mirror of [false, true]) {
    const sx = mirror ? -1 : 1;
    frame.add(part("Cánh chính", wingShape([[0.25, 0.7], [2.0, -0.8], [2.0, -1.15], [0.25, -1.2]], 0.07, p.hull, mirror)));
    frame.add(part("Đầu cánh (màu phe)", wingShape([[1.55, -0.45], [2.02, -0.82], [2.02, -1.16], [1.55, -1.18]], 0.08, p.team, mirror)));
    const canard = wingShape([[0.25, 1.25], [0.75, 0.95], [0.75, 0.82], [0.25, 0.85]], 0.05, p.hullDark, mirror);
    frame.add(part("Cánh mũi", canard));
    const fin = part("Cánh đuôi đứng", wingShape([[0, -0.6], [0.0, -1.5], [0.75, -1.55], [0.75, -1.3]], 0.06, p.team, false));
    fin.rotation.z = Math.PI / 2 - sx * 0.3;
    fin.position.set(sx * 0.28, 0.12, 0);
    frame.add(fin);
  }
  frame.add(part("Ống xả động cơ", cyl(0.24, 0.2, 0.3, p.metal, 10, 0, 0, -1.62).rotateX(Math.PI / 2)));
  const glow = engineGlow(p, 0.18, 1.0);
  glow.position.z = -1.75;
  frame.add(glow);

  // 2 tên lửa nổ treo dưới cánh (vũ khí phụ): bắn quả nào thì quả đó biến mất, hạ cánh nạp lại
  const pylons: THREE.Object3D[] = [];
  for (const x of [-1.35, 1.35]) {
    const m = part("Tên lửa nổ dưới cánh", missileMesh(p, 0.6, 0.05));
    (m.children[2] as THREE.Object3D).visible = false;
    m.position.set(x, -0.12, -0.25);
    frame.add(m);
    pylons.push(m);
  }
  // pháo đôi 30mm ở hai gốc cánh (cách nhau ~1,6 m như trong sim), mỗi nòng có chớp lửa đầu nòng
  const guns: THREE.Mesh[] = [];
  for (const x of [-0.8, 0.8]) {
    frame.add(part("Nòng pháo 30mm", cyl(0.045, 0.045, 0.7, p.metal, 6, x, -0.08, 0.75).rotateX(Math.PI / 2)));
    const f = muzzleFlash(0.55, p.flash);
    f.position.set(x, -0.08, 1.35);
    frame.add(f);
    guns.push(f);
  }
  const gear = group(gearLeg(p, 0, 1.2, 0.5, 0.1), gearLeg(p, -0.45, -0.35, 0.5, 0.12), gearLeg(p, 0.45, -0.35, 0.5, 0.12));
  frame.add(gear);

  const clock = new FireClock(0.1);
  const rig = aircraftRig(
    {
      frame,
      gear,
      engines: [glow],
      parkY: 0.62,
      flyY: 2.6,
      fire(dt, on) {
        clock.tick(dt, on);
        // hai nòng cùng chớp, nhấp nháy theo nhịp bắn
        const lit = on && clock.since < 0.05;
        for (const g of guns) {
          g.visible = lit;
          if (lit) g.scale.setScalar(0.8 + Math.random() * 0.5);
        }
      }
    },
    3.0
  );
  rig.setAmmo = (n) => {
    // sim bắn quả ở trục +x của thân trước (pylons[1], x = +1,35), rồi tới quả bên kia
    pylons[1]!.visible = n >= 2;
    pylons[0]!.visible = n >= 1;
  };
  return rig;
}
