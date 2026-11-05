/**
 * Bộ điều khiển người chơi: biến cử chỉ / phím bấm thành LỆNH gửi vào trận.
 *
 * Ra lệnh theo ngữ cảnh (giống các game RTS quen thuộc):
 *   chạm/nhấp quân mình → chọn · chạm quân địch → tấn công · chạm mỏ → khai thác / chiếm
 *   chạm đất → di chuyển · chạm Sân Đáp khi chọn máy bay → về sân nạp dầu
 * Trên máy tính: nhấp trái để chọn, nhấp phải để ra lệnh. Trên điện thoại: chạm đất khi đang chọn quân là ra lệnh đi.
 */
import * as THREE from "three";
import { BUILDINGS, FACTION_OF, RES_NAME, RULES, UNITS, type BuildingId, type Side, type UnitId } from "../sim/content";
import type { Building, Entity, Mine, Order, Unit, Wreck } from "../sim/types";
import { buildModel, disposeRig, type Rig } from "../render/models";
import type { Sfx } from "./audio";
import type { RtsCamera } from "./camera";
import type { Fx } from "./fx";
import type { Hud, Mode, PanelCtx } from "./hud";
import type { GestureHandlers, TapInfo } from "./input";
import type { Match } from "./match";
import { Views } from "./views";

const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0.45, depthWrite: false });
const GHOST_BAD = new THREE.MeshBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.45, depthWrite: false });
/** Vòng chọn điểm pháo kích: đỏ = bắn được, xám = không (kèm lý do ở dòng gợi ý). */
const AIM_OK = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.75, depthWrite: false });
const AIM_BAD = new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.6, depthWrite: false });

export class Controller implements GestureHandlers {
  selected: number[] = [];
  mode: Mode = "normal";
  placeKind: BuildingId | null = null;
  placePos: { x: number; z: number } | null = null;
  placeReason: string | null = null;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  alpha = 0;
  hud: Hud | null = null;
  lastAlert: { x: number; z: number } | null = null;
  /** Phòng Thử Nghiệm: công cụ đang cầm nhận cú chạm trước; trả về true nếu đã xử lý. */
  toolTap: ((sx: number, sy: number) => boolean) | null = null;
  /** Phòng Thử Nghiệm: phe mà việc chọn quân nhìn theo (null = thấy hết, khớp với phần vẽ khi tắt sương mù). */
  viewerFn: (() => Side | null) | null = null;
  private groups: number[][] = [[], [], [], [], [], []];
  private lastGroupKey = { n: -1, t: 0 };
  private panAnchor: THREE.Vector3 | null = null;
  private pinchAnchor: THREE.Vector3 | null = null;
  private pinchT = 0;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, inside: false, used: false };
  private ghost: Rig | null = null;
  private ghostKind: BuildingId | null = null;
  private ghostValid = true;
  private sellArmed = { id: 0, t: 0 };
  /** Vòng ngắm pháo kích (bán kính = vùng đạn rơi). */
  private aim: THREE.Mesh | null = null;

  constructor(
    private match: Match,
    private cam: RtsCamera,
    private scene: THREE.Scene,
    private views: Views,
    private fx: Fx,
    private sfx: Sfx,
    private canvas: HTMLCanvasElement,
    private onMenu: () => void
  ) {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.keys.clear());
    canvas.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") this.mouse.inside = true;
    });
    canvas.addEventListener("pointerleave", () => (this.mouse.inside = false));
    canvas.addEventListener("pointerdown", (e) => {
      this.mouse.used = e.pointerType === "mouse";
      this.sfx.unlock();
    });
  }

  private get world() {
    return this.match.world;
  }
  private get me() {
    return this.match.player;
  }
  private get viewer(): Side | null {
    return this.viewerFn ? this.viewerFn() : this.me;
  }
  private size(): { w: number; h: number } {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  // ------------------------------------------------------------------ chọn

  selectedEntities(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.selected) {
      const e = this.world.byId.get(id);
      if (!e || (e.cat !== "mine" && e.hp <= 0)) continue;
      const v = this.viewer;
      if (e.cat === "unit" && v !== null && e.side !== v && !this.world.visibleTo(v, e)) continue;
      out.push(e);
    }
    return out;
  }

  ownUnits(): Unit[] {
    return this.selectedEntities().filter((e): e is Unit => e.cat === "unit" && e.side === this.me);
  }

  ownBuilding(): Building | null {
    const e = this.selectedEntities();
    return e.length === 1 && e[0].cat === "building" && e[0].side === this.me ? e[0] : null;
  }

  select(ids: number[], add = false): void {
    if (add) {
      const set = new Set(this.selected);
      for (const id of ids) {
        if (set.has(id)) set.delete(id);
        else set.add(id);
      }
      this.selected = [...set];
    } else this.selected = ids;
    if (this.mode !== "place") this.mode = "normal";
    if (ids.length) this.sfx.ui("click");
  }

  panelCtx(): PanelCtx {
    const sel = this.selectedEntities();
    if (sel.length !== this.selected.length) this.selected = sel.map((e) => e.id);
    if (sel.length === 0) return { t: "none" };
    const first = sel[0];
    if (first.cat === "mine") return { t: "mine", m: first as Mine };
    if (first.cat === "building") return { t: "building", b: first, own: first.side === this.me };
    if (first.side !== this.me) return this.me === null ? { t: "units", units: sel.filter((e): e is Unit => e.cat === "unit") } : { t: "enemy", u: first };
    return { t: "units", units: sel.filter((e): e is Unit => e.cat === "unit" && e.side === this.me) };
  }

  /** Thực thể dưới điểm chạm: quân (so khoảng cách trên màn hình), rồi công trình, rồi mỏ. */
  pick(sx: number, sy: number, touch: boolean): Entity | null {
    const { w, h } = this.size();
    const viewer = this.viewer;
    let best: Entity | null = null;
    let bestD = Infinity;
    const tanHalf = Math.tan(((this.cam.cam.fov / 2) * Math.PI) / 180);
    for (const u of this.views.visibleUnits(this.world, viewer)) {
      const [x, y, z] = Views.displayPos(this.match.world.map, u, this.alpha);
      const p = this.cam.project(x, y + 1, z, w, h);
      if (!p.visible) continue;
      const camD = this.cam.cam.position.distanceTo(new THREE.Vector3(x, y, z));
      const ppm = h / (2 * camD * tanHalf);
      const r = Math.max(touch ? 26 : 14, UNITS[u.kind].radius * ppm * 1.3);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < r && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best) return best;
    const g = this.cam.ground(sx, sy, w, h);
    if (!g) return null;
    for (const b of this.views.visibleBuildings(this.world, viewer)) {
      const [hw, hd] = BUILDINGS[b.kind].half;
      if (Math.abs(g.x - b.x) <= hw + 0.6 && Math.abs(g.z - b.z) <= hd + 0.6) return b;
    }
    for (const m of this.world.mines) if (Math.hypot(g.x - m.x, g.z - m.z) < 4.6) return m;
    return null;
  }

  /** Xác quân gần điểm (x, z) trên mặt đất mà phe đang xem nhìn thấy (trong bán kính 3 m). */
  private wreckAt(x: number, z: number): Wreck | null {
    const viewer = this.viewer;
    let best: Wreck | null = null;
    let bestD = 3 * 3;
    for (const wr of this.world.wrecks) {
      if (viewer !== null && !this.world.cellVisible(viewer, wr.x, wr.z)) continue;
      const d = (wr.x - x) ** 2 + (wr.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = wr;
      }
    }
    return best;
  }

  private selectSameKindOnScreen(kind: UnitId): void {
    const { w, h } = this.size();
    const ids: number[] = [];
    for (const u of this.world.units) {
      if (u.side !== this.me || u.kind !== kind) continue;
      const [x, y, z] = Views.displayPos(this.match.world.map, u, this.alpha);
      const p = this.cam.project(x, y, z, w, h);
      if (p.visible && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) ids.push(u.id);
    }
    this.select(ids);
  }

  // ------------------------------------------------------------------ lệnh

  private issue(o: Order): void {
    this.match.issue(o);
  }

  private commandAt(sx: number, sy: number, hit: Entity | null, mode: Mode | "auto"): void {
    if (this.me === null) return;
    const { w, h } = this.size();
    const g = this.cam.ground(sx, sy, w, h);
    const units = this.ownUnits();
    const b = this.ownBuilding();
    if (mode === "rally" || (units.length === 0 && b)) {
      if (b && BUILDINGS[b.kind].produces && g) {
        this.issue({ t: "rally", building: b.id, x: g.x, z: g.z });
        this.fx.marker(g.x, g.z, 0xffd36e);
        this.sfx.ui("ack");
      }
      return;
    }
    if (!units.length) return;
    const ids = units.map((u) => u.id);
    // xác quân dưới điểm chạm: Xe Vận Tải đi kéo về
    const wreck = g && units.some((u) => u.kind === "hauler") && (mode === "salvage" || mode === "auto") && (!hit || hit.cat === "mine") ? this.wreckAt(g.x, g.z) : null;
    if (mode === "salvage" || wreck) {
      if (wreck) {
        this.issue({ t: "salvage", ids, wreck: wreck.id });
        this.fx.marker(wreck.x, wreck.z, 0xffd36e);
        this.sfx.ui("ack");
      } else {
        this.sfx.ui("error");
        this.hud?.alert("Hãy chạm vào một xác quân", "bad");
      }
      return;
    }
    if (mode === "harvest") {
      if (hit && hit.cat === "mine") {
        this.issue({ t: "harvest", ids, mine: hit.id });
        this.fx.marker(hit.x, hit.z, 0xffd36e);
        this.sfx.ui("ack");
      } else {
        this.sfx.ui("error");
        this.hud?.alert("Hãy chạm vào một mỏ", "bad");
      }
      return;
    }
    if (hit && hit.cat !== "mine" && hit.side !== this.me) {
      this.issue({ t: "attack", ids, target: hit.id });
      this.fx.marker(hit.x, hit.z, 0xff6b5e);
      this.sfx.ui("ack");
      return;
    }
    if (hit && hit.cat === "mine") {
      this.issue({ t: "harvest", ids, mine: hit.id });
      this.fx.marker(hit.x, hit.z, 0xffd36e);
      this.sfx.ui("ack");
      return;
    }
    if (hit && hit.cat === "building" && hit.kind === "airfield" && hit.side === this.me) {
      const air = units.filter((u) => u.air !== "none").map((u) => u.id);
      if (air.length) {
        this.issue({ t: "rtb", ids: air });
        this.fx.marker(hit.x, hit.z, 0x6fdc8c);
        this.sfx.ui("ack");
        return;
      }
    }
    if (!g) return;
    this.issue({ t: mode === "amove" ? "amove" : "move", ids, x: g.x, z: g.z });
    this.fx.marker(g.x, g.z, mode === "amove" ? 0xff6b5e : 0x6fdc8c);
    this.sfx.ui("ack");
  }

  // ------------------------------------------------------------------ đặt công trình

  startPlace(kind: BuildingId): void {
    if (this.me === null) return;
    const st = this.world.sides[this.me];
    const c = BUILDINGS[kind].cost!;
    if (st.iron < c.iron || st.oil < c.oil) {
      this.sfx.ui("error");
      this.hud?.alert(`Không đủ ${st.iron < c.iron ? RES_NAME.iron : RES_NAME.oil} để xây ${BUILDINGS[kind].name}`, "bad");
      return;
    }
    this.mode = "place";
    this.placeKind = kind;
    if (this.ghostKind !== kind) {
      this.clearGhost();
      this.ghost = buildModel(kind, FACTION_OF[this.me], false);
      this.ghost.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = GHOST_OK;
          o.castShadow = false;
        }
      });
      this.ghostKind = kind;
      this.scene.add(this.ghost.root);
    }
    const { w, h } = this.size();
    const g = this.mouse.used && this.mouse.inside ? this.cam.ground(this.mouse.x, this.mouse.y, w, h) : null;
    this.placePos = g ? { x: Math.round(g.x), z: Math.round(g.z) } : { x: Math.round(this.cam.tx), z: Math.round(this.cam.tz) };
    this.sfx.ui("click");
  }

  private clearGhost(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost.root);
      disposeRig(this.ghost);
    }
    this.ghost = null;
    this.ghostKind = null;
  }

  cancelPlace(): void {
    this.mode = "normal";
    this.placeKind = null;
    this.placePos = null;
    this.clearGhost();
    if (this.aim) this.aim.visible = false;
  }

  // ------------------------------------------------------------------ kỹ năng Tư lệnh

  /** Bắt đầu chọn điểm pháo kích (giống đặt công trình: nhấp để bắn, hoặc chạm rồi bấm ✓). */
  private startBarrage(): void {
    if (this.me === null) return;
    const st = this.world.sides[this.me];
    const B = RULES.abilities.barrage;
    if (st.cp < B.cost) {
      this.sfx.ui("error");
      this.hud?.alert(`Cần ${B.cost} điểm chỉ huy để pháo kích (đang có ${Math.floor(st.cp)})`, "bad");
      return;
    }
    this.cancelPlace();
    this.mode = "barrage";
    if (!this.aim) {
      const geo = new THREE.RingGeometry(B.radius - 0.35, B.radius, 64).rotateX(-Math.PI / 2);
      this.aim = new THREE.Mesh(geo, AIM_OK);
      this.aim.renderOrder = 4;
      this.scene.add(this.aim);
    }
    const { w, h } = this.size();
    const g = this.mouse.used && this.mouse.inside ? this.cam.ground(this.mouse.x, this.mouse.y, w, h) : null;
    this.placePos = g ? { x: g.x, z: g.z } : { x: this.cam.tx, z: this.cam.tz };
    this.sfx.ui("click");
  }

  private tryBarrage(): void {
    if (this.me === null || !this.placePos) return;
    const { x, z } = this.placePos;
    const reason = this.world.barrageError(this.me, x, z);
    if (reason) {
      this.sfx.ui("error");
      this.hud?.alert(reason, "bad");
      return;
    }
    this.issue({ t: "barrage", x, z });
    this.sfx.ui("ack");
    this.cancelPlace();
  }

  private mobilizeNow(): void {
    if (this.me === null) return;
    const reason = this.world.mobilizeError(this.me);
    if (reason) {
      this.sfx.ui("error");
      this.hud?.alert(`Tổng động viên: ${reason}`, "bad");
      return;
    }
    this.issue({ t: "mobilize" });
  }

  private tryPlace(keep: boolean): void {
    if (this.me === null || !this.placeKind || !this.placePos) return;
    const { x, z } = this.placePos;
    const reason = this.world.canPlace(this.me, this.placeKind, x, z);
    const st = this.world.sides[this.me];
    const c = BUILDINGS[this.placeKind].cost!;
    if (reason || st.iron < c.iron || st.oil < c.oil) {
      this.sfx.ui("error");
      this.hud?.alert(reason ?? "Không đủ tài nguyên", "bad");
      return;
    }
    this.issue({ t: "build", kind: this.placeKind, x, z });
    this.sfx.ui("build");
    if (!keep) this.cancelPlace();
  }

  /** Vị trí màn hình để đặt nút ✓ ✕ (chỉ khi dùng cảm ứng). */
  confirmAnchor(): { x: number; y: number } | null {
    if ((this.mode !== "place" && this.mode !== "barrage") || !this.placePos || this.mouse.used) return null;
    const { w, h } = this.size();
    const p = this.cam.project(this.placePos.x, this.match.world.map.groundY(this.placePos.x, this.placePos.z), this.placePos.z, w, h);
    return p.visible ? { x: p.x, y: Math.min(h - 220, p.y + 50) } : null;
  }

  hint(): string | null {
    switch (this.mode) {
      case "place": {
        // dự báo điện sau khi xây (Tư lệnh biết trước, không cần tự tính)
        let power = "";
        if (this.me !== null && this.placeKind) {
          const st = this.world.sides[this.me];
          const sp = BUILDINGS[this.placeKind];
          const use = st.powerUse + st.powerPending + Math.max(0, -sp.power);
          const cap = st.powerCap + (sp.oilBurn ? sp.power : 0);
          if (sp.power !== 0) power = ` · Điện sau khi xây: ${Math.round(use)}/${Math.round(cap)} MW${use > cap ? ` ⚠ thiếu ${Math.ceil(use - cap)} MW` : ""}`;
        }
        return (
          (this.mouse.used ? "Nhấp để đặt · Shift đặt nhiều · chuột phải hủy" : "Chạm để chọn chỗ, rồi bấm ✓") + power + (this.placeReason ? ` — ${this.placeReason}` : "")
        );
      }
      case "barrage":
        return (this.mouse.used ? "Pháo kích: nhấp vào điểm đang nhìn thấy · chuột phải hủy" : "Pháo kích: chạm chọn điểm, rồi bấm ✓") + (this.placeReason ? ` — ${this.placeReason}` : "");
      case "amove":
        return "Chọn điểm: quân sẽ đánh mọi kẻ địch trên đường đi";
      case "rally":
        return "Chọn điểm tập kết cho quân mới đúc";
      case "harvest":
        return "Chạm vào một mỏ để Xe Vận Tải khai thác";
      case "salvage":
        return "Chạm vào một xác quân: Xe Vận Tải kéo về Tổng Hành Dinh (mỗi xe một xác)";
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------ nút trên giao diện

  act(action: string, arg?: string): void {
    this.sfx.unlock();
    const b = this.ownBuilding();
    switch (action) {
      case "build":
        this.startPlace(arg as BuildingId);
        break;
      case "placeOk":
        if (this.mode === "barrage") this.tryBarrage();
        else this.tryPlace(false);
        break;
      case "ability":
        if (arg === "barrage") this.startBarrage();
        else if (arg === "mobilize") this.mobilizeNow();
        break;
      case "placeCancel":
        this.cancelPlace();
        break;
      case "produce":
        if (b) {
          this.issue({ t: "produce", building: b.id, kind: arg as UnitId });
          this.sfx.ui("click");
        }
        break;
      case "cancel":
        if (b) this.issue({ t: "cancel", building: b.id });
        break;
      case "sell":
        if (b) {
          const now = performance.now();
          if (this.sellArmed.id === b.id && now - this.sellArmed.t < 2500) {
            this.issue({ t: "sell", building: b.id });
            this.select([]);
          } else {
            this.sellArmed = { id: b.id, t: now };
            this.hud?.alert(`Bấm lần nữa để ${b.built ? "bán" : "hủy"} ${BUILDINGS[b.kind].name}`);
          }
        }
        break;
      case "rally":
      case "amove":
      case "harvest":
      case "salvage":
        this.mode = this.mode === action ? "normal" : (action as Mode);
        break;
      case "stop": {
        const ids = this.ownUnits().map((u) => u.id);
        if (ids.length) this.issue({ t: "stop", ids });
        break;
      }
      case "rtb": {
        const ids = this.ownUnits()
          .filter((u) => u.air !== "none")
          .map((u) => u.id);
        if (ids.length) {
          this.issue({ t: "rtb", ids });
          this.sfx.ui("ack");
        }
        break;
      }
      case "deselect":
        this.select([]);
        this.mode = "normal";
        break;
      case "army":
        this.select(this.world.units.filter((u) => u.side === this.me && u.kind !== "hauler" && u.kind !== "commander").map((u) => u.id));
        break;
      case "cmd": {
        const c = this.me !== null ? this.world.commanderOf(this.me) : null;
        if (c) {
          this.select([c.id]);
          this.cam.focus(c.x, c.z);
        }
        break;
      }
      case "hq": {
        const hq = this.me !== null ? this.world.hqOf(this.me) : null;
        if (hq) {
          this.select([hq.id]);
          this.cam.focus(hq.x, hq.z);
        }
        break;
      }
      case "speed":
        this.match.paused = false;
        this.match.speed = this.match.speed >= 4 ? 1 : this.match.speed * 2;
        break;
      case "sound":
        this.sfx.muted = !this.sfx.muted;
        this.hud?.alert(this.sfx.muted ? "Đã tắt âm thanh" : "Đã bật âm thanh");
        break;
      case "menu":
        this.onMenu();
        break;
    }
  }

  // ------------------------------------------------------------------ cử chỉ

  tap(x: number, y: number, info: TapInfo): void {
    if (this.mode === "barrage") {
      const { w, h } = this.size();
      const g = this.cam.ground(x, y, w, h);
      if (!g) return;
      this.placePos = { x: g.x, z: g.z };
      if (info.mouse) this.tryBarrage();
      return;
    }
    if (this.mode === "place") {
      const { w, h } = this.size();
      const g = this.cam.ground(x, y, w, h);
      if (!g) return;
      this.placePos = { x: Math.round(g.x), z: Math.round(g.z) };
      if (info.mouse) this.tryPlace(info.shift);
      return;
    }
    if (this.mode === "normal" && this.toolTap?.(x, y)) return;
    const hit = this.pick(x, y, !info.mouse);
    if (this.mode === "amove" || this.mode === "rally" || this.mode === "harvest" || this.mode === "salvage") {
      this.commandAt(x, y, hit, this.mode);
      this.mode = "normal";
      return;
    }
    if (hit && hit.cat !== "mine" && (this.me === null || hit.side === this.me)) {
      if (hit.cat === "unit" && this.me !== null) {
        if (info.double) this.selectSameKindOnScreen(hit.kind);
        else this.select([hit.id], info.shift || info.ctrl);
      } else this.select([hit.id]);
      return;
    }
    if (!info.mouse && (this.ownUnits().length || this.ownBuilding())) {
      this.commandAt(x, y, hit, "auto");
      return;
    }
    if (hit) this.select([hit.id]);
    else if (info.mouse) this.select([]);
  }

  command(x: number, y: number): void {
    if (this.mode === "place" || this.mode === "barrage") {
      this.cancelPlace();
      return;
    }
    if (this.mode !== "normal") {
      this.mode = "normal";
      return;
    }
    this.commandAt(x, y, this.pick(x, y, false), "auto");
  }

  boxStart(x: number, y: number): void {
    this.box = { x0: x, y0: y, x1: x, y1: y };
  }
  boxMove(x: number, y: number): void {
    if (this.box) {
      this.box.x1 = x;
      this.box.y1 = y;
    }
  }
  boxCancel(): void {
    this.box = null;
  }
  boxEnd(x: number, y: number, shift: boolean): void {
    const b = this.box;
    this.box = null;
    if (!b || this.me === null) return;
    b.x1 = x;
    b.y1 = y;
    const x0 = Math.min(b.x0, b.x1);
    const x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1);
    const y1 = Math.max(b.y0, b.y1);
    const { w, h } = this.size();
    const inside: Unit[] = [];
    for (const u of this.world.units) {
      if (u.side !== this.me) continue;
      const [ux, uy, uz] = Views.displayPos(this.match.world.map, u, this.alpha);
      const p = this.cam.project(ux, uy + 0.8, uz, w, h);
      if (p.visible && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) inside.push(u);
    }
    // có quân chiến trong khung thì bỏ Xe Vận Tải ra (tiện khi quét cả căn cứ)
    const fighters = inside.filter((u) => u.kind !== "hauler");
    const pick = fighters.length ? fighters : inside;
    if (pick.length || !shift) this.select(pick.map((u) => u.id), shift);
  }

  panStart(x: number, y: number): void {
    const { w, h } = this.size();
    this.panAnchor = this.cam.ground(x, y, w, h);
  }
  panMove(x: number, y: number): void {
    if (!this.panAnchor) return;
    const { w, h } = this.size();
    const g = this.cam.ground(x, y, w, h);
    if (!g) return;
    this.cam.panWorld(this.panAnchor.x - g.x, this.panAnchor.z - g.z);
    this.cam.apply();
  }
  panEnd(): void {
    this.panAnchor = null;
  }

  pinch(cx: number, cy: number, scale: number, rot: number): void {
    const { w, h } = this.size();
    const now = performance.now();
    if (!this.pinchAnchor || now - this.pinchT > 250) this.pinchAnchor = this.cam.ground(cx, cy, w, h);
    this.pinchT = now;
    this.cam.zoomBy(1 / scale);
    this.cam.rotate(-rot);
    this.cam.apply();
    const g = this.cam.ground(cx, cy, w, h);
    if (g && this.pinchAnchor) {
      this.cam.panWorld(this.pinchAnchor.x - g.x, this.pinchAnchor.z - g.z);
      this.cam.apply();
    }
  }

  rotateDrag(dx: number, dy: number): void {
    this.cam.rotate(-dx * 0.008);
    this.cam.tilt(dy * 0.005);
  }

  wheel(x: number, y: number, delta: number): void {
    const { w, h } = this.size();
    const before = this.cam.ground(x, y, w, h);
    this.cam.zoomBy(Math.exp(Math.max(-60, Math.min(60, delta)) * 0.004));
    this.cam.apply();
    const after = this.cam.ground(x, y, w, h);
    if (before && after) this.cam.panWorld(before.x - after.x, before.z - after.z);
  }

  hover(x: number, y: number): void {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.inside = true;
    this.mouse.used = true;
    if (this.mode === "place") {
      const { w, h } = this.size();
      const g = this.cam.ground(x, y, w, h);
      if (g) this.placePos = { x: Math.round(g.x), z: Math.round(g.z) };
    }
    if (this.mode === "barrage") {
      const { w, h } = this.size();
      const g = this.cam.ground(x, y, w, h);
      if (g) this.placePos = { x: g.x, z: g.z };
    }
  }

  longPressFeedback(): void {
    navigator.vibrate?.(12);
  }

  // ------------------------------------------------------------------ bàn phím & khung hình

  private onKey(e: KeyboardEvent, down: boolean): void {
    if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"].includes(k)) {
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      if (k.startsWith("arrow")) e.preventDefault();
      return;
    }
    if (!down) return;
    this.mouse.used = true;
    const units = this.ownUnits();
    if (k === "escape") {
      if (this.mode === "place" || this.mode === "barrage") this.cancelPlace();
      else if (this.mode !== "normal") this.mode = "normal";
      else this.select([]);
    } else if (k === "s" && units.length) this.act("stop");
    else if (k === "a" && units.length) this.mode = "amove";
    else if (k === "b") this.act("rtb");
    else if (k === "h") this.act("hq");
    else if (k === "f1") {
      e.preventDefault();
      this.act("cmd");
    } else if (k === "delete") this.act("sell");
    else if (k === " ") {
      e.preventDefault();
      const sel = this.selectedEntities()[0];
      if (sel) this.cam.focus(sel.x, sel.z);
      else if (this.lastAlert) this.cam.focus(this.lastAlert.x, this.lastAlert.z);
    } else if (k === "p" || k === "pause") this.match.paused = !this.match.paused;
    else if (k === "t") this.act("ability", "barrage");
    else if (k === "r") this.act("ability", "mobilize");
    else if (/^[1-5]$/.test(k)) {
      const n = Number(k);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = units.map((u) => u.id);
        this.hud?.alert(`Đã lưu nhóm ${n} (${units.length} quân)`);
      } else {
        const ids = this.groups[n].filter((id) => this.world.byId.has(id));
        this.select(ids);
        const now = performance.now();
        if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 400 && ids.length) {
          const u = this.world.byId.get(ids[0])!;
          this.cam.focus(u.x, u.z);
        }
        this.lastGroupKey = { n, t: now };
      }
    } else if (this.me !== null) {
      // phím đúc quân nhanh: Z X C N V
      const kind = (Object.keys(UNITS) as UnitId[]).find((id) => UNITS[id].mvp && UNITS[id].hotkey.toLowerCase() === k && UNITS[id].cost);
      if (kind) {
        const where = this.world.buildings
          .filter((b) => b.side === this.me && b.built && BUILDINGS[b.kind].produces?.includes(kind))
          .sort((a, b) => a.queue.length - b.queue.length)[0];
        if (where) {
          this.issue({ t: "produce", building: where.id, kind });
          this.sfx.ui("click");
        } else this.hud?.alert(`Cần ${BUILDINGS[UNITS[kind].builtAt!].name} để đúc ${UNITS[kind].short}`, "bad");
      }
    }
  }

  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("arrowright")) dx += 1;
    if (this.keys.has("arrowup")) dy += 1;
    if (this.keys.has("arrowdown")) dy -= 1;
    const { w, h } = this.size();
    if (this.mouse.inside && this.mouse.used && document.hasFocus() && !this.panAnchor && !this.box) {
      const m = 10;
      if (this.mouse.x < m) dx -= 1;
      if (this.mouse.x > w - m) dx += 1;
      if (this.mouse.y < m) dy += 1;
      if (this.mouse.y > h - m) dy -= 1;
    }
    if (dx || dy) this.cam.panScreen(dx * dt * 1.1, dy * dt * 1.1);
    if (this.keys.has("q")) this.cam.rotate(dt * 1.6);
    if (this.keys.has("e")) this.cam.rotate(-dt * 1.6);

    // bóng mờ công trình đang đặt: xanh = đặt được, đỏ = không
    if (this.mode === "place" && this.ghost && this.placePos && this.placeKind && this.me !== null) {
      const { x, z } = this.placePos;
      this.ghost.root.position.set(x, this.match.world.map.groundY(x, z) + 0.05, z);
      this.ghost.root.visible = true;
      this.placeReason = this.world.canPlace(this.me, this.placeKind, x, z);
      const valid = this.placeReason === null;
      if (valid !== this.ghostValid) {
        this.ghostValid = valid;
        this.ghost.root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.material = valid ? GHOST_OK : GHOST_BAD;
        });
      }
    } else if (this.mode === "barrage" && this.aim && this.placePos && this.me !== null) {
      // vòng ngắm pháo kích theo chuột / điểm chạm
      const { x, z } = this.placePos;
      this.aim.position.set(x, this.match.world.map.groundY(x, z) + 0.3, z);
      this.aim.visible = true;
      this.placeReason = this.world.barrageError(this.me, x, z);
      this.aim.material = this.placeReason === null ? AIM_OK : AIM_BAD;
    } else {
      this.placeReason = null;
      if (this.ghost && this.mode !== "place") this.clearGhost();
      if (this.aim) this.aim.visible = false;
    }
  }
}
