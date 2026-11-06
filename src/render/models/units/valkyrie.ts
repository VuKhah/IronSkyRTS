/**
 * Mô hình Valkyrie (`valkyrie`): cường kích ném bom kiểu CÁNH BAY TÀNG HÌNH (bản 2, 06/11/2026).
 * Người dùng chốt: cánh bay, giữ cỡ new00 (~7,3 m × 5,5 m). Bản cũ: Docs/models/valkyrie/.
 *
 * Ý đồ hình khối (bản 1):
 * - Gần như không có thân riêng: một khối gù giữa thấp, mặt vát phẳng (`facets`), cạnh sắc.
 * - Mép trước thẳng một đường; mép sau răng cưa hình chữ W. Không có đuôi đứng.
 * - Động cơ chìm trong lưng: gờ hút gió trên lưng, rãnh xả dẹt trước mép sau
 *   (máy bay tàng hình giấu luồng khí nóng khỏi radar và tên lửa tầm nhiệt).
 *
 * Lớp chi tiết (bản 2, để ngang tầm Titan):
 * - Đường ghép răng cưa, cửa khoang bom / cửa càng mũi nhọn hai đầu (dấu hiệu máy bay tàng hình).
 * - Cánh lái ở mép sau ngoài: BỘ PHẬN ĐỘNG, lệch theo độ nghiêng cánh.
 * - Màu phe theo nhịp: vạch đứt dọc mép trước, chữ V mũi, viền hút gió, mút cánh, ô nhận diện.
 * - Mảng tối hấp thụ radar quanh buồng lái, tấm giáp nổi, ăng-ten dẹt, cửa tiếp dầu, đèn mút cánh.
 * - Gầm: lòng khoang bom tối (thấy khi mở cửa), kính ngắm bom, cửa càng mở theo càng.
 *
 * Chi tiết dán lên bề mặt dùng `skin()`: tia dò (raycast) đo độ cao mặt thân tại (x, z) rồi đặt tấm mỏng
 * lên đúng mặt đó, nên chỉ cần khai báo tọa độ nhìn từ trên.
 */
import * as THREE from "three";
import { approach, facets, FireClock, group, part, sphere, type Palette, type Rig } from "../kit";
import { V, blast } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

type P2 = [number, number];
type P3 = [number, number, number];

/** Nửa phải của cánh nhìn từ trên (x ≥ 0, z dương là mũi). */
const NOSE_Z = 3.25;
const TIP_FRONT: P2 = [3.66, -1.0];
const TIP_BACK: P2 = [3.52, -1.42];
/** Mép sau răng cưa chữ W: mút cánh → khấc ngoài → răng → khấc trong → đuôi giữa. */
const TRAIL: P2[] = [[2.5, -0.42], [1.58, -1.85], [0.8, -0.8], [0, -2.05]];
/** z của mép trước tại x (mép trước là đường thẳng từ mũi tới mút cánh). */
const leZ = (x: number) => NOSE_Z + ((TIP_FRONT[1] - NOSE_Z) * x) / TIP_FRONT[0];

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FROM = new THREE.Vector3();

export function buildValkyrie(p: Palette): Rig {
  const frame = group();
  const engines: THREE.Mesh[] = [];
  const add = (...o: THREE.Object3D[]) => frame.add(...o);
  /** Gọi f cho nửa phải (sx = 1) và nửa trái (sx = −1). */
  const both = (f: (sx: number) => void) => [1, -1].forEach(f);

  // ================================================================ 1. KHUNG CHÍNH (hình khối bản 1)
  const outline: P2[] = [[0, NOSE_Z], TIP_FRONT, TIP_BACK, ...TRAIL];
  const wingR = part("Cánh bay", wingShape(outline, 0.1, p.hull, false));
  add(wingR, part("Cánh bay", wingShape(outline, 0.1, p.hull, true)));
  both((sx) => {
    const m = sx < 0;
    // Mép trước tối màu (vật liệu hấp thụ radar) chạy suốt từ mũi tới mút cánh
    add(part("Mép trước cánh", wingShape([[0, NOSE_Z], TIP_FRONT, [3.56, -1.12], [0, NOSE_Z - 0.2]], 0.13, p.hullDark, m)));
    add(part("Mút cánh (màu phe)", wingShape([[3.0, -0.22], TIP_FRONT, TIP_BACK, [3.18, -1.12]], 0.14, p.team, m)));
  });

  // Gốc cánh vát: dày ở gốc, mỏng dần ra mút cánh
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
  // Khối gù giữa: khoang lái + khoang bom
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
  add(root, hump);

  // Gờ hút gió + miệng hút gió (đo bề mặt bằng tia dò chỉ trên nửa phải, nên gờ dựng sau khi có hàm đo)
  frame.updateMatrixWorld(true);
  const surfaces = [hump, root, wingR];
  /** Độ cao mặt trên (top) hoặc mặt dưới của thân tại (x, z). Thân đối xứng nên đo ở |x|. */
  const surf = (x: number, z: number, top = true): number => {
    ray.set(FROM.set(Math.abs(x), top ? 5 : -5, z), top ? DOWN : UP);
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? hit.point.y : 0;
  };
  /** Tấm mỏng dán lên mặt thân theo đa giác lồi nhìn từ trên. sx = −1 lật sang nửa trái. */
  const skin = (name: string, pts: P2[], mat: THREE.Material, sx = 1, lift = 0.022, thick = 0.03, top = true) =>
    part(
      name,
      facets(
        pts.flatMap(([x, z]): P3[] => {
          const y = surf(x, z, top) + (top ? lift : -lift);
          return [[sx * x, y, z], [sx * x, top ? y - thick : y + thick, z]];
        }),
        mat
      )
    );
  /** Đường mảnh dán lên mặt thân (đường ghép tấm, vạch sơn) theo đường gấp khúc. */
  const line = (name: string, pts: P2[], mat: THREE.Material, sx = 1, w = 0.028) => {
    const g = group();
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
      const nx = (-(bz - az) / len) * (w / 2);
      const nz = ((bx - ax) / len) * (w / 2);
      g.add(skin(name, [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], mat, sx, 0.026, 0.02));
    }
    return part(name, g);
  };

  // ================================================================ 2. ĐỘNG CƠ CHÌM
  both((sx) => {
    add(
      part(
        "Gờ hút gió",
        facets(
          [
            [sx * 0.42, 0.33, 0.55], [sx * 0.92, 0.27, 0.5],
            [sx * 0.66, 0.46, 0.05], [sx * 0.45, 0.43, -0.1], [sx * 0.9, 0.36, -0.1],
            [sx * 0.5, 0.36, -0.95], [sx * 0.95, 0.3, -0.95]
          ],
          p.hull
        )
      ),
      // Miệng hút gió: khe tối hình thang ở đầu gờ, vát chéo kiểu tàng hình
      part(
        "Miệng hút gió",
        facets([[sx * 0.44, 0.34, 0.57], [sx * 0.9, 0.29, 0.52], [sx * 0.66, 0.45, 0.1], [sx * 0.46, 0.4, 0.42], [sx * 0.86, 0.34, 0.38]], p.metal)
      ),
      line("Viền hút gió (màu phe)", [[0.38, 0.66], [0.66, 0.66], [0.96, 0.58]], p.team, sx, 0.05),
      // Rãnh xả dẹt trên mặt cánh, chạy ra mép sau của răng cưa; tấm chịu nhiệt tối phía trước rãnh
      part("Rãnh xả động cơ", facets([[sx * 0.95, 0.12, -0.72], [sx * 1.55, 0.11, -0.85], [sx * 1.12, 0.1, -1.18], [sx * 1.58, 0.09, -1.38], [sx * 1.35, 0.06, -1.4]], p.metal)),
      skin("Tấm chịu nhiệt", [[0.9, -0.45], [1.5, -0.55], [1.55, -0.82], [0.95, -0.72]], p.hullDark, sx)
    );
    // Lửa động cơ dẹt (khe xả ngang): ép dẹt hình nón theo chiều cao, không đụng tới scale của mesh
    // vì aircraftRig dùng scale.y làm độ dài luồng lửa khi tăng giảm ga.
    for (const x of [1.2, 1.45]) {
      const g = engineGlow(p, 0.12, 0.7);
      g.geometry.scale(1.7, 1, 0.35);
      g.position.set(sx * x, 0.1, -1.32);
      add(g);
      engines.push(g);
    }
  });

  // ================================================================ 3. BUỒNG LÁI + MẢNG TỐI
  // Mảng hấp thụ radar quanh buồng lái: mũi tối như máy bay tàng hình thật, tương phản với thân xám
  add(skin("Mảng hấp thụ radar", [[0, 2.35], [0.46, 1.7], [0.42, 0.95], [0, 0.8], [-0.42, 0.95], [-0.46, 1.7]], p.hullDark));
  // Hai ô kính vát, ở giữa là thanh khung; mỗi ô có gờ giữa nhô lên để bắt sáng
  both((sx) => {
    const rim: P2[] = [[0.05, 1.9], [0.32, 1.52], [0.27, 1.12], [0.05, 1.05]];
    const pts: P3[] = rim.flatMap(([x, z]): P3[] => [[sx * x, surf(x, z) + 0.045, z], [sx * x, surf(x, z) + 0.01, z]]);
    pts.push([sx * 0.16, surf(0.16, 1.45) + 0.11, 1.45]);
    add(part("Buồng lái", facets(pts, p.glass)));
  });
  add(line("Khung kính", [[0, 1.95], [0, 1.0]], p.metal, 1, 0.07));
  add(line("Chữ V mũi (màu phe)", [[-0.34, 2.38], [0, 2.75], [0.34, 2.38]], p.team, 1, 0.07));

  // ================================================================ 4. MẶT LƯNG: màu phe, tấm giáp, đường ghép, ăng-ten
  add(skin("Ô nhận diện (màu phe)", [[0, 0.55], [0.22, 0.2], [0, -0.15], [-0.22, 0.2]], p.team));
  // Cửa tiếp dầu trên không: ô tối + 2 vạch trắng dẫn hướng cho máy bay tiếp dầu
  add(skin("Cửa tiếp dầu", [[0, -0.32], [0.09, -0.45], [0, -0.58], [-0.09, -0.45]], p.metal));
  both((sx) => add(line("Vạch dẫn tiếp dầu", [[0.05, -0.62], [0.05, -0.95]], p.white, sx, 0.025)));
  // Đường ghép răng cưa ngang lưng, sau cửa tiếp dầu
  add(line("Đường ghép răng cưa", [[-0.36, -1.05], [-0.24, -0.95], [-0.12, -1.05], [0, -0.95], [0.12, -1.05], [0.24, -0.95], [0.36, -1.05]], p.hullDark));
  // Ăng-ten dẹt trên lưng (vây mỏng vát về sau)
  const blade = (x: number, z: number, h: number, name: string) => {
    const y = surf(x, z);
    return part(name, facets([[x - 0.012, y, z + 0.1], [x + 0.012, y, z + 0.1], [x - 0.012, y, z - 0.12], [x + 0.012, y, z - 0.12], [x, y + h, z - 0.16]], p.metal));
  };
  add(blade(0, -1.3, 0.13, "Ăng-ten dẹt"));

  both((sx) => {
    // Vạch đứt màu phe dọc mép trước: nhịp đều như viền vai xe của Titan
    for (const [a, b] of [[1.25, 1.85], [2.05, 2.6]] as P2[]) {
      add(skin("Vạch mép cánh (màu phe)", [[a, leZ(a) - 0.24], [b, leZ(b) - 0.24], [b, leZ(b) - 0.33], [a, leZ(a) - 0.33]], p.team, sx));
    }
    // Tấm giáp nổi hình thoi trên cánh, tối màu, viền ghép răng cưa ở cạnh trong
    add(skin("Tấm giáp cánh", [[1.6, 0.4], [2.15, 0.02], [2.05, -0.28], [1.52, 0.08]], p.hullDark, sx));
    add(skin("Tấm giáp cánh", [[2.35, -0.05], [2.8, -0.42], [2.68, -0.6], [2.24, -0.24]], p.hullDark, sx));
    add(line("Đường ghép răng cưa", [[1.3, 0.95], [1.45, 0.7], [1.3, 0.45], [1.45, 0.2], [1.3, -0.05], [1.45, -0.3]], p.hullDark, sx));
    // Ăng-ten dẹt trên gốc cánh, đèn định vị mút cánh (phát sáng màu phe)
    add(blade(sx * 1.05, 0.95, 0.09, "Ăng-ten dẹt"));
    const lampPts: P3[] = [[3.5, 0.02, -0.98], [3.64, 0.02, -1.02], [3.56, 0.02, -1.14], [3.56, 0.1, -1.04]];
    add(part("Đèn mút cánh", facets(lampPts.map(([x, y, z]): P3 => [sx * x, y, z]), p.teamGlow)));
  });

  // ================================================================ 5. CÁNH LÁI (bộ phận động)
  // Hai tấm mỗi bên, gắn bản lề dọc mép sau ngoài, chìa vào khấc chữ W. Nghiêng cánh thì cánh lái
  // hai bên lệch ngược nhau (giống máy bay thật: cánh lái là thứ làm máy bay nghiêng).
  const elevons: { g: THREE.Group; axis: THREE.Vector3; k: number }[] = [];
  const mid: P2 = [(TIP_BACK[0] + TRAIL[0]![0]) / 2, (TIP_BACK[1] + TRAIL[0]![1]) / 2];
  both((sx) => {
    for (const [a, b, k] of [[TIP_BACK, mid, 1], [mid, TRAIL[0]!, 0.65]] as [P2, P2, number][]) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      const nx = (-dz / len) * 0.38; // pháp tuyến hướng ra sau, vào khấc
      const nz = (dx / len) * 0.38;
      const hinge = part("Cánh lái", group(wingShape([[0.03 * dx, 0.03 * dz], [0.97 * dx, 0.97 * dz], [0.97 * dx + nx * 0.8, 0.97 * dz + nz * 0.8], [0.03 * dx + nx, 0.03 * dz + nz]], 0.06, p.hullDark, sx < 0)));
      hinge.position.set(sx * a[0], 0, a[1]);
      add(hinge);
      elevons.push({ g: hinge, axis: new THREE.Vector3(sx * dx, 0, dz).normalize(), k: k * sx });
    }
  });

  // ================================================================ 6. GẦM: khoang bom, kính ngắm, càng + cửa càng
  add(skin("Lòng khoang bom", [[-0.4, 0.62], [0.4, 0.62], [0.4, -0.82], [-0.4, -0.82]], p.metal, 1, 0.004, 0.01, false));
  add(skin("Kính ngắm bom", [[0, 2.62], [0.14, 2.42], [0, 2.22], [-0.14, 2.42]], p.glass, 1, 0.012, 0.03, false));
  {
    const y = surf(0, 1.25, false);
    add(part("Ăng-ten bụng", facets([[-0.012, y, 1.35], [0.012, y, 1.35], [-0.012, y, 1.15], [0.012, y, 1.15], [0, y - 0.1, 1.1]], p.metal)));
  }

  /** Cửa mũi nhọn hai đầu (răng cưa): rộng w theo hướng ext (±1 trục x), dài 2·l theo z. */
  const sawDoor = (name: string, w: number, l: number, ext: number, mat: THREE.Material) =>
    part(
      name,
      group(
        facets(
          [[0, l * 0.85], [ext * w * 0.5, l], [ext * w, l * 0.85], [ext * w, -l * 0.85], [ext * w * 0.5, -l], [0, -l * 0.85]].flatMap(([x, z]): P3[] => [[x!, 0.02, z!], [x!, -0.02, z!]]),
          mat
        )
      )
    );
  const bombDoors: { g: THREE.Group; ext: number }[] = [];
  for (const ext of [-1, 1]) {
    const d = sawDoor("Cửa khoang bom", 0.4, 0.8, ext, p.hullDark);
    d.position.set(ext * 0.02, -0.28, -0.1);
    add(d);
    bombDoors.push({ g: d, ext });
  }
  const bay = group();
  bay.position.set(0, -0.24, -0.1);
  add(bay);

  const gear = group(gearLeg(p, 0, 1.85, 0.62, 0.14), gearLeg(p, -1.05, -0.4, 0.62, 0.16), gearLeg(p, 1.05, -0.4, 0.62, 0.16));
  add(gear);
  const gearDoors: { g: THREE.Group; ext: number }[] = [];
  const gearDoor = (x: number, z: number, w: number, l: number, ext: number) => {
    const d = sawDoor("Cửa càng", w, l, ext, p.hullDark);
    d.position.set(x, surf(x + ext * w * 0.5, z, false) - 0.025, z);
    add(d);
    gearDoors.push({ g: d, ext });
  };
  both((sx) => {
    gearDoor(sx * 0.88, -0.4, 0.17, 0.38, sx); // càng chính: cửa trong mở ra ngoài
    gearDoor(sx * 1.22, -0.4, 0.17, 0.38, -sx); // cửa ngoài mở vào trong
    gearDoor(sx * 0.15, 1.85, 0.13, 0.26, -sx); // càng mũi
  });

  // ================================================================ 7. BAY VÀ NÉM BOM
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
        // cánh lái theo độ nghiêng / chúc ngóc của thân (aircraftRig đặt frame.rotation = (−pitch, yaw, −roll))
        const roll = -frame.rotation.z;
        const pitch = -frame.rotation.x;
        for (const e of elevons) e.g.quaternion.setFromAxisAngle(e.axis, THREE.MathUtils.clamp(e.k * roll * 0.9 - Math.sign(e.k) * pitch * 2.5, -0.5, 0.5));
        // cửa càng mở theo càng (càng thu = scale.y về 0)
        const gOpen = Math.min(1, gear.scale.y * 1.3);
        for (const d of gearDoors) d.g.rotation.z = -d.ext * gOpen * 1.45;

        doorT = approach(doorT, on ? 1 : 0, 6, dt);
        for (const d of bombDoors) d.g.rotation.z = -d.ext * doorT * 1.3;
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
