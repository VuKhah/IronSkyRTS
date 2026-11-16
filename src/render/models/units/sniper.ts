/**
 * Tiểu Đội Bắn Tỉa, bản 1 (16/11/2026, người dùng: "dựng nhanh một tiểu đội bộ binh 5 thành viên sniper làm đại diện").
 * Luật: `UNITS.sniper` (troops 5, đế tiểu đội Ø 6 m, bodyR 3). Năm xạ thủ đứng hình ngũ giác bán kính FORMATION_R quanh tâm đế,
 * một người ở mũi. Mọi người cùng xoay về mục tiêu (`setAim`, quân không có mâm xoay nên chiến trường đưa góc tới mục tiêu),
 * đi thì bước chân, bắn thì giật súng và lóe đầu nòng lần lượt từng người. Máu tụt thì ẩn dần người (`setLevel` = máu / máu tối
 * đa), người phía sau mất trước. Mọi điểm (cả nòng súng dài) nằm trong vòng bodyR ở mọi góc ngắm: kiểm bằng bases.test.
 */
import * as THREE from "three";
import { approachAngle, box, cyl, group, muzzleFlash, part, sphere, tubeZ, type Palette, type Rig } from "../kit";

/** Bán kính hình ngũ giác đặt năm người (m). Xa tâm nhất = FORMATION_R + nòng súng ≈ 2,7 m < bodyR 3. */
const FORMATION_R = 1.45;
/** Chiều dài súng bắn tỉa (m). */
const RIFLE = 1.25;
/** Thứ tự người mất khi máu tụt: phía sau trước, người ở mũi (trưởng tiểu đội) mất cuối cùng. */
const LOSS_ORDER = [2, 3, 1, 4, 0];

interface Soldier {
  g: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  torso: THREE.Group;
  rifle: THREE.Group;
  flash: THREE.Mesh;
  tip: THREE.Object3D;
  phase: number;
}

function soldier(p: Palette, skin: THREE.Material, k: number): Soldier {
  const g = part(`Xạ thủ ${k + 1}`, group());
  // chân: khớp hông ở y 0,9, đung đưa khi đi
  const leg = (x: number): THREE.Group => {
    const l = part("Chân", group(box(0.17, 0.82, 0.2, p.hullDark, 0, -0.41, 0), box(0.19, 0.12, 0.3, p.hullDark, 0, -0.84, 0.05)));
    l.position.set(x, 0.9, 0);
    g.add(l);
    return l;
  };
  const legL = leg(-0.12);
  const legR = leg(0.12);
  // thân trên: áo, áo giáp màu phe, đầu, mũ, ba lô
  const torso = part("Thân người", group());
  torso.position.y = 0.9;
  torso.add(
    part("Áo", box(0.44, 0.56, 0.26, p.hull, 0, 0.3, 0)),
    part("Áo giáp (màu phe)", box(0.48, 0.34, 0.3, p.team, 0, 0.38, 0.01)),
    part("Ba lô", box(0.34, 0.4, 0.16, p.hullDark, 0, 0.34, -0.2)),
    part("Mặt", sphere(0.12, skin, 0, 0.72, 0.01, 8)),
    part("Mũ sắt", sphere(0.15, p.teamDark, 0, 0.78, -0.01, 8)),
    part("Vành mũ", cyl(0.17, 0.17, 0.03, p.teamDark, 10, 0, 0.73, 0))
  );
  // súng bắn tỉa: tay ôm súng ngang vai, nòng hướng +Z
  const rifle = part("Súng bắn tỉa", group());
  rifle.position.set(0.12, 0.52, 0.12);
  const stock = box(0.07, 0.12, 0.34, p.metal, 0, -0.02, -0.05);
  const body = box(0.07, 0.09, 0.42, p.metal, 0, 0, 0.3);
  const scope = part("Ống ngắm", tubeZ(0.035, 0.035, 0.3, p.metal, 8));
  scope.position.set(0, 0.08, 0.3);
  const lens = part("Mắt kính ống ngắm", tubeZ(0.03, 0.03, 0.02, p.metal, 8));
  lens.position.set(0, 0.08, 0.46);
  const bar = part("Nòng", tubeZ(0.018, 0.022, RIFLE - 0.5, p.metal, 6));
  bar.position.set(0, 0.01, 0.51 + (RIFLE - 0.5) / 2);
  const arms = part("Tay", box(0.36, 0.1, 0.34, p.metal, -0.12, -0.08, 0.16));
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.01, 0.51 + RIFLE - 0.5);
  const flash = muzzleFlash(0.35, p.flash);
  flash.position.copy(tip.position).setZ(tip.position.z + 0.12);
  flash.visible = false;
  rifle.add(stock, body, scope, lens, bar, arms, tip, flash);
  torso.add(rifle);
  g.add(torso);
  return { g, legL, legR, torso, rifle, flash, tip, phase: k * 1.3 };
}

export function buildSniper(p: Palette): Rig {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a74, roughness: 0.8, flatShading: true });
  const men: Soldier[] = [];
  for (let k = 0; k < 5; k++) {
    const s = soldier(p, skin, k);
    // ngũ giác, người 0 ở mũi (+Z); mỗi người lệch hướng một chút cho tự nhiên
    const a = (k * 2 * Math.PI) / 5;
    s.g.position.set(Math.sin(a) * FORMATION_R, 0, Math.cos(a) * FORMATION_R);
    root.add(s.g);
    men.push(s);
  }

  let aim: number | null = null;
  let yaw = 0;
  let alive = 5;
  let fireT = 0;
  return {
    root,
    actions: [
      { id: "move", label: "Đi" },
      { id: "aim", label: "Ngắm" },
      { id: "fire", label: "Bắn" }
    ],
    defaultOn: ["aim"],
    radius: 3.2,
    muzzlePoints: men.map((m) => m.tip),
    setAim(y: number | null) {
      aim = y;
    },
    setLevel(k: number) {
      alive = Math.max(1, Math.min(5, Math.ceil(k * 5 - 1e-6)));
      LOSS_ORDER.forEach((i, n) => (men[i].g.visible = n >= 5 - alive));
    },
    update(dt, t, active) {
      const moving = active.has("move");
      // ngắm: chiến trường đưa góc; Xưởng Mô Hình thì quét qua lại
      const want = aim ?? (active.has("aim") ? Math.sin(t * 0.6) * 1.2 : 0);
      yaw = approachAngle(yaw, moving && aim === null ? 0 : want, 4, dt);
      const firing = active.has("fire");
      if (firing) fireT += dt;
      else fireT = 0;
      // bắn lần lượt: mỗi 0,6 s một người bóp cò
      const shooter = firing ? Math.floor(fireT / 0.6) % alive : -1;
      const sinceShot = fireT % 0.6;
      let n = 0;
      for (const m of men) {
        if (!m.g.visible) continue;
        m.g.rotation.y = yaw;
        const step = moving ? Math.sin(t * 9 + m.phase) : 0;
        m.legL.rotation.x = step * 0.5;
        m.legR.rotation.x = -step * 0.5;
        m.torso.position.y = 0.9 + (moving ? Math.abs(step) * 0.04 : 0);
        const me = n === shooter;
        const kick = me ? Math.max(0, 1 - sinceShot / 0.25) : 0;
        m.rifle.position.z = 0.12 - kick * 0.08;
        m.rifle.rotation.x = -kick * 0.12;
        m.flash.visible = me && sinceShot < 0.07;
        n++;
      }
    }
  };
}
