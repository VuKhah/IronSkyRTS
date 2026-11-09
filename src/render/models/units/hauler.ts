/** Mô hình Xe Vận Tải (`hauler`). */
import * as THREE from "three";
import { approach, box, cyl, facets, group, part, sphere, tubeZ, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig } from "./ground";

let cargoMats: { ore: THREE.MeshStandardMaterial; tank: THREE.MeshStandardMaterial; oil: THREE.MeshStandardMaterial; scrap: THREE.MeshStandardMaterial } | null = null;

export function buildHauler(p: Palette): Rig {
  cargoMats ??= {
    ore: new THREE.MeshStandardMaterial({ color: 0x8796ad, roughness: 0.45, metalness: 0.65, flatShading: true }),
    tank: new THREE.MeshStandardMaterial({ color: 0x565d66, roughness: 0.42, metalness: 0.6 }),
    oil: new THREE.MeshStandardMaterial({ color: 0x8a4fd0, roughness: 0.5, metalness: 0.2 }),
    scrap: new THREE.MeshStandardMaterial({ color: 0x3b3733, roughness: 0.95, metalness: 0.2, flatShading: true })
  };
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.45, 0.05, -1.3]) {
      const w = wheel(0.44, 0.36, p.rubber, p.metal);
      w.position.set(side * 1.0, 0.44, z);
      body.add(w);
      wheels.push({ g: w, r: 0.44 });
    }
  // khung gầm
  body.add(part("Khung gầm", box(1.6, 0.3, 4.3, p.hullDark, 0, 0.72, 0)));

  // cabin vát: kính nghiêng, nóc thu lại, chân cabin rộng
  body.add(
    part("Cabin", facets([[0.9, 0.86, 0.82], [0.92, 0.86, 2.1], [0.9, 1.36, 2.18], [0.72, 1.98, 1.72], [0.76, 2.0, 0.84], [0.9, 1.4, 0.82]], p.hull, true)),
    part("Nóc cabin (màu phe)", facets([[0.7, 2.0, 0.86], [0.68, 2.0, 1.68], [0.6, 2.07, 1.6], [0.62, 2.07, 0.94]], p.team, true)),
    part("Thanh chắn nắng", box(1.42, 0.05, 0.22, p.hullDark, 0, 1.97, 1.82))
  );
  const windshield = part("Kính cabin", box(1.3, 0.62, 0.04, p.glass, 0, 1.67, 1.955));
  windshield.rotation.x = -0.63;
  const pillar = part("Thanh giữa kính", box(0.06, 0.64, 0.05, p.hullDark, 0, 1.67, 1.965));
  pillar.rotation.x = -0.63;
  body.add(windshield, pillar);

  // đầu xe: lưới tản nhiệt, đèn pha, cản có vạch cảnh báo, móc kéo
  body.add(part("Lưới tản nhiệt", box(1.14, 0.38, 0.05, p.hullDark, 0, 1.1, 2.17)));
  for (let i = 0; i < 5; i++) body.add(part("Thanh lưới", box(1.04, 0.035, 0.03, p.metal, 0, 0.96 + i * 0.07, 2.2)));
  body.add(part("Cản trước", box(1.9, 0.2, 0.16, p.warning, 0, 0.78, 2.22)));
  for (let i = 0; i < 6; i++) {
    const stripe = part("Vạch cảnh báo", box(0.13, 0.205, 0.02, p.hullDark, -0.8 + i * 0.32, 0.78, 2.305));
    stripe.rotation.z = 0.5;
    body.add(stripe);
  }

  for (const side of [-1, 1]) {
    const sideGlass = part("Kính hông", box(0.04, 0.34, 0.58, p.glass, side * 0.83, 1.64, 1.28));
    sideGlass.rotation.z = side * 0.24;
    body.add(
      sideGlass,
      part("Đèn pha", box(0.26, 0.15, 0.05, p.glass, side * 0.72, 1.1, 2.19)),
      part("Viền đèn pha", box(0.32, 0.21, 0.03, p.metal, side * 0.72, 1.1, 2.16)),
      part("Móc kéo", box(0.09, 0.12, 0.14, p.metal, side * 0.5, 0.62, 2.28)),
      part("Sọc cửa (màu phe)", box(0.03, 0.11, 0.95, p.team, side * 0.915, 1.18, 1.36)),
      part("Bậc lên cabin", box(0.24, 0.05, 0.5, p.metal, side * 0.98, 0.56, 0.74)),
      part("Gương chiếu hậu", group(box(0.26, 0.03, 0.03, p.metal, side * 1.0, 1.72, 1.7), box(0.05, 0.3, 0.16, p.hullDark, side * 1.13, 1.64, 1.7))),
      // chắn bùn
      part("Chắn bùn", box(0.46, 0.07, 1.02, p.hullDark, side * 1.0, 0.93, 1.45)),
      part("Chắn bùn", box(0.46, 0.07, 2.42, p.hullDark, side * 1.0, 0.93, -0.62)),
      // bên hông: bình nhiên liệu, hộp đồ
      part("Hộp đồ", group(box(0.2, 0.3, 0.46, p.hull, side * 0.92, 0.72, 0.72), box(0.02, 0.05, 0.3, p.metal, side * 1.03, 0.76, 0.72)))
    );
  }

  // sau cabin: khung chắn, ống xả, đèn nóc
  body.add(
    part("Ống xả", cyl(0.07, 0.07, 1.2, p.metal, 8, 0.7, 2.05, 0.74)),
    part("Tấm chắn nhiệt ống xả", cyl(0.1, 0.1, 0.5, p.hullDark, 8, 0.7, 1.95, 0.74)),
    part("Đèn báo", sphere(0.09, p.warning, -0.5, 2.12, 1.25, 6)),
    part("Ăng-ten", cyl(0.015, 0.02, 0.9, p.metal, 4, -0.62, 2.5, 0.92)),
    part("Khung chắn sau cabin", group(
      box(0.08, 0.95, 0.08, p.metal, -0.86, 1.55, 0.62),
      box(0.08, 0.95, 0.08, p.metal, 0.86, 1.55, 0.62),
      box(1.8, 0.08, 0.08, p.metal, 0, 2.02, 0.62),
      box(1.8, 0.05, 0.05, p.metal, 0, 1.8, 0.62),
      box(1.8, 0.05, 0.05, p.metal, 0, 1.6, 0.62)
    ))
  );

  // thùng hàng kiểu xe tải quân sự: thành màu phe, cột và ray thép, cửa sau có vạch cảnh báo
  const bed = group(
    box(1.9, 0.12, 2.6, p.hullDark, 0, 0.98, -0.75),
    box(0.1, 0.75, 2.6, p.team, -0.95, 1.4, -0.75),
    box(0.1, 0.75, 2.6, p.team, 0.95, 1.4, -0.75),
    box(1.9, 0.75, 0.1, p.teamDark, 0, 1.4, -2.05),
    box(1.9, 0.75, 0.1, p.hull, 0, 1.4, 0.55)
  );
  part("Thùng hàng", bed);
  body.add(bed);
  for (const side of [-1, 1]) {
    for (const z of [0.5, -0.1, -0.75, -1.4, -2.0]) body.add(part("Cột thùng", box(0.08, 0.84, 0.1, p.hullDark, side * 1.02, 1.42, z)));
    body.add(
      part("Ray trên thùng", box(0.07, 0.07, 2.66, p.metal, side * 1.0, 1.81, -0.75)),
      part("Ray giữa thùng", box(0.04, 0.04, 2.6, p.hullDark, side * 1.02, 1.42, -0.75)),
      part("Đèn hậu", box(0.3, 0.13, 0.04, p.teamGlow, side * 0.62, 1.18, -2.12))
    );
  }
  body.add(part("Thanh khóa cửa sau", box(1.7, 0.05, 0.05, p.metal, 0, 1.55, -2.12)));
  for (let i = 0; i < 4; i++) {
    const stripe = part("Vạch cảnh báo sau", box(0.16, 0.2, 0.02, p.warning, -0.18 + i * 0.12 - 0.06, 1.18, -2.11));
    stripe.rotation.z = 0.6;
    body.add(stripe);
  }
  // quặng Sắt
  const ore = group();
  for (const [x, z, s] of [[-0.4, -0.3, 0.42], [0.35, -0.9, 0.48], [-0.2, -1.4, 0.38], [0.3, -0.1, 0.33], [0, -0.8, 0.5]] as const) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), cargoMats.ore);
    m.position.set(x, 1.15 + s * 0.4, z);
    m.rotation.set(x * 3, z * 2, s * 5);
    m.castShadow = true;
    ore.add(m);
  }
  // bồn Dầu: bồn thép nằm dọc trên thùng hàng, như xe bồn thật, có đai giữ, sọc màu Dầu và nắp nạp trên đỉnh
  const TANK_Y = 1.68;
  const TANK_Z = -0.75;
  const TANK_R = 0.6;
  const tankBody = tubeZ(TANK_R, TANK_R, 2.0, cargoMats.tank, 16);
  tankBody.position.set(0, TANK_Y, TANK_Z);
  const tank = group(tankBody);
  for (const end of [-1, 1]) {
    const cap = sphere(TANK_R, cargoMats.tank, 0, TANK_Y, TANK_Z + end * 1.0, 16);
    cap.scale.z = 0.36;
    tank.add(part("Chỏm bồn", cap));
  }
  for (const z of [-1.0, 0, 1.0]) {
    const band = tubeZ(TANK_R + 0.025, TANK_R + 0.025, 0.1, p.hullDark, 16);
    band.position.set(0, TANK_Y, TANK_Z + z);
    tank.add(part("Đai giữ bồn", band));
  }
  const stripe = tubeZ(TANK_R + 0.012, TANK_R + 0.012, 0.42, cargoMats.oil, 16);
  stripe.position.set(0, TANK_Y, TANK_Z + 0.5);
  tank.add(
    part("Sọc màu Dầu", stripe),
    part("Nắp nạp dầu", group(cyl(0.2, 0.22, 0.12, p.metal, 10, 0, TANK_Y + TANK_R + 0.05, TANK_Z - 0.5), cyl(0.05, 0.05, 0.1, p.warning, 6, 0, TANK_Y + TANK_R + 0.16, TANK_Z - 0.5))),
    part("Giá đỡ bồn", group(box(1.3, 0.22, 0.28, p.hullDark, 0, 1.13, TANK_Z - 0.75), box(1.3, 0.22, 0.28, p.hullDark, 0, 1.13, TANK_Z + 0.75)))
  );
  // xác xe đang kéo về: tấm thép cháy đen, bánh xe gãy chất lệch trên thùng
  const scrap = group();
  for (const [x, y, z, w, h, d, rx, rz] of [
    [0, 1.3, -0.9, 1.5, 0.45, 1.7, 0.18, -0.12],
    [-0.35, 1.7, -1.3, 0.9, 0.35, 0.8, -0.3, 0.4],
    [0.4, 1.62, -0.35, 0.6, 0.5, 0.6, 0.5, 0.2]
  ] as const) {
    const m = box(w, h, d, cargoMats.scrap, x, y, z);
    m.rotation.set(rx, rx * 2, rz);
    scrap.add(m);
  }
  const brokenWheel = wheel(0.4, 0.3, cargoMats.scrap, cargoMats.scrap);
  brokenWheel.position.set(-0.45, 1.55, -0.2);
  brokenWheel.rotation.z = 1.1;
  scrap.add(brokenWheel);
  // cần cẩu nhỏ phía sau thùng: gập nằm dọc thành thùng khi không dùng, vươn ra sau và nhấp nhô khi đang cẩu xác
  const CRANE_REST = 2.95;
  const crane = group(box(0.12, 0.12, 1.7, p.warning, 0, 0, -0.85), box(0.08, 0.35, 0.08, p.metal, 0, -0.2, -1.7));
  crane.position.set(0.72, 1.85, -1.95);
  crane.rotation.x = CRANE_REST;
  body.add(part("Chân cần cẩu", cyl(0.14, 0.18, 0.5, p.hullDark, 8, 0.72, 1.6, -1.95)));
  part("Quặng Sắt", ore);
  part("Bồn Dầu", tank);
  part("Xác đang kéo về", scrap);
  part("Cần cẩu trục vớt", crane);
  ore.visible = tank.visible = scrap.visible = false;
  body.add(ore, tank, scrap, crane);
  return vehicleRig(
    "hauler",
    p,
    { body, wheels, turret: group(), gun: group(), barrels: [], muzzles: [group()], flashes: [], spinners: [], aimPitch: 0, recoil: 0 },
    2.8,
    [
      { id: "load", label: "Chở Sắt" },
      { id: "loadOil", label: "Chở Dầu" },
      { id: "scrap", label: "Chở xác" },
      { id: "crane", label: "Cẩu xác" }
    ],
    (dt, t, a) => {
      // xác chất trên thùng thì không còn chỗ cho quặng hiện ra (quặng vẫn được chở, chỉ là không thấy)
      scrap.visible = a.has("scrap");
      ore.visible = a.has("load") && !scrap.visible;
      tank.visible = a.has("loadOil") && !a.has("load") && !scrap.visible;
      crane.rotation.x = approach(crane.rotation.x, a.has("crane") ? 0.45 + Math.sin(t * 2.2) * 0.18 : CRANE_REST, 4, dt);
    },
    [{ id: "move", label: "Di chuyển" }]
  );
}
