/**
 * Điện thoại phải cầm ngang mới chơi được: trận RTS cần bề ngang cho bản đồ, HUD và thanh nút. Cầm dọc thì che màn
 * "Xoay ngang điện thoại" và tạm dừng trận (sim không chạy, AI không đánh lén lúc người chơi đang xoay máy); xoay ngang
 * lại thì chơi tiếp đúng trạng thái trước đó (nếu người chơi đã tự tạm dừng thì vẫn dừng). Menu chính không bị chặn.
 * Bản cài lên màn hình chính (PWA) đã khóa ngang bằng `orientation: "landscape"` trong manifest; màn này lo phần
 * chơi trên trình duyệt, nơi web không tự khóa hướng màn hình được.
 * `?forcerotate=1`: coi máy là điện thoại (để thử trên máy tính / Chrome không giao diện).
 */

/** Máy cảm ứng màn nhỏ = điện thoại. Máy tính bảng cầm dọc vẫn đủ rộng để chơi nên không chặn. */
function isPhone(): boolean {
  if (new URLSearchParams(location.search).has("forcerotate")) return true;
  return matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 768;
}

export function guardLandscape(root: HTMLElement, pause: { paused: boolean }): void {
  if (!isPhone()) return;
  const el = document.createElement("div");
  el.className = "rotate-guard";
  el.hidden = true;
  el.innerHTML = `<div class="rotate-phone"></div><b>Xoay ngang điện thoại để chơi</b><span>Trận đang tạm dừng, xoay ngang là chơi tiếp.</span>`;
  root.appendChild(el);
  let blocking = false;
  let wasPaused = false;
  const check = (): void => {
    const portrait = innerHeight > innerWidth;
    if (portrait === blocking) return;
    blocking = portrait;
    el.hidden = !portrait;
    if (portrait) {
      wasPaused = pause.paused;
      pause.paused = true;
    } else pause.paused = wasPaused;
  };
  addEventListener("resize", check);
  addEventListener("orientationchange", check);
  check();
}
