/**
 * Chọn bản đồ và phe ở menu (bước B6, Docs/design/MAPS_PLAN.md). Danh sách lấy thẳng từ `MAP_DEFS`: thêm bản đồ vào đó là
 * tự có thẻ ở menu. Lựa chọn nhớ trong localStorage (chỉ là tiện ích cho người xem; mất thì về mặc định), `?map=` / `&side=`
 * trên link thắng lựa chọn đã nhớ.
 */
import type { Side } from "../sim/content";
import { DEFAULT_MAP_ID, DEV_MAP_DEFS, getMap, MAP_DEFS, type GameMap } from "../sim/maps";
import { paintTerrain, RES_COLOR, SIDE_COLOR } from "./minimap";

const KEY = "ironsky.pick";

export interface Pick {
  map: string;
  side: Side;
}

/**
 * Lựa chọn hiện tại: link trước, rồi lựa chọn đã nhớ, rồi mặc định. Bản đồ không còn trong danh sách thì về mặc định;
 * bản đồ kiểm thử (`DEV_MAP_DEFS`) chỉ nhận từ link, để "Trận mới" trong `?map=proving-ground` vẫn ở bản đồ đó.
 */
export function loadPick(): Pick {
  let saved: Partial<Pick> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Pick>;
  } catch {
    /* trình duyệt chặn bộ nhớ: dùng mặc định */
  }
  const q = new URLSearchParams(location.search);
  const fromUrl = q.get("map");
  if (fromUrl && DEV_MAP_DEFS.some((d) => d.id === fromUrl)) return { map: fromUrl, side: q.get("side") === "1" ? 1 : 0 };
  const map = fromUrl ?? saved.map ?? DEFAULT_MAP_ID;
  const side = q.has("side") ? (q.get("side") === "1" ? 1 : 0) : saved.side === 1 ? 1 : 0;
  return { map: MAP_DEFS.some((d) => d.id === map) ? map : DEFAULT_MAP_ID, side };
}

export function savePick(p: Pick): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* không lưu được thì thôi */
  }
}

/** Ảnh bản đồ nhìn từ trên: địa hình, mỏ Sắt / giàn Dầu, hai căn cứ. Cạnh dài = `size` điểm ảnh (nhân mật độ màn hình). */
function thumb(map: GameMap, size: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = (size * dpr) / Math.max(map.w, map.h);
  const c = document.createElement("canvas");
  c.width = Math.round(map.w * s);
  c.height = Math.round(map.h * s);
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.drawImage(paintTerrain(map), 0, 0, c.width, c.height);
  const px = (x: number): number => (x + map.halfW) * s;
  const pz = (z: number): number => (z + map.halfH) * s;
  for (const m of map.mines) {
    g.fillStyle = RES_COLOR[m.res];
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = dpr;
    g.beginPath();
    g.arc(px(m.x), pz(m.z), 3 * dpr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  map.bases.forEach(([x, z], i) => {
    const r = 5 * dpr;
    g.fillStyle = SIDE_COLOR[i];
    g.strokeStyle = "#fff";
    g.lineWidth = 1.5 * dpr;
    g.fillRect(px(x) - r, pz(z) - r, r * 2, r * 2);
    g.strokeRect(px(x) - r, pz(z) - r, r * 2, r * 2);
  });
  return c;
}

/** HTML của khu chọn bản đồ + phe (ảnh vẽ sau bằng `mountPicker`). */
export function pickerHtml(): string {
  const cards = MAP_DEFS.map(
    (d) => `
      <button class="map-card" data-map="${d.id}">
        <span class="map-thumb" data-thumb="${d.id}"></span>
        <span class="map-info"><b>${d.name}</b><small>${d.size.w} × ${d.size.h} m</small><span>${d.blurb}</span></span>
      </button>`
  ).join("");
  return `
    <div class="picker">
      <div class="picker-head"><span>Bản đồ</span>
        <div class="side-pick"><button data-side="0">Lam</button><button data-side="1">Đỏ</button></div>
      </div>
      <div class="map-list">${cards}</div>
    </div>`;
}

/** Gắn sự kiện và vẽ ảnh bản đồ; trả về hàm đọc lựa chọn hiện tại. */
export function mountPicker(root: HTMLElement): () => Pick {
  const pick = loadPick();
  const sync = (): void => {
    root.querySelectorAll<HTMLElement>("[data-map]").forEach((b) => b.classList.toggle("on", b.dataset.map === pick.map));
    root.querySelectorAll<HTMLElement>("[data-side]").forEach((b) => b.classList.toggle("on", Number(b.dataset.side) === pick.side));
    // phe Đỏ nhìn bản đồ xoay 180° như minimap trong trận: nhà mình luôn ở góc dưới trái
    root.querySelectorAll<HTMLElement>("[data-thumb]").forEach((t) => t.classList.toggle("flip", pick.side === 1));
  };
  root.querySelectorAll<HTMLElement>("[data-map]").forEach((b) =>
    b.addEventListener("click", () => {
      pick.map = b.dataset.map!;
      savePick(pick);
      sync();
    })
  );
  root.querySelectorAll<HTMLElement>("[data-side]").forEach((b) =>
    b.addEventListener("click", () => {
      pick.side = b.dataset.side === "1" ? 1 : 0;
      savePick(pick);
      sync();
    })
  );
  // vẽ ảnh sau khi menu đã hiện: dựng GameMap của bản đồ lớn mất một chút, không để menu trắng chờ
  requestAnimationFrame(() =>
    root.querySelectorAll<HTMLElement>("[data-thumb]").forEach((t) => t.appendChild(thumb(getMap(t.dataset.thumb!), 96)))
  );
  sync();
  return () => ({ ...pick });
}
