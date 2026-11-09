/**
 * Xưởng Mô Hình Iron Sky: danh sách bên trái, sân khấu 3D ở giữa, phiếu thông số bên phải.
 * Mọi con số đọc từ src/sim/content.ts, cùng nguồn với trận đấu.
 */
import {
  ARMOR_NAME, BUILDINGS, DMG_NAME, MOBILITY_NAME, PLANNED_BUILDINGS, PLANNED_UNITS, UNITS, getSpec, targetsOf,
  type BuildingId, type BuildingSpec, type Cost, type EntityId, type EntitySpec, type Faction, type UnitId, type UnitSpec, type WeaponSpec
} from "../sim/content";
import { buildModel, disposeRig } from "../render/models";
import { bakeStatic } from "../render/models/bake";
import { isShowcase, SHOWCASE, SHOWCASE_IDS, type ShowcaseId } from "./showcase";
import { Stage, Thumbnailer, type ViewName } from "./stage";

const VIEW_LABEL: Record<ViewName, string> = { three: "3/4", front: "Trước", side: "Cạnh", top: "Trên", back: "Sau" };
let lastActions: { id: string; label: string }[] = [];

type Tab = "units" | "buildings";

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Không tìm thấy ${sel}`);
  return el;
};

const UNIT_IDS = Object.keys(UNITS) as EntityId[];
const BUILDING_IDS = Object.keys(BUILDINGS) as EntityId[];

// Nhóm con trong mỗi tab: mỗi lần chỉ hiện một nhóm cho danh sách gọn. Bảng khai báo đủ mọi mã, thêm quân hay công trình mà quên xếp nhóm thì lỗi biên dịch.
const CATS: Record<Tab, readonly { id: string; name: string }[]> = {
  units: [
    { id: "command", name: "Chỉ huy & Hậu cần" },
    { id: "armor", name: "Thiết giáp" },
    { id: "fire", name: "Hỏa lực" },
    { id: "air", name: "Không quân" },
    { id: "navy", name: "Hải quân" },
    { id: "planned", name: "Sắp có" }
  ],
  buildings: [
    { id: "base", name: "Căn cứ & Sản xuất" },
    { id: "energy", name: "Năng lượng & Hậu cần" },
    { id: "defense", name: "Phòng thủ" },
    { id: "front", name: "Tiền tuyến" },
    { id: "planned", name: "Sắp có" }
  ]
};
const UNIT_CAT: Record<UnitId, string> = { commander: "command", hauler: "command", lynx: "armor", titan: "armor", skyguard: "fire", rocket: "fire", artillery: "fire", falcon: "air", valkyrie: "air" };
const BUILDING_CAT: Record<BuildingId, string> = {
  hq: "base", factory: "base", "special-factory": "base", "aircraft-factory": "base", airfield: "base",
  "power-plant": "energy", "power-pylon": "energy", battery: "energy", "oil-extractor": "energy", "ammo-depot": "energy",
  turret: "defense", "aa-ciws": "defense", "aa-sam": "defense", "aa-emp": "defense",
  radar: "front", outpost: "front"
};

const state = {
  tab: "units" as Tab,
  cat: "command",
  id: "commander" as EntityId | ShowcaseId,
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
  // ?measure=0: tắt thước đo (chụp ảnh sạch)
  if (new URLSearchParams(location.search).get("measure") === "0") stage.measure = false;
  // ?sheet=1: chỉ còn 4 góc nhìn phủ cả cửa sổ (một ảnh chụp thay cho bốn ảnh, xem Stage.renderSheet)
  if (new URLSearchParams(location.search).get("sheet") === "1") {
    stage.measure = false;
    stage.sheet = true;
    document.head.insertAdjacentHTML("beforeend", `<style>.viewer{position:fixed!important;inset:0!important;z-index:999;width:100vw!important;height:100vh!important;max-height:none!important;border-radius:0!important;background:#141a24}.viewer>:not(canvas){display:none!important}</style>`);
  }
  // ?view=front|side|top|three: góc nhìn chuẩn (chụp ảnh để bàn thiết kế); đặt góc thì tắt tự xoay
  const v = new URLSearchParams(location.search).get("view");
  if (v === "front" || v === "side" || v === "top" || v === "three" || v === "back") {
    stage.viewName = v;
    state.autoRotate = false;
    stage.autoRotate = false;
  }
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
  const sub = s.kind === "unit" ? `${s.code} · [${s.hotkey}]` : s.mvp ? s.label : `${s.label} · sau MVP`;
  const img = thumbs.get(`${id}:${state.faction}`);
  return `<button type="button" class="pick" data-id="${id}" aria-current="${id === state.id}">
    ${img ? `<img class="thumb" src="${img}" alt="" />` : `<span class="thumb"></span>`}
    <span><b>${esc(s.name)}</b><small>${esc(sub)}</small></span></button>`;
}

function showcasePick(id: ShowcaseId): string {
  const s = SHOWCASE[id];
  const img = thumbs.get(`${id}:${state.faction}`);
  return `<button type="button" class="pick" data-id="${id}" aria-current="${id === state.id}">
    ${img ? `<img class="thumb" src="${img}" alt="" />` : `<span class="thumb"></span>`}
    <span><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></span></button>`;
}

function showcaseSheet(id: ShowcaseId): string {
  const s = SHOWCASE[id];
  return `<header><h2>${esc(s.name)}</h2><p class="role">${esc(s.role)}</p><div class="tags"><span class="tag warn">Chỉ xem trước</span><span class="tag">${esc(s.sub)}</span></div></header>
    <section><h3>Đặc điểm</h3><ul class="features">${s.notes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>`;
}

/** Dựng mô hình theo mã, kể cả mô hình chỉ để xem trước. */
function buildAny(id: EntityId | ShowcaseId, faction: Faction): ReturnType<typeof buildModel> {
  return isShowcase(id) ? SHOWCASE[id].build(faction) : buildModel(id, faction);
}

function catOf(id: EntityId | ShowcaseId): string {
  if (isShowcase(id)) return "navy";
  return id in UNITS ? UNIT_CAT[id as UnitId] : BUILDING_CAT[id as BuildingId];
}

function itemsIn(tab: Tab, cat: string): (EntityId | ShowcaseId)[] {
  const all: (EntityId | ShowcaseId)[] = tab === "units" ? [...UNIT_IDS, ...SHOWCASE_IDS] : BUILDING_IDS;
  return all.filter((id) => catOf(id) === cat);
}

function plannedHtml(tab: Tab): string {
  const chips = tab === "units" ? PLANNED_UNITS.map((u) => `<span title="${esc(u.group)}">${esc(u.name)}</span>`) : PLANNED_BUILDINGS.map((n) => `<span>${esc(n)}</span>`);
  return `<div class="planned">${chips.join("")}</div>`;
}

function renderRoster(): void {
  const plannedCount = state.tab === "units" ? PLANNED_UNITS.length : PLANNED_BUILDINGS.length;
  const chips = CATS[state.tab].map((c) => {
    const n = c.id === "planned" ? plannedCount : itemsIn(state.tab, c.id).length;
    return `<button type="button" class="cat" data-cat="${c.id}" aria-pressed="${c.id === state.cat}">${esc(c.name)}<small>${n}</small></button>`;
  });
  const body =
    state.cat === "planned"
      ? plannedHtml(state.tab)
      : itemsIn(state.tab, state.cat)
          .map((id) => (isShowcase(id) ? showcasePick(id) : pickHtml(id)))
          .join("");
  roster.innerHTML = `<div class="cats" role="group" aria-label="Nhóm">${chips.join("")}</div><div class="picks">${body}</div>`;
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
  lastActions = actions;
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
    <span class="faction" role="group" aria-label="Góc nhìn">
      ${(["three", "front", "side", "top", "back"] as const).map((v) => `<button type="button" data-view="${v}" aria-pressed="${s.viewName === v}">${VIEW_LABEL[v]}</button>`).join("")}
    </span>
    <button type="button" class="chip" data-measure aria-pressed="${s.measure}" title="Đường đo rộng / dài / cao (mét) và người cao 1,8 m để so tỉ lệ">📏 Thước đo</button>
    <button type="button" class="chip" data-rotate aria-pressed="${state.autoRotate}">Tự xoay</button>`;
}

/** Dựng lại mô hình đang chọn. keepView: chỉ đổi phe thì giữ nguyên góc camera và hoạt ảnh đang bật. */
function loadModel(keepView: boolean): void {
  if (!stage) return;
  const rig = buildAny(state.id, state.faction);
  if (!keepView) stage.active = new Set(rig.defaultOn);
  // ?bake=1: xem mô hình đã "nướng" đúng như trên chiến trường (gộp khối đứng yên)
  if (new URLSearchParams(location.search).has("bake")) bakeStatic(rig);
  const old = stage.show(rig, keepView);
  // ?flight=1: thử chế độ bay do chiến trường điều khiển (setFlight)
  if (new URLSearchParams(location.search).has("flight")) rig.setFlight?.(true, 0.5);
  if (old) disposeRig(old);
  renderControls(rig.actions);
}

function select(id: EntityId | ShowcaseId, push = true): void {
  state.id = id;
  state.tab = id in UNITS || isShowcase(id) ? "units" : "buildings";
  state.cat = catOf(id);
  if (push) history.replaceState(null, "", `#${id}`);
  renderTabs();
  renderRoster();
  if (isShowcase(id)) sheet.innerHTML = showcaseSheet(id);
  else renderSheet(getSpec(id));
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
  const chip = (e.target as Element).closest<HTMLButtonElement>(".cat");
  if (chip?.dataset.cat) {
    const first = itemsIn(state.tab, chip.dataset.cat)[0];
    if (first) select(first); // chọn nhóm là thấy ngay mô hình đầu nhóm
    else {
      state.cat = chip.dataset.cat; // "Sắp có" chưa có mô hình: chỉ đổi danh sách
      renderRoster();
    }
    return;
  }
  const b = (e.target as Element).closest<HTMLButtonElement>(".pick");
  if (b?.dataset.id) select(b.dataset.id as EntityId | ShowcaseId);
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
  } else if (b.dataset.view) {
    state.autoRotate = false;
    stage.autoRotate = false;
    stage.view(b.dataset.view as ViewName);
    renderControls(lastActions);
  } else if (b.hasAttribute("data-measure")) {
    stage.measure = !stage.measure;
    b.setAttribute("aria-pressed", String(stage.measure));
  } else if (b.hasAttribute("data-rotate")) {
    state.autoRotate = !state.autoRotate;
    stage.autoRotate = state.autoRotate;
    b.setAttribute("aria-pressed", String(state.autoRotate));
  }
});

window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (id && id !== state.id && (id in UNITS || id in BUILDINGS || isShowcase(id))) select(id as EntityId | ShowcaseId, false);
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
select(first in UNITS || first in BUILDINGS || isShowcase(first) ? (first as EntityId | ShowcaseId) : "commander");

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
    for (const id of [...UNIT_IDS, ...BUILDING_IDS, ...SHOWCASE_IDS]) {
      const rig = buildAny(id, faction);
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
// ?nothumb=1: bỏ ảnh đại diện (chụp kiểm tra bằng Chrome không giao diện, vẽ bằng CPU rất chậm)
if (!new URLSearchParams(location.search).has("nothumb")) void makeThumbnails();
