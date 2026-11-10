/**
 * Giao diện trong trận (HTML/CSS đè lên canvas 3D).
 * Bảng lệnh chỉ dựng lại khi NGỮ CẢNH đổi (chọn thứ khác); còn số liệu (máu, tiền, hàng chờ)
 * được cập nhật tại chỗ — dựng lại nút liên tục sẽ làm hỏng cú chạm đang bấm dở trên điện thoại.
 */
import { BUILDINGS, canStrike, FORMATIONS, lotCost, lotTime, MVP_BUILDABLE, RES_NAME, RULES, SIDE_NAME, UNITS, type BuildingId, type FormationId, type Side, type UnitId } from "../sim/content";
import { TERRAIN } from "../sim/maps";
import type { Building, Mine, Unit } from "../sim/types";
import { sec, TICK_RATE } from "../sim/world";
import type { Match } from "./match";

export type PanelCtx =
  | { t: "none" }
  | { t: "units"; units: Unit[] }
  | { t: "building"; b: Building; own: boolean }
  | { t: "enemy"; u: Unit }
  | { t: "mine"; m: Mine };

export type Mode = "normal" | "place" | "amove" | "rally" | "harvest" | "salvage" | "barrage";

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number): string => Math.floor(n).toLocaleString("vi-VN");
const clock = (ticks: number): string => {
  const s = Math.floor(ticks / TICK_RATE);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export class Hud {
  readonly root: HTMLElement;
  private topbar: HTMLElement;
  private bannerEl: HTMLElement;
  private alertsEl: HTMLElement;
  private panel: HTMLElement;
  private head: HTMLElement;
  private rows: HTMLElement;
  private hintEl: HTMLElement;
  readonly confirm: HTMLElement;
  readonly minimapCanvas: HTMLCanvasElement;
  private key = "";
  private lastNumbers = 0;

  private radialEl: HTMLElement | null = null;
  private radialTimer = 0;

  constructor(
    parent: HTMLElement,
    private match: Match,
    private thumbs: Map<string, string>,
    private act: (action: string, arg?: string) => void
  ) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    const spectator = match.player === null;
    this.root.innerHTML = `
      <div class="topbar">
        ${
          spectator
            ? `<div class="spectate-res"><div class="side lam"></div><div class="side do"></div></div>`
            : `<div class="chip-res iron" title="Sắt: xây công trình và đúc quân"><i></i><span data-n="iron"></span><small data-n="ironRate"></small></div>
               <div class="chip-res oil" title="Dầu: nhiên liệu máy bay"><i></i><span data-n="oil"></span></div>
               <div class="chip-res units" title="Số quân / giới hạn"><i></i><span data-n="units"></span></div>
               <div class="chip-res power" title="Điện: đang dùng / khả năng phát (MW) · % pin dự trữ. Hậu cần tự điều độ; thiếu điện thì cắt theo ưu tiên: phòng thủ → Sân Đáp → nhà xưởng"><i>⚡</i><span data-n="power"></span></div>`
        }
        <span class="spacer"></span>
        <div class="clock" data-n="clock">00:00</div>
        <button class="iconbtn" data-act="speed" title="Tốc độ trận">×1</button>
        <button class="iconbtn" data-act="sound" title="Bật/tắt âm thanh">♪</button>
        <button class="iconbtn" data-act="menu" title="Tạm dừng / menu">☰</button>
      </div>
      <div class="banner" hidden></div>
      <div class="alerts"></div>
      <div class="hint-line" hidden></div>
      ${
        spectator
          ? ""
          : `<div class="abilities">
               <button data-act="ability:barrage" title="Rải thảm (kỹ năng của Xe Tên Lửa Loạt): chọn một vùng; các xe đang chọn (không chọn thì mọi xe) tự chạy tới tầm, dựng dàn rồi xả cả loạt 24 quả"><b>🚀 Rải thảm</b><small data-n="barrage"></small></button>
               <button data-act="ability:mobilize" title="Tổng động viên (kỹ năng của Xe Tư Lệnh): quân quanh xe chạy nhanh hơn 30%, bắn nhanh hơn 20% trong 10 giây"><b>📯 Động viên</b><small data-n="mobilize"></small></button>
               <div class="up" data-n="uplinks" title="Đài Liên Lạc đang giữ: nhìn xa quanh mỗi đài"></div>
             </div>`
      }
      <div class="place-confirm" hidden><button class="no" data-act="placeCancel" aria-label="Hủy">✕</button><button class="rot" data-act="placeRotate" aria-label="Xoay">⟳</button><button class="ok" data-act="placeOk" aria-label="Xây">✓</button></div>
      <div class="bottom">
        <canvas class="minimap"></canvas>
        <div class="panel"><div class="sel-head"></div><div class="rows"></div></div>
      </div>`;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector<T>(s)!;
    this.topbar = q(".topbar");
    this.bannerEl = q(".banner");
    this.alertsEl = q(".alerts");
    this.panel = q(".panel");
    this.head = q(".sel-head");
    this.rows = q(".rows");
    this.hintEl = q(".hint-line");
    this.confirm = q(".place-confirm");
    this.minimapCanvas = q("canvas.minimap");
    this.root.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-act]");
      if (!b || (b as HTMLButtonElement).disabled) return;
      e.stopPropagation();
      const [a, arg] = (b.dataset.act ?? "").split(":");
      this.act(a, arg);
    });
    // chạm vào giao diện không được lọt xuống bản đồ
    const abil = this.root.querySelector<HTMLElement>(".abilities");
    for (const el of [this.panel, this.topbar, this.confirm, abil]) el?.addEventListener("pointerdown", (e) => e.stopPropagation());
    // hàng nút dài hơn bảng (9 công trình): lăn chuột thì cuộn ngang, vì chuột thường chỉ có con lăn dọc
    this.panel.addEventListener(
      "wheel",
      (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
        if (!row || row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        row.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  private img(id: string): string {
    const src = this.thumbs.get(id);
    return src ? `<img src="${src}" alt="" />` : "";
  }

  private costHtml(c: { iron: number; oil: number }): string {
    return `<span class="cost">${c.iron}${c.oil ? ` · <span class="o">${c.oil}</span>` : ""}</span>`;
  }

  /**
   * Bảng nan quạt tại điểm đến: mỗi nan một kiểu đội hình, nan sáng là kiểu đang dùng. Không chọn gì thì tự ẩn và đội giữ
   * nguyên kiểu; chạm chỗ khác trên bản đồ cũng ẩn. `ms` = 0: không tự ẩn.
   */
  showRadial(x: number, y: number, current: FormationId, pick: (f: FormationId) => void, ms = 3500): void {
    this.hideRadial();
    const ids = Object.keys(FORMATIONS) as FormationId[];
    const SIZE = 232;
    const C = SIZE / 2;
    const R = 112;
    const r = 42;
    const span = (Math.PI * 2) / ids.length;
    const pad = 0.035;
    const at = (a: number, d: number): string => `${(C + Math.cos(a) * d).toFixed(1)} ${(C + Math.sin(a) * d).toFixed(1)}`;
    const wedges = ids.map((id, i) => {
      const mid = -Math.PI / 2 + i * span;
      const a = mid - span / 2 + pad;
      const b = mid + span / 2 - pad;
      const large = b - a > Math.PI ? 1 : 0;
      const d = `M${at(a, r)} L${at(a, R)} A${R} ${R} 0 ${large} 1 ${at(b, R)} L${at(b, r)} A${r} ${r} 0 ${large} 0 ${at(a, r)}Z`;
      const lx = C + Math.cos(mid) * 78;
      const ly = C + Math.sin(mid) * 78;
      const words = FORMATIONS[id].name.split(" ");
      const cut = Math.ceil(words.length / 2);
      const lines = words.length > 2 ? [words.slice(0, cut).join(" "), words.slice(cut).join(" ")] : [FORMATIONS[id].name];
      const text = lines.map((t, k) => `<tspan x="${lx.toFixed(1)}" dy="${k ? 15 : lines.length > 1 ? -3 : 4}">${esc(t)}</tspan>`).join("");
      return `<g class="wedge${id === current ? " on" : ""}" data-f="${id}"><path d="${d}"/><text y="${ly.toFixed(1)}" text-anchor="middle">${text}</text></g>`;
    });
    const el = document.createElement("div");
    el.className = "radial";
    el.innerHTML = `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${wedges.join("")}<g class="hub" data-f=""><circle cx="${C}" cy="${C}" r="${r - 5}"/><text x="${C}" y="${C - 2}" text-anchor="middle">Giữ</text><text x="${C}" y="${C + 12}" text-anchor="middle">nguyên</text></g></svg>`;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const half = SIZE / 2 + 6;
    el.style.left = `${Math.max(half, Math.min(w - half, x))}px`;
    el.style.top = `${Math.max(half, Math.min(h - half, y))}px`;
    // chạm vào bảng không được lọt xuống bản đồ
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("[data-f]")) e.stopPropagation();
    });
    el.addEventListener("click", (e) => {
      const g = (e.target as Element).closest<SVGGElement>("[data-f]");
      if (!g) return;
      e.stopPropagation();
      const f = g.dataset.f as FormationId | "";
      if (f && f !== current) pick(f);
      this.hideRadial();
    });
    this.root.appendChild(el);
    this.radialEl = el;
    if (ms > 0) this.radialTimer = window.setTimeout(() => this.hideRadial(), ms);
  }

  hideRadial(): void {
    if (this.radialTimer) window.clearTimeout(this.radialTimer);
    this.radialTimer = 0;
    this.radialEl?.remove();
    this.radialEl = null;
  }

  private buildRow(): string {
    if (this.match.player === null) return "";
    return `<div class="row"><span class="row-label">Xây</span>${MVP_BUILDABLE.map((k) => {
      const s = BUILDINGS[k];
      const mw = s.power ? ` <span class="${s.power > 0 ? "pw" : "pwneg"}">${s.power > 0 ? "+" : ""}${s.power}⚡</span>` : "";
      return `<button class="btn" data-act="build:${k}" data-build="${k}" title="${esc(s.role)}">${this.img(k)}<span>${esc(s.name.replace("Sân Đáp Không Quân", "Sân Đáp"))}</span><span class="cost">${s.cost!.iron}${mw}</span></button>`;
    }).join("")}</div>`;
  }

  private contextKey(ctx: PanelCtx): string {
    switch (ctx.t) {
      case "none":
        return "none";
      case "units": {
        const kinds = [...new Set(ctx.units.map((u) => u.kind))].sort().join(",");
        return `units:${kinds}`;
      }
      case "building":
        return `b:${ctx.b.id}:${ctx.b.built}:${ctx.own}`;
      case "enemy":
        return `e:${ctx.u.id}`;
      case "mine":
        return `m:${ctx.m.id}`;
    }
  }

  private rebuild(ctx: PanelCtx): void {
    let html = "";
    switch (ctx.t) {
      case "none":
        if (this.match.player !== null)
          html = `<div class="row">
            <button class="btn wide" data-act="army"><span>⚔</span><span>Toàn quân</span><span class="cost">chọn quân chiến</span></button>
            <button class="btn wide" data-act="cmd"><span class="key">F1</span><span>★</span><span>Xe Tư Lệnh</span></button>
            <button class="btn wide" data-act="hq"><span class="key">H</span><span>⌂</span><span>Tổng Hành Dinh</span></button>
          </div>`;
        html += this.buildRow();
        break;
      case "units": {
        const hasAir = ctx.units.some((u) => u.air !== "none");
        const hasHauler = ctx.units.some((u) => u.kind === "hauler");
        const hasArmed = ctx.units.some((u) => UNITS[u.kind].weapon);
        html = `<div class="row">
          ${hasArmed ? `<button class="btn" data-act="amove" data-mode="amove"><span class="key">A</span><span>⚔</span><span>Tấn công</span><span class="cost">di chuyển</span></button>` : ""}
          <button class="btn" data-act="stop"><span class="key">S</span><span>■</span><span>Dừng</span></button>
          ${hasAir ? `<button class="btn" data-act="rtb"><span class="key">B</span><span>⤓</span><span>Về sân</span><span class="cost">nạp dầu</span></button>` : ""}
          ${hasHauler ? `<button class="btn" data-act="harvest" data-mode="harvest"><span>⛏</span><span>Khai thác</span><span class="cost">chọn mỏ</span></button>` : ""}
          ${hasHauler ? `<button class="btn" data-act="salvage" data-mode="salvage" title="Chọn một xác quân để Xe Vận Tải kéo về Tổng Hành Dinh (mỗi xe một xác)"><span>🔧</span><span>Trục vớt</span><span class="cost">chọn xác</span></button>` : ""}
          <button class="btn" data-act="deselect"><span class="key">Esc</span><span>✕</span><span>Bỏ chọn</span></button>
        </div>${this.buildRow()}`;
        break;
      }
      case "building": {
        const b = ctx.b;
        const s = BUILDINGS[b.kind];
        if (ctx.own && b.built && s.produces) {
          html = `<div class="row"><span class="row-label">Đúc</span>${s.produces
            .filter((k) => UNITS[k].mvp)
            .map((k) => {
              const u = UNITS[k];
              return `<button class="btn" data-act="produce:${k}" data-unit="${k}" title="${esc(u.role)}"><span class="key">${u.hotkey}</span>${this.img(k)}<span>${esc(u.short)}${u.batch > 1 ? ` ×${u.batch}` : ""}</span>${this.costHtml(lotCost(k))}<i class="prog" style="width:0"></i></button>`;
            })
            .join("")}</div>`;
        }
        if (ctx.own)
          html += `<div class="row">
            ${b.queue.length || !b.built ? "" : ""}
            ${s.produces ? `<button class="btn" data-act="cancel"><span>↶</span><span>Hủy đúc</span></button><button class="btn" data-act="rally" data-mode="rally"><span>⚑</span><span>Tập kết</span></button>` : ""}
            ${b.kind !== "hq" ? `<button class="btn danger" data-act="sell"><span>$</span><span data-sell>${b.built ? "Bán" : "Hủy xây"}</span><span class="cost">${b.built ? "hoàn 50%" : "hoàn 100%"}</span></button>` : ""}
            <button class="btn" data-act="deselect"><span>✕</span><span>Bỏ chọn</span></button>
          </div>`;
        else html = `<div class="row"><button class="btn" data-act="deselect"><span>✕</span><span>Bỏ chọn</span></button></div>`;
        break;
      }
      case "enemy":
      case "mine":
        html = `<div class="row"><button class="btn" data-act="deselect"><span>✕</span><span>Bỏ chọn</span></button></div>${this.buildRow()}`;
        break;
    }
    this.rows.innerHTML = html;
  }

  /**
   * Cột kỹ năng: mỗi kỹ năng thuộc về một binh chủng có thật. Rải thảm: số Xe Tên Lửa Loạt sẵn sàng / đang bắn / thời gian
   * nạp còn lại (mờ khi chưa có xe). Động viên: Xe Tư Lệnh, đếm thời gian hồi. Dòng cuối: số Đài Liên Lạc đang giữ.
   */
  private updateAbilities(mode: Mode): void {
    const box = this.root.querySelector<HTMLElement>(".abilities");
    const me = this.match.player;
    if (!box || me === null) return;
    const w = this.match.world;
    const q = (n: string): HTMLElement | null => box.querySelector<HTMLElement>(`[data-n="${n}"]`);
    const txt = (n: string, v: string): void => {
      const el = q(n);
      if (el && el.textContent !== v) el.textContent = v;
    };
    const rockets = w.units.filter((u) => u.side === me && canStrike(u.kind));
    const ready = rockets.filter((u) => u.cooldown === 0 && u.burst === 0).length;
    const firing = rockets.filter((u) => u.burst > 0).length;
    const bBtn = box.querySelector<HTMLButtonElement>('[data-act="ability:barrage"]')!;
    bBtn.disabled = rockets.length === 0;
    bBtn.classList.toggle("on", mode === "barrage");
    let rs: string;
    if (!rockets.length) rs = "[T] · chưa có xe";
    else if (ready || firing) rs = `[T] · ${ready}/${rockets.length} sẵn sàng${firing ? ` · ${firing} đang bắn` : ""}`;
    else rs = `[T] · đang nạp ${Math.ceil(Math.min(...rockets.map((u) => u.cooldown)) / TICK_RATE)}s`;
    txt("barrage", rs);
    const mErr = w.mobilizeError(me);
    const mBtn = box.querySelector<HTMLButtonElement>('[data-act="ability:mobilize"]')!;
    mBtn.disabled = mErr !== null;
    const active = w.sides[me].mobilizeUntil > w.tick;
    txt("mobilize", active ? `[R] · đang hiệu lực ${Math.ceil((w.sides[me].mobilizeUntil - w.tick) / TICK_RATE)}s` : mErr ? `[R] · ${mErr}` : "[R] · sẵn sàng");
    const ups = w.uplinks.length;
    txt("uplinks", ups ? `📡 Đài Liên Lạc ${w.uplinks.filter((u) => u.owner === me).length}/${ups}` : "");
  }

  /** Cựu binh: cấp và phần thưởng (bỏ trống nếu chưa lên cấp). */
  private rankNote(u: Unit): string {
    if (u.rank === 0) return "";
    const V = RULES.veterancy;
    return ` · Cựu binh ${"▲".repeat(u.rank)} +${Math.round(u.rank * V.dmgPerRank * 100)}% sát thương${u.rank >= V.regenRank ? ", tự hồi máu" : ""}`;
  }

  /** Địa hình dưới xe mặt đất: tên loại + ảnh hưởng tốc độ (và nấp nếu là rừng). Đứng trên cỏ thì bỏ trống. */
  private terrainNote(u: Unit): string {
    if (u.air !== "none") return "";
    const w = this.match.world;
    const kind = w.grid.kindAt(u.x, u.z);
    if (kind === "grass") return "";
    const t = TERRAIN[kind];
    const pct = Math.round((w.terrainFactor(u) - 1) * 100);
    const speed = pct === 0 ? "không bị chậm" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% tốc độ`;
    const cover = t.cover > 0 ? ` · nấp −${Math.round(t.cover * 100)}% sát thương` : "";
    return ` · ${t.name}: ${speed}${cover}`;
  }

  private hpBar(hp: number, max: number): string {
    const k = Math.max(0, Math.min(1, hp / max));
    const col = k > 0.6 ? "var(--good)" : k > 0.3 ? "var(--accent)" : "var(--bad)";
    return `<span class="bar"><i style="width:${(k * 100).toFixed(0)}%;background:${col}"></i></span>`;
  }

  private headHtml(ctx: PanelCtx): string {
    const w = this.match.world;
    switch (ctx.t) {
      case "none":
        return this.match.player === null
          ? `<b>Chế độ xem AI đấu AI</b><small>Kéo để di chuyển camera · chạm vào quân để xem thông tin</small>`
          : `<b>Tư lệnh, hãy ra lệnh</b><small>Chạm vào quân để chọn · giữ rồi kéo để chọn nhiều</small>`;
      case "units": {
        const counts = new Map<UnitId, number>();
        let hp = 0;
        let max = 0;
        for (const u of ctx.units) {
          counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
          hp += u.hp;
          max += u.maxHp;
        }
        const names = [...counts].map(([k, n]) => `${UNITS[k].short}${n > 1 ? ` ×${n}` : ""}`).join(" · ");
        const single = ctx.units.length === 1 ? ctx.units[0] : null;
        let extra = "";
        if (single) {
          const sp = UNITS[single.kind];
          if (sp.fuel) {
            const f = single.fuel / sp.fuel.tank;
            const state = { parked: f >= RULES.air.takeoffMin ? "Sẵn sàng" : "Đang nạp dầu", takeoff: "Cất cánh", launch: "Phóng khỏi giếng", flying: "Đang bay", returning: "Về sân", landing: "Hạ cánh", none: "" }[single.air];
            extra = `<small>Dầu ${Math.round(single.fuel)}/${sp.fuel.tank}L · ${state}</small>`;
          } else if (single.kind === "hauler") {
            const st = {
              idle: single.manual ? "Chờ lệnh" : "Tìm mỏ",
              toMine: "Ra mỏ",
              mining: "Đang đào",
              toDock: "Chở về",
              unloading: "Dỡ hàng",
              toWreck: "Đi kéo xác",
              salvaging: "Đang cẩu xác lên xe"
            }[single.hState];
            const load = [single.cargo > 0 ? `${Math.round(single.cargo)} ${RES_NAME[single.cargoRes]}` : "", single.scrap > 0 ? `xác ${Math.round(single.scrap)} Sắt` : ""].filter(Boolean).join(" + ");
            extra = `<small>${st}${load ? ` · ${load}` : ""}${this.terrainNote(single)}</small>`;
          } else extra = `<small>${Math.ceil(single.hp)}/${single.maxHp}${this.rankNote(single)}${this.terrainNote(single)}</small>`;
        }
        return `<b>${esc(single ? UNITS[single.kind].name : names)}</b>${this.hpBar(hp, max)}${extra}`;
      }
      case "building": {
        const b = ctx.b;
        const s = BUILDINGS[b.kind];
        let status = "";
        if (!b.built) status = `Đang xây ${Math.floor(b.progress * 100)}%`;
        else if (b.queue.length) {
          const u = UNITS[b.queue[0]];
          const k = b.prog / sec(lotTime(b.queue[0]));
          status = `Đang đúc ${u.short} ${Math.floor(k * 100)}%${b.queue.length > 1 ? ` · chờ ${b.queue.length - 1}` : ""}`;
          if (u.domain === "air" && w.freePads(b.side) < u.batch) status = "Tạm dừng: không đủ bãi đậu trống cho cả lô, xây thêm Sân Đáp";
        } else if (b.kind === "aircraft-factory" && !w.hasFreePad(b.side)) status = "Cần Sân Đáp còn bãi trống để đúc máy bay";
        else if (b.kind === "airfield") status = `Bãi đậu ${b.pads.filter((p) => p).length}/${RULES.air.pads}`;
        if (b.built && s.oilBurn)
          status = b.active
            ? `Đang phát ${Math.round(b.load)}/${s.power} MW · đốt ${((b.load / s.power) * s.oilBurn).toFixed(2)} Dầu/s`
            : w.sides[b.side].oil <= 0.01
              ? "Hết Dầu: không phát điện"
              : "Dự phòng: chưa cần điện, không đốt Dầu";
        else if (b.built && s.storage)
          status = `Pin ${Math.round(b.charge)}/${s.storage} MJ · ${b.load > 0.01 ? `đang nạp ${b.load.toFixed(1)} MW` : b.load < -0.01 ? `đang xả ${(-b.load).toFixed(1)} MW` : "chờ"}`;
        else if (b.built && s.power < 0 && ctx.own && b.powerFrac < 1)
          status = `${status ? status + " · " : ""}${s.radarSight && !b.active ? "Radar tắt vì thiếu điện" : `Thiếu điện: chạy ${Math.round(b.powerFrac * 100)}%`}`;
        const owner = ctx.own ? "" : `<small>${SIDE_NAME[b.side]}</small>`;
        return `<b>${esc(s.name)}</b>${this.hpBar(b.hp, b.maxHp)}<small>${status}</small>${owner}`;
      }
      case "enemy": {
        const u = ctx.u;
        return `<b>${esc(UNITS[u.kind].name)}</b>${this.hpBar(u.hp, u.maxHp)}<small>${SIDE_NAME[u.side]}</small>`;
      }
      case "mine": {
        const m = ctx.m;
        const owner = m.owner === -1 ? (m.capSide !== -1 && m.cap > 0 ? `Trung lập · ${SIDE_NAME[m.capSide]} đang chiếm ${Math.floor(m.cap * 100)}%` : "Trung lập") : `Thuộc ${SIDE_NAME[m.owner]}${m.cap < 1 ? ` (đang bị tranh ${Math.floor(m.cap * 100)}%)` : ""}`;
        void w;
        return `<b>${m.res === "iron" ? "Mỏ Sắt" : "Giàn Dầu"}</b><small>Còn ${fmt(m.amount)}/${fmt(m.max)} · ${owner}</small>`;
      }
    }
  }

  update(ctx: PanelCtx, mode: Mode, placeKind: BuildingId | null, hint: string | null): void {
    const k = this.contextKey(ctx);
    if (k !== this.key) {
      this.key = k;
      this.rebuild(ctx);
    }
    const now = performance.now();
    if (now - this.lastNumbers < 100) return;
    this.lastNumbers = now;
    const w = this.match.world;
    const me = this.match.player;
    const set = (n: string, v: string): void => {
      const el = this.topbar.querySelector<HTMLElement>(`[data-n="${n}"]`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set("clock", clock(w.tick));
    if (me !== null) {
      const st = w.sides[me];
      set("iron", fmt(st.iron));
      set("oil", fmt(st.oil));
      set("units", `${w.unitCount(me)}/${RULES.unitCap}`);
      set("power", `${Math.round(st.powerUse)}/${Math.round(st.powerCap)} MW${st.batteryMax > 0 ? ` · 🔋${Math.round((st.battery / st.batteryMax) * 100)}%` : ""}`);
      // đỏ khi đang thiếu, hoặc khi công trình đang xây sẽ làm thiếu
      this.topbar.querySelector(".chip-res.power")?.classList.toggle("low", st.eff < 1 || st.powerUse + st.powerPending > st.powerCap + 1e-6);
      this.topbar.querySelector(".chip-res.oil")?.classList.toggle("low", st.oil < 40);
      this.updateAbilities(mode);
    } else {
      const sides = this.topbar.querySelectorAll<HTMLElement>(".spectate-res .side");
      ([0, 1] as Side[]).forEach((s) => {
        const st = w.sides[s];
        const txt = `${s === 0 ? "Lam" : "Đỏ"} · Sắt ${fmt(st.iron)} · Dầu ${fmt(st.oil)} · ⚡${Math.round(st.powerUse)}/${Math.round(st.powerCap)} · Quân ${w.unitCount(s)}`;
        if (sides[s].textContent !== txt) sides[s].textContent = txt;
      });
    }
    const speedBtn = this.topbar.querySelector<HTMLElement>('[data-act="speed"]');
    if (speedBtn) speedBtn.textContent = this.match.paused ? "❚❚" : `×${this.match.speed}`;

    // banner độc quyền
    let banner: string | null = null;
    let tone = "";
    for (const s of [0, 1] as Side[]) {
      const st = w.sides[s];
      if (st.mono > 0 && st.monoRes) {
        const left = Math.max(0, Math.ceil(RULES.monopolySeconds - st.mono / TICK_RATE));
        banner = `${SIDE_NAME[s]} độc quyền ${RES_NAME[st.monoRes]}: còn ${left}s`;
        tone = me === null ? "" : s === me ? "good" : "bad";
      }
    }
    this.bannerEl.hidden = !banner;
    if (banner) {
      this.bannerEl.textContent = banner;
      this.bannerEl.className = `banner ${tone}`;
    }

    // đầu bảng + trạng thái các nút
    const h = this.headHtml(ctx);
    if (this.head.innerHTML !== h) this.head.innerHTML = h;
    if (me !== null) {
      const st = w.sides[me];
      this.rows.querySelectorAll<HTMLButtonElement>("[data-build]").forEach((b) => {
        const c = BUILDINGS[b.dataset.build as BuildingId].cost!;
        b.disabled = st.iron < c.iron || st.oil < c.oil;
        b.setAttribute("aria-pressed", String(mode === "place" && placeKind === b.dataset.build));
      });
      this.rows.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(mode === b.dataset.mode)));
      if (ctx.t === "building" && ctx.own) {
        const bd = ctx.b;
        this.rows.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach((btn) => {
          const kind = btn.dataset.unit as UnitId;
          const u = UNITS[kind];
          const c = lotCost(kind);
          const n = bd.queue.filter((q) => q === kind).length;
          btn.disabled = st.iron < c.iron || st.oil < c.oil || bd.queue.length >= RULES.queueMax || w.unitCount(me) + u.batch > RULES.unitCap;
          let badge = btn.querySelector<HTMLElement>(".count");
          if (n > 0) {
            if (!badge) {
              badge = document.createElement("span");
              badge.className = "count";
              btn.appendChild(badge);
            }
            badge.textContent = String(n);
          } else badge?.remove();
          const prog = btn.querySelector<HTMLElement>(".prog");
          if (prog) prog.style.width = bd.queue[0] === kind ? `${Math.min(100, (bd.prog / sec(lotTime(kind))) * 100)}%` : "0";
        });
      }
    }
    this.hintEl.hidden = !hint;
    if (hint) this.hintEl.textContent = hint;
  }

  alert(text: string, tone: "bad" | "good" | "" = ""): void {
    const el = document.createElement("div");
    el.className = `alert ${tone}`;
    el.textContent = text;
    this.alertsEl.prepend(el);
    while (this.alertsEl.children.length > 4) this.alertsEl.lastElementChild?.remove();
    window.setTimeout(() => el.remove(), 4000);
  }

  destroy(): void {
    this.root.remove();
  }
}
