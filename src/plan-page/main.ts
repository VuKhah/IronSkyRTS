/**
 * Bản Vẽ Mặt Bằng (plan.html), hai tấm:
 *  1. mỗi loại công trình một nhà xếp cho hình bao nhỏ nhất (`pack-board.ts`);
 *  2. căn cứ phòng thủ mẫu cho đạo quân ~80, thủ góc quạt 90° (`defense.ts`).
 */
import { drawDefense } from "./defense";
import { drawPackBoard } from "./pack-board";

drawPackBoard(document.getElementById("layout")!);
drawDefense(document.getElementById("defense")!);
