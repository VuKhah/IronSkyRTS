/**
 * Mô hình Tiêm Kích Falcon (`falcon`), bản 1 (06/11/2026).
 * Người dùng chốt: CÁNH XUÔI NGƯỢC (chữ V ngược: mút cánh nằm trước gốc cánh), theo ảnh tham chiếu (chỉ học ý tạo hình).
 *
 * Ý đồ:
 * - Thân vát nhiều mặt (`facets`), mũi nhọn dài có gờ sườn, buồng lái kính vát, hai cửa hút gió hai bên.
 * - Cánh chính xuôi ngược, mặt cánh trắng viền xám (phối 3 lớp trắng · màu phe · thép như bài học SkyGuard).
 * - ĐỘNG CƠ MÚT CÁNH: 2 khối hộp ở hai mút cánh, khe tản nhiệt, luồng lửa riêng (cùng động cơ chính là 3 luồng lửa).
 * - Cánh mũi nhỏ cạnh buồng lái, 2 đuôi đứng chếch ra ngoài (màu phe), 2 cánh đuôi ngang.
 * - Giữ chức năng cũ: pháo đôi 30mm ở gốc cánh (cách nhau 1,6 m như sim), 2 tên lửa dưới cánh (`setAmmo`), càng thu.
 */
import * as THREE from "three";
import { box, cyl, facets, FireClock, group, muzzleFlash, part, surfaceTools, tubeZ, type Palette, type Rig } from "../kit";
import { missileMesh } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

type P2 = [number, number];
type P3 = [number, number, number];

/** Cánh chính nửa phải nhìn từ trên [x, z] (z dương là mũi): mép trước và mép sau đều xuôi về phía trước khi ra mút. */
const WING: P2[] = [[0.3, 0.0], [2.12, 0.62], [2.12, 0.16], [0.3, -1.22]];
const TIP_X = 2.3; // tâm khối động cơ mút cánh

export function buildFalcon(p: Palette): Rig {
  const frame = group();
  const add = (...o: THREE.Object3D[]) => frame.add(...o);
  const both = (f: (sx: number) => void) => [1, -1].forEach(f);

  // ================================================================ 1. THÂN
  const body = part(
    "Thân máy bay",
    facets(
      [
        [0, 0.04, 2.7], // mũi
        [0.26, 0.0, 1.55], [0.36, 0.04, 0.55], [0.4, 0.02, -1.2], [0.3, 0.04, -1.75], // gờ sườn
        [0, 0.42, 0.9], [0, 0.36, -0.3], [0, 0.26, -1.55], // sống lưng
        [0, -0.2, 1.3], [0, -0.26, -0.6], [0.26, -0.18, 0.2], [0, -0.12, -1.75] // bụng
      ],
      p.hull,
      true
    )
  );
  add(body);
  const { at, skin, line } = surfaceTools(frame, [body]);
  add(part("Mũi radar", facets([[0, 0.04, 2.72], [0.1, 0.02, 2.3], [0, 0.12, 2.25], [0, -0.06, 2.3]], p.hullDark, true)));
  add(line("Sọc mũi (màu phe)", [[0, 2.15], [0, 1.65]], p.team, { w: 0.14 }));

  // Buồng lái: kính vát nhô trên sống lưng, khung giữa
  const glass: P3[] = [];
  for (const [x, z, h] of [[0, 1.75, 0.03], [0.17, 1.35, 0.03], [0.18, 0.8, 0.03], [0, 0.45, 0.03], [0, 1.15, 0.16], [0.1, 0.95, 0.14]] as const) {
    const pt = at(x, z, "top", h);
    glass.push(pt, at(x, z, "top", -0.02));
  }
  add(part("Buồng lái", facets(glass, p.glass, true)));
  add(line("Khung kính", [[0, 1.5], [0, 0.6]], p.metal, { w: 0.04, lift: 0.1 }));

  // Cửa hút gió hai bên thân, miệng tối vát chéo
  both((sx) => {
    const intake: P3[] = [[0.3, -0.16, 0.7], [0.62, -0.14, 0.62], [0.3, 0.18, 0.62], [0.6, 0.16, 0.55], [0.32, -0.16, -0.9], [0.56, -0.12, -0.9], [0.32, 0.16, -0.9], [0.52, 0.14, -0.9]];
    add(part("Cửa hút gió", facets(intake.map(([x, y, z]): P3 => [sx * x, y, z]), p.hull)));
    const mouth: P3[] = [[0.32, -0.14, 0.72], [0.62, -0.12, 0.64], [0.32, 0.16, 0.64], [0.6, 0.14, 0.57], [0.34, -0.12, 0.6], [0.58, 0.12, 0.5]];
    add(part("Miệng hút gió", facets(mouth.map(([x, y, z]): P3 => [sx * x, y, z]), p.metal)));
  });

  // ================================================================ 2. CÁNH XUÔI NGƯỢC + ĐỘNG CƠ MÚT CÁNH
  const engines: THREE.Mesh[] = [];
  both((sx) => {
    const m = sx < 0;
    add(part("Cánh chính", wingShape(WING, 0.08, p.hull, m)));
    // mặt cánh trắng thụt vào trong, để lộ viền xám quanh mép cánh
    add(part("Mặt cánh (trắng)", wingShape([[0.45, -0.08], [1.95, 0.46], [1.95, 0.22], [0.45, -1.0]], 0.09, p.white, m)));
    // vạch màu phe dọc mép trước
    add(part("Vạch mép cánh (màu phe)", wingShape([[0.5, 0.02], [1.98, 0.56], [1.98, 0.49], [0.5, -0.06]], 0.095, p.team, m)));
    // cánh mũi nhỏ cạnh buồng lái, cánh đuôi ngang, đuôi đứng chếch ra ngoài
    add(part("Cánh mũi", wingShape([[0.3, 1.35], [0.85, 1.12], [0.85, 0.98], [0.3, 1.02]], 0.05, p.hullDark, m)));
    add(part("Cánh đuôi ngang", wingShape([[0.32, -1.25], [1.05, -1.55], [1.05, -1.78], [0.32, -1.78]], 0.05, p.hull, m)));
    const fin = part("Đuôi đứng (màu phe)", wingShape([[0, -0.75], [0, -1.7], [0.82, -1.82], [0.82, -1.5]], 0.06, p.team, false));
    fin.rotation.z = Math.PI / 2 - sx * 0.35;
    fin.position.set(sx * 0.3, 0.18, 0);
    add(fin);

    // Động cơ mút cánh: khối hộp vát, mặt trước màu phe, khe tản nhiệt hông ngoài, ống xả + luồng lửa
    const pod: P3[] = [
      [2.1, -0.13, 0.9], [2.5, -0.13, 0.9], [2.12, 0.13, 0.85], [2.48, 0.13, 0.85],
      [2.08, -0.16, -0.75], [2.52, -0.16, -0.75], [2.08, 0.17, -0.75], [2.52, 0.17, -0.75]
    ];
    add(part("Động cơ mút cánh", facets(pod.map(([x, y, z]): P3 => [sx * x, y, z]), p.hull)));
    add(part("Mặt trước động cơ (màu phe)", box(0.36, 0.22, 0.04, p.team, sx * TIP_X, 0, 0.9)));
    add(part("Cửa hút gió mút cánh", box(0.26, 0.12, 0.05, p.metal, sx * TIP_X, 0, 0.92)));
    for (const z of [0.25, 0.05, -0.15]) add(part("Khe tản nhiệt", box(0.03, 0.18, 0.12, p.hullDark, sx * 2.53, 0, z)));
    const nozzle = part("Ống xả mút cánh", tubeZ(0.13, 0.15, 0.2, p.metal, 10));
    nozzle.position.set(sx * TIP_X, 0, -0.84); // đặt thẳng vị trí: tubeZ đã xoay khối nên translateZ đi sai trục
    add(nozzle);
    const g = engineGlow(p, 0.12, 0.8);
    g.position.set(sx * TIP_X, 0, -0.95);
    add(g);
    engines.push(g);
  });
  add(part("Ống xả động cơ chính", cyl(0.24, 0.2, 0.3, p.metal, 10, 0, 0, -1.85).rotateX(Math.PI / 2)));
  const glow = engineGlow(p, 0.18, 1.0);
  glow.position.z = -1.98;
  add(glow);
  engines.push(glow);

  // ================================================================ 3. VŨ KHÍ + CÀNG
  // 2 tên lửa nổ treo dưới cánh (vũ khí phụ): bắn quả nào thì quả đó biến mất, hạ cánh nạp lại
  const pylons: THREE.Object3D[] = [];
  for (const x of [-1.35, 1.35]) {
    add(part("Giá treo", box(0.06, 0.08, 0.4, p.hullDark, x, -0.07, 0.0)));
    const msl = part("Tên lửa nổ dưới cánh", missileMesh(p, 0.6, 0.05));
    (msl.children[2] as THREE.Object3D).visible = false;
    msl.position.set(x, -0.16, 0.0);
    add(msl);
    pylons.push(msl);
  }
  // pháo đôi 30mm ở hai gốc cánh (cách nhau ~1,6 m như trong sim), ụ che nòng, chớp lửa đầu nòng
  const guns: THREE.Mesh[] = [];
  for (const x of [-0.8, 0.8]) {
    add(part("Ụ pháo", box(0.12, 0.1, 0.5, p.hullDark, x, -0.06, 0.3)));
    add(part("Nòng pháo 30mm", cyl(0.04, 0.04, 0.5, p.metal, 6, x, -0.06, 0.75).rotateX(Math.PI / 2)));
    const f = muzzleFlash(0.55, p.flash);
    f.position.set(x, -0.06, 1.2);
    add(f);
    guns.push(f);
  }
  add(skin("Vạch nhận diện (màu phe)", [[-0.2, -0.35], [0.2, -0.35], [0.2, -0.6], [-0.2, -0.6]], p.team));
  const gear = group(gearLeg(p, 0, 1.25, 0.5, 0.1), gearLeg(p, -0.5, -0.45, 0.5, 0.12), gearLeg(p, 0.5, -0.45, 0.5, 0.12));
  add(gear);

  const clock = new FireClock(0.1);
  const rig = aircraftRig(
    {
      frame,
      gear,
      engines,
      parkY: 0.62,
      flyY: 2.6,
      fire(dt, on) {
        clock.tick(dt, on);
        // hai nòng cùng chớp, nhấp nháy theo nhịp bắn
        const lit = on && clock.since < 0.05;
        for (const gun of guns) {
          gun.visible = lit;
          if (lit) gun.scale.setScalar(0.8 + Math.random() * 0.5);
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
