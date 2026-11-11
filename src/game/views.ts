/**
 * Cầu nối sim → hình: mỗi thực thể trong World có một mô hình 3D (Rig) tương ứng.
 * - Vị trí được NỘI SUY giữa tick trước và tick hiện tại (alpha) để chuyển động mượt.
 * - Quân địch ngoài tầm nhìn (sương mù) không được vẽ; công trình địch hiện khi đã từng phát hiện.
 * - Hoạt ảnh lấy từ trạng thái sim: đang chạy → "move", vừa bắn → "fire", tháp pháo quay về mục tiêu thật.
 */
import * as THREE from "three";
import { ExitArrows } from "./exit-arrows";
import { Paving } from "./paving";
import { sec } from "../sim/world";
import { BUILDINGS, doorDir, FACTION_OF, RULES, rotOffset, UNITS, type Side, lotTime } from "../sim/content";
import type { GameMap } from "../sim/maps";
import type { Building, Mine, Target, Unit, Uplink, Wreck } from "../sim/types";
import { AIRBORNE_ALT, DT, type World } from "../sim/world";
import { CELL } from "../sim/maps";

/** 4 hướng ô bên cạnh (tường nối hình). */
const DIRS4: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
import { buildModel, buildNode, disposeRig, type NodeRig, type Rig } from "../render/models";
import { bakeObject, bakeStatic } from "../render/models/bake";

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
  /** Máy bay: góc chúc mũi (dương = chúc xuống) theo tốc độ hạ độ cao. */
  pitch: number;
  ring: THREE.Mesh | null;
  active: Set<string>;
  seen: number;
  /** Tick của phát bắn đã báo cho mô hình: `lastShot` đổi nghĩa là sim vừa bắn thêm một phát. */
  lastShot: number;
  /** Các miệng nòng và ống vừa dùng, để đường đạn xuất phát đúng chỗ. */
  muzzles: THREE.Object3D[];
  muzzleCursor: number;
}

function muzzlesOf(rig: Rig): THREE.Object3D[] {
  if (rig.muzzlePoints) return rig.muzzlePoints;
  const found: THREE.Object3D[] = [];
  rig.root.traverse((o) => {
    if (o.userData.muzzle) found.push(o);
  });
  return found;
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

/** Vùng sắp rải thảm (lệnh của Xe Tên Lửa Loạt phe mình): vòng đỏ bán kính = độ tản của vũ khí. */
const STRIKE_MAT = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.85, depthWrite: false });
const RING_UNIT = new THREE.RingGeometry(0.955, 1, 72).rotateX(-Math.PI / 2);

/** Đài Liên Lạc: màu theo phe (trung lập = xám). */
const UPLINK_COLOR = [0x3ea8ff, 0xff4d4d];
const UPLINK_NEUTRAL = 0xdddddd;
const UPLINK_METAL = new THREE.MeshStandardMaterial({ color: 0x59616b, roughness: 0.6, metalness: 0.5 });
const UPLINK_DISH = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });

interface UplinkView {
  root: THREE.Group;
  beacon: THREE.MeshStandardMaterial;
  ring: THREE.MeshBasicMaterial;
}

/** Cột ăng-ten: đế, cột, hai thanh ngang, chảo, đèn hiệu đổi màu theo phe; vòng trên đất = bán kính chiếm. */
function buildUplink(): UplinkView {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), UPLINK_METAL);
  base.position.y = 0.25;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 6.6, 6), UPLINK_METAL);
  mast.position.y = 3.8;
  root.add(base, mast);
  for (const y of [2.6, 4.6]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), UPLINK_METAL);
    bar.position.y = y;
    bar.rotation.y = y > 3 ? Math.PI / 2 : 0;
    root.add(bar);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), UPLINK_DISH);
  dish.position.set(0, 5.4, 0.25);
  dish.rotation.x = Math.PI / 2.4;
  root.add(dish);
  const beacon = new THREE.MeshStandardMaterial({ color: UPLINK_NEUTRAL, emissive: UPLINK_NEUTRAL, emissiveIntensity: 0.8 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), beacon);
  light.position.y = 7.25;
  root.add(light);
  const ring = new THREE.MeshBasicMaterial({ color: UPLINK_NEUTRAL, transparent: true, opacity: 0.35, depthWrite: false });
  const r = RULES.captureRadius;
  const area = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r, 72).rotateX(-Math.PI / 2), ring);
  area.position.y = 0.15;
  area.renderOrder = 3;
  root.add(area);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== area) o.castShadow = true;
  });
  return { root, beacon, ring };
}

/** Vật liệu cháy đen dùng chung cho mọi xác quân (một vật liệu → mỗi xác gộp được thành một lệnh vẽ). */
const WRECK_MAT = new THREE.MeshStandardMaterial({ color: 0x3b3733, roughness: 0.95, metalness: 0.15 });

/** Thời gian bật hoạt ảnh tung chiêu khi vừa Tổng động viên (giây). */
const CAST_WINDOW = 2.2;

export class Views {
  private units = new Map<number, View>();
  private buildings = new Map<number, View>();
  private mines = new Map<number, MineView>();
  private wrecks = new Map<number, { root: THREE.Object3D; seen: number }>();
  private strikeViews = new Map<number, THREE.Mesh>();
  private uplinkViews = new Map<number, UplinkView>();
  private frame = 0;

  /** Mặt đường quanh công trình (một mesh, dựng lại khi danh sách nhà nhìn thấy thay đổi). */
  private paving: Paving;
  /** Mũi tên cửa ra trước các nhà đang được chọn (theo id công trình). */
  private arrows = new Map<number, ExitArrows>();

  constructor(
    private scene: THREE.Scene,
    private map: GameMap
  ) {
    this.paving = new Paving(scene, map);
  }

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
        bakeStatic(rig);
        const yaw = Math.atan2(u.hx, u.hz);
        v = { rig, yaw, prevYaw: yaw, roll: 0, pitch: 0, ring: null, active: new Set(), seen: f, lastShot: u.lastShot, muzzles: muzzlesOf(rig), muzzleCursor: -1 };
        this.scene.add(rig.root);
        this.units.set(u.id, v);
      }
      v.seen = f;
      this.updateUnit(world, u, v, alpha, dt, time, selected.has(u.id), viewer);
    }
    const seenBuildings = this.visibleBuildings(world, viewer);
    this.paving.sync(world, seenBuildings);
    // công trình lát theo ô (tường): ô nào có tường cùng loại cùng phe (người xem đang thấy / còn nhớ), để nối hình
    const tiles = new Set<string>();
    for (const b of seenBuildings) if (BUILDINGS[b.kind].tile && b.hp > 0) tiles.add(`${b.side}:${b.kind}:${b.x},${b.z}`);
    for (const b of seenBuildings) {
      let v = this.buildings.get(b.id);
      if (!v) {
        const rig = buildModel(b.kind, FACTION_OF[b.side], false);
        bakeStatic(rig);
        rig.root.position.set(b.x, this.map.groundY(b.x, b.z), b.z);
        rig.root.rotation.y = (b.rot * Math.PI) / 2; // nấc xoay = hướng cửa (+z của mô hình)
        v = { rig, yaw: 0, prevYaw: 0, roll: 0, pitch: 0, ring: null, active: new Set(), seen: f, lastShot: b.lastShot, muzzles: muzzlesOf(rig), muzzleCursor: -1 };
        this.scene.add(rig.root);
        this.buildings.set(b.id, v);
      }
      v.seen = f;
      if (BUILDINGS[b.kind].tile && v.rig.setLinks) {
        let mask = 0;
        for (const [dx, dz] of DIRS4) {
          if (!tiles.has(`${b.side}:${b.kind}:${b.x + dx * CELL},${b.z + dz * CELL}`)) continue;
          // hướng thế giới → khung mô hình (xoay ngược nấc của nhà)
          const [lx, lz] = rotOffset(dx, dz, (4 - (b.rot & 3)) & 3);
          mask |= lx > 0.5 ? 1 : lx < -0.5 ? 2 : lz > 0.5 ? 4 : 8;
        }
        v.rig.setLinks(mask);
      }
      this.updateBuilding(world, b, v, dt, time, selected.has(b.id), viewer);
    }
    // ba mũi tên chỉ hướng cửa ra trước nhà phe mình đang được chọn
    for (const b of seenBuildings) {
      const ex = selected.has(b.id) && b.side === viewer ? world.exitRect(b.kind, b.x, b.z, b.rot) : null;
      let a = this.arrows.get(b.id);
      if (!ex) {
        a?.hide();
        continue;
      }
      if (!a) this.arrows.set(b.id, (a = new ExitArrows(this.scene, this.map)));
      const [dx, dz] = doorDir(b.rot);
      // giữa mép cửa = tâm ô cửa ra lùi về phía nhà nửa chiều sâu ô
      a.show(ex[0] - dx * ex[2], ex[1] - dz * ex[3], dx, dz, time);
    }
    for (const [id, a] of this.arrows)
      if (!world.buildings.some((b) => b.id === id)) {
        a.dispose();
        this.arrows.delete(id);
      }
    for (const m of world.mines) {
      let v = this.mines.get(m.id);
      if (!v) {
        const node = buildNode(m.res);
        bakeObject(node.root, (check) => {
          for (let i = 0; i < 30; i++) {
            node.setOwner(i % 2 === 0 ? 0 : 1);
            node.setAmount(i < 15 ? 1 : 0.3);
            node.update(0.05, i * 0.05);
            check();
          }
          node.setAmount(1);
        });
        node.root.position.set(m.x, this.map.groundY(m.x, m.z), m.z);
        this.scene.add(node.root);
        v = { node, ring: null };
        this.mines.set(m.id, v);
      }
      this.updateMine(m, v, dt, time, selected.has(m.id));
    }
    this.syncStrikes(world, viewer);
    for (const up of world.uplinks) this.syncUplink(up, time);
    for (const wr of world.wrecks) {
      // xác trong sương mù thì không thấy
      if (viewer !== null && !world.cellVisible(viewer, wr.x, wr.z)) continue;
      let v = this.wrecks.get(wr.id);
      if (!v) {
        v = { root: this.buildWreck(wr), seen: f };
        this.scene.add(v.root);
        this.wrecks.set(wr.id, v);
      }
      v.seen = f;
    }
    for (const [id, v] of this.wrecks) {
      if (v.seen === f) continue;
      this.scene.remove(v.root);
      v.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.wrecks.delete(id);
    }
    this.sweep(this.units, f);
    this.sweep(this.buildings, f);
  }

  /** Đài Liên Lạc: màu đèn hiệu và vòng chiếm theo chủ; đang bị giành thì nhấp nháy màu phe đang chiếm. */
  private syncUplink(up: Uplink, time: number): void {
    let v = this.uplinkViews.get(up.id);
    if (!v) {
      v = buildUplink();
      v.root.position.set(up.x, this.map.groundY(up.x, up.z), up.z);
      // chảo quay về phía tâm bản đồ
      v.root.rotation.y = Math.atan2(-up.x, -up.z);
      this.scene.add(v.root);
      this.uplinkViews.set(up.id, v);
    }
    const contested = up.cap > 0 && up.cap < 1 && up.capSide !== -1 && up.capSide !== up.owner;
    const side = contested ? up.capSide : up.owner;
    const color = side === -1 ? UPLINK_NEUTRAL : UPLINK_COLOR[side];
    v.beacon.color.setHex(color);
    v.beacon.emissive.setHex(color);
    v.ring.color.setHex(color);
    v.ring.opacity = contested ? 0.35 + 0.3 * Math.abs(Math.sin(time * 6)) : up.owner === -1 ? 0.3 : 0.45;
  }

  /**
   * Vòng đỏ ở vùng sắp rải thảm, vẽ THEO TRẠNG THÁI (lệnh "strike" của xe phe mình), không theo sự kiện: tua nhanh hay
   * vào muộn vẫn đúng. Địch không thấy vòng này, chỉ nghe tiếng rít khi tên lửa đã rời dàn.
   */
  private syncStrikes(world: World, viewer: Side | null): void {
    const live = new Set<number>();
    for (const u of world.units) {
      if (u.order !== "strike" || (viewer !== null && u.side !== viewer)) continue;
      const w = UNITS[u.kind].weapon;
      if (!w?.scatter) continue;
      live.add(u.id);
      let m = this.strikeViews.get(u.id);
      if (!m) {
        m = new THREE.Mesh(RING_UNIT, STRIKE_MAT);
        m.renderOrder = 4;
        this.scene.add(m);
        this.strikeViews.set(u.id, m);
      }
      m.position.set(u.tx, this.map.groundY(u.tx, u.tz) + 0.35, u.tz);
      m.scale.setScalar(w.scatter);
    }
    for (const [id, m] of this.strikeViews)
      if (!live.has(id)) {
        this.scene.remove(m);
        this.strikeViews.delete(id);
      }
  }

  /** Xác: chính mô hình chiếc xe, cháy đen, nghiêng, lún xuống đất; gộp thành một lệnh vẽ. */
  private buildWreck(wr: Wreck): THREE.Object3D {
    const rig = buildModel(wr.kind, FACTION_OF[wr.side], false);
    rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = WRECK_MAT;
        o.castShadow = true;
      }
    });
    bakeObject(rig.root, () => {});
    const root = rig.root;
    const tilt = ((wr.id % 7) - 3) * 0.05;
    root.position.set(wr.x, this.map.groundY(wr.x, wr.z) - 0.15, wr.z);
    root.rotation.set(tilt, Math.atan2(wr.hx, wr.hz) + tilt * 2, -tilt * 0.8, "YXZ");
    root.scale.setScalar(0.95);
    return root;
  }

  /** Các xác đang hiện (để phần hiệu ứng thả khói). */
  wreckPositions(): THREE.Vector3[] {
    return [...this.wrecks.values()].map((v) => v.root.position);
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
    let x = u.px + (u.x - u.px) * alpha;
    let z = u.pz + (u.z - u.pz) * alpha;
    const alt = u.palt + (u.alt - u.palt) * alpha;
    let hx = u.phx + (u.hx - u.phx) * alpha;
    let hz = u.phz + (u.hz - u.phz) * alpha;
    if (Views.curved(u)) [x, z, hx, hz] = Views.hermite(u, alpha);
    const target = Math.atan2(hx, hz);
    const root = v.rig.root;
    const a = v.active;
    a.clear();

    if (u.air !== "none") {
      // máy bay: hướng bay khá mượt sẵn; nghiêng cánh theo tốc độ ngoặt. Drone đổi hướng tức thì trong sim: xoay mượt ở đây
      const turn = wrap(target - v.yaw);
      v.yaw = spec.hover ? v.yaw + turn * Math.min(1, dt * 8) : target;
      const rollTarget = Math.max(-0.95, Math.min(0.95, (-turn / Math.max(dt, 1e-3)) * 0.35));
      v.roll += (rollTarget - v.roll) * Math.min(1, dt * 6);
      const parked = u.air === "parked";
      // drone: gốc mô hình trên mặt đất (vùng khiên bám đất), thân treo ở độ cao của sim
      if (spec.hover) v.rig.setHover?.(alt);
      const y = this.map.groundY(x, z) + (spec.hover ? 0 : parked || alt < 0.05 ? 0.22 : alt);
      root.position.set(x, y, z);
      // chúc mũi khi bổ nhào, ngóc mũi khi kéo lên: theo tốc độ đổi độ cao của sim
      const flying = u.air === "flying" || u.air === "returning";
      const sink = flying ? (u.palt - u.alt) / DT : 0;
      const pitchTarget = Math.atan2(sink, Math.max(1, u.speed));
      v.pitch += (pitchTarget - v.pitch) * Math.min(1, dt * 5);
      root.rotation.set(v.pitch, v.yaw, 0, "YXZ");
      // đang phóng từ giếng: giữ càng hạ tới khi bắt đầu bay ra trước
      v.rig.setFlight?.(u.air === "launch" ? u.speed > 0 : alt > 0.6, flying ? v.roll : 0);
      if (spec.secondary) v.rig.setAmmo?.(u.ammo2);
      if (spec.weapon && (world.tick - u.lastShot) * DT < 0.25) a.add("fire");
      if (spec.hover && u.mission === "attack" && spec.kamikaze) a.add("kamikaze");
      // vòm khiên vẽ THEO TRẠNG THÁI sim (bật tới tick nào, còn hứng được không), không theo sự kiện: tua nhanh vẫn đúng
      if (spec.shield && u.shieldUntil > world.tick && u.shieldHp > 0) a.add("shield");
    } else {
      v.yaw += wrap(target - v.yaw) * Math.min(1, dt * 10);
      const y = this.map.groundY(x, z);
      // nghiêng thân theo dốc: lấy độ cao trước/sau và trái/phải
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      const L = spec.radius;
      const pitch = Math.atan2(this.map.groundY(x - fx * L, z - fz * L) - this.map.groundY(x + fx * L, z + fz * L), L * 2);
      const roll = Math.atan2(this.map.groundY(x + fz * L, z - fx * L) - this.map.groundY(x - fz * L, z + fx * L), L * 2);
      root.position.set(x, y, z);
      root.rotation.set(pitch, v.yaw, roll, "YXZ");
      if (u.moved || u.px !== u.x || u.pz !== u.z) a.add("move");
      if (world.mobilized(u)) a.add("hurry");
      // vài giây đầu của Tổng động viên: quân có hào quang tung chiêu
      if (UNITS[u.kind].aura && world.sides[u.side].mobilizeUntil - world.tick > (RULES.abilities.mobilize.duration - CAST_WINDOW) * RULES.tickRate) a.add("cast");
      if (u.kind === "hauler") {
        if (u.cargo > 0) a.add(u.cargoRes === "oil" ? "loadOil" : "load");
        if (u.scrap > 0) a.add("scrap");
        if (u.hState === "salvaging") a.add("crane");
      } else {
        const tid = u.targetId || u.autoTarget;
        const w = spec.weapon;
        // mâm xoay: vẽ đúng hướng mâm trong sim (xoay mất thời gian, thấy được độ trễ); có việc mới nâng nòng
        const busy = u.order === "strike" || tid !== 0;
        const turretYaw = w?.traverse
          ? wrap(Math.atan2(u.aimX, u.aimZ) - v.yaw)
          : u.order === "strike"
            ? wrap(Math.atan2(u.tx - x, u.tz - z) - v.yaw)
            : this.aimAt(world, x, z, v.yaw, tid);
        if (w?.deploy?.required) {
          // dàn phóng / pháo: vẽ THEO SIM. Đứng yên (không thu bệ) là đang cố định: hạ chân chống, ngóc hộp phóng về điểm bắn;
          // thu bệ hoặc chạy thì thu lại. Nhịp hoạt ảnh = deploy.time nên khớp với lúc sim cho bắn / cho chạy.
          const planted = !a.has("move") && !u.packing;
          if (planted) a.add("deploy");
          v.rig.setAim?.(turretYaw, planted && busy);
        } else {
          v.rig.setAim?.(turretYaw, busy);
          // Lockdown không bắt buộc (SkyGuard): sim tính "đã cố định" khi đứng yên đủ deploy.time; rig hạ bệ cùng nhịp
          if (w?.deploy && !a.has("move") && !u.packing) a.add("deploy");
        }
        // mục tiêu đang bay: xe có tư thế phòng không (Lynx) ngóc nòng lên; chỉ là phần vẽ, sim không đổi
        const tgt = tid ? world.target(tid) : null;
        if (tgt && "alt" in tgt && tgt.alt > AIRBORNE_ALT) a.add("aimAir");
        if (w && (w.visual === "bullet" || w.visual === "cannon") && (world.tick - u.lastShot) * DT < Math.max(0.45, w.cooldown * 0.9)) a.add("fire");
      }
    }
    if (u.lastShot !== v.lastShot) {
      v.lastShot = u.lastShot;
      v.rig.shot?.();
    }
    v.rig.update(dt, time, a);
    const mat = viewer === null ? (u.side === 0 ? RING_MAT.own : RING_MAT.enemy) : u.side === viewer ? RING_MAT.own : RING_MAT.enemy;
    this.setRing(v, root, selected, spec.radius, mat, u.alt > AIRBORNE_ALT && !spec.hover ? -alt + 0.12 : 0.12);
    if (v.ring && u.alt > AIRBORNE_ALT) v.ring.position.y = this.map.groundY(x, z) - root.position.y + 0.12;
  }

  /** Vị trí miệng nòng sẽ bắn tiếp theo của quân / công trình `id`. Trả false nếu nó chưa có hình hoặc không có nòng. */
  muzzle(id: number, out: THREE.Vector3): boolean {
    const v = this.units.get(id) ?? this.buildings.get(id);
    if (!v || v.muzzles.length === 0) return false;
    v.muzzleCursor = (v.muzzleCursor + 1) % v.muzzles.length;
    v.muzzles[v.muzzleCursor]!.getWorldPosition(out);
    return true;
  }

  private updateBuilding(world: World, b: Building, v: View, dt: number, time: number, selected: boolean, viewer: Side | null): void {
    const spec = BUILDINGS[b.kind];
    const root = v.rig.root;
    root.scale.y = b.built ? 1 : 0.15 + 0.85 * b.progress;
    const a = v.active;
    a.clear();
    if (b.built) {
      if (spec.produces && b.kind !== "hq") {
        // nhà xưởng: chỉ "vận hành" (mở cửa, cầu trục chạy...) khi đang đúc
        if (b.queue.length && b.active) a.add("work");
      } else if (b.kind === "power-plant" || b.kind === "radar" || b.kind === "battery" || spec.power < 0) {
        if (b.active) a.add("work");
        if (spec.storage) v.rig.setLevel?.(b.charge / spec.storage);
      } else a.add("work");
      if (spec.weapon) {
        v.rig.setAim?.(spec.weapon.traverse ? wrap(Math.atan2(b.aimX, b.aimZ)) : this.aimAt(world, b.x, b.z, 0, b.targetId), b.targetId !== 0);
        if ((world.tick - b.lastShot) * DT < Math.max(0.45, spec.weapon.cooldown * 0.9)) a.add("fire");
      }
    }
    // thanh tiến độ trên nóc xưởng: theo lô đang đúc, không có hàng chờ thì trống
    if (b.built && spec.produces && b.kind !== "hq") v.rig.setLevel?.(b.queue.length ? b.prog / sec(lotTime(b.queue[0]!)) : 0);
    // giếng phóng: mở cửa cuốn khi có máy bay phe mình đang phóng từ giếng đó (theo trạng thái sim, tua nhanh vẫn đúng)
    if (b.built && spec.launch && spec.pads && v.rig.setLaunch) {
      spec.pads.forEach((r, k) => {
        const [ox, oz] = rotOffset((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, b.rot);
        const px = b.x + ox;
        const pz = b.z + oz;
        let open = false;
        for (const u of world.units)
          if (u.side === b.side && u.air === "launch" && (u.x - px) ** 2 + (u.z - pz) ** 2 < 9) {
            open = true;
            break;
          }
        v.rig.setLaunch!(k, open);
      });
    }
    // xưởng có sân ráp: xe đang đúc hiện trên sân (hiện thẳng, không nâng)
    if (b.built && spec.bay) {
      const kind = b.queue.length ? b.queue[0]! : null;
      v.rig.setAssembly?.(kind, kind ? UNITS[kind].batch : 0, kind ? b.prog / sec(lotTime(kind)) : 0);
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
  /** Máy bay đang bay: vẽ theo đường cong thay vì nối thẳng giữa hai tick. */
  static curved(u: Unit): boolean {
    // drone bay chậm, đổi hướng tức thì: nối thẳng là đúng (Hermite theo hướng bay sẽ vẽ đường cong lệch)
    return (u.air === "flying" || u.air === "returning") && !UNITS[u.kind].hover;
  }

  /**
   * Nội suy Hermite giữa hai tick: đường cong đi qua vị trí tick trước và tick này, tiếp tuyến đúng hướng bay ở
   * cả hai đầu. Máy bay nhanh ngoặt gắt đổi hướng tới ~20° mỗi tick; nối thẳng thì đường bay thành đa giác gãy
   * khúc, nhìn giật. Trả về vị trí và hướng (đạo hàm của đường cong, khớp với chuyển động trên màn hình).
   */
  static hermite(u: Unit, t: number): [number, number, number, number] {
    const L = Math.sqrt((u.x - u.px) ** 2 + (u.z - u.pz) ** 2);
    if (L < 1e-4) return [u.x, u.z, u.hx, u.hz];
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const x = h00 * u.px + h10 * u.phx * L + h01 * u.x + h11 * u.hx * L;
    const z = h00 * u.pz + h10 * u.phz * L + h01 * u.z + h11 * u.hz * L;
    const d00 = 6 * t2 - 6 * t;
    const d10 = 3 * t2 - 4 * t + 1;
    const d01 = -6 * t2 + 6 * t;
    const d11 = 3 * t2 - 2 * t;
    const dx = d00 * u.px + d10 * u.phx * L + d01 * u.x + d11 * u.hx * L;
    const dz = d00 * u.pz + d10 * u.phz * L + d01 * u.z + d11 * u.hz * L;
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    return [x, z, dx / dl, dz / dl];
  }

  static displayPos(map: GameMap, u: Unit, alpha: number): [number, number, number] {
    let x = u.px + (u.x - u.px) * alpha;
    let z = u.pz + (u.z - u.pz) * alpha;
    if (Views.curved(u)) [x, z] = Views.hermite(u, alpha);
    const alt = u.palt + (u.alt - u.palt) * alpha;
    return [x, map.groundY(x, z) + (alt < 0.05 ? 0.22 * (u.air === "parked" ? 1 : 0) : alt), z];
  }
}
