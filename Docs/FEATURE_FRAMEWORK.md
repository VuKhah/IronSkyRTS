# Khung Tính Năng Iron Sky

> Ghi nhận ngày 03/11/2026. Đây là **khung xương của game**: những thứ người dùng đã hình dung, và cũng là những gì Battle Drones đã chứng minh là làm được trên web.
> Iron Sky xây trên khung này, rồi **thêm bản sắc riêng** (Mục B).
> Nguyên tắc: học cơ chế, còn **tên, mô hình, chỉ số đều là của Iron Sky** (xem `BATTLEDRONES_REFERENCE.md`).

Trạng thái: ⬜ chưa làm · 🟨 đang làm / làm một phần · ✅ xong (theo bản v1 ngày 04/11/2026)
Ưu tiên: **P1** là khung cốt lõi, phải có để game chơi được · **P2** làm game vui và sâu hơn · **P3** về sau, tùy chọn

---

## A. Khung tính năng (học từ Battle Drones)

| # | Tính năng | Phiên bản Iron Sky | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| A1 | **Toàn bộ là mô hình 3D**: công trình, xe mặt đất, máy bay, bộ binh, kèm trang xem mô hình | Mô hình dựng bằng code Three.js, có trang `models.html` để xem từng mô hình. **Đã có Xưởng Mô Hình và 16 mô hình bản nhẹ; chờ bản chi tiết** | P1 | 🟨 |
| A2 | **Sương mù chiến tranh** | Tính theo địa hình 3D: đồi che tầm nhìn, đứng trên cao nhìn xa hơn. Thêm Trạm Radar | P1 | 🟨 |
| A3 | **Vũ khí khác nhau cho mục tiêu trên không và mặt đất** | Ma trận *loại sát thương × lớp giáp*, cờ "bắn được: đất / không / cả hai" | P1 | ✅ |
| A4 | **Chế độ giao tranh**: Xanh đấu Đỏ trên bản đồ đối xứng xoay | Liên Minh Lam đấu Tập Đoàn Đỏ, đối xứng 180° qua dòng sông chéo | P1 | ✅ |
| A5 | **Sáu bản đồ trên năm vùng khí hậu**: ôn đới, sa mạc, Bắc Cực, núi lửa, nhiệt đới | Mỗi vùng có bảng màu, địa hình, vật trang trí và luật riêng (ví dụ băng trơn, dung nham) | P2 | ⬜ |
| A6 | **Trình tạo bản đồ ngẫu nhiên** theo seed, đối xứng xoay | Sinh địa hình có độ cao, sông, cầu, mỏ, căn cứ. Cùng seed thì ra cùng bản đồ | P2 | ⬜ |
| A7 | **Chế độ Last Stand**: cầm cự qua càng nhiều đợt địch càng tốt | Thủ căn cứ trước các đợt tấn công mạnh dần, có bảng điểm | P2 | ⬜ |
| A8 | **Kỹ năng tác động diện rộng** (4 loại: pháo kích, EMP, thả quân, đòn trời giáng) | Gắn với Tư Lệnh và hậu cần. Pháo kích cần Kho đạn, EMP cần lưới điện… Tên riêng sẽ đặt sau | P2 | ⬜ |
| A9 | **Rương tiếp tế** chứa tài nguyên thêm | Thùng hàng thả dù xuống bản đồ, quân nào chạm vào trước thì phe đó nhận | P2 | ⬜ |
| A10 | **Nhạc thích ứng**: dồn dập hơn khi giao tranh | Tổng hợp bằng Web Audio API, cường độ nhạc theo mức độ giao tranh | P2 | ⬜ |
| A11 | **Tính cách AI**: Cân bằng, Tấn công nhanh, Bầy không quân, Phát triển kinh tế, Không lực, Thiết giáp | 6 tính cách cho AI Tập Đoàn Đỏ, tên riêng đặt sau | P2 | 🟨 |
| A12 | **Chế độ AI đấu AI** để xem | Kèm chỉnh tốc độ. Cũng dùng để chạy hàng nghìn trận cân bằng chỉ số không cần giao diện | P1 (dạng không giao diện) / P2 (xem được) | ✅ |
| A13 | **Siêu cỗ máy**: khổng lồ, nhiều vũ khí, dựng được căn cứ mới | Thiết kế riêng của Iron Sky, ví dụ *Pháo Đài Di Động*: neo xuống thành tiền đồn, vũ khí hỏng dần theo máu. Tên và hình dáng tự thiết kế | P2 | ⬜ |
| A14 | **Biến thể luật chơi** (mutator) | Ví dụ: dầu cạn nhanh, máy bay miễn phí, sương mù dày… | P3 | ⬜ |
| A15 | **Thử thách hằng ngày** | Seed bản đồ, luật và đối thủ theo ngày, giống nhau với mọi người chơi | P3 | ⬜ |
| A16 | **Cấp bậc và huy chương** | Cấp bậc người chơi, huy chương sau trận, lưu trong `localStorage` | P2 | ⬜ |
| A17 | **LLM đấu LLM** | Công cụ cho các mô hình AI chơi với nhau, chỉ thấy phần ngoài sương mù | P3 | ⬜ |
| A18 | **Multiplayer**: hai máy ở gần nhau truyền tin bằng âm thanh (mở rộng từ thử nghiệm Chirp Pong của tác giả) | Ưu tiên bản **online qua relay WebSocket bằng mã phòng**. Bản truyền qua âm thanh chỉ để thử nghiệm | P3 | ⬜ |

**Đội hình mục tiêu** (Battle Drones có 9 công trình, 7 xe mặt đất, 6 máy bay, 3 bộ binh). Iron Sky đặt khung tương tự, nhưng nhiều công trình hơn vì có hệ thống hậu cần:

| Nhóm | Đề xuất (tên tạm, sẽ chốt sau) |
|---|---|
| **Xe mặt đất (7)** | Xe Khai Thác, **Xe Tư Lệnh**, **Lynx** trinh sát, **Titan** tăng chủ lực, **SkyGuard** phòng không, Pháo tự hành, Xe công binh sửa chữa |
| **Máy bay (6)** | Drone trinh sát, **Falcon** tiêm kích đa nhiệm, **Valkyrie** cường kích ném bom, Trực thăng tấn công, Trực thăng vận tải, Drone sửa chữa |
| **Bộ binh (3)** | Tiểu đội súng trường, Tiểu đội tên lửa chống tăng, Tổ bắn tỉa |
| **Siêu cỗ máy (1)** | Pháo Đài Di Động (A13) |
| **Công trình** | Tổng Hành Dinh, Xưởng xe, **Sân Đáp**, Trại bộ binh, Trung tâm nghiên cứu, Trạm Radar, **Nhà máy điện**, **Cột điện**, **Nhà máy đào dầu**, **Kho đạn**, **CIWS**, **SAM**, **Tháp EMP** |

Tên **in đậm** là quân và công trình đã có trong thiết kế Iron Sky cũ (`GAME_CONTENT.md`).

---

## B. Bản sắc riêng của Iron Sky (Battle Drones không có)

| # | Tính năng | Ghi chú | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| B1 | **Cơ chế bay khí động học**: nghiêng cánh, bay vòng chờ, bổ nhào, lượn né phòng không | Máy bay bay theo quỹ đạo thật trong không gian 3D, không lơ lửng như drone | P1 | 🟨 |
| B2 | **Sân Đáp**: cất cánh, hạ cánh, đậu bãi, sửa chữa, nạp bom | Mỗi sân có 4 bãi đáp, giới hạn số máy bay theo số sân | P1 | ✅ |
| B3 | **Nhiên liệu Dầu cho máy bay** | Đủ 35% mới cất cánh được; xuống 24% (mức Bingo) thì tự quay về; hết dầu thì rơi | P1 | ✅ |
| B4 | **Lưới điện MW**: nhà máy điện, cột điện, dây cáp võng 3D | Thiếu điện thì quá tải, một số tháp ngừng bắn | P2 | ⬜ |
| B5 | **Nhà máy đào dầu** | Sản lượng cao hơn khi đặt gần giàn dầu | P2 | ⬜ |
| B6 | **Kho đạn, đường ray và xe goòng tiếp đạn** cho phòng không | Đánh vào mắt xích hậu cần của địch là chiến thuật chính | P2 | ⬜ |
| B7 | **Phòng không nhiều tầng**: CIWS, SAM, EMP | Mỗi tầng có tầm bắn và vai trò khác nhau | P2 | ⬜ |
| B8 | **Xe Tư Lệnh và 3 kỹ năng**, mất Xe Tư Lệnh là thua | Có hào quang hỗ trợ quân xung quanh | P1 | 🟨 |
| B9 | **4 điều kiện thắng**: phá căn cứ, diệt Tư Lệnh, độc quyền 3/3 mỏ, tính điểm khi hết giờ | Ván đấu tối đa 15 phút | P1 | 🟨 |
| B10 | **3 tài nguyên**: Vàng, Dầu, Sắt; **9 mỏ**; **5 căn cứ** | Dầu vừa dùng cho kinh tế vừa làm nhiên liệu máy bay | P1 | 🟨 |
| B11 | **Địa hình 3D chiến thuật**: đồi được cộng tầm nhìn và tầm bắn, sông có 7 cầu | Xem mục "Nghĩa của 3D" trong `AGENTS.md` | P1 | 🟨 |
| … | *(Người dùng sẽ bổ sung thêm)* | | | |

---

## C. Thứ tự xây dựng gợi ý

1. **Nền móng:** lõi mô phỏng tất định, địa hình 3D, camera, quân mặt đất di chuyển và bắn nhau (A4, B11).
2. **Vòng lặp trận đấu:** kinh tế 3 tài nguyên, công trình, sản xuất, điều kiện thắng, AI cơ bản (B8, B9, B10, A3).
3. **Không quân:** cơ chế bay, Sân Đáp, nhiên liệu Dầu (B1, B2, B3).
4. **Chiều sâu:** sương mù, bộ binh, hậu cần điện, dầu, đường ray, phòng không (A2, B4–B7).
5. **Độ vui:** kỹ năng diện rộng, rương, nhạc thích ứng, tính cách AI, siêu cỗ máy (A8–A13).
6. **Nội dung:** vùng khí hậu, trình tạo bản đồ, Last Stand, cấp bậc (A5–A7, A16).
7. **Về sau:** biến thể luật chơi, thử thách hằng ngày, multiplayer, LLM đấu LLM (A14, A15, A17, A18).
