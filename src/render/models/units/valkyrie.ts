/**
 * Mô hình Valkyrie (`valkyrie`): cường kích ném bom kiểu CÁNH BAY TÀNG HÌNH (bản 1, 06/11/2026).
 * Người dùng chốt: cánh bay, giữ cỡ new00 (~7,3 m × 5,5 m). Bản cũ (new00, thân cá đuối bo tròn)
 * lưu ở Docs/models/valkyrie/valkyrie_new00.md.
 *
 * Ý đồ hình khối:
 * - Gần như không có thân riêng: một khối gù giữa thấp, mặt vát phẳng (`facets`), cạnh sắc.
 * - Mép trước thẳng một đường; mép sau răng cưa hình chữ W.
 * - Động cơ chìm trong lưng: chỉ thấy gờ hút gió trên lưng và ống xả dẹt trước mép sau
 *   (máy bay tàng hình giấu luồng khí nóng khỏi radar và tên lửa tầm nhiệt).
 * - Không có đuôi đứng. Màu phe tiết chế: mút cánh và một ô nhận diện trên lưng.
 */
import * as THREE from "three";
import { approach, box, facets, FireClock, group, part, sphere, type Palette, type Rig } from "../kit";
import { V, blast } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

/** Nửa phải của cánh nhìn từ trên (x ≥ 0, z dương là mũi). */
const NOSE_Z = 3.25;
const TIP_FRONT: [number, number] = [3.66, -1.0];
const TIP_BACK: [number, number] = [3.52, -1.42];
/** Mép sau răng cưa chữ W: mút cánh → khấc ngoài → răng → khấc trong → đuôi giữa. */
const TRAIL: [number, number][] = [[2.5, -0.42], [1.58, -1.85], [0.8, -0.8], [0, -2.05]];

export function buildValkyrie(p: Palette): Rig {
  const frame = group();
  const engines: THREE.Mesh[] = [];

  // 1. CÁNH BAY: một tấm mỏng phủ trọn hình chữ W, đối xứng hai nửa
  const outline: [number, number][] = [[0, NOSE_Z], TIP_FRONT, TIP_BACK, ...TRAIL];
  for (const mirror of [false, true]) {
    frame.add(part("Cánh bay", wingShape(outline, 0.1, p.hull, mirror)));
    // Mép trước tối màu (vật liệu hấp thụ radar) chạy suốt từ mũi tới mút cánh
    frame.add(part("Mép trước cánh", wingShape([[0, NOSE_Z], TIP_FRONT, [3.56, -1.12], [0, NOSE_Z - 0.2]], 0.13, p.hullDark, mirror)));
    // Mút cánh màu phe
    frame.add(part("Mút cánh (màu phe)", wingShape([[3.0, -0.22], TIP_FRONT, TIP_BACK, [3.18, -1.12]], 0.14, p.team, mirror)));
  }

  // 2. GỐC CÁNH VÁT: dày ở gốc, mỏng dần ra mút cánh (mặt phẳng nghiêng thay cho mặt cong)
  const root = part(
    "Gốc cánh vát",
    facets(
      [
        [0, 0.05, NOSE_Z - 0.1], [0, -0.05, NOSE_Z - 0.1],
        [3.2, 0.05, -0.7], [3.2, -0.05, -0.7], [3.1, 0.05, -1.1], [3.1, -0.05, -1.1],
        [2.35, 0.05, -0.5], [2.35, -0.05, -0.5],
        [0.85, 0.05, -0.85], [0.85, -0.05, -0.85],
        [1.0, 0.2, 1.0], [1.15, 0.18, -0.55], [1.0, -0.12, 0.6], [1.1, -0.11, -0.55]
      ],
      p.hull,
      true
    )
  );
  frame.add(root);

  // 3. KHỐI GÙ GIỮA: khoang lái + khoang bom, thấp và nhiều mặt vát
  const hump = part(
    "Thân giữa",
    facets(
      [
        [0, 0.04, NOSE_Z + 0.1], [0, -0.02, NOSE_Z + 0.05],
        [0.55, 0.12, 2.3], [0.5, -0.1, 2.2],
        [0, 0.41, 1.3], [0, 0.47, 0.0], [0, 0.39, -1.15],
        [0.78, 0.31, 0.6], [0.88, 0.29, -0.8],
        [1.28, 0.07, 0.35], [1.32, 0.07, -1.0],
        [0, 0.08, -1.95],
        [0, -0.27, 0.6], [0, -0.27, -0.8], [1.0, -0.15, 0.2], [1.0, -0.15, -0.9], [0, -0.08, -1.85]
      ],
      p.hull,
      true
    )
  );
  frame.add(hump);

  // Buồng lái: hai ô kính vát nằm sát lưng, chia bởi một thanh khung giữa
  const canopy = part(
    "Buồng lái",
    facets([[0, 0.39, 1.85], [0.3, 0.37, 1.5], [0.25, 0.46, 1.15], [0, 0.5, 1.08], [0, 0.46, 1.5], [0.32, 0.32, 1.55], [0, 0.33, 1.9]], p.glass, true)
  );
  const canopyBar = part("Khung kính", box(0.05, 0.06, 0.8, p.hullDark, 0, 0.47, 1.45));
  canopyBar.rotation.x = 0.13;
  frame.add(canopy, canopyBar);

  // Ô nhận diện màu phe trên lưng, sau buồng lái
  const idPanel = part("Ô nhận diện (màu phe)", facets([[0, 0.49, 0.55], [0.22, 0.45, 0.2], [0, 0.49, -0.15]], p.team, true));
  frame.add(idPanel);

  // 4. ĐỘNG CƠ CHÌM: gờ hút gió trên lưng + ống xả dẹt trước mép sau
  for (const sx of [-1, 1]) {
    const intake = part(
      "Gờ hút gió",
      facets(
        [
          [sx * 0.42, 0.33, 0.55], [sx * 0.92, 0.27, 0.5],
          [sx * 0.66, 0.46, 0.05], [sx * 0.45, 0.43, -0.1], [sx * 0.9, 0.36, -0.1],
          [sx * 0.5, 0.36, -0.95], [sx * 0.95, 0.3, -0.95]
        ],
        p.hull
      )
    );
    // Miệng hút gió: khe tối hình thang ở đầu gờ, vát chéo kiểu tàng hình
    const mouth = part(
      "Miệng hút gió",
      facets(
        [
          [sx * 0.44, 0.34, 0.57], [sx * 0.9, 0.29, 0.52], [sx * 0.66, 0.45, 0.1],
          [sx * 0.46, 0.4, 0.42], [sx * 0.86, 0.34, 0.38]
        ],
        p.metal
      )
    );
    // Rãnh xả dẹt trên mặt cánh, chạy ra mép sau của răng cưa
    const trough = part("Rãnh xả động cơ", facets([[sx * 0.95, 0.12, -0.72], [sx * 1.55, 0.11, -0.85], [sx * 1.12, 0.1, -1.18], [sx * 1.58, 0.09, -1.38], [sx * 1.35, 0.06, -1.4]], p.metal));
    frame.add(intake, mouth, trough);

    // Lửa động cơ dẹt (khe xả ngang): ép dẹt hình nón theo chiều cao, không đụng tới scale của mesh
    // vì aircraftRig dùng scale.y làm độ dài luồng lửa khi tăng giảm ga.
    for (const x of [1.2, 1.45]) {
      const g = engineGlow(p, 0.12, 0.7);
      g.geometry.scale(1.7, 1, 0.35);
      g.position.set(sx * x, 0.1, -1.32);
      frame.add(g);
      engines.push(g);
    }
  }

  // 5. KHOANG BOM: 2 cửa dưới bụng mở sang hai bên
  const doors: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = part("Cửa khoang bom", group(box(0.4, 0.04, 1.5, p.hullDark, side * 0.2, 0, 0)));
    hinge.position.set(side * 0.02, -0.28, -0.1);
    doors.push(hinge);
    frame.add(hinge);
  }
  const bay = group();
  bay.position.set(0, -0.24, -0.1);
  frame.add(bay);

  // 6. CÀNG ĐÁP: bánh mũi + 2 càng chính dưới gốc cánh
  const gear = group(gearLeg(p, 0, 1.85, 0.62, 0.14), gearLeg(p, -1.05, -0.4, 0.62, 0.16), gearLeg(p, 1.05, -0.4, 0.62, 0.16));
  frame.add(gear);

  // 7. BAY VÀ NÉM BOM
  let rigRoot: THREE.Object3D = frame;
  const bombs: { o: THREE.Mesh; v: THREE.Vector3 }[] = [];
  const clock = new FireClock(0.5);
  let doorT = 0;

  const rig = aircraftRig(
    {
      frame,
      gear,
      engines,
      parkY: 0.78,
      flyY: 3.2,
      fire(dt, on) {
        doorT = approach(doorT, on ? 1 : 0, 6, dt);
        doors.forEach((d, i) => (d.rotation.z = (i ? -1 : 1) * doorT * 1.3));
        if (clock.tick(dt, on && doorT > 0.6)) {
          const b = sphere(0.12, p.metal);
          b.scale.set(1, 1, 2.2);
          rigRoot.updateMatrixWorld(true);
          bay.getWorldPosition(V);
          rigRoot.worldToLocal(V);
          b.position.copy(V);
          rigRoot.add(b);
          frame.getWorldDirection(V);
          bombs.push({ o: b, v: V.clone().multiplyScalar(2.5) });
        }
        for (let i = bombs.length - 1; i >= 0; i--) {
          const s = bombs[i]!;
          s.v.y -= 9.8 * dt;
          s.o.position.addScaledVector(s.v, dt);
          s.o.lookAt(V.copy(s.o.position).add(s.v));
          if (s.o.position.y <= 0.1) {
            blast(rigRoot, s.o.position, p, 0.6);
            rigRoot.remove(s.o);
            s.o.geometry.dispose();
            bombs.splice(i, 1);
          }
        }
      }
    },
    4.0
  );
  rigRoot = rig.root;
  return rig;
}
