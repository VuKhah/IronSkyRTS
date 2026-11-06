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
  setAim?(yaw: number | null): void;
  /**
   * Chiến trường điều khiển máy bay: độ cao do sim quyết định (đặt vào root.position.y),
   * rig chỉ lo càng, lửa động cơ và độ nghiêng cánh.
   */
  setFlight?(airborne: boolean, roll: number): void;
  /** Chỉ báo mức (0..1), ví dụ % pin của Trạm Tích Điện. */
  setLevel?(k: number): void;
  /** Số đạn vũ khí phụ còn treo trên thân (ví dụ tên lửa dưới cánh Falcon): bắn rồi thì ẩn đi. */
  setAmmo?(n: number): void;
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

/** Chớp lửa đầu nòng: hình nón sáng, ẩn mặc định. */
export function muzzleFlash(size: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.45, size, 7), mat);
  m.rotation.x = Math.PI / 2;
  m.visible = false;
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** Đồng hồ bắn theo chu kỳ: trả về số giây kể từ phát bắn gần nhất (hoặc Infinity khi tắt). */
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
