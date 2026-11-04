/**
 * Cầu nối sim → hình: mỗi thực thể trong World có một mô hình 3D (Rig) tương ứng.
 * - Vị trí được NỘI SUY giữa tick trước và tick hiện tại (alpha) để chuyển động mượt.
 * - Quân địch ngoài tầm nhìn (sương mù) không được vẽ; công trình địch hiện khi đã từng phát hiện.
 * - Hoạt ảnh lấy từ trạng thái sim: đang chạy → "move", vừa bắn → "fire", tháp pháo quay về mục tiêu thật.
 */
import * as THREE from "three";
import { BUILDINGS, FACTION_OF, UNITS, type Side } from "../sim/content";
import { groundY } from "../sim/map";
import type { Building, Mine, Target, Unit } from "../sim/types";
import { AIRBORNE_ALT, DT, type World } from "../sim/world";
import { buildModel, buildNode, disposeRig, type NodeRig, type Rig } from "../render/models";

const wrap = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

interface View {
  rig: Rig;
  yaw: number;
  prevYaw: number;
  roll: number;
  ring: THREE.Mesh | null;
  active: Set<string>;
  seen: number;
}

interface MineView {
  node: NodeRig;
  ring: THREE.Mesh | null;
}

const ringGeo = new Map<number, THREE.RingGeometry>();
function ringGeometry(r: number): THREE.RingGeometry {
  const k = Math.round(r * 10);
  let g = ringGeo.get(k);
  if (!g) {
    g = new THREE.RingGeometry(r * 1.15, r * 1.32, 40);
    g.rotateX(-Math.PI / 2);
    ringGeo.set(k, g);
  }
  return g;
}
const RING_MAT = {
  own: new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0.9, depthWrite: false }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.9, depthWrite: false }),
  neutral: new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.9, depthWrite: false })
};

export class Views {
  private units = new Map<number, View>();
  private buildings = new Map<number, View>();
  private mines = new Map<number, MineView>();
  private frame = 0;

  constructor(private scene: THREE.Scene) {}

  /** Toàn bộ thực thể đang hiển thị (để chọn bằng chạm/chuột và vẽ thanh máu). */
  visibleUnits(world: World, viewer: Side | null): Unit[] {
    return world.units.filter((u) => viewer === null || u.side === viewer || world.visibleTo(viewer, u));
  }
  visibleBuildings(world: World, viewer: Side | null): Building[] {
    return world.buildings.filter((b) => viewer === null || b.side === viewer || world.sides[viewer].known.has(b.id));
  }

  sync(world: World, viewer: Side | null, alpha: number, dt: number, time: number, selected: ReadonlySet<number>): void {
    this.frame++;
    const f = this.frame;
    for (const u of this.visibleUnits(world, viewer)) {
      let v = this.units.get(u.id);
      if (!v) {
        const rig = buildModel(u.kind, FACTION_OF[u.side], false);
        const yaw = Math.atan2(u.hx, u.hz);
        v = { rig, yaw, prevYaw: yaw, roll: 0, ring: null, active: new Set(), seen: f };
        this.scene.add(rig.root);
        this.units.set(u.id, v);
      }
      v.seen = f;
      this.updateUnit(world, u, v, alpha, dt, time, selected.has(u.id), viewer);
    }
    for (const b of this.visibleBuildings(world, viewer)) {
      let v = this.buildings.get(b.id);
      if (!v) {
        const rig = buildModel(b.kind, FACTION_OF[b.side], false);
        rig.root.position.set(b.x, groundY(b.x, b.z), b.z);
        v = { rig, yaw: 0, prevYaw: 0, roll: 0, ring: null, active: new Set(), seen: f };
        this.scene.add(rig.root);
        this.buildings.set(b.id, v);
      }
      v.seen = f;
      this.updateBuilding(world, b, v, dt, time, selected.has(b.id), viewer);
    }
    for (const m of world.mines) {
      let v = this.mines.get(m.id);
      if (!v) {
        const node = buildNode(m.res);
        node.root.position.set(m.x, groundY(m.x, m.z), m.z);
        this.scene.add(node.root);
        v = { node, ring: null };
        this.mines.set(m.id, v);
      }
      this.updateMine(m, v, dt, time, selected.has(m.id));
    }
    this.sweep(this.units, f);
    this.sweep(this.buildings, f);
  }

  private sweep(map: Map<number, View>, f: number): void {
    for (const [id, v] of map) {
      if (v.seen === f) continue;
      this.scene.remove(v.rig.root);
      disposeRig(v.rig);
      map.delete(id);
    }
  }

  private setRing(v: { ring: THREE.Mesh | null }, parent: THREE.Object3D, on: boolean, r: number, mat: THREE.MeshBasicMaterial, y = 0.1): void {
    if (on && !v.ring) {
      v.ring = new THREE.Mesh(ringGeometry(r), mat);
      v.ring.renderOrder = 3;
      parent.add(v.ring);
    }
    if (v.ring) {
      v.ring.visible = on;
      v.ring.material = mat;
      v.ring.position.y = y;
    }
  }

  private aimAt(world: World, x: number, z: number, yaw: number, targetId: number): number | null {
    const t: Target | null = world.target(targetId);
    if (!t) return null;
    return wrap(Math.atan2(t.x - x, t.z - z) - yaw);
  }

  private updateUnit(world: World, u: Unit, v: View, alpha: number, dt: number, time: number, selected: boolean, viewer: Side | null): void {
    const spec = UNITS[u.kind];
    const x = u.px + (u.x - u.px) * alpha;
    const z = u.pz + (u.z - u.pz) * alpha;
    const alt = u.palt + (u.alt - u.palt) * alpha;
    const hx = u.phx + (u.hx - u.phx) * alpha;
    const hz = u.phz + (u.hz - u.phz) * alpha;
    const target = Math.atan2(hx, hz);
    const root = v.rig.root;
    const a = v.active;
    a.clear();

    if (u.air !== "none") {
      // máy bay: hướng bay khá mượt sẵn; nghiêng cánh theo tốc độ ngoặt
      const turn = wrap(target - v.yaw);
      v.yaw = target;
      const rollTarget = Math.max(-0.95, Math.min(0.95, (-turn / Math.max(dt, 1e-3)) * 0.35));
      v.roll += (rollTarget - v.roll) * Math.min(1, dt * 6);
      const parked = u.air === "parked";
      const y = groundY(x, z) + (parked || alt < 0.05 ? 0.22 : alt);
      root.position.set(x, y, z);
      root.rotation.set(0, v.yaw, 0);
      v.rig.setFlight?.(alt > 0.6, u.air === "flying" || u.air === "returning" ? v.roll : 0);
    } else {
      v.yaw += wrap(target - v.yaw) * Math.min(1, dt * 10);
      const y = groundY(x, z);
      // nghiêng thân theo dốc: lấy độ cao trước/sau và trái/phải
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      const L = spec.radius;
      const pitch = Math.atan2(groundY(x - fx * L, z - fz * L) - groundY(x + fx * L, z + fz * L), L * 2);
      const roll = Math.atan2(groundY(x + fz * L, z - fx * L) - groundY(x - fz * L, z + fx * L), L * 2);
      root.position.set(x, y, z);
      root.rotation.set(pitch, v.yaw, roll, "YXZ");
      if (u.moved || u.px !== u.x || u.pz !== u.z) a.add("move");
      if (u.kind === "hauler") {
        if (u.cargo > 0) a.add(u.cargoRes === "oil" ? "loadOil" : "load");
      } else {
        const tid = u.targetId || u.autoTarget;
        v.rig.setAim?.(this.aimAt(world, x, z, v.yaw, tid));
        const w = spec.weapon;
        if (w && (w.visual === "bullet" || w.visual === "cannon") && (world.tick - u.lastShot) * DT < Math.max(0.45, w.cooldown * 0.9)) a.add("fire");
      }
    }
    v.rig.update(dt, time, a);
    const mat = viewer === null ? (u.side === 0 ? RING_MAT.own : RING_MAT.enemy) : u.side === viewer ? RING_MAT.own : RING_MAT.enemy;
    this.setRing(v, root, selected, spec.radius, mat, u.alt > AIRBORNE_ALT ? -alt + 0.12 : 0.12);
    if (v.ring && u.alt > AIRBORNE_ALT) v.ring.position.y = groundY(x, z) - root.position.y + 0.12;
  }

  private updateBuilding(world: World, b: Building, v: View, dt: number, time: number, selected: boolean, viewer: Side | null): void {
    const spec = BUILDINGS[b.kind];
    const root = v.rig.root;
    root.scale.y = b.built ? 1 : 0.15 + 0.85 * b.progress;
    const a = v.active;
    a.clear();
    if (b.built) {
      if (b.kind === "factory") {
        if (b.queue.length) a.add("work");
      } else a.add("work");
      if (spec.weapon) {
        v.rig.setAim?.(this.aimAt(world, b.x, b.z, 0, b.targetId));
        if ((world.tick - b.lastShot) * DT < Math.max(0.45, spec.weapon.cooldown * 0.9)) a.add("fire");
      }
    }
    v.rig.update(dt, time, a);
    const mat = viewer === null ? (b.side === 0 ? RING_MAT.own : RING_MAT.enemy) : b.side === viewer ? RING_MAT.own : RING_MAT.enemy;
    this.setRing(v, root, selected, Math.max(spec.half[0], spec.half[1]), mat, 0.14);
  }

  private updateMine(m: Mine, v: MineView, dt: number, time: number, selected: boolean): void {
    v.node.setOwner(m.owner);
    v.node.setAmount(m.amount / m.max);
    v.node.update(dt, time);
    this.setRing(v, v.node.root, selected, 3.6, RING_MAT.neutral, 0.14);
  }

  /** Vị trí hiển thị (nội suy) của một đơn vị — cho thanh máu và chọn bằng chạm. */
  static displayPos(u: Unit, alpha: number): [number, number, number] {
    const x = u.px + (u.x - u.px) * alpha;
    const z = u.pz + (u.z - u.pz) * alpha;
    const alt = u.palt + (u.alt - u.palt) * alpha;
    return [x, groundY(x, z) + (alt < 0.05 ? 0.22 * (u.air === "parked" ? 1 : 0) : alt), z];
  }
}
