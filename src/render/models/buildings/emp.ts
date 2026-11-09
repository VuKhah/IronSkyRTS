/**
 * Tháp Xung Điện Từ, bản 2 (09/11/2026), chân đế 4 × 4 m, công sự.
 * Nét riêng: tháp cao nhất nhóm phòng thủ, 4 vây thép, 3 vòng cuộn dây trôi lên xuống, quả cầu năng lượng trên đỉnh, 4 bình tích điện ở chân.
 * Bộ phận động: 3 vòng cuộn, vòng xung phát ra khi bắn.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, FireClock, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, FIRE, rig, fortBase, oct, BASE_Y, type P3 } from "./shared";

const COL_TOP = 6.6;
const TIP_Y = 7.3;

export function buildEMP(p: Palette): Rig {
  const root = group(fortBase(p));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  add(part("Bệ bê tông", facets([...oct(1.72, 1.72, 0.5, BASE_Y), ...oct(1.3, 1.3, 0.38, 1.3)], p.concrete)));
  add(part("Viền bệ (màu phe)", facets([...oct(1.36, 1.36, 0.4, 1.3), ...oct(1.36, 1.36, 0.4, 1.46)], p.team)));
  add(part("Thân tháp", cyl(0.3, 0.55, COL_TOP - 1.46, p.hull, 12, 0, (COL_TOP + 1.46) / 2, 0)));
  add(part("Đai thân (màu phe)", cyl(0.42, 0.42, 0.16, p.team, 12, 0, 3.0, 0)));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const r0 = 0.3;
    const r1 = 1.0;
    const t = 0.06;
    const pts: P3[] = [];
    for (const off of [-t, t]) {
      const px = c * off;
      const pz = -s * off;
      pts.push([s * r0 + px, 1.46, c * r0 + pz], [s * r1 + px, 1.46, c * r1 + pz], [s * r0 + px, 4.4, c * r0 + pz]);
    }
    add(part("Vây thép", facets(pts, p.hullDark)));
    // bình tích điện ở 4 góc nền
    add(part("Bình tích điện", group(cyl(0.2, 0.2, 0.9, p.hullDark, 10, s * 1.75, BASE_Y + 0.45, c * 1.75), cyl(0.21, 0.17, 0.08, p.team, 10, s * 1.75, BASE_Y + 0.94, c * 1.75))));
  }
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  add(part("Cổ đỡ quả cầu", cyl(0.2, 0.32, 0.3, p.metal, 10, 0, COL_TOP + 0.1, 0)));
  add(part("Quả cầu năng lượng", sphere(0.72, glow, 0, TIP_Y, 0, 16)));

  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = part("Vòng cuộn dây", new THREE.Mesh(new THREE.TorusGeometry(1.25 - i * 0.2, 0.09, 8, 28), glow));
    r.rotation.x = Math.PI / 2;
    r.userData.base = 3.5 + i * 1.0;
    rings.push(r);
    add(r);
  }
  const pulseMat = new THREE.MeshBasicMaterial({ color: (glow.color as THREE.Color).getHex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), pulseMat);
  pulse.position.y = TIP_Y;
  add(pulse);
  const tip = group(); // mốc riêng cho điểm phát xung: quả cầu đứng yên nên bị gộp khi vào trận
  tip.position.y = TIP_Y;
  add(tip);
  add(part("Cửa thép", box(0.7, 0.8, 0.05, p.hullDark, 0, BASE_Y + 0.5, 1.55)));
  const clock = new FireClock(BUILDINGS["aa-emp"].weapon!.cooldown);
  const built = rig(root, [WORK, FIRE], 5.2, [
    (dt, t, a) => {
      const on = a.has("work") || a.has("fire");
      rings.forEach((r, i) => {
        r.position.y = (r.userData.base as number) + (on ? Math.sin(t * 2 + i * 1.2) * 0.25 : 0);
        if (on) r.rotation.z += dt * (1 + i * 0.6);
      });
      glow.emissiveIntensity = on ? 1.3 + Math.sin(t * 5) * 0.5 : 0.3;
      clock.tick(dt, a.has("fire"));
      const k = clock.since / 0.6;
      pulse.visible = k < 1;
      if (pulse.visible) {
        pulse.scale.setScalar(0.8 + k * 3.8);
        pulseMat.opacity = 0.45 * (1 - k);
      }
    }
  ]);
  built.muzzlePoints = [tip];
  return built;
}
