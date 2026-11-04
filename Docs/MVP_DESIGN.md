# Thiết Kế MVP — Iron Sky

> Chốt ngày 04/11/2026 qua 3 vòng hỏi đáp với người dùng.
> **MVP** (Minimum Viable Product) là phiên bản nhỏ nhất **chơi được trọn một trận**, đủ để biết game có vui không.
> Mọi thứ không có trong tài liệu này đều để sau MVP (xem `FEATURE_FRAMEWORK.md`).
> Con số trong tài liệu là **điểm xuất phát**: sẽ cân bằng lại bằng các trận AI đấu AI chạy không giao diện.

## 1. Câu chốt

> Hai đạo quân, Liên Minh Lam và Tập Đoàn Đỏ, tranh nhau các mỏ Sắt dọc một dòng sông chéo có 3 cây cầu.
> Chiếm mỏ, cho Xe Khai Thác chở Sắt về, đúc xe tăng và tiêm kích, rồi **phá sập Tổng Hành Dinh địch**.
> Chơi được cả trên điện thoại (cảm ứng) lẫn máy tính (chuột, bàn phím). Một trận dài 15–20 phút.

## 2. Các quyết định đã chốt

| Câu hỏi | Lựa chọn | Hệ quả thiết kế |
|---|---|---|
| Thiết bị | **Cảm ứng và chuột ngang nhau** | Mọi thao tác phải làm được bằng một ngón tay. Phím tắt chỉ là lối tắt |
| Kinh tế | **Chiếm mỏ rồi Xe Khai Thác chở về** | Hai lớp tranh chấp: giành mỏ và chặn tuyến xe chở |
| Tài nguyên | **1 loại: Sắt** | Mọi chi phí tính bằng Sắt. Vàng và Dầu để sau |
| Hậu cần | **Sân Đáp và nhiên liệu máy bay** | Lưới điện và đường ray đạn để sau |
| Nạp dầu | **Miễn phí, chỉ tốn thời gian** | Dầu là một giới hạn về thời gian bay, không phải chi phí |
| Quân chiến | **4 loại: Lynx, Titan, SkyGuard, Falcon** + Xe Khai Thác | Xe Tư Lệnh và Valkyrie để sau |
| Thắng trận | **Phá Tổng Hành Dinh địch** | Không có điều kiện thắng nào khác |
| Sương mù | **Có, bản đơn giản** | Tầm nhìn hình tròn, chưa tính đồi che |
| Bản đồ | **1 bản đồ cố định, sông chéo, 3 cầu** | Đối xứng xoay 180°, có đồi thấp |
| Công trình | **4 công trình cốt lõi** | Tổng Hành Dinh, Xưởng Xe, Sân Đáp, Tháp Phòng Thủ |
| Đối thủ | **1 AI, 1 độ khó + chế độ AI đấu AI** | AI phải chơi bằng đúng các lệnh của người chơi |
| Nhịp trận | **15–20 phút** | Mỏ có trữ lượng hữu hạn, nên trận tự dồn về giao tranh cuối |

## 3. Vòng lặp chơi

```
 Chiếm mỏ ──► Xe Khai Thác đào ──► chở Sắt về HQ ──► Kho Sắt
     ▲                                                  │
     │                                                  ▼
 Giữ/đánh mỏ ◄── quân chiến ◄── Xưởng Xe / Sân Đáp ◄── xây và đúc
     │
     └──► đẩy qua cầu ──► phá Tháp Phòng Thủ ──► phá Tổng Hành Dinh = THẮNG
```

- **Đầu trận (0–3 phút):** đúc thêm Xe Khai Thác, đưa Lynx đi chiếm 2 mỏ phía mình, xây Xưởng Xe.
- **Giữa trận (3–12 phút):** tranh 2 mỏ giữa sông, đánh tuyến xe chở của địch, xây Sân Đáp, dựng Tháp Phòng Thủ.
- **Cuối trận (12–20 phút):** mỏ gần cạn, hai bên dồn quân qua cầu đánh vào căn cứ.

## 4. Kinh tế

| Thông số | Giá trị khởi điểm | Ghi chú |
|---|---|---|
| Sắt lúc đầu trận | **600** | |
| Thu nhập gốc của HQ | **+2 Sắt/s** | Để bên cạn mỏ vẫn còn đường gỡ, giống `hqTrickle` của game tham chiếu |
| Số mỏ | **6** | Mỗi bên 1 mỏ nhà (có sẵn) và 1 mỏ tiền tuyến; 2 mỏ tranh chấp ở giữa sông |
| Trữ lượng mỗi mỏ | **6.000 Sắt** (mỏ giữa sông: **9.000**) | Hữu hạn: hết là cạn, nên trận không kéo dài vô tận |
| Chiếm mỏ | Đứng trong bán kính **8m**, mất **10s** với 1 quân; thêm quân thì nhanh hơn, tối đa ×3 | Có quân địch trong vùng thì việc chiếm tạm dừng. Mỏ trung lập thì phải chiếm trước rồi mới đào được |
| Xe Khai Thác | Chở **100 Sắt** mỗi chuyến, đào **20 Sắt/s**, dỡ hàng tại HQ mất **1.5s** | Chỉ đào được ở mỏ phe mình. Mỗi mỏ cho tối đa 3 xe đào cùng lúc |
| Giới hạn quân | **40** quân (Xe Khai Thác tính chung) | |

## 5. Quân đội (MVP)

Chi phí quy đổi sang một tài nguyên là Sắt. Máu, tốc độ, tầm bắn lấy từ `content.ts` hiện tại.

| Quân | Vai trò | Chi phí | Thời gian | Bắn |
|---|---|---|---|---|
| **Xe Khai Thác** *(mới)* | Đào và chở Sắt. Không vũ khí, máu 300 | 150 | 6s (tại HQ) | — |
| **Lynx** | Nhanh, chiếm mỏ, săn Xe Khai Thác | 150 | 4.5s | Đất |
| **Titan** | Tăng nặng, phá công trình | 350 | 7.5s | Đất |
| **SkyGuard** | Phòng không cơ động | 250 | 6s | Đất (yếu) + Không |
| **Falcon** | Tiêm kích, cần Sân Đáp | 300 | 6.5s | Đất + Không |

**Vòng khắc chế:** Lynx thắng SkyGuard và Xe Khai Thác. Titan thắng Lynx và công trình. Falcon thắng Titan và Lynx từ trên không. SkyGuard thắng Falcon.

**Falcon và Sân Đáp:**
- Mỗi Sân Đáp có **4 bãi đậu**, nên nuôi tối đa 4 Falcon.
- Bình dầu **65L**, đốt **1.05L/s**, tức khoảng 60 giây bay.
- Chỉ cất cánh khi còn **≥ 35%** dầu. Xuống **≤ 24%** thì tự động bay về hạ cánh.
- Đậu trên bãi thì nạp **10L/s** và sửa **25 HP/s**, miễn phí.
- Hết dầu giữa trời mà không còn bãi trống thì **rơi**. Sân Đáp bị phá thì các máy bay của nó phải tìm sân khác.
- Khi đang đậu trên bãi, máy bay là mục tiêu **mặt đất**.

## 6. Công trình (MVP)

| Công trình | Chi phí | Thời gian xây | Máu | Chức năng |
|---|---|---|---|---|
| **Tổng Hành Dinh** | Có sẵn | — | 3.600 | Đúc Xe Khai Thác, nhận Sắt, pháo tự vệ. **Mất là thua** |
| **Xưởng Xe** *(mới)* | 300 | 10s | 1.000 | Đúc Lynx, Titan, SkyGuard |
| **Sân Đáp** | 400 | 12s | 1.150 | Đúc Falcon, 4 bãi đậu, nạp dầu và sửa |
| **Tháp Phòng Thủ** *(mới)* | 250 | 8s | 700 | Pháo tự động, bắn cả đất lẫn không, tầm 20m |

- Chỉ được xây trong bán kính **14m** quanh công trình phe mình (giống `buildRadius` của thể loại RTS).
- Mỗi công trình sản xuất có hàng chờ tối đa **5** quân và một **điểm tập kết** (đặt bằng cách chạm hoặc chuột phải).
- Bán công trình được hoàn lại **50%**.

## 7. Bản đồ MVP: "Thung Lũng Sông Sắt"

- Kích thước khoảng **160 × 160m**. Sông chạy chéo từ Tây Bắc xuống Đông Nam. Bản đồ **đối xứng xoay 180°** quanh tâm.
- **3 cây cầu:** cầu giữa ở tâm bản đồ và 2 cầu cánh. Xe mặt đất chỉ qua sông bằng cầu; máy bay bay qua mọi nơi.
- **Đồi thấp** làm cảnh và chắn đường. Ở MVP, đồi chưa ảnh hưởng tới tầm nhìn hay tầm bắn.
- **HQ Lam** ở góc Tây Nam, **HQ Đỏ** ở góc Đông Bắc.
- **6 mỏ:** mỗi bên có 1 mỏ nhà sát căn cứ (sở hữu từ đầu) và 1 mỏ tiền tuyến gần sông; thêm 2 mỏ lớn ở hai đầu cầu cánh.
- **Lực lượng ban đầu mỗi bên:** HQ, 1 Xe Khai Thác, 2 Lynx.

## 8. Điều khiển (cảm ứng ngang hàng chuột)

| Thao tác | Cảm ứng | Chuột / bàn phím |
|---|---|---|
| Chọn 1 quân | Chạm vào quân | Nhấp trái |
| Chọn nhiều | **Giữ ~0.3s rồi kéo** để vẽ khung | Kéo chuột trái |
| Chọn mọi quân cùng loại đang thấy | Chạm đúp | Nhấp đúp |
| Ra lệnh đi / tấn công | Chạm mặt đất / chạm quân địch khi đang chọn quân | Nhấp phải |
| Bỏ chọn | Nút ✕ trên thanh lệnh | Esc |
| Kéo màn hình | Một ngón kéo | WASD, phím mũi tên, đưa chuột sát mép, hoặc kéo chuột giữa |
| Thu phóng | Chụm hai ngón | Lăn chuột |
| Xoay camera | Hai ngón xoay | Q/E hoặc Alt + kéo |
| Xây | Chọn công trình trên thanh xây, chạm vị trí, bấm ✓ | Chọn, nhấp đặt |
| Nhóm quân | Nút "Tất cả quân chiến" | Ctrl+1..5 để lưu, 1..5 để gọi |

- Camera là **3D tự do**, nhưng giới hạn góc nghiêng (30°–75°) để trận luôn dễ đọc.
- **Giao diện:** thanh tài nguyên ở trên, minimap ở góc dưới, thanh lệnh và thanh xây ở dưới. Nút cỡ ít nhất 44px cho ngón tay.

## 9. Sương mù chiến tranh (bản đơn giản)

- Mỗi quân và công trình nhìn trong một **vòng tròn** (lấy chỉ số tầm nhìn trong `content.ts`).
- Ba trạng thái ô: **chưa khám phá** (đen), **đã khám phá** (tối, nhớ địa hình và công trình địch lần cuối thấy), **đang thấy**.
- Quân địch chỉ hiện khi nằm trong vùng đang thấy.
- **AI cũng chịu sương mù:** AI chỉ được đọc phần mà phe nó đang thấy.

## 10. AI và chế độ AI đấu AI

- **1 độ khó.** AI xây theo thứ tự gần đúng: Xe Khai Thác → Xưởng Xe → chiếm mỏ → quân hỗn hợp → Sân Đáp → Tháp Phòng Thủ → đánh theo đợt.
- AI ra lệnh **qua cùng kênh lệnh** với người chơi (`{ tick, playerId, order }`), không chạm trực tiếp vào trạng thái game.
- **AI đấu AI:** xem hai AI đánh nhau, có nút tốc độ ×1, ×2, ×4. Chế độ này cũng chạy được **không giao diện** bằng Node, để cho hàng trăm trận tự động và cân bằng chỉ số.

## 11. Ngoài phạm vi MVP (để sau)

Xe Tư Lệnh và kỹ năng, Valkyrie, Vàng và Dầu, lưới điện, đường ray đạn, CIWS/SAM/EMP, bộ binh, đồi che tầm nhìn, tiền đồn, nhiều bản đồ, trình tạo bản đồ ngẫu nhiên, Last Stand, multiplayer, nhạc thích ứng (MVP chỉ có hiệu ứng âm thanh cơ bản).

## 12. Lộ trình xây MVP

| Mốc | Nội dung | "Xong" nghĩa là |
|---|---|---|
| **M0** | Lõi sim tất định: tick 10 Hz, RNG có seed, toán tự viết, hàng đợi lệnh, hàm băm | Kiểm thử: cùng seed và cùng lệnh thì ra cùng mã băm |
| **M1** | Bản đồ: heightmap, sông, 3 cầu, đồi; camera cảm ứng và chuột | Mở game là thấy bản đồ 3D, xoay, zoom, kéo được trên cả điện thoại |
| **M2** | Di chuyển: tìm đường (lưới + flow field), qua cầu; chọn quân và ra lệnh | Chọn Lynx, chạm bên kia sông thì xe tự tìm cầu mà đi |
| **M3** | Chiến đấu: tự nhắm, bắn đất/không, đạn bay, máu, nổ | 2 nhóm quân đánh nhau ra kết quả hợp lý |
| **M4** | Kinh tế: chiếm mỏ, Xe Khai Thác, HQ đúc xe | Sắt tăng đúng theo số mỏ và số xe |
| **M5** | Xây công trình, hàng chờ sản xuất, điểm tập kết | Xây Xưởng Xe và đúc Titan được |
| **M6** | Không quân: Sân Đáp, cất và hạ cánh, nhiên liệu | Falcon bay đánh, hết dầu thì tự về nạp |
| **M7** | Sương mù chiến tranh | Không thấy quân địch ngoài tầm nhìn |
| **M8** | AI, chế độ AI đấu AI, chạy không giao diện | AI tự chơi trọn trận và có lúc thắng được người |
| **M9** | Hoàn thiện: HUD, minimap, âm thanh, màn thắng/thua, đăng GitHub Pages | Gửi link là người khác chơi được |
