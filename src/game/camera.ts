/**
 * Camera RTS 3D: nhìn vào một điểm trên mặt đất (tx, tz), từ khoảng cách `dist`,
 * xoay quanh trục đứng (`yaw`) và nghiêng (`pitch`, giới hạn 30°–75° để trận luôn dễ đọc).
 */
import * as THREE from "three";
import type { GameMap } from "../sim/maps";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
/** Số điểm ảnh mỗi mét: lớn hơn PPM_NEAR là chiến trường 3D, nhỏ hơn PPM_FAR là bản đồ giấy, ở giữa thì chuyển dần. */
const PPM_NEAR = 7.2;
const PPM_FAR = 4.6;
/** Góc nhìn trên bản đồ giấy: gần như thẳng đứng (đứng hẳn thì lookAt mất hướng). */
const TOP_DOWN = 1.5707;
/** Lề giấy cộng bàn gỗ còn thấy khi kéo xa nhất (m). */
const PAPER_MARGIN = 60;

/**
 * Hướng nhìn ban đầu của mỗi phe (Docs/design/MAPS_PLAN.md mục 3.4): bản đồ hiện "đúng hướng", cạnh dưới nằm ngang.
 * yaw = 0: camera đứng phía Nam nhìn về Bắc, trục x nằm ngang màn hình, Lam (góc Tây Nam) ở góc dưới trái.
 * Phe Đỏ xoay 180°: nhìn từ phía Bắc, nhà Đỏ (góc Đông Bắc) cũng hiện ở góc dưới trái.
 * null (người xem AI đấu AI) nhìn như phe Lam.
 */
export function homeYaw(side: 0 | 1 | null): number {
  return side === 1 ? Math.PI : 0;
}

export class RtsCamera {
  tx = 0;
  tz = 0;
  dist = 64;
  yaw = 0;
  pitch = 0.95;
  /** Hướng "cạnh dưới nằm ngang" của phe đang chơi: bản đồ giấy luôn đặt theo hướng này. */
  home = 0;
  /** Mức chuyển sang bản đồ giấy: 0 = chiến trường 3D, 1 = bản đồ giấy. */
  strategic = 0;
  private maxDist = 150;
  private viewH = 800;
  readonly cam = new THREE.PerspectiveCamera(40, 1, 0.5, 700);
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();

  constructor(private map: GameMap) {}

  /** Góc quay đang hiển thị: càng xa càng về hướng chuẩn của bản đồ giấy. */
  private get viewYaw(): number {
    const turn = Math.atan2(Math.sin(this.home - this.yaw), Math.cos(this.home - this.yaw));
    return this.yaw + turn * this.strategic;
  }

  apply(): void {
    // ngưỡng tính theo số điểm ảnh mỗi mét, để đúng cho mọi cỡ màn hình
    const tanHalf = Math.tan((this.cam.fov * Math.PI) / 360);
    const ppm = this.viewH / (2 * this.dist * tanHalf);
    const t = clamp((PPM_NEAR - ppm) / (PPM_NEAR - PPM_FAR), 0, 1);
    this.strategic = t * t * (3 - 2 * t);
    if (this.strategic > 0) {
      // nhìn được bao nhiêu thì tâm chỉ cần đi bấy nhiêu, không để lộ cả khoảng bàn trống khi kéo xa
      const halfH = this.dist * tanHalf;
      const halfW = halfH * this.cam.aspect;
      const limX = Math.max(0, this.map.halfW + PAPER_MARGIN - halfW);
      const limZ = Math.max(0, this.map.halfH + PAPER_MARGIN - halfH);
      this.tx = clamp(this.tx, -limX, limX);
      this.tz = clamp(this.tz, -limZ, limZ);
    }
    const ty = Math.max(0, this.map.groundY(this.tx, this.tz)) * (1 - this.strategic);
    const pitch = this.pitch + (TOP_DOWN - this.pitch) * this.strategic;
    const yaw = this.viewYaw;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    this.cam.position.set(this.tx + Math.sin(yaw) * cp * this.dist, ty + sp * this.dist, this.tz + Math.cos(yaw) * cp * this.dist);
    this.cam.lookAt(this.tx, ty, this.tz);
    this.cam.updateMatrixWorld();
  }

  setAspect(w: number, h: number): void {
    this.cam.aspect = w / Math.max(1, h);
    this.viewH = Math.max(1, h);
    // xa nhất vừa đủ thấy trọn tờ bản đồ, cả khi màn hình dọc
    const tanHalf = Math.tan((this.cam.fov * Math.PI) / 360);
    this.maxDist = Math.max(150, Math.max(this.map.halfH + PAPER_MARGIN, (this.map.halfW + PAPER_MARGIN) / this.cam.aspect) / tanHalf);
    this.cam.far = Math.max(700, this.maxDist * 1.6);
    this.cam.updateProjectionMatrix();
  }

  focus(x: number, z: number): void {
    this.tx = clamp(x, -this.map.edgeX, this.map.edgeX);
    this.tz = clamp(z, -this.map.edgeZ, this.map.edgeZ);
  }

  panWorld(dx: number, dz: number): void {
    this.focus(this.tx + dx, this.tz + dz);
  }

  /** Kéo theo hướng màn hình (phím mũi tên, đưa chuột sát mép): dx sang phải, dy lên trên. */
  panScreen(dx: number, dy: number): void {
    const s = this.dist * 0.9;
    const yaw = this.viewYaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.panWorld((rx * dx + fx * dy) * s, (rz * dx + fz * dy) * s);
  }

  zoomBy(f: number): void {
    this.dist = clamp(this.dist * f, 16, this.maxDist);
  }

  rotate(d: number): void {
    this.yaw += d;
  }

  tilt(d: number): void {
    this.pitch = clamp(this.pitch + d, 0.52, 1.31);
  }

  /** Điểm mặt đất dưới vị trí màn hình (sx, sy). Dò dần độ cao vì địa hình không phẳng. */
  ground(sx: number, sy: number, w: number, h: number): THREE.Vector3 | null {
    this.ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y > -1e-4) return null;
    // trên bản đồ giấy, điểm chạm nằm ngay trên mặt giấy phẳng
    if (this.strategic >= 0.5) {
      const t0 = -o.y / d.y;
      return new THREE.Vector3(o.x + d.x * t0, 0, o.z + d.z * t0);
    }
    let y = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const t = (y - o.y) / d.y;
      p.set(o.x + d.x * t, y, o.z + d.z * t);
      y = this.map.groundY(clamp(p.x, -this.map.halfW - 15, this.map.halfW + 15), clamp(p.z, -this.map.halfH - 15, this.map.halfH + 15));
    }
    p.y = y;
    return p;
  }

  /** Chiếu điểm 3D lên màn hình (pixel CSS). visible = false nếu ở sau camera. */
  project(x: number, y: number, z: number, w: number, h: number): { x: number; y: number; visible: boolean } {
    this.tmp.set(x, y, z).project(this.cam);
    return { x: (this.tmp.x * 0.5 + 0.5) * w, y: (-this.tmp.y * 0.5 + 0.5) * h, visible: this.tmp.z < 1 && this.tmp.z > -1 };
  }
}
