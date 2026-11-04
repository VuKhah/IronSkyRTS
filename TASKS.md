# Đầu việc Iron Sky

Cập nhật 05/11/2026 · ✅ xong · 🔄 đang làm · ⏳ chưa làm · ⏸ sau MVP. Chi tiết từng mục ở `Docs/design/`.

**Tiến độ: 25 xong · 22 chưa làm · 6 sau MVP**

## 1. Nền móng MVP (`MVP_DESIGN.md`)
- ✅ Lõi sim tất định 10 Hz, hàng đợi lệnh, hàm băm
- ✅ Bản đồ 3D, camera chạm + chuột, xoay / nghiêng / thu phóng
- ✅ Tìm đường A*, qua cầu và bãi cạn, đội hình
- ✅ Chiến đấu đất / không, đạn bay, nổ lan
- ✅ Kinh tế: chiếm mỏ, Xe Vận Tải chở Sắt / Dầu
- ✅ Công trình, hàng chờ, điểm tập kết, 3 điều kiện thắng
- ✅ Không quân: Sân Đáp, đốt Dầu, tự về nạp
- ✅ Sương mù + Trạm Radar
- ✅ AI, AI đấu AI không giao diện
- ✅ Điện: hậu cần tự điều độ, Trạm Tích Điện, báo trước
- ✅ HUD, minimap, cảnh báo, âm thanh, màn kết thúc
- ✅ Đẩy code lên GitHub (VuKhah/IronSkyRTS)
- ⏳ Đăng game lên GitHub Pages
- ⏳ Độc quyền Dầu thắng quá sớm: chọn cách sửa (`MVP_DESIGN.md` 16.3)

## 2. Công cụ
- ✅ Xưởng Mô Hình (`models.html`)
- ✅ Phòng Thử Nghiệm (`?play=sandbox`)
- ✅ Kịch bản thiết kế + `npm run balance`, 2 kịch bản bắt buộc trong `npm test`

## 3. Quân đội (`ARMY_DESIGN.md`)
- ✅ Bước 1–2: vai trò, điểm mạnh / yếu, khắc chế từng quân
- ✅ Bước 3: ma trận 4 giáp × 3 đạn, giáp công trình
- ✅ Bước 4: ma trận vào code, máu ×1,5, tiêu chí kịp phản ứng 8 giây
- ✅ Cơ chế bắn: loạt, Lockdown, xoay tháp, giáp mặt trước, phòng thủ điểm, rải thảm
- ✅ Falcon: bổ nhào, pháo đôi, 2 tên lửa, đường đạn thẳng
- ⏳ Phiên riêng không quân: Falcon còn giật khi bay
- ⏳ AI đấu AI hay hòa (giằng co quanh mỏ): chọn hướng sửa
- ⏳ AI thắng lệch về phe Đỏ: tìm nguyên nhân
- ⏳ Buổi cân bằng chỉ số (Falcon quá mạnh, 2 kịch bản chờ đưa lại)
- ⏳ Pháo Tự Hành (tầm tối thiểu, lộ 2 giây, cộng tầm trên đồi)
- ⏳ Xe Tên Lửa Loạt (độ tản, dựng dàn phóng)
- ⏳ Drone Trinh Sát cảm tử, Drone Sửa Chữa, Drone Khiên / Khói
- ⏳ Xe Tư Lệnh: Tổng động viên, rút chạy khi máu thấp
- ⏳ Bàn: quân tự phản ứng, ưu tiên bắn quân sửa chữa

## 4. Địa hình và bản đồ (`MAPS_PLAN.md`)
- ✅ Đồi và đá che tầm nhìn, đứng cao cộng tầm nhìn / tầm bắn
- ✅ Kế hoạch bản đồ, học cách làm bản đồ của Battle Drones
- ✅ B0: tách bản đồ thành thành phần riêng (`src/sim/maps/`)
- ✅ Bản thử vẽ mặt đất bằng code; chốt dùng ảnh mặt đất
- ✅ Sắp xếp thư mục `Docs/`, danh sách đầu việc này
- ⏳ B1: mọi nơi đọc `GameMap`, bộ vẽ tự đối xứng
- ⏳ B2: góc nhìn hình vuông, phe Đỏ xoay 180°
- ⏳ B3: loại địa hình (`terrain.ts`), độ dốc làm chậm
- ⏳ B4: đo hiệu năng theo kích cỡ bản đồ
- ⏳ B5: Sông Sắt bản lớn, Cao Nguyên Gió, Đèo Đá Kép
- ⏳ B6: chọn bản đồ (menu, Phòng Thử Nghiệm, `?map=`)
- ⏳ B7: trang xem trước bản đồ (tùy chọn)
- ⏳ B8a: ảnh mặt đất vẽ sẵn, phủ lên địa hình 3D
- ⏳ B8b–d: vân chi tiết, lớp vết chiến trường (hố đạn), nước, cây, bóng mây

## 5. Định hướng sư đoàn, trận ≤ 20 phút (`MVP_DESIGN.md` 17)
- ⏳ Đúc theo lô / điều theo đội
- ⏳ Giới hạn quân, đạn, đường ray tàu hỏa

## 6. Sau MVP
- ⏸ Multiplayer lockstep, vào trận bằng mã phòng
- ⏸ Hải quân và lưới nước
- ⏸ Siêu vũ khí (sau Hải quân)
- ⏸ Bộ binh, Trực Thăng (đang tạm bỏ)
- ⏸ Tính cách AI, chế độ chơi, cựu binh, xác quân
- ⏸ Bản đồ ngẫu nhiên theo seed
