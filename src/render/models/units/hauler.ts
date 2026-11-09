/** Mô hình Xe Vận Tải (`hauler`). */
import * as THREE from "three";
import { approach, box, cyl, group, part, sphere, tubeZ, wheel, type Palette, type Rig } from "../kit";
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
  body.add(
    box(1.8, 0.35, 4.3, p.hullDark, 0, 0.72, 0),
    part("Cabin", box(1.8, 1.05, 1.25, p.hull, 0, 1.4, 1.45)),
    part("Nóc cabin (màu phe)", box(1.82, 0.12, 1.27, p.team, 0, 1.97, 1.45)),
    part("Kính cabin", box(1.5, 0.42, 0.06, p.glass, 0, 1.6, 2.09)),
    part("Cản trước", box(1.9, 0.18, 0.15, p.warning, 0, 0.78, 2.2)),
    part("Ống xả", cyl(0.06, 0.06, 0.8, p.metal, 6, 0.75, 2.2, 0.85)),
    part("Đèn báo", sphere(0.09, p.warning, -0.6, 2.08, 1.45, 6)),
    // thùng hàng
    part("Thùng hàng", group(
      box(1.9, 0.12, 2.6, p.hullDark, 0, 0.98, -0.75),
      box(0.1, 0.75, 2.6, p.team, -0.95, 1.4, -0.75),
      box(0.1, 0.75, 2.6, p.team, 0.95, 1.4, -0.75),
      box(1.9, 0.75, 0.1, p.team, 0, 1.4, -2.05),
      box(1.9, 0.75, 0.1, p.hull, 0, 1.4, 0.55)
    ))
  );
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
