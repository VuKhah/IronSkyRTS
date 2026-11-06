/**
 * Mô hình Tiêm Kích Falcon (`falcon`), bản 3 (06/11/2026).
 * Người dùng chốt: CÁNH XUÔI NGƯỢC (chữ V ngược: mút cánh nằm trước gốc cánh), theo ảnh tham chiếu (chỉ học ý tạo hình);
 * động cơ mút cánh ngắn, chụm về tâm phía sau; đuôi 2 động cơ (tổng 4 luồng lửa). Bản 3: "vẫn hơi hiền, làm wow hơn".
 *
 * Ý đồ "dữ" hơn (bản 3):
 * - Dáng: mũi dài nhọn, gờ sườn sắc; gờ gốc cánh (LERX) chạy dọc thân tới buồng lái như vai gồ; mép trước cánh có khấc răng;
 *   cánh mũi to vát nhọn; đuôi đứng cao, chếch mạnh, mút tối + đèn; 2 vây bụng dưới đuôi; cửa hút gió miệng cá mập.
 * - Tương phản: sống lưng tối, mặt cánh trắng, vạch màu phe chạy chéo kiểu tia chớp; buồng lái KÍNH VÀNG.
 * - Động cơ: ống xả có vành cánh hoa, giữa có vòng phát sáng; động cơ mút cánh mũi vát nhọn màu phe.
 * - Vũ khí lộ rõ: tên lửa to có cánh đuôi, giá treo nặng; cầu cảm biến trước kính.
 * - Giữ chức năng: pháo đôi 30mm ở gốc cánh (cách nhau 1,6 m như sim), 2 tên lửa dưới cánh (`setAmmo`), càng thu.
 */
import * as THREE from "three";
import { box, cyl, facets, FireClock, group, muzzleFlash, part, sphere, surfaceTools, tubeZ, type Palette, type Rig } from "../kit";
import { missileMesh } from "./common";
import { wingShape, aircraftRig, gearLeg, engineGlow } from "./air";

type P2 = [number, number];
type P3 = [number, number, number];

/** Cánh chính nửa phải nhìn từ trên [x, z] (z dương là mũi): xuôi ngược, mép trước có khấc răng ở giữa sải. */
const WING: P2[] = [[0.3, 0.0], [1.18, 0.3], [1.22, 0.2], [2.12, 0.62], [2.12, 0.16], [0.3, -1.22]];
const TIP_X = 2.3; // tâm khối động cơ mút cánh
/** Góc chụm vào trong của động cơ mút cánh (rad): đuôi chĩa vào tâm, trục gặp nhau ở xa phía sau. */
const TIP_TOE = 0.14;

/** Kính buồng lái vàng (phủ kim loại chống chói): vật liệu riêng của tiêm kích, dùng chung cho cả hai phe. */
let goldGlass: THREE.MeshStandardMaterial | null = null;

export function buildFalcon(p: Palette): Rig {
  goldGlass ??= new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.2, metalness: 0.7, emissive: 0xa86400, emissiveIntensity: 0.75, flatShading: true });
  const frame = group();
  const add = (...o: THREE.Object3D[]) => frame.add(...o);
  const both = (f: (sx: number) => void) => [1, -1].forEach(f);

  // ================================================================ 1. THÂN: mũi dài nhọn, gờ sườn sắc
  const body = part(
    "Thân máy bay",
    facets(
      [
        [0, 0.03, 3.05], // mũi
        [0.3, 0.0, 1.6], [0.38, 0.03, 0.55], [0.4, 0.02, -1.2], [0.3, 0.04, -1.78], // gờ sườn
        [0, 0.36, 1.25], [0, 0.42, 0.7], [0, 0.34, -0.4], [0, 0.24, -1.6], // sống lưng
        [0, -0.18, 1.6], [0, -0.26, -0.6], [0.26, -0.18, 0.2], [0, -0.12, -1.78] // bụng
      ],
      p.hull,
      true
    )
  );
  add(body);
  const { at, skin, line } = surfaceTools(frame, [body]);
  add(part("Mũi radar", facets([[0, 0.03, 3.08], [0.11, 0.01, 2.55], [0, 0.11, 2.5], [0, -0.07, 2.55]], p.hullDark, true)));
  // Sống lưng tối chạy suốt từ mũi tới đuôi (tương phản với hai bên sáng)
  add(skin("Sống lưng tối", [[-0.1, 2.45], [0.1, 2.45], [0.2, 1.8], [0.2, -1.55], [-0.2, -1.55], [-0.2, 1.8]], p.hullDark, { lift: 0.015 }));
  add(line("Sọc lưng (màu phe)", [[0, -0.15], [0, -1.45]], p.team, { w: 0.1, lift: 0.03 }));

  // Buồng lái kính vàng, khung giữa; cầu cảm biến hồng ngoại ngay trước kính
  const glass: P3[] = [];
  for (const [x, z, h] of [[0, 1.85, 0.04], [0.17, 1.45, 0.04], [0.18, 0.85, 0.04], [0, 0.5, 0.04], [0, 1.2, 0.17], [0.1, 1.0, 0.15]] as const) {
    glass.push(at(x, z, "top", h), at(x, z, "top", -0.02));
  }
  add(part("Buồng lái (kính vàng)", facets(glass, goldGlass, true)));
  add(line("Khung kính", [[0, 1.6], [0, 0.65]], p.metal, { w: 0.04, lift: 0.11 }));
  const [ix, iy, iz] = at(0.12, 2.05, "top", 0.03);
  add(part("Cầu cảm biến", group(sphere(0.06, p.glass, ix, iy, iz, 8), box(0.1, 0.04, 0.12, p.hullDark, ix, iy - 0.03, iz))));

  // Cửa hút gió miệng cá mập: mép trên chìa ra trước, miệng tối vát chéo; vạch màu phe chéo hai bên thân
  both((sx) => {
    const intake: P3[] = [[0.3, -0.16, 0.6], [0.66, -0.14, 0.55], [0.3, 0.18, 0.92], [0.62, 0.16, 0.82], [0.32, -0.16, -0.9], [0.56, -0.12, -0.9], [0.32, 0.16, -0.9], [0.52, 0.14, -0.9]];
    add(part("Cửa hút gió", facets(intake.map(([x, y, z]): P3 => [sx * x, y, z]), p.white)));
    const mouth: P3[] = [[0.32, -0.14, 0.62], [0.66, -0.12, 0.57], [0.32, 0.16, 0.94], [0.62, 0.14, 0.84], [0.36, -0.1, 0.5], [0.58, 0.1, 0.7]];
    add(part("Miệng hút gió", facets(mouth.map(([x, y, z]): P3 => [sx * x, y, z]), p.metal)));
    // dải màu phe chạy chéo hai bên thân (khai báo theo mặt hông: [z, y])
    add(skin("Dải chéo thân (màu phe)", [[0.45, 0.05], [-0.55, 0.13], [-0.55, 0.05], [0.45, -0.03]], p.team, { face: "right", mirror: sx < 0, lift: 0.02 }));
  });

  // ================================================================ 2. CÁNH XUÔI NGƯỢC + GỜ GỐC CÁNH + ĐUÔI
  const engines: THREE.Mesh[] = [];
  both((sx) => {
    const m = sx < 0;
    add(part("Cánh chính", wingShape(WING, 0.08, p.hull, m)));
    add(part("Mặt cánh (trắng)", wingShape([[0.45, -0.08], [1.1, 0.2], [1.95, 0.46], [1.95, 0.22], [0.45, -1.0]], 0.09, p.white, m)));
    add(part("Mép trước cánh tối", wingShape([[0.3, 0.0], [1.18, 0.3], [1.15, 0.24], [0.33, -0.06]], 0.095, p.hullDark, m)));
    add(part("Mép trước cánh tối", wingShape([[1.22, 0.2], [2.12, 0.62], [2.1, 0.55], [1.24, 0.14]], 0.095, p.hullDark, m)));
    // vạch màu phe chạy chéo kiểu tia chớp trên mặt cánh trắng
    add(part("Tia chớp cánh (màu phe)", wingShape([[0.55, -0.55], [1.25, -0.15], [1.15, -0.05], [1.92, 0.33], [1.92, 0.24], [1.1, -0.17], [1.2, -0.27], [0.55, -0.67]], 0.1, p.team, m)));
    // gờ gốc cánh (LERX): tấm vát mỏng dọc thân từ gốc cánh lên cạnh buồng lái, như vai gồ
    const lerx = part("Gờ gốc cánh", wingShape([[0.2, 1.9], [0.48, 0.9], [0.72, 0.2], [0.32, -0.1], [0.24, 1.0]], 0.05, p.hull, m));
    lerx.position.y = 0.17;
    add(lerx);
    // cánh mũi to vát nhọn, mút màu phe
    add(part("Cánh mũi", wingShape([[0.32, 1.62], [1.05, 1.1], [1.05, 0.95], [0.32, 1.2]], 0.05, p.hullDark, m)));
    add(part("Mút cánh mũi (màu phe)", wingShape([[0.85, 1.24], [1.05, 1.1], [1.05, 0.95], [0.85, 1.0]], 0.055, p.team, m)));
    add(part("Cánh đuôi ngang", wingShape([[0.32, -1.25], [1.12, -1.6], [1.12, -1.82], [0.32, -1.82]], 0.05, p.hull, m)));

    // đuôi đứng cao, chếch mạnh: thân màu phe, mút tối, đèn định vị phát sáng ở đỉnh
    const fin = part("Đuôi đứng", group(
      part("Đuôi đứng (màu phe)", wingShape([[0, -0.6], [0, -1.78], [1.02, -2.0], [1.02, -1.62]], 0.06, p.team, false)),
      part("Mút đuôi tối", wingShape([[0.8, -1.5], [0.8, -1.95], [1.03, -2.01], [1.03, -1.62]], 0.065, p.hullDark, false)),
      part("Đèn định vị", box(0.06, 0.06, 0.1, p.teamGlow, 1.06, 0, -1.8))
    ));
    fin.rotation.z = Math.PI / 2 - sx * 0.45;
    fin.position.set(sx * 0.3, 0.18, 0);
    add(fin);
    // vây bụng nhỏ dưới đuôi, chếch xuống ra ngoài
    const ventral = part("Vây bụng", wingShape([[0, -1.15], [0, -1.7], [0.36, -1.78], [0.36, -1.5]], 0.04, p.hullDark, false));
    ventral.rotation.z = -Math.PI / 2 + sx * 0.4;
    ventral.position.set(sx * 0.22, -0.12, 0);
    add(ventral);

    // ================================================================ ĐỘNG CƠ MÚT CÁNH: mũi vát nhọn, chụm đuôi vào tâm
    const tip = group();
    tip.position.set(sx * TIP_X, 0, 0.1);
    tip.rotation.y = sx * TIP_TOE;
    const pod: P3[] = [
      [-0.19, -0.13, 0.42], [0.19, -0.13, 0.42], [-0.17, 0.13, 0.42], [0.17, 0.13, 0.42],
      [-0.21, -0.15, -0.5], [0.21, -0.15, -0.5], [-0.21, 0.16, -0.5], [0.21, 0.16, -0.5]
    ];
    tip.add(part("Động cơ mút cánh", facets(pod, p.white)));
    tip.add(part("Mũi động cơ (màu phe)", facets([[-0.19, -0.13, 0.42], [0.19, -0.13, 0.42], [-0.17, 0.13, 0.42], [0.17, 0.13, 0.42], [0, 0.02, 0.82]], p.team)));
    tip.add(part("Cửa hút gió mút cánh", facets([[-0.12, -0.15, 0.35], [0.12, -0.15, 0.35], [-0.1, -0.15, 0.05], [0.1, -0.15, 0.05], [0, -0.22, 0.2]], p.metal)));
    for (const z of [0.2, 0.0, -0.2]) tip.add(part("Khe tản nhiệt", box(0.03, 0.17, 0.11, p.hullDark, sx * 0.22, 0, z)));
    tip.add(part("Sọc động cơ tối", box(0.43, 0.04, 0.6, p.hullDark, 0, 0.165, -0.15)));
    const [nz, g] = nozzle(p, 0.13, -0.5);
    tip.add(nz, g);
    add(tip);
    engines.push(g);
  });
  // Đuôi: 2 động cơ phản lực cạnh nhau (tổng 4 luồng lửa: 2 ở đuôi, 2 ở mút cánh)
  for (const sx of [-1, 1]) {
    const [nz, g] = nozzle(p, 0.16, -1.78);
    nz.position.x = sx * 0.18;
    g.position.x = sx * 0.18;
    add(nz, g);
    engines.push(g);
  }

  // ================================================================ 3. VŨ KHÍ + CÀNG
  // 2 tên lửa nổ to có cánh đuôi, treo trên giá nặng dưới cánh (vũ khí phụ): bắn quả nào thì quả đó biến mất
  const pylons: THREE.Object3D[] = [];
  for (const x of [-1.35, 1.35]) {
    add(part("Giá treo", facets([[x - 0.04, -0.04, 0.3], [x + 0.04, -0.04, 0.3], [x - 0.04, -0.04, -0.3], [x + 0.04, -0.04, -0.3], [x, -0.14, 0.2], [x, -0.14, -0.25]], p.hullDark)));
    const msl = part("Tên lửa nổ dưới cánh", missileMesh(p, 0.78, 0.065));
    (msl.children[2] as THREE.Object3D).visible = false; // luồng lửa đuôi chỉ dùng khi bay
    for (const a of [0, Math.PI / 2]) {
      const f = box(0.26, 0.012, 0.12, p.white, 0, 0, -0.32);
      f.rotation.z = a;
      msl.add(part("Cánh đuôi tên lửa", f));
    }
    msl.position.set(x, -0.21, 0.0);
    add(msl);
    pylons.push(msl);
  }
  // pháo đôi 30mm ở hai gốc cánh (cách nhau ~1,6 m như trong sim), ụ che nòng, chớp lửa đầu nòng
  const guns: THREE.Mesh[] = [];
  for (const x of [-0.8, 0.8]) {
    add(part("Ụ pháo", facets([[x - 0.06, -0.01, 0.05], [x + 0.06, -0.01, 0.05], [x - 0.06, -0.11, 0.05], [x + 0.06, -0.11, 0.05], [x, -0.06, 0.62]], p.hullDark)));
    add(part("Nòng pháo 30mm", cyl(0.04, 0.04, 0.5, p.metal, 6, x, -0.06, 0.75).rotateX(Math.PI / 2)));
    const f = muzzleFlash(0.55, p.flash);
    f.position.set(x, -0.06, 1.2);
    add(f);
    guns.push(f);
  }
  const gear = group(gearLeg(p, 0, 1.3, 0.5, 0.1), gearLeg(p, -0.5, -0.45, 0.5, 0.12), gearLeg(p, 0.5, -0.45, 0.5, 0.12));
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
    3.1
  );
  rig.setAmmo = (n) => {
    // sim bắn quả ở trục +x của thân trước (pylons[1], x = +1,35), rồi tới quả bên kia
    pylons[1]!.visible = n >= 2;
    pylons[0]!.visible = n >= 1;
  };
  return rig;
}

/**
 * Ống xả phản lực hầm hố tại z (ống chĩa về −z): thân ống, vành 8 cánh hoa loe ra, vòng phát sáng màu phe bên trong,
 * và luồng lửa (trả riêng để aircraftRig co giãn theo ga).
 */
function nozzle(p: Palette, r: number, z: number): [THREE.Group, THREE.Mesh] {
  const g = part("Ống xả phản lực", group());
  const body = tubeZ(r * 0.95, r * 1.1, 0.26, p.metal, 12);
  body.position.z = z - 0.1;
  g.add(body);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const petal = part("Cánh hoa ống xả", box(r * 0.62, 0.025, 0.16, p.hullDark));
    petal.position.set(Math.sin(a) * r * 1.08, Math.cos(a) * r * 1.08, z - 0.27);
    petal.rotation.set(0, 0, -a);
    petal.rotateX(0.25); // loe nhẹ ra ngoài: mép sau cánh hoa chĩa ra xa trục
    g.add(petal);
  }
  const ring = part("Vòng phát sáng", cyl(r * 0.78, r * 0.78, 0.03, p.teamGlow, 12, 0, 0, z - 0.22).rotateX(Math.PI / 2));
  g.add(ring);
  const flame = engineGlow(p, r * 0.8, 0.9);
  flame.position.z = z - 0.3;
  return [g, flame];
}
