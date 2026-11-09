import * as THREE from "three";
import { BUILDINGS, PAD_OFFSETS, type Faction } from "../../../sim/content";
import { box, cyl, group, part, sphere, type Palette, type Rig } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig } from "./shared";

export function buildAirfield(p: Palette, faction: Faction, showcase: boolean): Rig {
  // Bố cục (khớp PAD_OFFSETS trong sim): đường băng dọc trục z ở giữa, 2 dãy × 3 ô đáp hai bên; máy bay đậu quay mũi
  // về +z (hướng cất cánh). Đài kiểm soát + bồn dầu ở cuối đường băng phía sau, không chắn đường cất cánh.
  // Sân Đáp chỉ là nơi cất / hạ cánh, nạp dầu, sửa chữa; máy bay đúc ở Nhà Máy Máy Bay (buildAircraftFactory).
  const [HX, HZ] = BUILDINGS.airfield.half;
  const root = group(part("Nền sân", box(HX * 2, 0.18, HZ * 2, p.concreteDark, 0, 0.09, 0)));
  const RUNWAY_W = 3.0;
  const RUNWAY_Z0 = -HZ + 2.3; // đầu đường băng phía sau (sau đó là sân đài kiểm soát)
  const runwayLen = HZ - RUNWAY_Z0;
  const runwayMid = (HZ + RUNWAY_Z0) / 2;
  // Đường băng: mặt bê tông sáng + 2 vạch trắng dọc + vạch ngưỡng đầu đường băng phía trước
  root.add(part("Đường băng", box(RUNWAY_W, 0.04, runwayLen, p.concrete, 0, 0.2, runwayMid)));
  for (const x of [-0.55, 0.55]) root.add(part("Vạch đường băng", box(0.16, 0.03, runwayLen - 0.6, p.white, x, 0.23, runwayMid)));
  for (let k = -2; k <= 2; k++) if (k !== 0) root.add(part("Vạch ngưỡng", box(0.18, 0.03, 0.9, p.white, k * 0.3 + Math.sign(k) * 0.45, 0.23, HZ - 0.7)));
  // Đèn đường băng hai bên mép: 4 vật liệu luân phiên tạo dải đèn chạy đuổi về phía cất cánh
  const lights: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) lights.push(p.teamGlow.clone() as THREE.MeshStandardMaterial);
  const LIGHTS = 9;
  for (let k = 0; k < LIGHTS; k++) {
    const z = RUNWAY_Z0 + 0.4 + (k * (runwayLen - 0.8)) / (LIGHTS - 1);
    for (const x of [-RUNWAY_W / 2 - 0.12, RUNWAY_W / 2 + 0.12]) root.add(part("Đèn đường băng", sphere(0.09, lights[k % 4]!, x, 0.26, z, 6)));
  }

  // 6 ô đáp (5,6 × 5,2 m, vừa Falcon sải cánh 5,1 m): mặt bê tông, viền trắng 4 góc, vòng tròn màu phe ở tâm,
  // số hiệu ô; vạch dẫn màu vàng từ ô ra đường băng
  PAD_OFFSETS.forEach(([x, z], i) => {
    const pad = part(`Ô đáp ${i + 1}`, group(box(5.6, 0.04, 5.2, p.concrete, 0, 0, 0)));
    pad.position.set(x, 0.2, z);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pad.add(box(0.9, 0.03, 0.12, p.white, cx * 2.3, 0.03, cz * 2.45), box(0.12, 0.03, 0.9, p.white, cx * 2.69, 0.03, cz * 2.1));
    }
    pad.add(part("Vòng tâm ô (màu phe)", cyl(0.75, 0.75, 0.025, p.team, 16, 0, 0.03, 0)), cyl(0.6, 0.6, 0.03, p.concrete, 16, 0, 0.035, 0));
    // số hiệu ô: i+1 vạch ngắn ở mép ngoài
    for (let k = 0; k <= i; k++) pad.add(box(0.1, 0.03, 0.42, p.white, -Math.sign(x) * (2.0 - k * 0.2), 0.03, -1.9));
    // trụ nạp dầu ở góc ngoài phía sau ô (sim nạp dầu cho máy bay ngay tại ô đậu)
    pad.add(part("Trụ nạp dầu", group(box(0.34, 0.6, 0.3, p.hullDark, 0, 0.32, 0), box(0.36, 0.1, 0.32, p.team, 0, 0.5, 0), cyl(0.03, 0.03, 0.5, p.rubber, 4, -Math.sign(x) * 0.2, 0.25, 0.1))).translateX(Math.sign(x) * 2.45).translateZ(-2.25));
    root.add(pad);
    const inner = x > 0 ? RUNWAY_W / 2 : -RUNWAY_W / 2;
    const edge = x > 0 ? x - 2.8 : x + 2.8;
    root.add(part("Vạch dẫn", box(Math.abs(edge - inner), 0.03, 0.12, p.warning, (edge + inner) / 2, 0.23, z + 1.2)));
  });

  // Đài kiểm soát không lưu ở ô trống cuối đường băng phía sau (giữa 2 ô đáp dãy sau)
  const tower = group(cyl(0.45, 0.55, 3.2, p.hull, 8, 0, 1.6, 0), cyl(0.85, 0.7, 0.7, p.glass, 8, 0, 3.5, 0), cyl(0.9, 0.9, 0.12, p.team, 8, 0, 3.9, 0));
  const beacon = group(box(0.5, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0));
  beacon.position.y = 4.15;
  tower.add(beacon);
  tower.position.set(0, 0, (RUNWAY_Z0 - HZ) / 2);
  tower.scale.setScalar(0.9);
  root.add(part("Đài kiểm soát", tower));
  root.add(part("Vạch cảnh báo sân sau", box(RUNWAY_W, 0.03, 0.2, p.warning, 0, 0.2, RUNWAY_Z0 - 0.15)));

  // Xưởng Mô Hình: trưng một chiếc Falcon đậu ở ô số 3 (trong trận thì máy bay thật đậu ở các ô)
  if (showcase) {
    const falcon = buildUnit("falcon", faction);
    const [fx, fz] = PAD_OFFSETS[2]!;
    falcon.root.position.set(fx, 0.2, fz);
    root.add(falcon.root);
  }
  return rig(root, [WORK], 10.5, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) beacon.rotation.y += dt * 3;
      lights.forEach((m, i) => (m.emissiveIntensity = on ? (Math.floor(t * 6) % 4 === i ? 2.4 : 0.5) : 0.3));
    }
  ]);
}
