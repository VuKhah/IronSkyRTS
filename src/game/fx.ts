/**
 * Hiệu ứng thuần hình ảnh, sinh ra từ sự kiện của sim (shot, hit, death, captured…).
 * Không ảnh hưởng tới trận đấu nên được dùng Math.random thoải mái.
 */
import * as THREE from "three";
import type { WeaponVisual } from "../sim/content";
import { groundY } from "../sim/map";
import type { SimEvent } from "../sim/types";
import { DT, type World } from "../sim/world";

interface Particle {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  vel: THREE.Vector3;
  grow: number;
  fade: boolean;
  gravity: number;
  spin: number;
}

interface Tracer {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: number;
  t: number;
  dur: number;
  visual: WeaponVisual;
  arc: number;
  smokeT: number;
}

const add = (color: number, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export class Fx {
  private parts: Particle[] = [];
  private tracers: Tracer[] = [];
  private geo = {
    sphere: new THREE.SphereGeometry(1, 10, 8),
    bullet: new THREE.BoxGeometry(0.12, 0.12, 1.4),
    shell: new THREE.SphereGeometry(0.22, 8, 6),
    missile: new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6).rotateX(Math.PI / 2),
    debris: new THREE.BoxGeometry(0.5, 0.35, 0.6),
    ring: new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
    scorch: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)
  };
  private mat = {
    bullet: add(0xffe08a),
    shell: add(0xffb347),
    missile: new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
    flash: add(0xfff1c2),
    fire: add(0xff8a2a),
    smoke: new THREE.MeshBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.5, depthWrite: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.6, depthWrite: false }),
    debris: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.9, transparent: true }),
    scorch: new THREE.MeshBasicMaterial({ color: 0x15120f, transparent: true, opacity: 0.55, depthWrite: false })
  };

  constructor(private scene: THREE.Scene) {}

  private spawn(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, scale: number, life: number, opts: Partial<Omit<Particle, "mesh" | "life" | "max">> = {}): Particle {
    // giới hạn số hạt: trận đông thì bỏ hạt cũ nhất thay vì để máy chậm đi
    if (this.parts.length > 260) {
      const old = this.parts.shift()!;
      this.scene.remove(old.mesh);
      if (old.fade) (old.mesh.material as THREE.Material).dispose();
    }
    const mesh = new THREE.Mesh(geo, opts.fade === false ? mat : (mat as THREE.Material).clone());
    mesh.position.copy(pos);
    mesh.scale.setScalar(scale);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    const p: Particle = { mesh, life, max: life, vel: opts.vel ?? new THREE.Vector3(), grow: opts.grow ?? 0, fade: opts.fade ?? true, gravity: opts.gravity ?? 0, spin: opts.spin ?? 0 };
    this.parts.push(p);
    return p;
  }

  private boom(pos: THREE.Vector3, size: number): void {
    this.spawn(this.geo.sphere, this.mat.flash, pos, size * 0.6, 0.18, { grow: size * 6 });
    this.spawn(this.geo.sphere, this.mat.fire, pos, size * 0.5, 0.45, { grow: size * 2.4, vel: new THREE.Vector3(0, 1.5, 0) });
    const puffs = Math.min(6, 2 + Math.round(size * 2));
    for (let i = 0; i < puffs; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2);
      this.spawn(this.geo.sphere, this.mat.smoke, pos.clone().add(new THREE.Vector3(0, size * 0.3, 0)), size * 0.45, 1.4 + Math.random(), { vel: v, grow: size * 0.9 });
    }
  }

  /** Nhận sự kiện của tick vừa chạy. visible(x,z) = phe đang xem có thấy chỗ đó không. */
  handle(events: readonly SimEvent[], world: World, visible: (x: number, z: number) => boolean): void {
    for (const e of events) {
      switch (e.t) {
        case "shot": {
          if (!visible(e.x, e.z) && !visible(e.tx, e.tz)) break;
          const from = new THREE.Vector3(e.x, groundY(e.x, e.z) + (e.alt > 0.5 ? e.alt : 1.6), e.z);
          const to = new THREE.Vector3(e.tx, groundY(e.tx, e.tz) + (e.talt > 0.5 ? e.talt : 1.0), e.tz);
          const geo = e.visual === "missile" ? this.geo.missile : e.visual === "cannon" ? this.geo.shell : this.geo.bullet;
          const mat = e.visual === "missile" ? this.mat.missile : e.visual === "cannon" ? this.mat.shell : this.mat.bullet;
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(from);
          mesh.renderOrder = 5;
          this.scene.add(mesh);
          this.tracers.push({ mesh, from, to, target: e.target, t: 0, dur: Math.max(0.06, e.ticks * DT), visual: e.visual, arc: e.visual === "missile" ? 2.5 : e.visual === "cannon" ? 1.2 : 0, smokeT: 0 });
          if (e.visual === "missile") this.spawn(this.geo.sphere, this.mat.smoke, from, 0.35, 0.6, { grow: 1.2 });
          break;
        }
        case "hit": {
          if (!visible(e.x, e.z)) break;
          const pos = new THREE.Vector3(e.x, groundY(e.x, e.z) + (e.alt > 0.5 ? e.alt : 0.8), e.z);
          if (e.splash > 0) this.boom(pos, 0.5 + e.splash * 0.35);
          else this.spawn(this.geo.sphere, this.mat.flash, pos, 0.25, 0.12, { grow: 3 });
          break;
        }
        case "death": {
          if (e.sold || !visible(e.x, e.z)) break;
          const y = groundY(e.x, e.z);
          const pos = new THREE.Vector3(e.x, y + (e.alt > 0.5 ? e.alt : 1), e.z);
          const size = e.building ? 3.2 : e.crash ? 1.8 : 1.5;
          this.boom(pos, size);
          if (e.building) {
            this.boom(pos.clone().add(new THREE.Vector3(1.5, 1, -1)), 2);
            this.boom(pos.clone().add(new THREE.Vector3(-1.5, 0.5, 1.2)), 1.6);
          }
          const n = e.building ? 10 : 5;
          for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
            this.spawn(this.geo.debris, this.mat.debris, pos, 0.6 + Math.random() * 0.8, 1.6, { vel: v, gravity: 16, spin: 6, fade: false });
          }
          // vết cháy trên mặt đất
          const scorch = this.spawn(this.geo.scorch, this.mat.scorch, new THREE.Vector3(e.x, y + 0.08, e.z), e.building ? 6 : 2.4, 25, {});
          scorch.mesh.renderOrder = 1;
          break;
        }
        case "captured": {
          const m = world.byId.get(e.mine);
          if (!m) break;
          const color = e.side === 0 ? 0x2e9eff : e.side === 1 ? 0xf23d3d : 0xdddddd;
          this.spawn(this.geo.ring, add(color, 0.9), new THREE.Vector3(m.x, groundY(m.x, m.z) + 0.3, m.z), 3, 0.9, { grow: 14, fade: true });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Dấu lệnh trên mặt đất (xanh = đi, đỏ = tấn công, vàng = khai thác). */
  marker(x: number, z: number, color: number): void {
    this.spawn(this.geo.ring, add(color, 0.95), new THREE.Vector3(x, groundY(x, z) + 0.25, z), 2.2, 0.5, { grow: -3 });
  }

  update(dt: number, world: World, targetPos: (id: number) => THREE.Vector3 | null): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      const live = targetPos(tr.target);
      if (live) tr.to.lerp(live, 0.35);
      const k = Math.min(1, tr.t / tr.dur);
      const p = tr.from.clone().lerp(tr.to, k);
      p.y += Math.sin(k * Math.PI) * tr.arc;
      const prev = tr.mesh.position.clone();
      tr.mesh.position.copy(p);
      if (p.distanceToSquared(prev) > 1e-6) tr.mesh.lookAt(p.clone().add(p.clone().sub(prev)));
      if (tr.visual === "missile") {
        tr.smokeT -= dt;
        if (tr.smokeT <= 0) {
          tr.smokeT = 0.035;
          this.spawn(this.geo.sphere, this.mat.smoke, p, 0.22, 0.7, { grow: 0.9 });
        }
      }
      if (k >= 1) {
        this.scene.remove(tr.mesh);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.fade) (p.mesh.material as THREE.Material).dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.gravity > 0) {
        const gy = groundY(p.mesh.position.x, p.mesh.position.z) + 0.15;
        if (p.mesh.position.y < gy) {
          p.mesh.position.y = gy;
          p.vel.set(0, 0, 0);
          p.spin = 0;
        }
      }
      if (p.spin) p.mesh.rotation.x += p.spin * dt;
      if (p.grow) p.mesh.scale.addScalar(p.grow * dt);
      if (p.mesh.scale.x < 0.05) p.mesh.scale.setScalar(0.05);
      const k = p.life / p.max;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      if (p.fade) m.opacity = Math.min(m.opacity, k * (m.blending === THREE.AdditiveBlending ? 1 : 0.55));
      else if (k < 0.3) p.mesh.scale.multiplyScalar(0.9); // vật liệu dùng chung: thu nhỏ dần thay vì làm mờ
    }
    void world;
  }
}
