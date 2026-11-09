/** Khung xe mặt đất: tháp pháo xoay, nòng giật, bánh lăn, xích. Mọi xe dùng vehicleRig. */
import * as THREE from "three";
import { RULES, UNITS, type UnitId } from "../../../sim/content";
import { approach, approachAngle, box, FireClock, group, part, partIfUnnamed, Spring, tubeZ, wheel, type Palette, type Rig, type RigAction } from "../kit";
import { V, Shots, missileMesh } from "./common";

/** Độ nảy mỗi phát bắn. Các số là độ lệch lớn nhất của MỘT phát; nằm ở `gun` và `body` (vốn đã động) nên không tốn thêm lệnh vẽ. */
export interface GunBounce {
  /** Độ tắt của lò xo (0..1): cao thì từng phát tách bạch. */
  damp: number;
  /** Thân xe nảy: CHỈ KHI CHƯA HẠ BỆ (hạ bệ là để thân đứng im). Tần số (Hz), chúi ngược hướng bắn (rad), trượt lùi (m), lún (m). */
  hull?: { hz: number; tilt: number; slide: number; sink: number };
  /** Lò xo giá súng: tần số (Hz); giá súng ngóc thêm (rad), lùi theo trục nòng (m), vặn về bên ống vừa bắn (rad). */
  gunHz: number;
  gunClimb: number;
  gunSlide: number;
  gunTwist: number;
  /** Nòng giật: lùi rất nhanh rồi trôi về chỗ cũ, không dội lại; đây là hằng số thời gian (giây). */
  recoilTime?: number;
}

/** Xưởng Mô Hình: nghỉ giữa hai loạt (giây), thay cho thời gian nạp thật để đỡ phải chờ. */
const BURST_REST = 1.2;

export interface VehicleParts {
  body: THREE.Group;
  wheels: { g: THREE.Object3D; r: number }[];
  turret: THREE.Group;
  gun: THREE.Group;
  /** Nòng giật lùi theo trục -Z khi bắn. */
  barrels: THREE.Object3D[];
  muzzles: THREE.Object3D[];
  flashes: THREE.Mesh[];
  spinners: THREE.Object3D[];
  /** Góc nâng nòng khi ngắm (rad, dương = ngóc lên). */
  aimPitch: number;
  /**
   * Góc ngóc nòng khi mục tiêu là máy bay (rad). Có trường này thì xe có hai tư thế: nằm ngang bắn đất, ngóc cao bắn máy bay.
   * Chiến trường bật hoạt ảnh "aimAir" khi mục tiêu đang bay; Xưởng Mô Hình có nút "Ngắm máy bay".
   */
  airPitch?: number;
  recoil: number;
  /** Tên lửa thay cho đạn pháo (SkyGuard). */
  missiles?: boolean;
  /** Nhịp bắn khi bật "Khai hỏa" ở Xưởng Mô Hình (giây); mặc định theo thời gian nạp của vũ khí. */
  fireEvery?: number;
  /** Có trường này thì mô hình nảy theo từng phát thật của sim (`Rig.shot`). */
  bounce?: GunBounce;
}

export const GROUND_ACTIONS: RigAction[] = [
  { id: "move", label: "Di chuyển" },
  { id: "aim", label: "Ngắm" },
  { id: "fire", label: "Khai hỏa" }
];

export function vehicleRig(
  id: UnitId,
  p: Palette,
  parts: VehicleParts,
  radius: number,
  extra: RigAction[] = [],
  extraUpdate?: (dt: number, t: number, a: ReadonlySet<string>) => void,
  baseActions: RigAction[] = GROUND_ACTIONS
): Rig {
  // tên bộ phận chung cho Xưởng Mô Hình (bộ phận đã có tên riêng thì giữ tên riêng)
  partIfUnnamed("Thân xe", parts.body);
  partIfUnnamed("Tháp pháo", parts.turret);
  partIfUnnamed("Cụm nòng", parts.gun);
  for (const b of parts.barrels) partIfUnnamed(parts.missiles ? "Ống phóng tên lửa" : "Nòng pháo", b);
  for (const w of parts.wheels) partIfUnnamed("Bánh xe", w.g);
  const root = group(parts.body);
  const spec = UNITS[id];
  const b = parts.bounce;
  // Xưởng Mô Hình bắn theo đúng nhịp loạt của sim (khoảng cách đã làm tròn theo tick)
  const burst = b ? spec.weapon?.burst : undefined;
  const burstGap = burst ? Math.max(1, Math.round(burst.interval * RULES.tickRate)) / RULES.tickRate : 0;
  const clock = new FireClock(burst ? burstGap : (parts.fireEvery ?? Math.max(0.35, spec.weapon?.cooldown ?? 1)));
  const shots = new Shots(root);
  // mỗi nhịp bắn ra mấy viên cùng lúc (SkyGuard 2 khẩu)
  const volley = b ? (spec.weapon?.barrels ?? 1) : 1;
  const hull = b?.hull ? new Spring(b.hull.hz, b.damp) : null;
  const gunKick = b ? new Spring(b.gunHz, b.damp) : null;
  const twist = b ? new Spring(b.gunHz, b.damp) : null;
  const gunY0 = parts.gun.position.y;
  const gunZ0 = parts.gun.position.z;
  // ống bắn lệch sang bên nào so với trục giá súng (-1..1): phát đó vặn giá súng về bên ấy
  const offsets = b
    ? (() => {
        const xs = parts.muzzles.map((m) => parts.gun.worldToLocal(m.getWorldPosition(V)).x);
        const max = Math.max(1e-6, ...xs.map(Math.abs));
        return xs.map((x) => x / max);
      })()
    : [];
  // nòng giật là chuyển động duy nhất của nó và bakeStatic không chạy thử "fire": phải báo trước, không nó bị gộp vào tháp
  if (b && parts.recoil > 0) for (const barrel of parts.barrels) barrel.userData.animated = true;
  let since = Infinity;
  let driven = false; // đã nhận phát bắn thật từ sim: bỏ đồng hồ giả của Xưởng Mô Hình
  let braced = false;
  let recoilState = 0;
  let recoilShown = 0;
  let baseY = 0;
  let fired = 0;
  let rest = 0;
  let yaw = 0;
  let pitch = 0;
  // bắn nhiều viên một nhịp thì ống đầu tiên phải là ống số 0, không cặp ống bị ghép lệch một vị trí
  let muzzleIndex = b ? parts.muzzles.length - 1 : 0;
  // bánh xe quay đúng theo tốc độ chạy thật của xe
  const speed = spec.speed;
  let aimOverride: number | null = null;
  let aimRaise = true;
  const fireOne = (): void => {
    since = 0;
    let off = 0; // hai khẩu đối xứng bắn cùng lúc thì lệch triệt tiêu, giá súng không vặn
    for (let i = 0; i < volley; i++) {
      muzzleIndex = (muzzleIndex + 1) % parts.muzzles.length;
      off += offsets[muzzleIndex] ?? 0;
      // trên chiến trường viên đạn do sim vẽ; chỉ Xưởng Mô Hình mới tự thả tên lửa minh họa
      if (parts.missiles && !driven) {
        const muzzle = parts.muzzles[muzzleIndex]!;
        muzzle.getWorldDirection(V);
        shots.spawn(missileMesh(p), muzzle, V.clone().multiplyScalar(16), 1.1);
      }
    }
    if (b) {
      recoilState = 1;
      if (!braced) hull?.hit(1);
      gunKick!.hit(1);
      twist!.hit(off);
    }
  };
  return {
    root,
    actions: [...baseActions, ...extra],
    ...(b
      ? {
          shot() {
            driven = true;
            fireOne();
          }
        }
      : {}),
    defaultOn: [],
    radius,
    setAim(y, raise = true) {
      aimOverride = y;
      aimRaise = raise;
    },
    update(dt, t, a) {
      const moving = a.has("move");
      for (const w of parts.wheels) if (moving) w.g.rotation.x += (speed / w.r) * dt;
      baseY = moving ? Math.sin(t * 14) * 0.025 : approach(baseY, 0, 10, dt);
      parts.body.position.y = baseY;
      braced = a.has("deploy");
      parts.body.rotation.x = moving ? Math.sin(t * 7) * 0.008 : 0;

      // Chiến trường đặt góc ngắm thật (setAim); Xưởng Mô Hình thì cho tháp pháo quét qua lại.
      const air = parts.airPitch !== undefined && a.has("aimAir");
      const aiming = (aimOverride !== null && aimRaise) || a.has("aim") || a.has("fire") || air;
      const yawTarget = aimOverride !== null ? aimOverride : a.has("aim") ? Math.sin(t * 0.7) * 1.1 : 0;
      yaw = approachAngle(yaw, yawTarget, aimOverride !== null ? 7 : 3, dt);
      pitch = approach(pitch, aiming ? (air ? parts.airPitch! : parts.aimPitch) + (aimOverride === null ? Math.sin(t * 1.3) * 0.06 : 0) : 0, air ? 2.2 : 3, dt);
      parts.turret.rotation.y = yaw;
      parts.gun.rotation.x = -pitch;

      for (const s of parts.spinners) s.rotation.y += dt * 2.2;

      since += dt;
      rest = Math.max(0, rest - dt);
      if (!driven && clock.tick(dt, a.has("fire") && rest <= 0)) {
        fireOne();
        if (burst && ++fired >= burst.shots) {
          fired = 0;
          rest = BURST_REST;
        }
      }
      let kick = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) * parts.recoil : 0;
      if (b) {
        gunKick!.step(dt);
        twist!.step(dt);
        if (hull && b.hull) {
          hull.step(dt);
          // súng chĩa hướng nào thì phần xe phía đó bị hất lên, cả xe trượt ngược lại
          const sy = Math.sin(yaw);
          const cy = Math.cos(yaw);
          parts.body.rotation.x -= hull.x * b.hull.tilt * cy;
          parts.body.rotation.z = hull.x * b.hull.tilt * sy;
          parts.body.position.x = -hull.x * b.hull.slide * sy;
          parts.body.position.z = -hull.x * b.hull.slide * cy;
          parts.body.position.y -= hull.x * b.hull.sink;
        }
        parts.gun.rotation.x -= gunKick!.x * b.gunClimb;
        parts.gun.rotation.y = twist!.x * b.gunTwist;
        parts.gun.position.y = gunY0 - gunKick!.x * b.gunSlide * Math.sin(pitch);
        parts.gun.position.z = gunZ0 - gunKick!.x * b.gunSlide * Math.cos(pitch);
        // nòng lùi rất nhanh rồi trôi từ từ về chỗ cũ
        recoilState *= Math.exp(-dt / (b.recoilTime ?? 0.2));
        recoilShown = approach(recoilShown, recoilState, 45, dt);
        kick = recoilShown * parts.recoil;
      }
      parts.barrels.forEach((b, i) => (b.position.z = (b.userData.z0 as number) - (parts.missiles || i % parts.muzzles.length === muzzleIndex ? kick : 0)));
      parts.flashes.forEach((f, i) => {
        f.visible = since < 0.07 && i === muzzleIndex;
        if (f.visible) f.scale.setScalar(0.8 + Math.random() * 0.5);
      });
      shots.update(dt);
      extraUpdate?.(dt, t, a);
    }
  };
}

export function barrel(len: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Group {
  const g = group(tubeZ(r, r * 1.1, len, mat, 8));
  (g.children[0] as THREE.Mesh).position.z = len / 2;
  g.position.set(x, y, z);
  g.userData.z0 = z;
  return g;
}

/** Bộ xích: thanh xích cao su + bánh tì quay được + tấm che màu phe. */
export function tracks(p: Palette, halfWidth: number, length: number, wheelR: number, count: number): { g: THREE.Group; wheels: { g: THREE.Object3D; r: number }[] } {
  const g = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1]) {
    g.add(box(0.5, wheelR * 2.3, length, p.rubber, side * halfWidth, wheelR * 1.15, 0));
    g.add(box(0.62, 0.12, length * 1.02, p.teamDark, side * halfWidth, wheelR * 2.35, 0));
    for (let i = 0; i < count; i++) {
      const w = part("Bánh tì xích", wheel(wheelR, 0.56, p.hullDark, p.metal));
      w.position.set(side * halfWidth, wheelR + 0.02, -length / 2 + wheelR + (i * (length - wheelR * 2)) / (count - 1));
      g.add(w);
      wheels.push({ g: w, r: wheelR });
    }
  }
  return { g: part("Dải xích", g), wheels };
}
