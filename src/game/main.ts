/**
 * Điểm khởi động của game: menu → trận đấu → màn kết thúc.
 * Mỗi trận mới được mở bằng cách tải lại trang với ?play=…&seed=… — đơn giản và sạch
 * (không phải tự dọn hàng nghìn đối tượng 3D của trận trước).
 */
import * as THREE from "three";
import type Stats from "stats-gl";
import { BUILDINGS, FACTION_OF, RES_NAME, RULES, SIDE_NAME, UNITS, type EntityId, type Side, type UnitId } from "../sim/content";
import type { SideStats, SimEvent } from "../sim/types";
import { TICK_RATE } from "../sim/world";
import { buildModel, disposeRig } from "../render/models";
import { Thumbnailer } from "../models-page/stage";
import { Sfx } from "./audio";
import { Music } from "./music";
import { homeYaw, RtsCamera } from "./camera";
import { Controller } from "./controller";
import { Fx } from "./fx";
import { Hud } from "./hud";
import { attachGestures } from "./input";
import { Match, type Mode } from "./match";
import { loadPick, mountPicker, pickerHtml, type Pick } from "./map-picker";
import { Minimap } from "./minimap";
import { Overlay } from "./overlay";
import { DUEL_CENTER, Sandbox } from "./sandbox";
import { BattleScene } from "./scene";
import { Views } from "./views";

const app = document.getElementById("app")!;
const randomSeed = (): number => Math.floor(Math.random() * 1e9) + 1;
/**
 * Mở trận mới (hoặc về menu khi `mode` = null). Từ menu: bản đồ / phe theo lựa chọn ở menu. Trong trận (nút "Trận mới"):
 * giữ nguyên bản đồ và phe đang chơi trên link.
 */
const go = (mode: Mode | null, seed = randomSeed(), pick: Pick = loadPick()): void => {
  if (!mode) {
    location.search = "";
    return;
  }
  location.search = `?play=${mode}&seed=${seed}&map=${encodeURIComponent(pick.map)}${pick.side === 1 ? "&side=1" : ""}`;
};

const HELP = `
  <table>
    <tr><td>Mục tiêu</td><td>Thắng khi: <b>diệt Xe Tư Lệnh địch</b>, hoặc <b>phá hết công trình địch</b>, hoặc <b>giữ trọn một loại mỏ</b> (4/4 Sắt hoặc 5/5 Dầu) liên tục 30 giây.</td></tr>
    <tr><td>Kinh tế</td><td>Đưa quân đứng cạnh mỏ để chiếm. Xe Vận Tải tự đào và chở Sắt / Dầu về Tổng Hành Dinh. Sắt để xây và đúc quân, Dầu để nạp cho máy bay.</td></tr>
    <tr><td>Địa hình</td><td>Xe <b>bánh</b> (Tư Lệnh, Lynx, Vận Tải) nhanh trên <b>đường</b>, sa lầy trong <b>bùn</b>; xe <b>xích</b> (Titan, SkyGuard) đều hơn trên mọi loại đất. Lên dốc chậm. Xe tự chọn đường nhanh nhất. <b>Rừng</b> che tầm nhìn: đứng trong nhìn ra được, đứng ngoài không nhìn vào được; nấp trong rừng giảm 20% sát thương đạn thẳng (đạn Nổ thì không). Đứng trên cao nhìn xa, bắn xa hơn.</td></tr>
    <tr><td>Kỹ năng</td><td>Mỗi kỹ năng thuộc về một binh chủng có thật, phải đúc ra. <b>Rải thảm</b> [T] (Xe Tên Lửa Loạt, đúc ở Xưởng Xe Chuyên Dụng): chọn một vùng, xe tự chạy tới tầm, dựng dàn rồi xả 24 quả tên lửa, sau đó nạp lại 15 giây; bắn được cả vào sương mù. <b>Tổng động viên</b> [R] (Xe Tư Lệnh): quân quanh xe chạy nhanh, bắn nhanh 10 giây. <b>Đài Liên Lạc</b> (📡, chiếm như mỏ): nhìn xa quanh đài. Quân lập công lên <b>cựu binh</b> (vạch vàng). Xe bị hạ để lại <b>xác</b> chứa Sắt: <b>Xe Vận Tải</b> kéo về Tổng Hành Dinh mới thành Sắt (xác trong vùng căn cứ và quanh mỏ thì hậu cần tự kéo; xác ở xa thì chọn xe rồi chạm vào xác).</td></tr>
    <tr><td>Không quân</td><td>Falcon đúc ở Nhà Máy Máy Bay (cần Sân Đáp còn bãi trống để đậu), rất mạnh nhưng chỉ bay ~33 giây. Hết dầu tự về Sân Đáp nạp (trừ vào kho Dầu). Kho Dầu cạn thì máy bay nằm sân.</td></tr>
    <tr><td>Chạm</td><td>Chạm quân để chọn · chạm đất / địch / mỏ để ra lệnh · <b>giữ rồi kéo</b> để chọn nhiều · chạm đúp để chọn cả loại · một ngón kéo để cuộn · hai ngón để thu phóng và xoay.</td></tr>
    <tr><td>Chuột</td><td>Trái: chọn (kéo để quét) · Phải: ra lệnh (kéo để xoay camera) · Giữa kéo / mũi tên / sát mép: cuộn · Lăn: thu phóng · Q/E: xoay.</td></tr>
    <tr><td>Phím</td><td>A tấn công-di chuyển · S dừng · B máy bay về sân · H Tổng Hành Dinh · F1 Xe Tư Lệnh · Ctrl+1..5 lưu nhóm, 1..5 gọi nhóm · Z X C G N V đúc nhanh · T rải thảm · R tổng động viên · Space tới chỗ vừa báo động · P tạm dừng.</td></tr>
  </table>`;

function showMenu(): void {
  app.innerHTML = `
    <div class="screen">
      <div class="card">
        <h1>IRON SKY</h1>
        <p>Tư Lệnh Chiến Thuật &amp; Hậu Cần · bản v1 (MVP). Hai đạo quân tranh mỏ Sắt và giàn Dầu, chỉ huy cả sư đoàn trong trận không quá 20 phút.</p>
        ${pickerHtml()}
        <button class="menu-btn primary" data-go="vsai">Chơi với AI<small data-vs>Bạn là Liên Minh Lam, đối đầu Tập Đoàn Đỏ</small></button>
        <button class="menu-btn" data-go="aivai">Xem AI đấu AI<small>Hai AI đánh nhau, có nút tăng tốc ×1 ×2 ×4</small></button>
        <button class="menu-btn" data-go="sandbox">Phòng Thử Nghiệm<small>Thả quân và công trình tùy ý để thử từng binh chủng</small></button>
        <button class="menu-btn" data-help>Cách chơi<small>Luật thắng, kinh tế, điều khiển chạm và chuột</small></button>
        <a class="menu-btn" href="./models.html">Xưởng Mô Hình<small>Xem mô hình 3D và chỉ số từng binh chủng</small></a>
        <div data-helpbox hidden>${HELP}</div>
      </div>
    </div>`;
  const pick = mountPicker(app);
  // dòng mô tả nút "Chơi với AI" theo phe đang chọn
  const vs = app.querySelector<HTMLElement>("[data-vs]")!;
  const syncVs = (): void => {
    vs.textContent = pick().side === 1 ? "Bạn là Tập Đoàn Đỏ, đối đầu Liên Minh Lam" : "Bạn là Liên Minh Lam, đối đầu Tập Đoàn Đỏ";
  };
  app.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", syncVs));
  syncVs();
  app.querySelectorAll<HTMLElement>("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go as Mode, randomSeed(), pick())));
  app.querySelector("[data-help]")!.addEventListener("click", () => {
    const box = app.querySelector<HTMLElement>("[data-helpbox]")!;
    box.hidden = !box.hidden;
  });
}

/** Ảnh nút của HUD trận thường: mọi quân MVP đúc được + công trình MVP xây được (suy từ content.ts, thêm quân không phải sửa ở đây). */
const HUD_THUMBS: readonly EntityId[] = [
  ...Object.values(UNITS).filter((s) => s.mvp && s.builtAt && s.cost).map((s) => s.id),
  ...Object.values(BUILDINGS).filter((s) => s.mvp && s.cost && s.id !== "hq").map((s) => s.id)
];

/** Ảnh nút bấm, vẽ theo màu phe người chơi (chơi phe Đỏ thì nút cũng màu Đỏ). */
function makeThumbs(ids: readonly EntityId[], side: Side): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const shooter = new Thumbnailer();
    for (const id of ids) {
      const rig = buildModel(id, FACTION_OF[side]);
      out.set(id, shooter.shoot(rig));
      disposeRig(rig);
    }
    shooter.dispose();
  } catch {
    // không có WebGL thứ hai: nút sẽ không có ảnh, vẫn chơi được
  }
  return out;
}

/** Huy chương sau trận: thành tích đáng nhớ (cho người chơi lý do chơi lại theo cách khác). */
const MEDALS: { icon: string; name: string; why: string; got: (s: SideStats, won: boolean, secs: number) => boolean }[] = [
  { icon: "🎖️", name: "Lão tướng", why: "Có quân lên cựu binh cấp 3", got: (s) => s.topRank >= 3 },
  { icon: "🚀", name: "Mưa thép", why: "Xe Tên Lửa Loạt xả từ 5 loạt", got: (s) => s.salvos >= 5 },
  { icon: "🔧", name: "Thợ trục vớt", why: "Kéo về từ 300 Sắt trong xác quân", got: (s) => s.salvaged >= 300 },
  { icon: "📡", name: "Người giữ cầu", why: "Giữ Đài Liên Lạc tổng cộng từ 3 phút", got: (s) => s.uplinkTime >= 180 },
  { icon: "⚡", name: "Thần tốc", why: "Thắng trong vòng 8 phút", got: (_s, won, secs) => won && secs < 480 },
  { icon: "🛡️", name: "Thép", why: "Thắng mà chỉ mất tối đa 3 quân", got: (s, won) => won && s.unitsLost <= 3 }
];
function medalsHtml(s: SideStats, won: boolean, secs: number): string {
  const got = MEDALS.filter((m) => m.got(s, won, secs));
  if (!got.length) return "";
  return `<div class="medals">${got.map((m) => `<span class="medal" title="${m.why}">${m.icon} ${m.name}</span>`).join("")}</div>`;
}

const REASON: Record<string, string> = {
  commander: "Xe Tư Lệnh bị tiêu diệt",
  buildings: "Toàn bộ công trình bị phá hủy",
  monopoly: "Độc quyền tài nguyên 30 giây",
  timeout: "Hết giờ"
};

const ALERT_TEXT: Record<string, (n: number) => string> = {
  commander: () => "Xe Tư Lệnh đang bị tấn công!",
  base: () => "Căn cứ đang bị tấn công!",
  hauler: () => "Xe Vận Tải bị tấn công",
  lowfuel: () => "Máy bay sắp hết dầu, đang quay về Sân Đáp",
  nooil: () => "Kho Dầu cạn: máy bay không nạp được!",
  mineLost: () => "Ta vừa mất một mỏ!",
  uplinkLost: () => "Mất Đài Liên Lạc! Mất tầm nhìn quanh đài",
  powerShort: (n) => `Hậu cần: thiếu ${n} MW — đã cắt điện nhà xưởng / Sân Đáp trước, giữ điện cho phòng thủ`,
  powerForecast: (n) => `Hậu cần: xây xong sẽ thiếu ${n} MW — cần thêm Nhà Máy Điện`,
  oilLow: (n) => `Hậu cần: Dầu cho Nhà Máy Điện chỉ còn khoảng ${n} giây!`,
  batteryLow: (n) => `Hậu cần: pin dự trữ chỉ còn khoảng ${n} giây!`
};

function startGame(mode: Mode, seed: number, skip = 0, mapId?: string, side: Side = 0): void {
  app.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.className = "view";
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.className = "overlay";
  app.append(canvas, overlayCanvas);
  if (new URLSearchParams(location.search).has("nooverlay")) overlayCanvas.style.display = "none";

  const match = new Match(mode, seed, mapId, side);
  const map = match.world.map;
  let scene: BattleScene;
  try {
    const sceneT0 = performance.now();
    scene = new BattleScene(canvas, map);
    if (new URLSearchParams(location.search).has("perf")) console.log(`[perf] dựng cảnh ${map.id}: ${Math.round(performance.now() - sceneT0)} ms`);
  } catch {
    app.innerHTML = `<div class="screen"><div class="card"><h2>Không bật được WebGL</h2><p>Trình duyệt này không hỗ trợ đồ họa 3D (WebGL), nên chưa chơi được Iron Sky. Hãy thử Chrome, Edge hoặc Safari bản mới.</p></div></div>`;
    return;
  }
  if (new URLSearchParams(location.search).has("noshadow")) scene.renderer.shadowMap.enabled = false;
  // ?skip=N: chạy nhanh N giây đầu trận (để thử nghiệm / chụp ảnh giữa trận)
  // (Phòng Thử Nghiệm tua sau khi đã thả quân, xem sandbox.ts)
  if (mode !== "sandbox") for (let i = 0; i < skip * 10 && match.world.winner === -1; i++) match.advance(0.1);
  match.drainEvents();
  const world = match.world;
  const sandboxMode = mode === "sandbox";
  /** Phe người chơi đang điều khiển (Phòng Thử Nghiệm cho đổi phe nên đọc lại mỗi khung hình). */
  let me = match.player;
  /** Phe mà sương mù / phần vẽ nhìn theo: null = thấy toàn bản đồ. */
  let viewer = me;
  const cam = new RtsCamera(map);
  // Bản đồ hiện đúng hướng (cạnh dưới nằm ngang); phe Đỏ xoay 180° để nhà mình cũng ở góc dưới trái.
  // Phòng Thử Nghiệm luôn nhìn như phe Lam (đổi phe giữa chừng không xoay camera).
  const homeSide = sandboxMode ? 0 : me;
  cam.yaw = cam.home = homeYaw(homeSide);
  if (sandboxMode) {
    cam.focus(DUEL_CENTER[0], DUEL_CENTER[1]);
    cam.dist = 70;
  } else if (me !== null) {
    const [hx, hz] = map.bases[me];
    const l = Math.hypot(hx, hz);
    cam.focus(hx - (hx / l) * 7, hz - (hz / l) * 7);
    cam.dist = 66;
  } else {
    cam.focus(0, 0);
    cam.dist = Math.max(map.w, map.h) * 0.8;
    cam.pitch = 1.05;
  }
  // ?cam=x,z,dist: đặt camera (để thử nghiệm / chụp ảnh)
  const camParam = new URLSearchParams(location.search).get("cam");
  if (camParam) {
    const [cx, cz, cd] = camParam.split(",").map(Number);
    cam.focus(cx, cz);
    if (cd) cam.dist = cd;
  }
  const views = new Views(scene.scene, map);
  const fx = new Fx(scene.scene, map);
  const sfx = new Sfx();
  // nhạc thích ứng: độ căng thẳng tăng theo giao tranh mình thấy, tự giảm dần khi yên (nửa đời ~5 giây)
  const music = new Music(sfx);
  // ?audio=1: mở âm thanh ngay (để tự kiểm tra bằng Chrome không giao diện, cần thêm cờ cho phép tự phát)
  if (new URLSearchParams(location.search).has("audio")) {
    sfx.unlock();
    window.setInterval(() => console.log(`[music] ${music.debug()}`), 1500);
  }
  let tension = 0;
  const tense = (k: number): void => {
    tension = Math.min(1, tension + k);
  };
  const thumbs = makeThumbs(sandboxMode ? ([...Object.keys(UNITS), ...Object.keys(BUILDINGS)] as EntityId[]) : HUD_THUMBS, me ?? 0);
  const overlay = new Overlay(overlayCanvas);

  let screenEl: HTMLElement | null = null;
  const closeScreen = (): void => {
    screenEl?.remove();
    screenEl = null;
  };
  const openPause = (): void => {
    if (screenEl) return;
    match.paused = true;
    screenEl = document.createElement("div");
    screenEl.className = "screen";
    screenEl.innerHTML = `<div class="card">
      <h2>Tạm dừng</h2>
      <button class="menu-btn primary" data-a="resume">Tiếp tục</button>
      <button class="menu-btn" data-a="restart">Chơi lại trận mới</button>
      <button class="menu-btn" data-a="help">Cách chơi</button>
      <button class="menu-btn" data-a="quit">Về menu chính</button>
      <div data-helpbox hidden>${HELP}</div></div>`;
    screenEl.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (a === "resume") {
        match.paused = false;
        closeScreen();
      } else if (a === "restart") go(mode);
      else if (a === "quit") go(null);
      else if (a === "help") {
        const box = screenEl!.querySelector<HTMLElement>("[data-helpbox]")!;
        box.hidden = !box.hidden;
      }
    });
    app.appendChild(screenEl);
  };

  const ctrl = new Controller(match, cam, scene.scene, views, fx, sfx, canvas, openPause);
  const hud = new Hud(app, match, thumbs, (a, arg) => ctrl.act(a, arg));
  ctrl.hud = hud;
  // ?radial=1: mở sẵn bảng nan quạt giữa màn hình để tự kiểm phần hình
  if (new URLSearchParams(location.search).get("radial")) hud.showRadial(innerWidth / 2, innerHeight / 2 - 40, "attack", () => {}, 0);
  // ?place=<mã công trình>,dx,dz: mở sẵn chế độ đặt nhà cách căn cứ (dx, dz) mét, để tự kiểm lưới ô và bóng mờ
  const placeArg = new URLSearchParams(location.search).get("place")?.split(",");
  if (placeArg) {
    ctrl.startPlace(placeArg[0] as Parameters<typeof ctrl.startPlace>[0]);
    const [bx, bz] = map.bases[me ?? 0];
    ctrl.placePos = { x: bx + Number(placeArg[1] ?? 14), z: bz + Number(placeArg[2] ?? 0) };
  }
  attachGestures(canvas, ctrl);
  const minimap = new Minimap(
    hud.minimapCanvas,
    map,
    homeYaw(homeSide),
    (x, z) => cam.focus(x, z),
    (x, z) => {
      const ids = ctrl.ownUnits().map((u) => u.id);
      if (ids.length) {
        match.issue({ t: "move", ids, x, z });
        fx.marker(x, z, 0x6fdc8c);
        sfx.ui("ack");
      }
    }
  );

  const resize = (): void => {
    const w = app.clientWidth;
    const h = app.clientHeight;
    scene.resize(w, h);
    cam.setAspect(w, h);
    overlay.resize(w, h);
  };
  window.addEventListener("resize", resize);
  resize();

  const sandbox = sandboxMode ? new Sandbox(app, match, ctrl, cam, fx, hud, canvas, thumbs) : null;

  window.setTimeout(() => {
    if (sandbox) hud.alert("Phòng Thử Nghiệm: chọn quân ở bảng bên trái rồi chạm lên bản đồ để thả");
    else if (me === null) hud.alert("Chế độ xem: hai AI tự đánh nhau. Bấm ×1 để tăng tốc.");
    else {
      hud.alert("Mục tiêu: diệt Xe Tư Lệnh địch, phá hết công trình, hoặc giữ trọn một loại mỏ 30 giây");
      window.setTimeout(() => hud.alert("Mẹo: chọn Lynx rồi chạm vào mỏ trung lập để chiếm"), 2200);
    }
  }, 500);

  const vol = (x: number, z: number): number => {
    const d = Math.hypot(x - cam.tx, z - cam.tz);
    return Math.max(0, Math.min(1, 1 - d / (cam.dist * 1.2 + 25))) * (cam.dist > 110 ? 0.5 : 1);
  };
  const visible = (x: number, z: number): boolean => viewer === null || world.cellVisible(viewer, x, z);
  let lastReady = 0;
  let ended = false;

  let endScheduled = false;
  /** Hẹn hiện màn kết thúc (một lần): nhạc nhỏ dần, 1,2 giây sau hiện bảng kết quả. */
  const scheduleEnd = (): void => {
    if (endScheduled) return;
    endScheduled = true;
    music.stop();
    window.setTimeout(showEnd, 1200);
  };
  const showEnd = (): void => {
    if (ended) return;
    ended = true;
    closeScreen();
    const w = world.winner;
    const won = me !== null && w === me;
    const draw = w === 2;
    const title = me === null ? (draw ? "HÒA" : `${SIDE_NAME[w as Side].toUpperCase()} THẮNG`) : draw ? "HÒA" : won ? "CHIẾN THẮNG" : "THẤT BẠI";
    sfx.ui(draw || me === null ? "win" : won ? "win" : "lose");
    const s = world.sides;
    const secs = Math.floor(world.tick / TICK_RATE);
    // người xem AI đấu AI: số liệu của phe thắng (hòa thì phe Lam)
    const p: Side = me ?? (w === 0 || w === 1 ? w : 0);
    screenEl = document.createElement("div");
    screenEl.className = "screen";
    screenEl.innerHTML = `<div class="card">
      <h2 class="${draw ? "" : won || me === null ? "win" : "lose"}">${title}</h2>
      <p>${REASON[world.winReason ?? ""] ?? ""}${draw ? "" : me === null ? "" : won ? " — của đối phương." : " — phía ta."}</p>
      <div class="stats">
        <div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}</b><span>Thời gian</span></div>
        <div><b>${s[p].stats.unitsBuilt}</b><span>Quân đã đúc</span></div>
        <div><b>${s[p].stats.kills}</b><span>Hạ được</span></div>
        <div><b>${s[p].stats.unitsLost}</b><span>Quân mất</span></div>
        <div><b>${Math.round(s[p].stats.ironMined)}</b><span>Sắt đã đào</span></div>
        <div><b>${Math.round(s[p].stats.oilMined)}</b><span>Dầu đã đào</span></div>
        <div><b>${Math.round(s[p].stats.salvaged)}</b><span>Sắt trục vớt</span></div>
        <div><b>${s[p].stats.promotions}</b><span>Lần lên cựu binh</span></div>
        <div><b>${s[p].stats.salvos}</b><span>Loạt tên lửa</span></div>
        <div><b>${Math.floor(s[p].stats.uplinkTime / 60)}:${String(Math.floor(s[p].stats.uplinkTime % 60)).padStart(2, "0")}</b><span>Giữ Đài Liên Lạc</span></div>
      </div>
      ${medalsHtml(s[p].stats, me !== null && won, secs)}
      <button class="menu-btn primary" data-a="again">${me === null ? "Xem trận khác" : "Chơi lại"}</button>
      <button class="menu-btn" data-a="watch">${me === null ? "Tự chơi với AI" : "Xem AI đấu AI"}</button>
      <button class="menu-btn" data-a="close">Xem lại chiến trường</button>
      <button class="menu-btn" data-a="quit">Về menu chính</button></div>`;
    screenEl.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (a === "again") go(mode);
      else if (a === "watch") go(mode === "vsai" ? "aivai" : "vsai");
      else if (a === "quit") go(null);
      else if (a === "close") closeScreen();
    });
    app.appendChild(screenEl);
  };

  const noFx = new URLSearchParams(location.search).has("nofx");
  const onEvents = (evs: SimEvent[]): void => {
    if (!noFx) fx.handle(evs, world, visible, (id, out) => views.muzzle(id, out));
    const now = performance.now();
    for (const e of evs) {
      switch (e.t) {
        case "shot":
          if (visible(e.x, e.z)) {
            sfx.shot(e.visual, vol(e.x, e.z));
            tense(0.012);
          }
          break;
        case "hit":
          if (e.splash > 0 && visible(e.x, e.z)) {
            sfx.boom(e.splash * 0.4, vol(e.x, e.z) * 0.6);
            tense(0.02);
          }
          break;
        case "death":
          if (!e.sold && visible(e.x, e.z)) tense(e.building ? 0.15 : 0.07);
          if (!e.sold && visible(e.x, e.z)) sfx.boom(e.building ? 3 : 1.5, vol(e.x, e.z));
          if (me !== null && e.side === me && e.kind === "falcon" && e.crash) hud.alert("Một Falcon hết dầu và rơi vì không còn Sân Đáp!", "bad");
          break;
        case "alert":
          if (e.side === me && (e.what === "commander" || e.what === "base")) tense(0.35);
          if (e.side === me) {
            hud.alert(ALERT_TEXT[e.what]?.(e.n ?? 0) ?? "", "bad");
            ctrl.lastAlert = { x: e.x, z: e.z };
            if (e.what === "commander" || e.what === "base" || e.what === "nooil" || e.what === "powerShort" || e.what === "oilLow" || e.what === "batteryLow" || e.what === "uplinkLost") sfx.ui("alert");
          }
          break;
        case "captured": {
          const name = e.res === "iron" ? "Mỏ Sắt" : "Giàn Dầu";
          if (me === null) {
            if (e.side !== -1) hud.alert(`${SIDE_NAME[e.side]} chiếm ${name}`);
          } else if (e.side === me) {
            hud.alert(`Đã chiếm ${name}`, "good");
            sfx.ui("ready");
          }
          break;
        }
        case "uplink":
          if (me === null) {
            if (e.side !== -1) hud.alert(`${SIDE_NAME[e.side]} chiếm Đài Liên Lạc`);
          } else if (e.side === me) {
            hud.alert("Đã chiếm Đài Liên Lạc: nhìn xa quanh đài", "good");
            sfx.ui("ready");
          } else if (e.side !== -1) hud.alert("Địch chiếm một Đài Liên Lạc", "bad");
          break;
        case "salvo":
          // loạt tên lửa vừa rời dàn: bên bị bắn nghe tiếng rít nếu thấy chỗ đạn sắp rơi (không thấy trước vùng đỏ như bên bắn)
          if (e.side === me || visible(e.tx, e.tz)) tense(0.3);
          if (e.side !== me && visible(e.tx, e.tz)) {
            sfx.ui("incoming");
            if (me !== null) {
              hud.alert("Tên lửa loạt địch đang bay tới!", "bad");
              ctrl.lastAlert = { x: e.tx, z: e.tz };
            }
          }
          break;
        case "mobilize":
          if (e.side === me) {
            hud.alert("Tổng động viên! Quân quanh Xe Tư Lệnh tăng tốc", "good");
            sfx.ui("horn");
          } else if (visible(e.x, e.z)) sfx.ui("horn");
          break;
        case "salvage":
          if (visible(e.x, e.z)) overlay.float(e.x, map.groundY(e.x, e.z) + 2, e.z, `+${e.value} Sắt`, e.side === 0 ? "#8fd0ff" : "#ff9a8f");
          if (e.side === me) sfx.ui("salvage");
          break;
        case "rank":
          if (e.side === me) {
            hud.alert(`${UNITS[e.kind].short} lên cựu binh cấp ${e.rank}${e.rank >= RULES.veterancy.regenRank ? ": tự hồi máu" : ""}`, "good");
            sfx.ui("rank");
          }
          break;
        case "built":
          if (e.side === me) {
            hud.alert(`${BUILDINGS[e.kind].name} đã xây xong`, "good");
            sfx.ui("build");
          }
          break;
        case "spawn":
          if (!sandbox && e.side === me && now - lastReady > 600 && world.tick > 1) {
            lastReady = now;
            sfx.ui("ready");
            if (UNITS[e.kind as UnitId].domain === "air") hud.alert(`${UNITS[e.kind as UnitId].short} xuất xưởng, đang bay về Sân Đáp`, "good");
          }
          break;
        case "monopoly":
          if (me === null) hud.alert(`${SIDE_NAME[e.side]} độc quyền ${RES_NAME[e.res]}!`);
          else if (e.side === me) hud.alert(`Ta độc quyền ${RES_NAME[e.res]}: giữ 30 giây để thắng!`, "good");
          else {
            hud.alert(`Địch độc quyền ${RES_NAME[e.res]}! Chiếm lại một mỏ trong 30 giây!`, "bad");
            sfx.ui("alert");
          }
          break;
        case "end":
          scheduleEnd();
          break;
        default:
          break;
      }
    }
  };

  const targetPos = (id: number): THREE.Vector3 | null => {
    const e = world.byId.get(id);
    if (!e || e.cat === "mine") return null;
    if (e.cat === "unit") {
      const [x, y, z] = Views.displayPos(map, e, ctrl.alpha);
      return new THREE.Vector3(x, y + 1, z);
    }
    return new THREE.Vector3(e.x, map.groundY(e.x, e.z) + 1.5, e.z);
  };

  // ?script=1: kịch bản tự chơi thử, gọi đúng các hàm mà nút bấm / cú chạm gọi (để kiểm tra không cần tay)
  if (new URLSearchParams(location.search).has("script") && match.player !== null) {
    const me = match.player;
    const lynx = world.units.find((u) => u.side === me && u.kind === "lynx")!;
    // mỏ Sắt trung lập gần nhà nhất (đúng với mọi bản đồ)
    const [bx, bz] = map.bases[me];
    const dHome = (m: { x: number; z: number }): number => Math.hypot(m.x - bx, m.z - bz);
    const fwd = world.mines.filter((m) => m.res === "iron" && m.owner === -1).sort((a, b) => dHome(a) - dHome(b))[0];
    ctrl.select([lynx.id]);
    match.issue({ t: "harvest", ids: [lynx.id], mine: fwd.id });
    ctrl.act("build", "factory");
    const [hx, hz] = map.bases[me];
    ctrl.placePos = { x: hx + 8, z: hz - 12 };
    ctrl.update(0);
    console.log(`[script] đặt Xưởng Xe: ${ctrl.placeReason ?? "hợp lệ"}`);
    ctrl.act("placeOk");
    for (let i = 0; i < 160; i++) match.advance(0.1);
    const fac = world.buildings.find((b) => b.side === me && b.kind === "factory");
    console.log(`[script] xưởng: ${fac ? (fac.built ? "đã xây xong" : "đang xây") : "KHÔNG CÓ"}`);
    if (fac) {
      ctrl.select([fac.id]);
      ctrl.act("produce", "titan");
      ctrl.act("produce", "lynx");
    }
    for (let i = 0; i < 340; i++) match.advance(0.1);
    match.drainEvents();
    console.log(`[script] mỏ tiền tuyến thuộc phe: ${fwd.owner}; quân: ${world.units.filter((u) => u.side === me).map((u) => u.kind).join(",")}; sắt ${Math.round(world.sides[me].iron)}`);
    cam.focus(hx + 10, hz - 14);
  }
  // ?perf=1: bảng đo hiệu năng (FPS, số lệnh vẽ, số tam giác) — để biết máy có bị lag không
  const perfEl = new URLSearchParams(location.search).has("perf") ? document.createElement("div") : null;
  // Kèm biểu đồ stats-gl: FPS, CPU (ms để ra lệnh vẽ), GPU (ms card đồ họa vẽ thật) và SIM (ms lõi mô phỏng mỗi khung hình).
  // Nhờ vậy biết chỗ nghẽn nằm ở đâu: GPU cao = cảnh nặng (tam giác, bóng đổ); CPU cao = nhiều lệnh vẽ; SIM cao = luật chơi.
  let stats: Stats | null = null;
  let simPanel: InstanceType<typeof Stats.Panel> | null = null;
  let simMs = 0;
  let simMax = 0;
  let simFrames = 0;
  let simT = performance.now();
  if (perfEl) {
    perfEl.style.cssText = "position:absolute;left:8px;top:48px;background:rgba(0,0,0,.7);color:#9f9;font:12px monospace;padding:4px 8px;border-radius:6px;pointer-events:none;white-space:pre";
    app.appendChild(perfEl);
    // Tải động: người chơi bình thường không phải tải thêm gói này.
    void import("stats-gl").then(({ default: StatsGL }) => {
      const s = new StatsGL({ trackGPU: true, horizontal: true, logsPerSecond: 4 });
      simPanel = s.addPanel(new StatsGL.Panel("SIM", "#fc6", "#321"));
      s.dom.style.cssText += ";position:absolute;left:8px;top:74px;right:auto;bottom:auto;z-index:5;pointer-events:none";
      app.appendChild(s.dom);
      void s.init(scene.renderer);
      stats = s;
    });
  }
  let perfFrames = 0;
  let fpsFrames = 0;
  let fpsT = performance.now();
  /** Số lần đo FPS liên tiếp bị chậm (dưới 40). */
  let slowWindows = 0;
  const lockQuality = new URLSearchParams(location.search).has("hq");
  let perfT = performance.now();
  let debugFrames = new URLSearchParams(location.search).has("debug") ? 8 : 0;
  let last = performance.now();
  let time = 0;
  let lastFogTick = -1;
  let lastViewer: Side | null | undefined = undefined;
  let lastMini = 0;
  const selectedSet = new Set<number>();
  const frame = (): void => {
    const now = performance.now();
    // mốc thời gian của khung hình đầu có thể sớm hơn `last` → dt âm sẽ làm nổ các phép nội suy exp()
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    time += dt;
    tension *= Math.exp(-dt / 7);
    music.update(dt, tension);
    // hết trận mà sự kiện "end" đã lỡ (ví dụ rơi vào lúc tua ?skip): vẫn hiện màn kết thúc theo trạng thái
    if (world.winner !== -1) scheduleEnd();
    me = match.player;
    viewer = sandbox ? sandbox.viewer() : me;
    const simStart = stats ? performance.now() : 0;
    ctrl.alpha = match.advance(dt);
    if (stats && simPanel) {
      const ms = performance.now() - simStart;
      simMs += ms;
      simMax = Math.max(simMax, ms);
      simFrames++;
      if (now - simT > 250) {
        simPanel.update(simMs / simFrames, Math.max(10, simMax), 2, " ms");
        simPanel.updateGraph(simMs / simFrames, Math.max(10, simMax));
        simMs = simMax = simFrames = 0;
        simT = now;
      }
    }
    if (debugFrames > 0) {
      debugFrames--;
      console.log(`[frame] now=${now.toFixed(1)} dt=${dt.toFixed(4)} tick=${world.tick} paused=${match.paused} speed=${match.speed}`);
    }
    onEvents(match.drainEvents());
    ctrl.update(dt);
    cam.apply();
    scene.followSun(cam.tx, cam.tz);
    if (world.tick !== lastFogTick || viewer !== lastViewer) {
      scene.updateFog(world, viewer);
      lastFogTick = world.tick;
      lastViewer = viewer;
    }
    selectedSet.clear();
    for (const id of ctrl.selected) selectedSet.add(id);
    views.sync(world, viewer, ctrl.alpha, dt, time, selectedSet);
    // khói bốc lên từ xác xe
    if (!noFx) for (const p of views.wreckPositions()) if (Math.random() < dt * 1.4) fx.wreckSmoke(p);
    fx.update(dt, world, targetPos);
    hud.update(ctrl.panelCtx(), ctrl.mode, ctrl.placeKind, ctrl.hint());
    const anchor = ctrl.confirmAnchor();
    hud.confirm.hidden = !anchor;
    if (anchor) {
      hud.confirm.style.left = `${anchor.x}px`;
      hud.confirm.style.top = `${anchor.y}px`;
      hud.confirm.querySelector<HTMLButtonElement>(".ok")!.disabled = ctrl.placeReason !== null;
    }
    const w = app.clientWidth;
    const h = app.clientHeight;
    overlay.draw(world, viewer, cam, ctrl.alpha, selectedSet, ctrl.box, w, h);
    if (now - lastMini > 150) {
      lastMini = now;
      const corners: [number, number][] = [];
      for (const [sx, sy] of [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h]
      ]) {
        const g = cam.ground(sx, sy, w, h) ?? cam.ground(sx, Math.max(sy, h * 0.35), w, h);
        if (g) corners.push([g.x, g.z]);
      }
      minimap.draw(world, viewer, corners);
    }
    sandbox?.update(now);
    scene.render(cam.cam, cam.strategic);
    stats?.update();
    // Tự hạ chất lượng nếu máy chậm (đo mỗi 2 giây, chỉ khi tab đang hiện). ?hq=1 để giữ nguyên.
    // Chỉ hạ khi chậm HAI lần đo liên tiếp: một cú giật ngắn (một loạt tên lửa, nổ lớn) không được làm xấu hình cả trận.
    fpsFrames++;
    if (now - fpsT > 2000) {
      const fps = (fpsFrames * 1000) / (now - fpsT);
      fpsFrames = 0;
      fpsT = now;
      const slow = !lockQuality && document.visibilityState === "visible" && time > 4 && fps < 40;
      slowWindows = slow ? slowWindows + 1 : 0;
      if (slowWindows >= 2) {
        slowWindows = 0;
        const what = scene.lowerQuality();
        if (what) {
          hud.alert(`Máy đang chậm (${Math.round(fps)} FPS): tự ${what} để chơi mượt hơn`);
          resize();
        }
      }
    }
    if (perfEl) {
      perfFrames++;
      if (now - perfT > 1000) {
        const r = scene.renderer.info.render;
        let meshes = 0;
        scene.scene.traverseVisible((o) => {
          if ((o as THREE.Mesh).isMesh) meshes++;
        });
        perfEl.textContent = `FPS ${Math.round((perfFrames * 1000) / (now - perfT))} · chất lượng ${scene.quality} · draw ${r.calls} · tam giác ${(r.triangles / 1000).toFixed(0)}k · mesh ${meshes} · quân ${world.units.length}`;
        console.log(`[perf] ${perfEl.textContent}`);
        perfFrames = 0;
        perfT = now;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const params = new URLSearchParams(location.search);
const play = params.get("play");
if (play === "vsai" || play === "aivai" || play === "sandbox") startGame(play, Number(params.get("seed")) || randomSeed(), Number(params.get("skip")) || 0, params.get("map") ?? undefined, params.get("side") === "1" ? 1 : 0);
else showMenu();
