import { box, cyl, group, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation } from "./shared";

export function buildOilExtractor(p: Palette): Rig {
  const root = group(foundation(p, 6, 4));
  // cần bơm dầu (pumpjack): khung chữ A, đòn gánh gật lên xuống, đầu ngựa, tay quay
  for (const x of [-0.35, 0.35]) {
    const legF = box(0.12, 2.4, 0.12, p.hullDark, x, 1.35, 0.35);
    legF.rotation.x = -0.25;
    const legB = box(0.12, 2.4, 0.12, p.hullDark, x, 1.35, -0.35);
    legB.rotation.x = 0.25;
    root.add(legF, legB);
  }
  const beam = group(box(0.3, 0.3, 4.0, p.team, 0, 0, 0.2), box(0.5, 1.0, 0.4, p.hull, 0, -0.25, 2.25));
  beam.position.set(0, 2.55, 0);
  const crank = group(box(0.15, 1.3, 0.3, p.hullDark, 0, -0.45, 0), box(0.4, 0.5, 0.5, p.metal, 0, -0.95, 0));
  crank.position.set(0.45, 1.2, -1.75);
  const rod = box(0.06, 1.3, 0.06, p.metal, 0, 0, 0);
  root.add(beam, crank, rod, box(1.0, 0.8, 1.0, p.hullDark, 0.45, 0.65, -1.75));
  const wellhead = cyl(0.18, 0.25, 0.7, p.metal, 8, 0, 0.6, 2.45);
  root.add(wellhead);
  // bồn chứa
  root.add(cyl(0.9, 0.9, 2.0, p.hull, 16, -1.9, 1.25, 0.4), cyl(0.92, 0.92, 0.25, p.team, 16, -1.9, 1.7, 0.4), cyl(0.9, 0.7, 0.2, p.hullDark, 16, -1.9, 2.35, 0.4));
  const pipe = tubeZ(0.08, 0.08, 2.2, p.metal, 6);
  pipe.position.set(-1.0, 0.45, 1.5);
  pipe.rotation.y = Math.PI / 2.6;
  root.add(pipe);
  let ang = 0;
  return rig(root, [WORK], 3.6, [
    (dt, _t, a) => {
      if (a.has("work")) ang += dt * 2.2;
      const tilt = Math.sin(ang) * 0.28;
      beam.rotation.x = tilt;
      crank.rotation.x = ang;
      // Thanh truyền nối chốt tay quay với đuôi đòn gánh.
      // Xoay quanh trục X góc θ: điểm (y=0, z) đi tới y' = -z·sinθ. Đuôi đòn gánh ở z = -1.8 so với trục.
      const tailY = 2.55 + 1.8 * Math.sin(tilt) - 0.15;
      // Chốt tay quay ở y = -0.95 trong khung tay quay: y' = -0.95·cos(ang)
      const crankY = 1.2 - 0.95 * Math.cos(ang);
      rod.position.set(0.3, (tailY + crankY) / 2, -1.75);
      rod.scale.y = Math.max(0.2, (tailY - crankY) / 1.3);
    }
  ]);
}
