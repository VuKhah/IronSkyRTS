/**
 * LÕI MÔ PHỎNG — World.
 *
 * Mỗi lần gọi step(lệnh) là trận đấu tiến thêm đúng 1 tick (0.1 giây). Thứ tự trong một tick luôn cố định:
 *   1. lưu vị trí cũ (để phần vẽ nội suy)   2. áp dụng lệnh   3. kinh tế   4. công trình (xây, đúc quân, tháp bắn)
 *   5. chiếm mỏ   6. quân (đi, nhắm, bắn; máy bay bay và đốt dầu)   7. đẩy xe không chồng lên nhau
 *   8. đạn tới đích → trừ máu   9. dọn xác   10. sương mù   11. kiểm tra thắng thua
 * Không có gì phụ thuộc thời gian thật hay số ngẫu nhiên không seed, nên cùng seed + cùng lệnh thì ra cùng trận.
 */

/*
 * World được tách theo nhóm luật trong thư mục src/sim/world/:
 *   core.ts      trạng thái, hàm tạo, vòng tick step(), truy vấn công khai
 *   shared.ts    hằng số và hàm phụ dùng chung
 *   placement.ts Bố trí công trình: lưới 2 m, xoay nhà, nền móng, cửa ra, ô cấm xây, kiểm chỗ đặt.
 *   entities.ts  Tạo thực thể: sinh quân, dựng công trình.
 *   orders.ts    Nhận lệnh của người chơi / AI (applyOrder) và các lệnh đơn: tấn công, dừng, xây.
 *   sandbox.ts   Phòng Thử Nghiệm: lệnh sb* (chỉ khi World tạo với { sandbox: true }).
 *   squad.ts     Đội hình hành quân (Squad): xếp ô, chia hàng, xoay đội, hành quân theo khối, chờ xe tụt.
 *   movement.ts  Di chuyển một xe: quay thân, bước tới, đi theo đường A*, né vách, đẩy xe không chồng lên nhau.
 *   economy.ts   Kinh tế: điện, công trình (xây, đúc quân), mỏ và chiếm mỏ.
 *   combat.ts    Tác chiến mặt đất: tầm, tìm mục tiêu, nhắm, bắn, đạn bay, sát thương, cấp bậc.
 *   hauler.ts    Xe Vận Tải: chở quặng từ mỏ về Tổng Hành Dinh, ô đỗ dỡ hàng, trục vớt xác.
 *   air.ts       Không quân và drone: sân bay, nhiên liệu, pin, bay, bổ nhào, Drone Khiên, sửa chữa, cảm tử.
 *   abilities.ts Kỹ năng của binh chủng: rải thảm, pháo phóng loạt, tổng động viên.
 *   lifecycle.ts Xác quân, dọn thực thể chết, sương mù, thắng thua.
 *   field.ts     Bãi tài nguyên: khối quặng / giếng Dầu và chỗ đỗ Xe Vận Tải quanh tâm mỏ.
 *   hash.ts      hashWorld
 * Mỗi file nhóm viết hàm thường với `this: World` rồi gắn vào World.prototype; `declare module "./core"` khai báo kiểu
 * cho các hàm đó. Mọi nơi khác chỉ import từ file này ("./world"), không import thẳng "./world/core" (sẽ thiếu hàm).
 */
export { World } from "./world/core";
export { TICK_RATE, DT, sec, AIRBORNE_ALT, PAD_OFFSETS, dirToCenter } from "./world/shared";
export type { WorldOptions, SandboxState } from "./world/shared";
export { hashWorld } from "./world/hash";
import "./world/placement";
import "./world/entities";
import "./world/orders";
import "./world/sandbox";
import "./world/squad";
import "./world/movement";
import "./world/economy";
import "./world/combat";
import "./world/hauler";
import "./world/air";
import "./world/abilities";
import "./world/lifecycle";
import "./world/field";
