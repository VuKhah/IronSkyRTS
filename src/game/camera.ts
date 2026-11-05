/**
 * Camera RTS 3D: nhìn vào một điểm trên mặt đất (tx, tz), từ khoảng cách `dist`,
 * xoay quanh trục đứng (`yaw`) và nghiêng (`pitch`, giới hạn 30°–75° để trận luôn dễ đọc).
 */
import * as THREE from "three";
import type { GameMap } from "../sim/maps";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class RtsCamera {
  tx = 0;
  tz = 0;
  dist = 64;
  yaw = 0;
  pitch = 0.95;
  readonly cam = new THREE.PerspectiveCamera(40, 1, 0.5, 700);
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();

  constructor(private map: GameMap) {}

  apply(): void {
    const ty = Math.max(0, this.map.groundY(this.tx, this.tz));
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.cam.position.set(this.tx + Math.sin(this.yaw) * cp * this.dist, ty + sp * this.dist, this.tz + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.tx, ty, this.tz);
    this.cam.updateMatrixWorld();
  }

  setAspect(w: number, h: number): void {
    this.cam.aspect = w / Math.max(1, h);
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
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.panWorld((rx * dx + fx * dy) * s, (rz * dx + fz * dy) * s);
  }

  zoomBy(f: number): void {
    this.dist = clamp(this.dist * f, 16, 150);
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
