/**
 * Bản Vẽ Mặt Bằng (plan.html). Mặc định: căn cứ phòng thủ mẫu cho đạo quân 80, thủ góc quạt 90° (`defense.ts`).
 * `?pack=1`: mỗi loại công trình một nhà xếp cho hình bao nhỏ nhất (`pack-board.ts`).
 */
import { drawDefense } from "./defense";
import { drawPackBoard } from "./pack-board";

const host = document.getElementById("layout")!;
if (new URLSearchParams(location.search).has("pack")) drawPackBoard(host);
else drawDefense(host);
