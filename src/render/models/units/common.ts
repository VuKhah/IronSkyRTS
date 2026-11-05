/** Dùng chung cho mọi mô hình binh chủng: đạn bay và vết nổ thuần hình ảnh (không thuộc luật chơi). */
import * as THREE from "three";
import { group, tubeZ, type Palette } from "../kit";

export const V = new THREE.Vector3();
export const FORWARD = new THREE.Vector3(0, 0, 1);

/** Đạn bay thuần hình ảnh (tên lửa, bom) trong hệ tọa độ của mô hình. */
export class Shots {
  private list: { o: THREE.Object3D; v: THREE.Vector3; life: number; g: number; onEnd?: () => void }[] = [];
  constructor(private parent: THREE.Object3D) { }
  spawn(o: THREE.Object3D, from: THREE.Object3D, vel: THREE.Vector3, life: number, gravity = 0, onEnd?: () => void): void {
    this.parent.updateMatrixWorld(true);
    from.getWorldPosition(V);
    this.parent.worldToLocal(V);
    o.position.copy(V);
    this.parent.add(o);
    this.list.push({ o, v: vel.clone(), life, g: gravity, onEnd });
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]!;
      s.v.y -= s.g * dt;
      s.o.position.addScaledVector(s.v, dt);
      if (s.v.lengthSq() > 1e-6) s.o.quaternion.setFromUnitVectors(FORWARD, V.copy(s.v).normalize());
      s.life -= dt;
      if (s.life <= 0 || s.o.position.y < 0) {
        s.onEnd?.();
        this.parent.remove(s.o);
        s.o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
        this.list.splice(i, 1);
      }
    }
  }
}

export function missileMesh(p: Palette, len = 0.55, r = 0.05): THREE.Group {
  const g = group(tubeZ(r, r, len, p.white, 6));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 3, 6), p.teamDark);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len / 2 + r * 1.5;
  const trail = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, len * 0.9, 6), p.flash);
  trail.rotation.x = -Math.PI / 2;
  trail.position.z = -len / 2 - len * 0.45;
  g.add(tip, trail);
  return g;
}

/** Vết nổ nhỏ chỗ đạn chạm đất. */
export function blast(parent: THREE.Object3D, at: THREE.Vector3, p: Palette, size: number): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), p.flash.clone());
  m.position.copy(at).setY(Math.max(0.05, at.y));
  parent.add(m);
  const start = performance.now();
  const mat = m.material as THREE.MeshBasicMaterial;
  const step = () => {
    const k = (performance.now() - start) / 350;
    if (k >= 1) {
      parent.remove(m);
      m.geometry.dispose();
      mat.dispose();
      return;
    }
    m.scale.setScalar(0.4 + k * 1.4);
    mat.opacity = 0.9 * (1 - k);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
