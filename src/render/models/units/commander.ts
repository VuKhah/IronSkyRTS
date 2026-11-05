/** Mô hình Xe Tư Lệnh (`commander`). */
import * as THREE from "three";
import { box, cyl, group, muzzleFlash, part, sphere, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

export function buildCommander(p: Palette): Rig {
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.35, 0, -1.35]) {
      const w = wheel(0.46, 0.36, p.rubber, p.metal);
      w.position.set(side * 1.08, 0.46, z);
      body.add(w);
      wheels.push({ g: w, r: 0.46 });
    }
  body.add(
    box(2.0, 0.85, 4.1, p.hull, 0, 1.0, 0),
    part("Mũi xe", box(1.9, 0.5, 0.9, p.hullDark, 0, 0.95, 2.3)),
    part("Khoang chỉ huy", box(1.7, 0.65, 2.2, p.hull, 0, 1.75, -0.45)),
    part("Nóc khoang (màu phe)", box(1.72, 0.12, 2.22, p.team, 0, 2.12, -0.45)),
    part("Sọc màu phe", box(2.04, 0.18, 3.4, p.team, 0, 1.15, -0.1)),
    part("Kính khoang chỉ huy", box(1.3, 0.28, 0.08, p.glass, 0, 1.85, 0.66))
  );
  // cột radar chỉ huy
  const mast = part("Cột radar chỉ huy", cyl(0.06, 0.08, 1.3, p.metal, 6, 0.55, 2.75, -1.25));
  const dish = part("Chảo radar chỉ huy", group(box(0.9, 0.06, 0.5, p.hullDark), cyl(0.08, 0.08, 0.25, p.teamGlow, 6, 0, 0.12, 0)));
  dish.position.set(0.55, 3.45, -1.25);
  body.add(mast, dish, part("Ăng-ten", group(cyl(0.02, 0.02, 1.6, p.metal, 4, -0.7, 2.9, -1.4), sphere(0.06, p.teamGlow, -0.7, 3.7, -1.4))));
  // tháp pháo kép
  const turret = part("Tháp pháo kép 40mm", group(cyl(0.5, 0.58, 0.32, p.hullDark, 10), box(0.75, 0.3, 0.8, p.hull, 0, 0.22, 0.05)));
  turret.position.set(0, 2.32, 0.75);
  const gun = group();
  gun.position.set(0, 0.25, 0.35);
  const barrels = [barrel(1.1, 0.07, p.metal, -0.15, 0, 0), barrel(1.1, 0.07, p.metal, 0.15, 0, 0)];
  const flashes = barrels.map((b) => {
    const f = muzzleFlash(0.5, p.flash);
    f.position.z = 1.35;
    b.add(f);
    return f;
  });
  gun.add(...barrels);
  turret.add(gun);
  body.add(turret);

  // vòng hào quang chỉ huy 13.5m (thu nhỏ để vừa khung)
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.85, 48),
    new THREE.MeshBasicMaterial({ color: (p.team.color as THREE.Color).getHex(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;
  part("Vòng hào quang chỉ huy", aura);

  const rig = vehicleRig("commander", p, { body, wheels, turret, gun, barrels, muzzles: barrels, flashes, spinners: [dish], aimPitch: 0.12, recoil: 0.18 }, 3.4,
    [{ id: "aura", label: "Hào quang" }],
    (_dt, t, a) => {
      aura.visible = a.has("aura");
      if (aura.visible) {
        const k = (t * 0.6) % 1;
        aura.scale.setScalar(0.85 + k * 0.25);
        (aura.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
      }
    });
  rig.root.add(aura);
  rig.defaultOn = ["aura"];
  return rig;
}
