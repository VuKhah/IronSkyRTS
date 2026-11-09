import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, group, part, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation } from "./shared";

/**
 * Nhà Máy Máy Bay: nhà chứa mái vòm (nửa trụ nằm dọc z), cửa lớn hai cánh phía trước (+z) trượt sang hai bên khi đang đúc,
 * sân đỗ trước cửa có vạch dẫn (máy bay mới lăn ra đây rồi cất cánh thẳng ra trước, khớp sim), xưởng động cơ bên hông,
 * cột ống gió và đèn hiệu trên đỉnh vòm.
 */
export function buildAircraftFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["aircraft-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const R = 3.0;
  const L = 5.4;
  const cx = -0.6;
  const DOOR_SLIDE = 1.25; // mỗi cánh trượt sang bên chừng này (m): đủ cho Falcon sải cánh 5,1 m lăn ra
  const zc = -HZ + 0.5 + L / 2; // vòm sát mép sau, sân đỗ phía trước
  // nửa trụ: trục Y của CylinderGeometry xoay thành trục Z; góc PI/2..3PI/2 là nửa phía trên sau khi xoay.
  // Nhóm vật liệu của trụ: [thân, nắp trên, nắp dưới]; nắp trên quay ra trước (+z) = lòng nhà chứa tối, lộ ra khi mở cửa.
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, false, Math.PI / 2, Math.PI), [p.hull, p.rubber, p.hull]);
  vault.castShadow = vault.receiveShadow = true;
  vault.rotation.x = Math.PI / 2;
  vault.position.set(cx, 0.25, zc);
  root.add(part("Mái vòm nhà chứa", vault));
  for (const k of [-0.5, 0, 0.5]) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.16, 20, 1, true, Math.PI / 2, Math.PI), k === 0 ? p.team : p.hullDark);
    rib.castShadow = true;
    rib.rotation.x = Math.PI / 2;
    rib.position.set(cx, 0.25, zc + k * (L - 0.4));
    root.add(part(k === 0 ? "Vành mái (màu phe)" : "Vành mái", rib));
  }
  // cửa hai cánh trượt: mỗi cánh gồm 4 dải cao thấp dần ra ngoài để ôm theo vòm
  const front = zc + L / 2 + 0.05;
  const leaves: { g: THREE.Group; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    const g = part(dir < 0 ? "Cánh cửa trái" : "Cánh cửa phải", group());
    [2.9, 2.65, 2.2, 1.4].forEach((h, i) => g.add(box(0.72, h, 0.12, p.teamDark, dir * (0.36 + i * 0.72), h / 2, 0)));
    g.add(part("Sọc chân cửa", box(2.88, 0.1, 0.14, p.warning, dir * 1.44, 0.15, 0.02)));
    g.position.set(cx, 0.25, front + 0.08);
    leaves.push({ g, dir });
    root.add(g);
  }
  // ray trượt của cửa: chạy ngang trước mặt tiền, chìa ra hai bên đủ chỗ cho cánh cửa mở
  root.add(part("Ray cửa", box(2 * (2.88 + DOOR_SLIDE) - 0.4, 0.06, 0.18, p.metal, cx, 0.28, front + 0.08)));
  // sân đỗ trước cửa: vạch dẫn vàng theo hướng cất cánh
  const apronZ0 = front + 0.1;
  const apronMid = (apronZ0 + HZ) / 2;
  const apronLen = HZ - apronZ0;
  root.add(part("Sân đỗ", box(5.4, 0.04, apronLen, p.concrete, cx, 0.27, apronMid)));
  root.add(part("Vạch dẫn", box(0.14, 0.03, apronLen - 0.2, p.warning, cx, 0.3, apronMid)));
  for (const x of [cx - 2.5, cx + 2.5]) root.add(part("Vạch mép sân", box(0.1, 0.03, apronLen - 0.2, p.white, x, 0.3, apronMid)));
  // xưởng động cơ bên hông phải
  const sx = HX - 1.2;
  root.add(part("Xưởng động cơ", box(1.8, 2.2, 3.6, p.hullDark, sx, 0.25 + 1.1, zc - 0.4)));
  root.add(part("Dải màu phe", box(1.84, 0.18, 3.64, p.team, sx, 0.25 + 1.9, zc - 0.4)));
  root.add(part("Cửa sổ", box(0.05, 0.5, 2.4, p.glass, sx - 0.92, 1.6, zc - 0.4)));
  root.add(part("Ống thông gió", cyl(0.2, 0.24, 1.0, p.metal, 8, sx + 0.3, 0.25 + 2.7, zc - 1.6)));
  // cột ống gió ở góc trước bên phải
  const sock = part("Ống gió", group());
  const sockTube = cyl(0.12, 0.05, 0.9, p.warning, 8, 0, 0, 0.45);
  sockTube.rotation.x = Math.PI / 2;
  sock.add(sockTube);
  sock.position.set(HX - 0.6, 0.25 + 2.6, HZ - 0.8);
  root.add(part("Cột ống gió", cyl(0.04, 0.04, 2.6, p.metal, 4, HX - 0.6, 0.25 + 1.3, HZ - 0.8)), sock);
  // đèn hiệu xoay trên đỉnh vòm
  const beacon = part("Đèn hiệu", group(box(0.5, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0)));
  beacon.position.set(cx, 0.25 + R + 0.25, zc);
  root.add(beacon);
  let doorT = 0;
  return rig(root, [WORK], Math.max(HX, HZ) + 0.6, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2, dt);
      for (const l of leaves) l.g.position.x = cx + l.dir * doorT * DOOR_SLIDE;
      if (on) beacon.rotation.y += dt * 3;
      sock.rotation.y = Math.sin(t * 0.7) * 0.4;
    }
  ]);
}
