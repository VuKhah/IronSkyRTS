/**
 * Xưởng Mô Hình Iron Sky: danh sách bên trái, sân khấu 3D ở giữa, phiếu thông số bên phải.
 * Mọi con số đọc từ src/sim/content.ts, cùng nguồn với trận đấu.
 */
import {
  ARMOR_NAME, BUILDINGS, DMG_NAME, MOBILITY_NAME, PLANNED_BUILDINGS, PLANNED_UNITS, UNITS, getSpec, targetsOf,
  type BuildingSpec, type Cost, type EntityId, type EntitySpec, type Faction, type UnitSpec, type WeaponSpec
} from "../sim/content";
import { buildModel, disposeRig } from "../render/models";
import { bakeStatic } from "../render/models/bake";
import { Stage, Thumbnailer } from "./stage";

type Tab = "units" | "buildings";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Không tìm thấy ${sel}`);
  return el;
};

const UNIT_IDS = Object.keys(UNITS) as EntityId[];
const BUILDING_IDS = Object.keys(BUILDINGS) as EntityId[];

const state = {
  tab: "units" as Tab,
  id: "commander" as EntityId,
  faction: "lam" as Faction,
  autoRotate: true
};

const roster = $<HTMLElement>(".roster");
const controls = $<HTMLElement>(".controls");
const sheet = $<HTMLElement>(".sheet");
const viewer = $<HTMLElement>(".viewer");

let stage: Stage | null = null;
try {
  stage = new Stage(viewer);
  stage.autoRotate = state.autoRotate;
} catch {
  viewer.insertAdjacentHTML("beforeend", `<p class="nogl">Trình duyệt này không bật được WebGL nên không hiển thị được mô hình 3D. Thông số vẫn xem được bên cạnh.</p>`);
}

const thumbs = new Map<string, string>();

// ------------------------------------------------------------------ tiện ích

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString("vi-VN") : n.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const stat = (value: string | number, label: string) => `<div class="stat"><b>${typeof value === "number" ? num(value) : value}</b><span>${label}</span></div>`;
const TARGET_TEXT = { ground: "Bắn mặt đất", air: "Bắn trên không", both: "Bắn đất + không", none: "Không vũ khí" } as const;

function costHtml(c: Cost | undefined, time: number | undefined, verb: string): string {
  if (!c) return "";
  return `<section><h3>Chi phí</h3><div class="cost">
    <span class="i">${c.iron}<small>Sắt</small></span>${c.oil ? `<span class="o">${c.oil}<small>Dầu</small></span>` : ""}
    ${time ? `<span>${num(time)}s<small>${verb}</small></span>` : ""}</div></section>`;
}

function weaponHtml(w: WeaponSpec | undefined): string {
  if (!w) return "";
  const bits = [`<b>${esc(w.name)}</b>`];
  if (w.dmgGround) bits.push(`${w.dmgGround} ST mặt đất`);
  if (w.dmgAir) bits.push(`${w.dmgAir} ST trên không`);
  bits.push(`đạn ${DMG_NAME[w.dmgType]}`, `mỗi ${num(w.cooldown)}s`, `tầm ${num(w.range)}m`);
  if (w.splash) bits.push(`nổ lan ${num(w.splash)}m`);
  if (w.breach) bits.push("công phá");
  return `<p class="weapon">${bits.join(" · ")}</p>`;
}

/** Sát thương mỗi giây trung bình (chưa nhân giáp): cả loạt (`burst`) và mọi nòng (`barrels`), chia cho trọn một chu kỳ nạp + bắn. */
const dps = (w: WeaponSpec) => {
  const shots = w.burst?.shots ?? 1;
  const cycle = w.cooldown + (shots - 1) * (w.burst?.interval ?? 0);
  return Math.round((Math.max(w.dmgGround, w.dmgAir) * shots * (w.barrels ?? 1)) / cycle);
};

function linkList(ids: EntityId[]): string {
  return ids.map((id) => `<button type="button" data-go="${id}">${esc(getSpec(id).name)}</button>`).join("");
}

// ------------------------------------------------------------------ hiển thị

function renderTabs(): void {
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
}

function pickHtml(id: EntityId): string {
  const s = getSpec(id);
  const sub = s.kind === "unit" ? `${s.code} · [${s.hotkey}]` : s.label;
  const img = thumbs.get(`${id}:${state.faction}`);
  return `<button type="button" class="pick" data-id="${id}" aria-current="${id === state.id}">
    ${img ? `<img class="thumb" src="${img}" alt="" />` : `<span class="thumb"></span>`}
    <span><b>${esc(s.name)}</b><small>${esc(sub)}</small></span></button>`;
}

function renderRoster(): void {
  if (state.tab === "units") {
    const ground = UNIT_IDS.filter((id) => UNITS[id as keyof typeof UNITS].domain === "ground");
    const air = UNIT_IDS.filter((id) => UNITS[id as keyof typeof UNITS].domain === "air");
    roster.innerHTML = `<h2>Mặt đất</h2>${ground.map(pickHtml).join("")}<h2>Trên không</h2>${air.map(pickHtml).join("")}
      <h2>Sắp có</h2><div class="planned">${PLANNED_UNITS.map((u) => `<span title="${esc(u.group)}">${esc(u.name)}</span>`).join("")}</div>`;
  } else {
    const mvp = BUILDING_IDS.filter((id) => BUILDINGS[id as keyof typeof BUILDINGS].mvp);
    const later = BUILDING_IDS.filter((id) => !BUILDINGS[id as keyof typeof BUILDINGS].mvp);
    roster.innerHTML = `<h2>Bản MVP</h2>${mvp.map(pickHtml).join("")}<h2>Sau MVP</h2>${later.map(pickHtml).join("")}
      <h2>Sắp có</h2><div class="planned">${PLANNED_BUILDINGS.map((n) => `<span>${esc(n)}</span>`).join("")}</div>`;
  }
}

function unitSheet(s: UnitSpec): string {
  const w = s.weapon;
  const tags = [
    `<span class="tag key">${s.code}</span>`,
    `<span class="tag key">Phím [${s.hotkey}]</span>`,
    `<span class="tag">${s.domain === "air" ? "Trên không" : "Mặt đất"}</span>`,
    s.mobility ? `<span class="tag">Xe ${MOBILITY_NAME[s.mobility].toLowerCase()}</span>` : "",
    s.slowResist ? `<span class="tag">Kháng làm chậm</span>` : "",
    `<span class="tag">${TARGET_TEXT[targetsOf(w)]}</span>`,
    s.id === "commander" ? `<span class="tag warn">Mất xe là thua</span>` : ""
  ].join("");
  const stats = [
    stat(s.hp, "Máu"),
    stat(ARMOR_NAME[s.armorClass], "Giáp"),
    stat(s.minSpeed ? `${num(s.minSpeed)}–${num(s.speed)}` : num(s.speed), "Tốc độ m/s"),
    stat(`${s.sight}m`, "Tầm nhìn"),
    ...(w ? [stat(`${num(w.range)}m`, "Tầm bắn"), stat(dps(w), "ST mỗi giây"), stat(w.splash ? `${num(w.splash)}m` : "—", "Nổ lan")] : []),
    ...(s.cargo ? [stat(s.cargo, "Sức chở")] : []),
    ...(s.fuel ? [stat(`${s.fuel.tank}L`, "Bình dầu"), stat(`${num(s.fuel.burn)}L/s`, "Đốt dầu"), stat(`~${Math.round(s.fuel.tank / s.fuel.burn)}s`, "Thời gian bay")] : [])
  ].join("");
  return `
    <header><h2>${esc(s.name)}</h2><p class="role">${esc(s.role)}</p><div class="tags">${tags}</div></header>
    ${s.cost ? costHtml(s.cost, s.buildTime, "chế tạo") : `<section><h3>Chi phí</h3><p class="weapon">Có sẵn từ đầu trận, không chế tạo thêm được.</p></section>`}
    <section><h3>Chỉ số</h3><div class="stats">${stats}</div></section>
    ${w ? `<section><h3>Vũ khí</h3>${weaponHtml(w)}</section>` : ""}
    ${s.secondary ? `<section><h3>Vũ khí phụ (${s.secondary.ammo} viên mỗi lần xuất kích)</h3>${weaponHtml(s.secondary)}</section>` : ""}
    <section><h3>Đặc điểm</h3><ul class="features">${s.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
    <section class="matchups">
      <div class="beats"><h3>Khắc chế</h3>${linkList(s.beats) || `<span class="weapon">—</span>`}</div>
      <div class="fears"><h3>Sợ</h3>${linkList(s.fears)}</div>
    </section>`;
}

function buildingSheet(s: BuildingSpec): string {
  const tags = [
    `<span class="tag key">${esc(s.label)}</span>`,
    s.weapon ? `<span class="tag">${TARGET_TEXT[targetsOf(s.weapon)]}</span>` : "",
    s.strictPower ? `<span class="tag warn">Bắt buộc có điện</span>` : "",
    s.id === "hq" ? `<span class="tag warn">Mất là thua</span>` : ""
  ].join("");
  const power = s.power > 0 ? `+${s.power} MW` : s.power < 0 ? `${s.power} MW` : "0 MW";
  const stats = [
    stat(s.hp, "Độ bền"),
    stat(ARMOR_NAME[s.armorClass], "Giáp"),
    stat(power, s.power >= 0 ? "Phát điện" : "Tiêu thụ điện"),
    ...(s.weapon ? [stat(`${num(s.weapon.range)}m`, "Tầm bắn"), stat(dps(s.weapon), "ST mỗi giây")] : []),
    ...(s.magazine ? [stat(s.magazine, "Băng đạn")] : [])
  ].join("");
  // Công trình nào bị quân nào khắc chế: suy ra ngược từ danh sách "beats" của quân
  const threats = UNIT_IDS.filter((u) => UNITS[u as keyof typeof UNITS].beats.includes(s.id));
  return `
    <header><h2>${esc(s.name)}</h2><p class="role">${esc(s.role)}</p><div class="tags">${tags}</div></header>
    ${s.cost ? costHtml(s.cost, s.buildTime, "xây") : `<section><h3>Chi phí</h3><p class="weapon">Có sẵn trên bản đồ, không xây được.</p></section>`}
    <section><h3>Chỉ số</h3><div class="stats">${stats}</div></section>
    ${s.weapon ? `<section><h3>Vũ khí</h3>${weaponHtml(s.weapon)}</section>` : ""}
    <section><h3>Đặc điểm</h3><ul class="features">${s.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
    ${threats.length ? `<section class="matchups"><div class="fears" style="grid-column: 1 / -1"><h3>Bị khắc chế bởi</h3>${linkList(threats)}</div></section>` : ""}`;
}

function renderSheet(spec: EntitySpec): void {
  sheet.innerHTML = spec.kind === "unit" ? unitSheet(spec) : buildingSheet(spec);
}

function renderControls(actions: { id: string; label: string }[]): void {
  if (!stage) {
    controls.innerHTML = "";
    return;
  }
  const s = stage;
  controls.innerHTML = `${actions.map((a) => `<button type="button" class="chip" data-act="${a.id}" aria-pressed="${s.active.has(a.id)}">${esc(a.label)}</button>`).join("")}
    <span class="sep"></span>
    <span class="faction" role="group" aria-label="Phe">
      <button type="button" data-f="lam" aria-pressed="${state.faction === "lam"}">Liên Minh Lam</button>
      <button type="button" data-f="do" aria-pressed="${state.faction === "do"}">Tập Đoàn Đỏ</button>
    </span>
    <button type="button" class="chip" data-rotate aria-pressed="${state.autoRotate}">Tự xoay</button>`;
}

/** Dựng lại mô hình đang chọn. keepView: chỉ đổi phe thì giữ nguyên góc camera và hoạt ảnh đang bật. */
function loadModel(keepView: boolean): void {
  if (!stage) return;
  const rig = buildModel(state.id, state.faction);
  if (!keepView) stage.active = new Set(rig.defaultOn);
  // ?bake=1: xem mô hình đã "nướng" đúng như trên chiến trường (gộp khối đứng yên)
  if (new URLSearchParams(location.search).has("bake")) bakeStatic(rig);
  const old = stage.show(rig, keepView);
  // ?flight=1: thử chế độ bay do chiến trường điều khiển (setFlight)
  if (new URLSearchParams(location.search).has("flight")) rig.setFlight?.(true, 0.5);
  if (old) disposeRig(old);
  renderControls(rig.actions);
}

function select(id: EntityId, push = true): void {
  state.id = id;
  state.tab = id in UNITS ? "units" : "buildings";
  if (push) history.replaceState(null, "", `#${id}`);
  renderTabs();
  renderRoster();
  renderSheet(getSpec(id));
  loadModel(false);
}

// ------------------------------------------------------------------ sự kiện

document.querySelector(".tabs")!.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-tab]");
  if (!b) return;
  const tab = b.dataset.tab as Tab;
  if (tab !== state.tab) select(tab === "units" ? UNIT_IDS[0]! : BUILDING_IDS[0]!);
});

roster.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>(".pick");
  if (b?.dataset.id) select(b.dataset.id as EntityId);
});

sheet.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("[data-go]");
  if (b?.dataset.go) {
    select(b.dataset.go as EntityId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

controls.addEventListener("click", (e) => {
  if (!stage) return;
  const b = (e.target as Element).closest<HTMLButtonElement>("button");
  if (!b) return;
  if (b.dataset.act) {
    const id = b.dataset.act;
    if (stage.active.has(id)) stage.active.delete(id);
    else stage.active.add(id);
    b.setAttribute("aria-pressed", String(stage.active.has(id)));
  } else if (b.dataset.f) {
    if (b.dataset.f === state.faction) return;
    state.faction = b.dataset.f as Faction;
    loadModel(true);
    renderRoster();
  } else if (b.hasAttribute("data-rotate")) {
    state.autoRotate = !state.autoRotate;
    stage.autoRotate = state.autoRotate;
    b.setAttribute("aria-pressed", String(state.autoRotate));
  }
});

window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (id && id !== state.id && (id in UNITS || id in BUILDINGS)) select(id as EntityId, false);
});

// Chọn thẳng bằng phím tắt của binh chủng (Z, X, C, N, M, F1) — giống trong trận.
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const hit = (Object.values(UNITS) as UnitSpec[]).find((u) => u.hotkey.toLowerCase() === e.key.toLowerCase());
  if (hit) {
    e.preventDefault();
    select(hit.id);
  }
});

// ------------------------------------------------------------------ khởi động

const first = location.hash.slice(1);
select(first in UNITS || first in BUILDINGS ? (first as EntityId) : "commander");

// ?act=fly,fire bật sẵn hoạt ảnh, ?f=do chọn phe Đỏ — tiện để gửi link xem đúng cảnh.
{
  const q = new URLSearchParams(location.search);
  if (q.get("f") === "do") {
    state.faction = "do";
    loadModel(true);
    renderRoster();
  }
  const acts = q.get("act");
  if (acts && stage) {
    for (const a of acts.split(",")) stage.active.add(a);
    loadModel(true);
  }
}

/** Chụp ảnh đại diện lần lượt, nhường luồng chính giữa các lần để trang không bị khựng. */
async function makeThumbnails(): Promise<void> {
  if (!stage) return;
  const shooter = new Thumbnailer();
  for (const faction of ["lam", "do"] as const) {
    for (const id of [...UNIT_IDS, ...BUILDING_IDS]) {
      const rig = buildModel(id, faction);
      thumbs.set(`${id}:${faction}`, shooter.shoot(rig));
      disposeRig(rig);
      if (faction === state.faction) {
        const img = roster.querySelector<HTMLElement>(`.pick[data-id="${id}"] .thumb`);
        if (img && img.tagName !== "IMG") img.outerHTML = `<img class="thumb" src="${thumbs.get(`${id}:${faction}`)}" alt="" />`;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  shooter.dispose();
}
void makeThumbnails();
