/** Mô hình Valkyrie (`valkyrie`). */
import * as THREE from "three";
import { approach, box, cyl, FireClock, group, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { V, blast } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

export function buildValkyrie(p: Palette): Rig {
  const frame = group();
  const engines: THREE.Mesh[] = [];

  // 1. THÂN TRUNG TÂM BO TRÒN KHÍ ĐỘNG HỌC (Organic Blended-Wing Body)
  // Dùng khối cầu kéo giãn (Ellipsoid) tạo phần lưng vồng mềm mại như cá đuối, không còn góc hộp vuông
  const mainBody = part("Thân chính khí động học", sphere(1.0, p.hull, 0, 0.04, 0.25));
  mainBody.scale.set(1.25, 0.34, 2.35);

  // Sống lưng trên vuốt thuôn dài về phía mũi (Smooth Dorsal Blending)
  const upperSpine = sphere(1.0, p.hull, 0, 0.14, 0.55);
  upperSpine.scale.set(0.82, 0.28, 1.95);

  // Mũi máy bay thuôn nhọn bo tròn (Streamlined Radome Nose)
  const noseCone = part("Mũi máy bay", sphere(1.0, p.hull, 0, 0.02, 1.85));
  noseCone.scale.set(0.58, 0.18, 1.65);

  const noseTipDark = sphere(1.0, p.hullDark, 0, 0.01, 2.85);
  noseTipDark.scale.set(0.28, 0.1, 0.75);

  // Vòm kính buồng lái cong mượt ôm theo độ dốc của mũi (Seamless Bubble Canopy)
  const canopy = part("Buồng lái", sphere(1.0, p.glass, 0, 0.22, 1.45));
  canopy.scale.set(0.46, 0.18, 0.95);
  canopy.rotation.x = 0.08;

  // Khung viền buồng lái bo tròn
  const canopyTrim = sphere(1.0, p.hullDark, 0, 0.19, 1.38);
  canopyTrim.scale.set(0.5, 0.16, 1.05);
  canopyTrim.rotation.x = 0.08;

  // Bụng khoang bom bo tròn nhẹ dưới gầm
  const bellyFairing = part("Bụng khoang bom", sphere(1.0, p.hullDark, 0, -0.12, 0.15));
  bellyFairing.scale.set(1.05, 0.22, 1.85);

  frame.add(mainBody, upperSpine, noseCone, noseTipDark, canopy, canopyTrim, bellyFairing);

  // 2. ĐÔI CÁNH TAM GIÁC LƯỢN SÓNG MỀM MẠI (Ogival Delta / Manta Wing)
  for (const mirror of [false, true]) {
    const sx = mirror ? -1 : 1;

    // Cánh gốc chuyển tiếp (Wing Root Fillet) dày hơn để nối mượt từ thân cầu ra cánh
    const wingRoot = wingShape(
      [
        [0.45, 2.45],
        [1.25, 1.15],
        [2.15, -0.15],
        [2.05, -1.55],
        [0.95, -1.95],
        [0.35, -1.75]
      ],
      0.24,
      p.hull,
      mirror
    );

    // Cánh chính tam giác rộng có đường viền trước uốn cong nhiều điểm (Smooth Multi-point Leading Edge)
    const mainWing = part(
      "Cánh chính",
      wingShape(
        [
          [0.55, 2.3],    // Vuốt từ mũi
          [1.45, 1.05],   // Đường cong lượn phần vai
          [2.55, -0.15],  // Mở rộng sải cánh mượt
          [3.65, -1.25],  // Đầu cánh vát lượn
          [3.45, -1.75],  // Bo góc mút cánh sau
          [2.25, -1.45],  // Đường lượn sóng đuôi cánh (Smooth trailing curve)
          [1.15, -1.95],  // Đỉnh đuôi trong
          [0.35, -1.65]   // Nối về tâm đuôi
        ],
        0.14,
        p.hull,
        mirror
      )
    );

    // Mép cánh trước tối màu tạo dáng khí động học lướt gió (Sleek Leading Edge)
    const leadingEdge = wingShape(
      [
        [0.65, 2.15],
        [1.48, 1.02],
        [2.58, -0.18],
        [3.66, -1.25],
        [3.52, -1.42],
        [2.42, -0.32],
        [1.35, 0.85],
        [0.65, 1.85]
      ],
      0.15,
      p.hullDark,
      mirror
    );

    // Gân cánh uốn cong mềm bằng khối elip dẹp (Smooth Wing Blending Fairing)
    const wingFairing = sphere(1.0, p.hull, sx * 1.15, 0.06, 0.1);
    wingFairing.scale.set(0.95, 0.18, 1.45);
    wingFairing.rotation.y = sx * -0.35;

    // 3. BẦU ĐỘNG CƠ THUÔN MƯỢT LIỀN THÂN (Streamlined Curved Nacelles)
    // Dùng tubeZ nhiều cạnh (16 segments) ép dẹp elip thay cho khối box vuông
    const nacelle = part("Khoang động cơ", tubeZ(0.32, 0.26, 1.95, p.hull, 16));
    nacelle.scale.set(1.15, 0.62, 1.0);
    nacelle.position.set(sx * 0.72, 0.14, -0.25);
    nacelle.rotation.y = sx * -0.06;

    // Vòm che cửa hút gió bo tròn mềm mại phía trước động cơ
    const intakeCowling = sphere(1.0, p.hullDark, sx * 0.76, 0.13, 0.55);
    intakeCowling.scale.set(0.34, 0.15, 0.55);
    intakeCowling.rotation.y = sx * -0.08;

    // Họng xả phản lực kép bo tròn nằm gọn trong đuôi bầu động cơ
    for (const offset of [-0.14, 0.14]) {
      const exX = sx * (0.72 + offset);
      const exZ = -1.22;
      const nozzle = cyl(0.13, 0.16, 0.35, p.metal, 14, exX, 0.12, exZ).rotateX(Math.PI / 2);
      nozzle.scale.set(1.15, 0.8, 1.0);
      frame.add(nozzle);

      const g = engineGlow(p, 0.13, 0.85);
      g.scale.set(1.2, 0.75, 1.0);
      g.position.set(exX, 0.12, exZ - 0.22);
      frame.add(g);
      engines.push(g);
    }

    // 4. PHỐI MÀU PHE (p.team) DẠNG DẢI LƯỢN KHÍ ĐỘNG HỌC & VÂY ĐẦU CÁNH (Winglet)
    // Dải màu phe vuốt theo độ vát của cánh
    const teamStripe = part(
      "Đầu cánh (màu phe)",
      wingShape(
        [
          [2.65, -0.32],
          [3.58, -1.22],
          [3.42, -1.72],
          [2.95, -1.62],
          [2.35, -0.65]
        ],
        0.155,
        p.team,
        mirror
      )
    );

    // Dải nhấn mảnh dọc theo lưng bầu động cơ
    const spineAccent = wingShape(
      [
        [0.45, 0.85],
        [0.58, 0.65],
        [0.58, -1.05],
        [0.45, -1.25]
      ],
      0.26,
      p.team,
      mirror
    );
    spineAccent.position.y = 0.06;

    // Vây khí động học nhỏ vuốt cong ở mút cánh (Sleek Cantilever Winglet)
    const winglet = part(
      "Cánh đuôi đứng",
      wingShape(
        [
          [0, -1.15],
          [0, -1.72],
          [0.42, -1.88],
          [0.42, -1.52]
        ],
        0.06,
        p.team,
        false
      )
    );
    winglet.rotation.z = Math.PI / 2 - sx * 0.55; // Nghiêng lượn ra ngoài mút cánh
    winglet.position.set(sx * 3.42, 0.05, 0);

    frame.add(
      wingRoot,
      mainWing,
      leadingEdge,
      wingFairing,
      nacelle,
      intakeCowling,
      teamStripe,
      spineAccent,
      winglet
    );
  }

  // 5. KHOANG BOM TRUNG TÂM (2 cửa mở sang hai bên dưới bụng)
  const doors: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = part(
      "Cửa khoang bom",
      group(box(0.42, 0.05, 1.75, p.hullDark, side * 0.21, 0, 0))
    );
    hinge.position.set(side * 0.02, -0.26, 0.15);
    doors.push(hinge);
    frame.add(hinge);
  }

  const bay = group();
  bay.position.set(0, -0.22, 0.15);
  frame.add(bay);

  // 6. CÀNG ĐÁP (3 chân càng cân đối)
  const gear = group(
    gearLeg(p, 0, 1.85, 0.62, 0.14),
    gearLeg(p, -1.05, -0.4, 0.62, 0.16),
    gearLeg(p, 1.05, -0.4, 0.62, 0.16)
  );
  frame.add(gear);

  // 7. RIG BAY & LOGIC NÉM BOM
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
