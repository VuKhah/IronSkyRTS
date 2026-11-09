/**
 * Nhà Máy Máy Bay, bản 2 (09/11/2026), chân đế 8 × 8 m, theo phong cách của Tổng Hành Dinh.
 * Nhà chứa mái vòm rộng 7,2 m trên tường đứng 0,95 m; cửa xếp hai bên mở ra đủ cho Falcon sải cánh 5,2 m lăn ra sân đỗ rồi cất cánh
 * thẳng ra trước (khớp sim). Từ trên cao: dải nóc màu phe chạy dọc vòm. Sau nhà là xưởng động cơ và ống xả thử động cơ.
 * Bộ phận động: 6 tấm cửa xếp, đèn hiệu, ống gió.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, productionSignals, strut, BASE_Y, type P3 } from "./shared";

const R = 3.6;
const KNEE = 0.95;
const L = 5.0;
const ZC = -0.5;
/** Mép trong của cửa khi mở hết: mỗi bên 2,65 m, tổng 5,3 m, vừa Falcon sải cánh 5,2 m. */
const DOOR_OPEN = 2.65;
const STRIP_W = 1.2;
const VAULT_Y = BASE_Y + KNEE;

/** Tấm vòm phủ một góc quanh đỉnh (0 = đỉnh), dựng bằng trụ hở rồi xoay nằm dọc z như mái vòm. */
function vaultStrip(r: number, len: number, a0: number, a1: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10, 1, true, Math.PI + a0, a1 - a0), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.rotation.x = Math.PI / 2;
  return m;
}

export function buildAircraftFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["aircraft-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const front = ZC + L / 2;

  // ================================================================ 1. NHÀ CHỨA MÁI VÒM
  // nửa trụ: nhóm vật liệu [thân, nắp trên, nắp dưới]; nắp trên quay ra trước (+z) là lòng nhà chứa tối, lộ ra khi mở cửa
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24, 1, false, Math.PI / 2, Math.PI), [p.hull, p.rubber, p.hull]);
  vault.castShadow = vault.receiveShadow = true;
  vault.rotation.x = Math.PI / 2;
  vault.position.set(0, VAULT_Y, ZC);
  add(part("Mái vòm nhà chứa", vault));
  for (const sx of [-1, 1]) add(part("Tường đứng", box(0.16, KNEE, L, p.hull, sx * (R - 0.08), BASE_Y + KNEE / 2, ZC)));
  add(part("Vách sau", box(R * 2, KNEE, 0.16, p.hull, 0, BASE_Y + KNEE / 2, ZC - L / 2 + 0.08)));
  add(part("Lòng nhà chứa", box(R * 2 - 0.32, KNEE, 0.04, p.rubber, 0, BASE_Y + KNEE / 2, front)));
  for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.16, 24, 1, true, Math.PI / 2, Math.PI), p.hullDark);
    rib.castShadow = true;
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, VAULT_Y, ZC + k * (L - 0.2));
    add(part("Vành mái", rib));
  }
  const ridge = vaultStrip(R + 0.07, L - 0.1, -0.33, 0.33, p.team);
  ridge.position.set(0, VAULT_Y, ZC);
  add(part("Dải nóc (màu phe)", ridge));
  for (const sx of [-1, 1]) {
    const pane = vaultStrip(R + 0.07, L - 0.5, sx < 0 ? -0.7 : 0.42, sx < 0 ? -0.42 : 0.7, p.glass);
    pane.position.set(0, VAULT_Y, ZC);
    add(part("Cửa lấy sáng", pane));
  }

  // ================================================================ 2. CỬA XẾP: mỗi bên 3 tấm, xếp gọn vào hai mép khi đúc
  const topAt = (x: number) => KNEE + Math.sqrt(Math.max(0, R * R - x * x)) - 0.04;
  const leaves: { g: THREE.Group; x0: number; x1: number; dir: number; squash: number }[] = [];
  for (const dir of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const xa = i * STRIP_W;
      const xb = xa + STRIP_W;
      const pts: P3[] = [];
      for (const z of [0, 0.1]) pts.push([0, 0, z], [dir * STRIP_W, 0, z], [dir * STRIP_W, topAt(Math.min(xb, R)), z], [0, topAt(xa), z]);
      const g = part("Tấm cửa xếp", group(facets(pts, p.teamDark)));
      g.add(part("Sọc chân cửa", box(STRIP_W - 0.06, 0.12, 0.13, p.warning, dir * (STRIP_W / 2), 0.1, 0.05)));
      const x1 = DOOR_OPEN + i * 0.28;
      g.position.set(dir * xa, BASE_Y, front + 0.06 + i * 0.12);
      // khi xếp, tấm phải thấp xuống cho lọt dưới mái vòm ở mép
      leaves.push({ g, x0: xa, x1, dir, squash: topAt(Math.min(x1 + 0.34, R)) / topAt(xa) });
      add(g);
    }
  add(part("Ray cửa", box(R * 2 + 0.1, 0.06, 0.5, p.metal, 0, BASE_Y + 0.03, front + 0.25)));
  // tín hiệu đang đúc: thanh tiến độ dọc sống mái vòm, đèn lắp ráp sáng trong lòng nhà chứa, đèn chớp hai bên cửa
  const sig = productionSignals(p, L - 1);
  sig.bar.rotation.y = -Math.PI / 2;
  sig.bar.position.set(0, VAULT_Y + R + 0.14, ZC);
  add(sig.bar);
  add(part("Đèn lắp ráp (sáng khi đang đúc)", box(4.8, 3.0, 0.03, sig.glow, 0, BASE_Y + 1.6, front + 0.03)));
  for (const sx of [-1, 1]) add(part("Đèn cửa", sphere(0.16, sig.beacon, sx * (R + 0.08), BASE_Y + KNEE + 0.25, front + 0.1, 8)));

  // ================================================================ 3. SÂN ĐỖ
  const apronZ0 = front + 0.5;
  const apronLen = HZ - apronZ0;
  const apronMid = (apronZ0 + HZ) / 2;
  add(part("Sân đỗ", box(6.2, 0.04, apronLen, p.concrete, 0, BASE_Y + 0.02, apronMid)));
  add(part("Vạch dẫn", box(0.14, 0.03, apronLen - 0.2, p.warning, 0, BASE_Y + 0.05, apronMid)));
  for (const sx of [-1, 1]) add(part("Vạch mép sân", box(0.1, 0.03, apronLen - 0.2, p.white, sx * 2.9, BASE_Y + 0.05, apronMid)));

  // ================================================================ 4. XƯỞNG ĐỘNG CƠ VÀ ỐNG XẢ THỬ ĐỘNG CƠ SAU NHÀ
  const SHOP_Z = -3.5;
  add(part("Xưởng động cơ", box(5.6, 2.5, 0.96, p.hullDark, -0.9, BASE_Y + 1.25, SHOP_Z)));
  add(part("Mái xưởng động cơ (màu phe)", box(5.68, 0.12, 1.04, p.team, -0.9, BASE_Y + 2.56, SHOP_Z)));
  add(part("Cửa sổ xưởng động cơ", box(3.6, 0.5, 0.04, p.glass, -0.9, BASE_Y + 1.8, SHOP_Z - 0.49)));
  const STACK_X = 3.1;
  const STACK_TOP = 7.2;
  add(part("Ống xả thử động cơ", cyl(0.34, 0.42, STACK_TOP - BASE_Y, p.hullDark, 12, STACK_X, (STACK_TOP + BASE_Y) / 2, SHOP_Z)));
  add(part("Đai ống xả (màu phe)", cyl(0.38, 0.38, 0.26, p.team, 12, STACK_X, STACK_TOP - 0.45, SHOP_Z)));
  add(part("Miệng ống xả", cyl(0.38, 0.36, 0.14, p.metal, 12, STACK_X, STACK_TOP, SHOP_Z)));
  add(part("Ống dẫn nhiên liệu", strut([R + 0.14, BASE_Y + 0.5, ZC + 2.2], [R + 0.14, BASE_Y + 0.5, SHOP_Z + 0.5], 0.07, p.metal)));
  add(part("Ống dẫn nhiên liệu", strut([R + 0.14, BASE_Y + 0.5, SHOP_Z + 0.5], [STACK_X, BASE_Y + 0.5, SHOP_Z + 0.2], 0.07, p.metal)));

  // ================================================================ 5. ỐNG GIÓ, ĐÈN HIỆU
  const SOCK_X = HX - 0.45;
  const SOCK_Z = HZ - 1.3; // ống gió dài 1,1 m chĩa về trước, phải nằm trong chân đế
  const sock = part("Ống gió", group());
  const sockTube = cyl(0.14, 0.06, 1.1, p.warning, 8, 0, 0, 0.55);
  sockTube.rotation.x = Math.PI / 2;
  sock.add(sockTube);
  sock.position.set(SOCK_X, BASE_Y + 3.6, SOCK_Z);
  add(part("Cột ống gió", cyl(0.05, 0.05, 3.6, p.metal, 5, SOCK_X, BASE_Y + 1.8, SOCK_Z)), sock);
  const beacon = part("Đèn hiệu", group(box(0.6, 0.16, 0.16, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0)));
  beacon.position.set(0, VAULT_Y + R + 0.32, ZC);
  add(beacon);

  let doorT = 0;
  const built = rig(root, [WORK], 7.5, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2, dt);
      for (const l of leaves) {
        l.g.position.x = l.dir * (l.x0 + (l.x1 - l.x0) * doorT);
        l.g.scale.x = 1 - doorT * 0.72; // xếp lại thành tấm hẹp
        l.g.scale.y = 1 + (l.squash - 1) * doorT;
      }
      if (on) beacon.rotation.y += dt * 3;
      sock.rotation.y = Math.sin(t * 0.7) * 0.4;
    },
    sig.update
  ]);
  built.setLevel = sig.setLevel;
  return built;
}
