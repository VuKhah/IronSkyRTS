/**
 * Phòng Thử Nghiệm (index.html?play=sandbox): thả quân / công trình tùy ý để thử từng binh chủng.
 *
 * Mọi thao tác ở đây đều được gửi thành LỆNH (sbSpawn, sbRemove, …) qua cùng kênh lệnh của trận,
 * không sửa thẳng vào World. Nhờ vậy trận thử nghiệm vẫn tất định: cùng seed + cùng nhật ký lệnh
 * thì ra cùng kết quả, và lõi sim không cần biết có giao diện nào đang điều khiển nó.
 */
import { BUILDINGS, SIDE_NAME, UNITS, type BuildingId, type Side, type UnitId } from "../sim/content";
import { ARENA_CENTER, ARENA_U, formation, SCENARIOS, ScenarioRun } from "../sim/scenarios";
import { fromUV } from "../sim/map";
import type { Order } from "../sim/types";
import { TICK_RATE } from "../sim/world";
import type { RtsCamera } from "./camera";
import type { Controller } from "./controller";
import type { Fx } from "./fx";
import type { Hud } from "./hud";
import type { Match } from "./match";

type Tool = { t: "spawn"; kind: UnitId | BuildingId } | { t: "remove" } | { t: "heal" } | null;

const UNIT_IDS = Object.keys(UNITS) as UnitId[];
const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
/** Bãi thử đấu tay đôi (dùng chung với kịch bản thiết kế): vùng đất bằng bên bờ Liên Minh Lam. */
export const DUEL_CENTER = ARENA_CENTER;
const SCENARIO_IDS = Object.keys(SCENARIOS);

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class Sandbox {
  private el: HTMLElement;
  private tool: Tool = null;
  private count = 1;
  private fog = false;
  private base = { tick: 0, dmg: [0, 0], kills: [0, 0] };
  private lastStats = 0;

  constructor(
    parent: HTMLElement,
    private match: Match,
    private ctrl: Controller,
    private cam: RtsCamera,
    private fx: Fx,
    private hud: Hud,
    private canvas: HTMLCanvasElement,
    thumbs: Map<string, string>
  ) {
    const img = (id: string): string => (thumbs.get(id) ? `<img src="${thumbs.get(id)}" alt="" />` : "");
    const item = (id: string, label: string, name: string, role: string, mvp: boolean): string =>
      `<button class="sb-item" data-sb="spawn:${id}" title="${esc(`${name}: ${role}`)}">${img(id)}<span>${esc(label)}</span>${mvp ? "" : `<i class="sb-draft">nháp</i>`}</button>`;
    const opt = (id: UnitId, sel: UnitId): string => `<option value="${id}"${id === sel ? " selected" : ""}>${esc(UNITS[id].short)}</option>`;
    this.el = document.createElement("div");
    this.el.className = "sandbox";
    this.el.innerHTML = `
      <div class="sb-head"><b>Phòng Thử Nghiệm</b><button class="iconbtn" data-sb="fold" title="Thu gọn / mở rộng">–</button></div>
      <div class="sb-body">
        <div class="sb-line"><span>Phe</span>
          <button class="sb-chip lam" data-sb="side:0">${SIDE_NAME[0]}</button>
          <button class="sb-chip do" data-sb="side:1">${SIDE_NAME[1]}</button>
        </div>
        <p class="sb-note">Phe đang chọn là phe được thả quân và nhận lệnh của bạn.</p>
        <div class="sb-line"><span>Số lượng</span>${[1, 3, 5, 10].map((n) => `<button class="sb-chip" data-sb="count:${n}">${n}</button>`).join("")}</div>
        <h4>Quân <small>chọn rồi chạm lên bản đồ</small></h4>
        <div class="sb-grid">${UNIT_IDS.map((id) => item(id, UNITS[id].short, UNITS[id].name, UNITS[id].role, UNITS[id].mvp)).join("")}</div>
        <h4>Công trình <small>đã xây xong, bỏ qua vùng xây</small></h4>
        <div class="sb-grid">${BUILDING_IDS.map((id) => item(id, BUILDINGS[id].name, BUILDINGS[id].name, BUILDINGS[id].role, BUILDINGS[id].mvp)).join("")}</div>
        <p class="sb-note"><i class="sb-draft">nháp</i> = chưa vào MVP: chỉ chạy theo luật chung (di chuyển, bắn), chưa có cơ chế riêng.</p>
        <h4>Công cụ</h4>
        <div class="sb-line">
          <button class="sb-chip" data-sb="tool:none">Chọn / ra lệnh</button>
          <button class="sb-chip" data-sb="tool:remove">Xóa</button>
          <button class="sb-chip" data-sb="tool:heal">Hồi đầy</button>
        </div>
        <div class="sb-line">
          <button class="sb-chip" data-sb="healAll">Hồi đầy tất cả</button>
          <button class="sb-chip danger" data-sb="clear">Dọn sạch</button>
        </div>
        <h4>Luật</h4>
        <label class="sb-check"><input type="checkbox" data-sb="hold:0" /> ${SIDE_NAME[0]} ngừng bắn</label>
        <label class="sb-check"><input type="checkbox" data-sb="hold:1" /> ${SIDE_NAME[1]} ngừng bắn</label>
        <label class="sb-check"><input type="checkbox" data-sb="fuel" checked /> Máy bay không tốn nhiên liệu</label>
        <label class="sb-check"><input type="checkbox" data-sb="fog" /> Sương mù (nhìn theo phe đang chọn)</label>
        <h4>Đấu thử nhanh</h4>
        <div class="sb-duel">
          <span class="lam">Lam</span><select data-duel="k0">${UNIT_IDS.map((id) => opt(id, "lynx")).join("")}</select>
          <span>×</span><input data-duel="n0" type="number" min="1" max="30" value="3" />
          <span class="do">Đỏ</span><select data-duel="k1">${UNIT_IDS.map((id) => opt(id, "titan")).join("")}</select>
          <span>×</span><input data-duel="n1" type="number" min="1" max="30" value="1" />
        </div>
        <div class="sb-line"><span>Cách nhau</span><input data-duel="d" type="number" min="10" max="90" value="44" /><span>m</span>
          <button class="sb-chip primary" data-sb="duel">Bắt đầu</button></div>
        <h4>Kịch bản thiết kế <small>ý đồ trong ARMY_DESIGN</small></h4>
        <div class="sb-scen">${SCENARIO_IDS.map((id) => {
          const sc = SCENARIOS[id]();
          return `<button class="sb-chip" data-sb="scen:${id}" title="${esc(sc.intent)}">${esc(sc.name)}</button>`;
        }).join("")}</div>
        <div class="sb-verdict" data-n="verdict" hidden></div>
        <h4>Đo đạc <small data-n="since"></small></h4>
        <table class="sb-stats">
          <thead><tr><th></th><th>Quân</th><th>Máu</th><th>Sát thương</th><th>/giây</th><th>Hạ</th></tr></thead>
          <tbody><tr data-row="0"><th class="lam">Lam</th><td></td><td></td><td></td><td></td><td></td></tr>
          <tr data-row="1"><th class="do">Đỏ</th><td></td><td></td><td></td><td></td><td></td></tr></tbody>
        </table>
        <div class="sb-line"><button class="sb-chip" data-sb="reset">Đặt lại đo</button></div>
      </div>`;
    parent.appendChild(this.el);
    // chạm vào bảng không được lọt xuống bản đồ
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.el.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button[data-sb]");
      if (b) this.onButton(b.dataset.sb!);
    });
    this.el.addEventListener("change", (e) => {
      const i = e.target as HTMLInputElement;
      const k = i.dataset.sb;
      if (!k) return;
      if (k.startsWith("hold:")) this.send({ t: "sbHold", side: Number(k.slice(5)) as Side, on: i.checked });
      else if (k === "fuel") this.send({ t: "sbFuel", on: i.checked });
      else if (k === "fog") this.fog = i.checked;
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.setTool(null);
    });
    if (window.innerWidth < 720) this.setFolded(true);
    ctrl.toolTap = (sx, sy) => this.onTap(sx, sy);
    ctrl.viewerFn = () => this.viewer();
    this.refresh();
    this.fromUrl();
  }

  private startScenario(id: string): void {
    this.match.director = new ScenarioRun(id);
    this.resetStats(true);
    this.cam.focus(ARENA_CENTER[0], ARENA_CENTER[1]);
    this.cam.dist = Math.max(this.cam.dist, 80);
    this.hud.alert(`Kịch bản: ${this.match.director.scenario.name}`);
  }

  /**
   * ?play=sandbox&duel=lynx:3,titan:1&dist=44&skip=10: vào thẳng một trận đấu thử (để chia sẻ kịch bản / chụp ảnh).
   * ?play=sandbox&scenario=titan-vs-lynx-seq: chạy thẳng một kịch bản thiết kế.
   */
  private fromUrl(): void {
    const p = new URLSearchParams(location.search);
    const skip = Number(p.get("skip")) || 0;
    const scen = p.get("scenario");
    if (scen && scen in SCENARIOS) {
      this.startScenario(scen);
      for (let i = 0; i < skip * TICK_RATE; i++) this.match.advance(1 / TICK_RATE);
      this.match.drainEvents();
      return;
    }
    const duel = p.get("duel");
    if (!duel) return;
    const q = <T extends HTMLInputElement | HTMLSelectElement>(s: string): T => this.el.querySelector<T>(`[data-duel="${s}"]`)!;
    duel.split(",").slice(0, 2).forEach((part, s) => {
      const [k, n] = part.split(":");
      if (k in UNITS) q(`k${s}`).value = k;
      if (n) q(`n${s}`).value = n;
    });
    if (p.get("dist")) q("d").value = p.get("dist")!;
    this.startDuel();
    for (let i = 0; i < skip * TICK_RATE; i++) this.match.advance(1 / TICK_RATE);
    this.match.drainEvents();
  }

  private setFolded(on: boolean): void {
    this.el.classList.toggle("folded", on);
    this.el.querySelector<HTMLElement>('[data-sb="fold"]')!.textContent = on ? "+" : "–";
  }

  /** Phe mà sương mù / phần vẽ nhìn theo: null = thấy toàn bản đồ. */
  viewer(): Side | null {
    return this.fog ? this.match.player : null;
  }

  private get side(): Side {
    return this.match.player ?? 0;
  }

  private send(o: Order): void {
    this.match.issueAs(this.side, o);
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.refresh();
  }

  private onButton(a: string): void {
    const [k, arg] = a.split(":");
    switch (k) {
      case "fold":
        this.setFolded(!this.el.classList.contains("folded"));
        break;
      case "side":
        this.match.player = Number(arg) as Side;
        this.ctrl.select([]);
        break;
      case "count":
        this.count = Number(arg);
        break;
      case "spawn": {
        const kind = arg as UnitId | BuildingId;
        // bấm lại món đang cầm thì bỏ
        this.setTool(this.tool?.t === "spawn" && this.tool.kind === kind ? null : { t: "spawn", kind });
        return;
      }
      case "tool":
        this.setTool(arg === "remove" ? { t: "remove" } : arg === "heal" ? { t: "heal" } : null);
        return;
      case "healAll": {
        const w = this.match.world;
        this.send({ t: "sbHeal", ids: [...w.units.map((u) => u.id), ...w.buildings.map((b) => b.id)] });
        break;
      }
      case "scen":
        this.startScenario(arg);
        break;
      case "clear":
        this.match.director = null;
        this.send({ t: "sbClear" });
        this.resetStats(true);
        break;
      case "reset":
        this.resetStats(false);
        break;
      case "duel":
        this.startDuel();
        break;
    }
    this.refresh();
  }

  private onTap(sx: number, sy: number): boolean {
    const t = this.tool;
    if (!t) return false;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (t.t === "remove" || t.t === "heal") {
      const hit = this.ctrl.pick(sx, sy, false);
      if (hit && hit.cat !== "mine") {
        this.send(t.t === "remove" ? { t: "sbRemove", ids: [hit.id] } : { t: "sbHeal", ids: [hit.id] });
        this.fx.marker(hit.x, hit.z, t.t === "remove" ? 0xff6b5e : 0x6fdc8c);
      }
      return true;
    }
    const g = this.cam.ground(sx, sy, w, h);
    if (!g) return true;
    if (t.kind in BUILDINGS) {
      const kind = t.kind as BuildingId;
      const x = Math.round(g.x);
      const z = Math.round(g.z);
      const why = this.match.world.sandboxPlaceError(kind, x, z);
      if (why) this.hud.alert(`Không đặt được ${BUILDINGS[kind].name}: ${why}`, "bad");
      else {
        this.send({ t: "sbSpawn", kind, side: this.side, x, z });
        this.fx.marker(x, z, 0x6fdc8c);
      }
      return true;
    }
    // hàng ngang quay mặt về phía camera đang nhìn, các hàng lùi về phía người xem
    const bx = this.cam.cam.position.x - g.x;
    const bz = this.cam.cam.position.z - g.z;
    const l = Math.hypot(bx, bz) || 1;
    for (let i = 0; i < this.count; i++) {
      const [x, z] = formation(i, this.count, g.x, g.z, bx / l, bz / l);
      this.send({ t: "sbSpawn", kind: t.kind, side: this.side, x, z });
    }
    this.fx.marker(g.x, g.z, 0x6fdc8c);
    return true;
  }

  private startDuel(): void {
    const q = <T extends HTMLElement>(s: string): T => this.el.querySelector<T>(`[data-duel="${s}"]`)!;
    const kinds = [q<HTMLSelectElement>("k0").value as UnitId, q<HTMLSelectElement>("k1").value as UnitId];
    const ns = [0, 1].map((s) => Math.max(1, Math.min(30, Math.round(Number(q<HTMLInputElement>(`n${s}`).value) || 1))));
    const d = Math.max(10, Math.min(90, Number(q<HTMLInputElement>("d").value) || 44));
    // hai nhóm đứng đối diện dọc theo trục v (song song dòng sông), cùng một bờ
    const pos = [fromUV(ARENA_U, -d / 2), fromUV(ARENA_U, d / 2)];
    this.match.director = null;
    this.send({ t: "sbClear" });
    for (const s of [0, 1] as Side[]) {
      const [cx, cz] = pos[s];
      const [ex, ez] = pos[1 - s];
      const l = Math.hypot(cx - ex, cz - ez);
      for (let i = 0; i < ns[s]; i++) {
        const [x, z] = formation(i, ns[s], cx, cz, (cx - ex) / l, (cz - ez) / l);
        this.match.issueAs(s, { t: "sbSpawn", kind: kinds[s], side: s, x, z, gx: ex, gz: ez });
      }
    }
    this.resetStats(true);
    this.cam.focus(DUEL_CENTER[0], DUEL_CENTER[1]);
    this.cam.dist = Math.max(60, d * 1.5);
    this.hud.alert(`Đấu thử: ${ns[0]} ${UNITS[kinds[0]].short} (Lam) đối đầu ${ns[1]} ${UNITS[kinds[1]].short} (Đỏ)`);
  }

  /** cleared = vừa gửi lệnh dọn sạch (sim sẽ đưa số đo về 0 ở tick tới). */
  private resetStats(cleared: boolean): void {
    const st = this.match.world.sides;
    this.base = {
      tick: this.match.world.tick + (cleared ? 1 : 0),
      dmg: cleared ? [0, 0] : [st[0].stats.damageDealt, st[1].stats.damageDealt],
      kills: cleared ? [0, 0] : [st[0].stats.kills, st[1].stats.kills]
    };
  }

  /** Cập nhật trạng thái nút (gọi khi bấm). */
  private refresh(): void {
    const t = this.tool;
    this.el.querySelectorAll<HTMLElement>("button[data-sb]").forEach((b) => {
      const [k, arg] = (b.dataset.sb ?? "").split(":");
      let on = false;
      if (k === "side") on = Number(arg) === this.side;
      else if (k === "count") on = Number(arg) === this.count;
      else if (k === "spawn") on = t?.t === "spawn" && t.kind === arg;
      else if (k === "tool") on = arg === "none" ? t === null : t?.t === arg;
      b.setAttribute("aria-pressed", String(on));
    });
    this.canvas.style.cursor = t ? "crosshair" : "";
  }

  /** Gọi mỗi khung hình: cập nhật bảng đo (4 lần/giây là đủ). */
  update(now: number): void {
    if (now - this.lastStats < 250) return;
    this.lastStats = now;
    const w = this.match.world;
    const secs = Math.max(0, (w.tick - this.base.tick) / TICK_RATE);
    for (const s of [0, 1] as Side[]) {
      let n = 0;
      let hp = 0;
      let max = 0;
      for (const u of w.units)
        if (u.side === s) {
          n++;
          hp += Math.max(0, u.hp);
          max += u.maxHp;
        }
      const dmg = w.sides[s].stats.damageDealt - this.base.dmg[s];
      const cells = this.el.querySelectorAll<HTMLElement>(`tr[data-row="${s}"] td`);
      cells[0].textContent = String(n);
      cells[1].textContent = max ? `${Math.round((hp / max) * 100)}%` : "–";
      cells[2].textContent = String(Math.round(dmg));
      cells[3].textContent = secs > 0.5 ? (dmg / secs).toFixed(1) : "–";
      cells[4].textContent = String(w.sides[s].stats.kills - this.base.kills[s]);
    }
    this.el.querySelector<HTMLElement>('[data-n="since"]')!.textContent = `trong ${secs.toFixed(1)} giây`;
    const vEl = this.el.querySelector<HTMLElement>('[data-n="verdict"]')!;
    const run = this.match.director;
    vEl.hidden = !run;
    if (run) {
      const r = run.result;
      vEl.className = `sb-verdict ${r ? (r.ok ? "ok" : "no") : ""}`;
      vEl.innerHTML = `<b>${esc(run.scenario.name)}</b><br><small>${esc(run.scenario.intent)}</small><br>${
        r ? `${r.ok ? "✅ ĐẠT" : "❌ CHƯA ĐẠT"}: ${esc(r.text)}` : `Đang chạy… ${run.elapsed(w).toFixed(1)} giây`
      }`;
    }
  }
}
