/**
 * Bộ công cụ dựng mô hình bằng code: vật liệu theo phe và các khối hình cơ bản.
 *
 * Mỗi mô hình là một "Rig": cây Object3D có các khớp được đặt tên (tháp pháo, nòng, bánh xe…)
 * và một hàm update() chạy hoạt ảnh. Trang Xưởng Mô Hình và chiến trường dùng chung Rig,
 * nên mô hình bản nhẹ hôm nay có thể được thay bằng bản chi tiết mà không phải sửa chỗ khác.
 */
import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { Faction } from "../../sim/content";

/**
 * Đặt tên bộ phận (tiếng Việt) cho một khối hoặc một nhóm khối: Xưởng Mô Hình hiện tên này khi rê chuột vào,
 * để người thiết kế gọi đúng tên khi góp ý ("kéo dài Nòng pháo", "Cabin thấp xuống"). Khối không có tên thì lấy tên
 * của nhóm gần nhất bên ngoài nó. Không ảnh hưởng chiến trường.
 */
export function part<T extends THREE.Object3D>(name: string, o: T): T {
  o.userData.part = name;
  return o;
}

/** Đặt tên nếu bộ phận chưa có tên riêng (dùng cho tên chung như "Thân xe", "Tháp pháo"). */
export function partIfUnnamed<T extends THREE.Object3D>(name: string, o: T): T {
  if (!o.userData.part) o.userData.part = name;
  return o;
}

export interface RigAction {
  id: string;
  label: string;
}

export interface Rig {
  root: THREE.Group;
  /** Các hoạt ảnh bật/tắt được trên Xưởng Mô Hình. */
  actions: RigAction[];
  /** Hoạt ảnh bật sẵn khi mở mô hình. */
  defaultOn: string[];
  /** Bán kính bao quanh, để camera tự canh khung hình. */
  radius: number;
  update(dt: number, time: number, active: ReadonlySet<string>): void;
  /**
   * Chiến trường điều khiển tháp pháo: góc quay (rad) so với thân, null = tự do (hoạt ảnh "Ngắm" trên Xưởng Mô Hình).
   * Chỉ có ở mô hình có tháp pháo.
   */
  /** Góc mâm xoay so với thân (null = để hoạt ảnh tự quét); `raise` = nâng nòng (mặc định có): rảnh thì chỉ quay, không nâng. */
  setAim?(yaw: number | null, raise?: boolean): void;
  /**
   * Chiến trường điều khiển máy bay: độ cao do sim quyết định (đặt vào root.position.y),
   * rig chỉ lo càng, lửa động cơ và độ nghiêng cánh.
   */
  setFlight?(airborne: boolean, roll: number): void;
  /** Chỉ báo mức (0..1), ví dụ % pin của Trạm Tích Điện. */
  setLevel?(k: number): void;
  /** Số đạn vũ khí phụ còn treo trên thân (ví dụ tên lửa dưới cánh Falcon): bắn rồi thì ẩn đi. */
  setAmmo?(n: number): void;
  /** Miệng ống theo đúng thứ tự bắn, để đường đạn xuất phát từ đó. Không khai báo thì chiến trường dùng các tia lửa đầu nòng (`muzzleFlash`). */
  muzzlePoints?: THREE.Object3D[];
  /** Sim vừa bắn một phát thật (`lastShot` đổi): mô hình nảy theo đúng phát đó. Chỉ có ở mô hình khai báo `bounce`. */
  shot?(): void;
}

export interface Palette {
  team: THREE.MeshStandardMaterial;
  teamDark: THREE.MeshStandardMaterial;
  teamGlow: THREE.MeshStandardMaterial;
  hull: THREE.MeshStandardMaterial;
  hullDark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  warning: THREE.MeshStandardMaterial;
  flash: THREE.MeshBasicMaterial;
  engine: THREE.MeshBasicMaterial;
  smoke: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
}

const TEAM_COLORS: Record<Faction, { main: number; dark: number; glow: number }> = {
  lam: { main: 0x2e9eff, dark: 0x1a4e7d, glow: 0x7cc8ff },
  do: { main: 0xf23d3d, dark: 0x7a1f1f, glow: 0xff9a7a }
};

const palettes = new Map<Faction, Palette>();

/** Vật liệu dùng chung theo phe (tạo một lần, không dispose theo mô hình). */
export function palette(faction: Faction): Palette {
  const cached = palettes.get(faction);
  if (cached) return cached;
  const c = TEAM_COLORS[faction];
  const std = (color: number, roughness = 0.7, metalness = 0.15, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra });
  const p: Palette = {
    team: std(c.main, 0.55, 0.2),
    teamDark: std(c.dark, 0.6, 0.2),
    teamGlow: std(c.glow, 0.4, 0, { emissive: c.main, emissiveIntensity: 1.6 }),
    hull: std(0x7d8794, 0.65, 0.35),
    hullDark: std(0x4a525d, 0.7, 0.35),
    metal: std(0x2f343b, 0.45, 0.7),
    rubber: std(0x1d2024, 0.9, 0),
    concrete: std(0x9a9a92, 0.95, 0),
    concreteDark: std(0x5f605c, 0.95, 0),
    glass: std(0x9fe3ff, 0.15, 0.4, { emissive: 0x2a6f8f, emissiveIntensity: 0.6 }),
    warning: std(0xffb547, 0.6, 0.1),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false }),
    engine: new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, depthWrite: false }),
    smoke: std(0xd8d8d8, 1, 0, { transparent: true, opacity: 0.55, depthWrite: false }),
    wood: std(0x6b4a2e, 0.95, 0),
    white: std(0xe8ecef, 0.7, 0)
  };
  palettes.set(faction, p);
  return p;
}

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

/** Trụ đứng (trục Y). */
export function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 12, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat));
  m.position.set(x, y, z);
  return m;
}

/** Trụ nằm dọc trục Z (nòng pháo, thân máy bay, ống phóng). */
export function tubeZ(rFront: number, rBack: number, len: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, seg), mat));
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Bánh xe nằm ngang (trục X), bọc trong Group để quay quanh trục của chính nó. */
export function wheel(r: number, width: number, mat: THREE.Material, hubMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tire = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 14), mat));
  tire.rotation.z = Math.PI / 2;
  const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, width * 1.05, 6), hubMat));
  hub.rotation.z = Math.PI / 2;
  g.add(tire, hub);
  // bánh quay chỉ là chi tiết trang trí: khi "nướng" cho chiến trường được phép gộp vào thân xe (mất hiệu ứng quay)
  g.userData.cosmetic = true;
  return g;
}

export function sphere(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat));
  m.position.set(x, y, z);
  return m;
}

/**
 * Khối nhiều mặt vát: bao lồi của các điểm [x, y, z] (mặt phẳng, cạnh sắc — hợp máy bay tàng hình, giáp vát).
 * `mirror = true` thì tự thêm bản đối xứng qua mặt x = 0, chỉ cần khai báo nửa bên phải.
 */
export function facets(points: [number, number, number][], mat: THREE.Material, mirror = false): THREE.Mesh {
  const all = mirror ? [...points, ...points.filter(([x]) => x !== 0).map(([x, y, z]) => [-x, y, z] as [number, number, number])] : points;
  const geo = new ConvexGeometry(all.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return shadowed(new THREE.Mesh(geo, mat));
}

/** Mặt thân để dán chi tiết: nhìn từ phía nào vào. */
export type Face = "top" | "bottom" | "right" | "left" | "front" | "back";
/** axis: trục tia dò đi dọc; sign: phía nhìn vào (+ = từ phía dương của trục); u, v: hai trục của tọa độ khai báo. */
const FACE_AXES: Record<Face, { axis: 0 | 1 | 2; sign: 1 | -1; u: 0 | 1 | 2; v: 0 | 1 | 2 }> = {
  top: { axis: 1, sign: 1, u: 0, v: 2 }, // (x, z)
  bottom: { axis: 1, sign: -1, u: 0, v: 2 },
  right: { axis: 0, sign: 1, u: 2, v: 1 }, // (z, y), bên phải là +x
  left: { axis: 0, sign: -1, u: 2, v: 1 },
  front: { axis: 2, sign: 1, u: 0, v: 1 }, // (x, y), mặt trước là +z
  back: { axis: 2, sign: -1, u: 0, v: 1 }
};
export interface SkinOpts {
  face?: Face;
  /** Lật sang nửa trái (đổi dấu x). */
  mirror?: boolean;
  /** Nhô khỏi bề mặt bao nhiêu (m). */
  lift?: number;
  /** Độ dày tấm (m). */
  thick?: number;
}

/**
 * Bộ công cụ dán chi tiết sát bề mặt các khối vát (tấm giáp, đường ghép, vạch sơn, ô kính).
 * Tia dò (raycast) đo vị trí bề mặt tại tọa độ khai báo, nên chỉ cần ghi chi tiết nằm ở đâu nhìn từ phía đó,
 * không phải tự tính độ cao của mặt nghiêng; sửa hình thân thì chi tiết tự bám theo.
 * `symmetric`: thân đối xứng trái phải, chỉ đo trên nửa phải (khối có scale âm không dò được tia).
 * Gọi sau khi đã dựng xong các khối `surfaces`, trước khi dịch chuyển gốc `root`.
 */
export function surfaceTools(root: THREE.Object3D, surfaces: THREE.Object3D[], symmetric = true) {
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  root.updateMatrixWorld(true);
  /** Tọa độ bề mặt dọc trục nhìn của mặt `face` tại (u, v). Không trúng thì trả 0. */
  const surf = (u: number, v: number, face: Face = "top"): number => {
    if (symmetric && face === "left") return -surf(u, v, "right");
    const f = FACE_AXES[face];
    from.set(0, 0, 0);
    from.setComponent(f.axis, f.sign * 50);
    from.setComponent(f.u, symmetric && f.u === 0 ? Math.abs(u) : u);
    from.setComponent(f.v, v);
    dir.set(0, 0, 0).setComponent(f.axis, -f.sign);
    ray.set(from, dir);
    const hit = ray.intersectObjects(surfaces, true)[0];
    return hit ? hit.point.getComponent(f.axis) : 0;
  };
  /** Điểm 3D trên mặt `face` tại (u, v), nhô thêm `lift`. */
  const at = (u: number, v: number, face: Face = "top", lift = 0, mirror = false): [number, number, number] => {
    const f = FACE_AXES[face];
    const p = new THREE.Vector3();
    p.setComponent(f.axis, surf(u, v, face) + f.sign * lift);
    p.setComponent(f.u, u);
    p.setComponent(f.v, v);
    return [mirror ? -p.x : p.x, p.y, p.z];
  };
  /** Tấm mỏng dán lên mặt theo đa giác lồi khai báo bằng tọa độ (u, v) của mặt đó. */
  const skin = (name: string, pts: [number, number][], mat: THREE.Material, o: SkinOpts = {}) => {
    const { face = "top", mirror = false, lift = 0.022, thick = 0.03 } = o;
    return part(name, facets(pts.flatMap(([u, v]) => [at(u, v, face, lift, mirror), at(u, v, face, lift - thick, mirror)]), mat));
  };
  /** Đường mảnh dán lên mặt (đường ghép tấm, vạch sơn) theo đường gấp khúc. */
  const line = (name: string, pts: [number, number][], mat: THREE.Material, o: SkinOpts & { w?: number } = {}) => {
    const { w = 0.028, ...rest } = o;
    const g = group();
    for (let i = 0; i + 1 < pts.length; i++) {
      const [au, av] = pts[i]!;
      const [bu, bv] = pts[i + 1]!;
      const len = Math.sqrt((bu - au) ** 2 + (bv - av) ** 2);
      const nu = (-(bv - av) / len) * (w / 2);
      const nv = ((bu - au) / len) * (w / 2);
      g.add(skin(name, [[au + nu, av + nv], [bu + nu, bv + nv], [bu - nu, bv - nv], [au - nu, av - nv]], mat, { lift: 0.026, thick: 0.02, ...rest }));
    }
    return part(name, g);
  };
  return { surf, at, skin, line };
}

/** Chớp lửa đầu nòng: hình nón sáng, ẩn mặc định. */
export function muzzleFlash(size: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.45, size, 7), mat);
  m.rotation.x = Math.PI / 2;
  m.visible = false;
  m.userData.muzzle = true; // tia lửa nằm đúng miệng nòng: đường đạn xuất phát từ đây
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** Đồng hồ bắn theo chu kỳ: trả về số giây kể từ phát bắn gần nhất (hoặc Infinity khi tắt). */
/**
 * Lò xo có giảm chấn, tính bằng nghiệm chính xác nên khung hình dài cũng không nổ số.
 * `hit(p)`: một cú hích làm lò xo lệch tối đa đúng `p` nếu đang đứng yên; hích liên tiếp thì cộng dồn tự nhiên.
 */
export class Spring {
  x = 0;
  private v = 0;
  private readonly w: number;
  private readonly wd: number;
  private readonly gain: number;
  constructor(hz: number, private readonly damp: number) {
    this.w = 2 * Math.PI * hz;
    const s = Math.sqrt(1 - damp * damp);
    this.wd = this.w * s;
    this.gain = this.w / Math.exp((-damp * Math.acos(damp)) / s);
  }
  hit(peak: number): void {
    this.v += peak * this.gain;
  }
  step(dt: number): void {
    const a = this.damp * this.w;
    const e = Math.exp(-a * dt);
    const c = Math.cos(this.wd * dt);
    const s = Math.sin(this.wd * dt);
    const b = (this.v + a * this.x) / this.wd;
    const x = e * (this.x * c + b * s);
    this.v = e * (this.v * c + (-a * b - this.wd * this.x) * s);
    this.x = x;
  }
}

export class FireClock {
  private t = Infinity;
  private next = 0;
  constructor(private cooldown: number) {}
  /** Gọi mỗi khung hình; trả true đúng lúc vừa nổ một phát mới. */
  tick(dt: number, on: boolean): boolean {
    if (!on) {
      this.t += dt;
      this.next = 0.15;
      return false;
    }
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) {
      this.next += this.cooldown;
      this.t = 0;
      return true;
    }
    return false;
  }
  get since(): number {
    return this.t;
  }
}

/** Nội suy mượt về giá trị đích (không phụ thuộc tốc độ khung hình). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Đưa góc về khoảng [-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Như approach nhưng cho góc: luôn quay theo đường ngắn nhất. */
export function approachAngle(current: number, target: number, rate: number, dt: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

/** Giải phóng hình học của một mô hình (vật liệu dùng chung nên giữ lại). */
export function disposeRig(rig: Rig): void {
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
