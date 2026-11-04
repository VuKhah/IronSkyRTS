# Thiết Kế MVP — Iron Sky

> Chốt ngày 04/11/2026 qua 3 vòng hỏi đáp với người dùng, rồi chỉnh lần 2 cùng ngày (Dầu, điều kiện thắng, lực lượng ban đầu).
> **MVP** (Minimum Viable Product) là phiên bản nhỏ nhất **chơi được trọn một trận**, đủ để biết game có vui không.
> Mọi thứ không có trong tài liệu này đều để sau MVP (xem `FEATURE_FRAMEWORK.md`).
> ⚠️ **Mọi chỉ số quân và công trình ở đây là SỐ TẠM** để dựng bản demo. Người dùng sẽ bàn kỹ lại khi bản demo hoàn tất, có số đo từ các trận AI đấu AI chạy không giao diện.

## 1. Câu chốt

> Hai đạo quân, Liên Minh Lam và Tập Đoàn Đỏ, tranh nhau mỏ **Sắt** và giàn **Dầu** dọc một dòng sông chéo có 3 cây cầu.
> Sắt dùng để xây và đúc quân. Dầu là **nhiên liệu tiêu hao** của không quân: máy bay rất mạnh nhưng bay ngắn, phải liên tục về Sân Đáp đốt Dầu để xuất kích tiếp.
> Thắng bằng một trong ba cách: **diệt Xe Tư Lệnh địch**, **phá hết công trình địch**, hoặc **giữ trọn một loại mỏ trong 30 giây**.
> Chơi được cả trên điện thoại (cảm ứng) lẫn máy tính (chuột, bàn phím). Một trận dài 15–20 phút.

## 2. Các quyết định đã chốt

| Câu hỏi | Lựa chọn | Hệ quả thiết kế |
|---|---|---|
| Thiết bị | **Cảm ứng và chuột ngang nhau** | Mọi thao tác phải làm được bằng một ngón tay. Phím tắt chỉ là lối tắt |
| Kinh tế | **Chiếm mỏ rồi Xe Vận Tải chở về** | Hai lớp tranh chấp: giành mỏ và chặn tuyến xe chở |
| Tài nguyên | **2 loại: Sắt và Dầu** *(sửa lần 2: trước đó là 1 loại)* | Sắt để xây và đúc quân. Dầu là nhiên liệu tiêu hao của máy bay |
| Hậu cần | **Sân Đáp, nhiên liệu máy bay, điện** *(điện thêm sau bản chơi thử 04/11)* | Đường ray đạn để sau |
| Dầu *(sửa lần 2)* | **Tiêu hao thật:** mỗi lần nạp trừ vào kho Dầu | Không quân **rất mạnh, xuất kích dày, áp lực lớn**, nhưng bị giới hạn bởi thời gian bay và kho Dầu |
| Quân chiến | **Lynx, Titan, SkyGuard, Falcon** + Xe Vận Tải + **Xe Tư Lệnh** | Xe Tư Lệnh có mặt vì là điều kiện thắng. Kỹ năng của nó để sau. Valkyrie để sau |
| Thắng trận *(sửa lần 2)* | **3 điều kiện**, đạt điều nào trước thì thắng | Diệt Tư Lệnh, phá hết công trình, độc quyền một loại mỏ trong 30s |
| Lực lượng ban đầu *(sửa lần 2)* | **2 Xe Vận Tải + 1 xe trinh sát Lynx** + Xe Tư Lệnh, kèm **1 mỏ Sắt sát nhà** đã thuộc sở hữu | Mở trận là có kinh tế chạy ngay và có xe đi dò đường |
| Sương mù | **Có, bản đơn giản** | Tầm nhìn hình tròn, chưa tính đồi che |
| Bản đồ | **1 bản đồ cố định, sông chéo, 3 cầu** | Đối xứng xoay 180°, có đồi thấp |
| Công trình | **4 công trình cốt lõi** | Tổng Hành Dinh, Xưởng Xe, Sân Đáp, Tháp Phòng Thủ |
| Đối thủ | **1 AI, 1 độ khó + chế độ AI đấu AI** | AI phải chơi bằng đúng các lệnh của người chơi |
| Nhịp trận | **15–20 phút** | Mỏ có trữ lượng hữu hạn, nên trận tự dồn về giao tranh cuối |
| Chỉ số *(sửa lần 2)* | **Số tạm, bàn lại sau bản demo** | Không tối ưu cân bằng trước khi có demo |

## 3. Vòng lặp chơi

```
 Chiếm mỏ Sắt / giàn Dầu ──► Xe Vận Tải đào ──► chở về HQ ──► Kho Sắt + Kho Dầu
        ▲                                                      │        │
        │                                     xây & đúc ◄──────┘        │ nạp nhiên liệu
        │                                         │                     ▼
   giữ / đánh mỏ ◄── quân mặt đất ◄── Xưởng Xe    └──► Sân Đáp ──► Falcon xuất kích
        │                                                        (bay ngắn, đánh mạnh,
        │                                                         về nạp, xuất kích lại)
        ▼
  THẮNG: diệt Xe Tư Lệnh địch  |  phá hết công trình địch  |  giữ trọn 1 loại mỏ 30s
```

- **Đầu trận (0–3 phút):** 2 Xe Vận Tải chạy ngay ra mỏ Sắt nhà. Lynx đi trinh sát và chiếm mỏ gần. Xây Xưởng Xe.
- **Giữa trận (3–12 phút):** tranh giàn Dầu, xây Sân Đáp. Falcon xuất kích dồn dập, săn Xe Vận Tải và đánh quân đang chiếm mỏ.
- **Cuối trận (12–20 phút):** mỏ gần cạn. Có ba hướng: dồn quân qua cầu phá căn cứ, săn Xe Tư Lệnh, hoặc gom trọn một loại mỏ.

## 4. Kinh tế: Sắt và Dầu

| Thông số | Giá trị tạm | Ghi chú |
|---|---|---|
| Kho lúc đầu trận | **500 Sắt • 100 Dầu** | |
| Thu nhập gốc của HQ | **+2 Sắt/s** (không có Dầu) | Để bên cạn mỏ vẫn còn đường gỡ. Dầu chỉ có từ giàn Dầu |
| Mỏ Sắt | **4 mỏ**: mỗi bên 1 mỏ nhà (sở hữu từ đầu) và 1 mỏ tiền tuyến | Trữ lượng **6.000** mỗi mỏ |
| Giàn Dầu | **5 giàn**: mỗi bên 1 **giàn nhà** (sở hữu từ đầu, trữ lượng nhỏ **1.200**) *(thêm 04/11)* + 3 giàn trung lập: 1 ở giữa sông (cầu giữa), 2 ở đầu cầu cánh | Giàn trung lập trữ lượng **3.000**, là điểm nóng. Giàn nhà đủ khởi động điện và máy bay nhưng cạn sớm |
| Chiếm mỏ | Đứng trong bán kính **8m**, mất **10s** với 1 quân; thêm quân thì nhanh hơn, tối đa ×3 | Có quân địch trong vùng thì tạm dừng. Mỏ trung lập phải chiếm trước rồi mới đào được |
| Xe Vận Tải | Chở **100** mỗi chuyến (Sắt hoặc Dầu), đào **20/s**, dỡ hàng tại HQ mất **1.5s** | Chỉ đào ở mỏ phe mình. Mỗi mỏ tối đa 3 xe cùng lúc |
| Giới hạn quân | **40** quân (Xe Vận Tải tính chung) | |

## 5. Quân đội (MVP)

| Quân | Vai trò | Chi phí tạm | Thời gian | Bắn |
|---|---|---|---|---|
| **Xe Tư Lệnh** | Có sẵn, không đúc thêm. Hào quang hỗ trợ quân quanh nó. **Bị diệt là thua** | — | — | Đất + Không |
| **Xe Vận Tải** *(mới)* | Đào và chở Sắt hoặc Dầu. Không vũ khí | 150 Sắt | 6s (tại HQ) | — |
| **Lynx** | Trinh sát nhanh, chiếm mỏ, săn Xe Vận Tải | 150 Sắt | 4.5s | Đất |
| **Titan** | Tăng nặng, phá công trình | 350 Sắt | 7.5s | Đất |
| **SkyGuard** | Phòng không cơ động | 250 Sắt | 6s | Đất (yếu) + Không |
| **Falcon** | Tiêm kích **rất mạnh**, cần Sân Đáp và Dầu | 300 Sắt + 50 Dầu | 6.5s | Đất + Không |

**Vòng khắc chế:** Lynx thắng SkyGuard và Xe Vận Tải. Titan thắng Lynx và công trình. Falcon đánh mạnh mọi thứ trên mặt đất nhưng chỉ bay được một lúc. SkyGuard và Tháp Phòng Thủ là câu trả lời cho Falcon.

### Không quân: mạnh, xuất kích dày, áp lực lớn

Ý đồ thiết kế: Falcon là **đòn đánh mạnh nhất trận**, nhưng mỗi lần chỉ bay được ít giây. Người chơi luôn phải tính: **xuất kích lúc nào, đánh vào đâu, còn đủ Dầu không.** Mất giàn Dầu thì không quân tê liệt, nên giàn Dầu luôn là điểm nóng.

| Thông số | Giá trị tạm | Ý nghĩa |
|---|---|---|
| Sát thương Falcon | Cao hơn hẳn quân mặt đất cùng giá | Mỗi lần xuất kích phải để lại hậu quả rõ rệt |
| Bình dầu | **40L**, đốt **1.2L/s** | Khoảng **33 giây** bay mỗi lần xuất kích |
| Cất cánh | Chỉ khi bình còn **≥ 35%** | |
| Tự về | Khi bình xuống **≤ 24%**, máy bay tự bay về Sân Đáp | Người chơi cũng có thể gọi về sớm |
| Nạp dầu | **Vài giây** (~**4s** cho một bình đầy) tại bãi đậu, **trừ vào kho Dầu**: 1 Dầu kho = 1L | Đầy một bình khoảng 40 Dầu. Đậu trên bãi cũng được sửa 25 HP/s |
| Sân Đáp | **4 bãi đậu**, nuôi tối đa 4 Falcon mỗi sân | |

**Khi hết Dầu:**
- **Dầu dự trữ** *(sửa sau bản chơi thử 04/11)*: máy bay tự quay về khi dầu chỉ còn vừa đủ bay về sân (mức Bingo động = max(24%, dầu cần để về + 25% dự phòng)). Cạn dầu trên đường về vẫn bay về được, **không rơi**.
- Máy bay **chỉ rơi** khi hết dầu mà phe mình **không còn Sân Đáp nào**.
- **Kho Dầu cạn:** máy bay đậu trên bãi **không nạp được nữa**, nằm chờ ở sân. Lúc này nó là mục tiêu mặt đất, dễ bị phá.
- **Kho Dầu còn ít:** máy bay chỉ nạp được một phần bình. Nếu chưa đủ 35% thì không cất cánh được.
- **Sân Đáp bị phá:** máy bay của sân đó phải tìm bãi trống ở sân khác, không có thì rơi khi hết dầu.

## 6. Công trình (MVP)

| Công trình | Chi phí tạm | Thời gian xây | Máu | Chức năng |
|---|---|---|---|---|
| **Tổng Hành Dinh** | Có sẵn | — | 3.600 | Đúc Xe Vận Tải, nhận Sắt và Dầu, pháo tự vệ |
| **Xưởng Xe** *(mới)* | 300 Sắt | 10s | 1.000 | Đúc Lynx, Titan, SkyGuard |
| **Sân Đáp** | 400 Sắt | 12s | 1.150 | Đúc Falcon, 4 bãi đậu, nạp Dầu và sửa |
| **Tháp Phòng Thủ** *(mới)* | 250 Sắt | 8s | 700 | Pháo tự động, bắn cả đất lẫn không, tầm 20m |

- Chỉ được xây trong bán kính **14m** quanh công trình phe mình.
- Mỗi công trình sản xuất có hàng chờ tối đa **5** quân và một **điểm tập kết** (đặt bằng cách chạm hoặc chuột phải).
- Bán công trình được hoàn lại **50%**.

## 7. Điều kiện thắng (đạt điều nào trước thì thắng ngay)

| # | Điều kiện | Chi tiết |
|---|---|---|
| 1 | **Diệt Xe Tư Lệnh địch** | Xe Tư Lệnh không đúc lại được. Nên giữ nó an toàn, nhưng hào quang của nó lại rất mạnh khi đi cùng quân |
| 2 | **Phá hết công trình địch** | Mọi công trình, kể cả Tổng Hành Dinh. Xe còn sống không cứu được trận |
| 3 | **Độc quyền tài nguyên** | Sở hữu **trọn 4/4 mỏ Sắt** hoặc **trọn 5/5 giàn Dầu** (gồm cả giàn nhà của địch) liên tục **30 giây**. Mất một mỏ là đồng hồ về 0. Cả hai bên thấy đồng hồ đếm ngược trên HUD |

- Cả độc quyền Sắt lẫn độc quyền Dầu đều buộc phải chiếm **mỏ / giàn nhà của địch**, nên thực chất là thắng áp đảo chứ không còn là cuộc đua giành giàn giữa bản đồ (đổi 04/11 khi thêm giàn Dầu nhà).
- Hòa: hai bên cùng đạt điều kiện trong cùng một tick (rất hiếm) thì tính hòa.

## 8. Bản đồ MVP: "Thung Lũng Sông Sắt"

- Kích thước khoảng **160 × 160m**. Sông chạy chéo từ Tây Bắc xuống Đông Nam. Bản đồ **đối xứng xoay 180°** quanh tâm.
- **3 cây cầu:** cầu giữa ở tâm bản đồ và 2 cầu cánh. Xe mặt đất chỉ qua sông bằng cầu; máy bay bay qua mọi nơi.
- **Đồi thấp** làm cảnh và chắn đường. Ở MVP, đồi chưa ảnh hưởng tới tầm nhìn hay tầm bắn.
- **HQ Lam** ở góc Tây Nam, **HQ Đỏ** ở góc Đông Bắc.
- **4 mỏ Sắt:** mỗi bên 1 mỏ nhà sát căn cứ và 1 mỏ tiền tuyến gần sông.
- **3 giàn Dầu:** 1 ở cầu giữa (tâm đối xứng) và 2 ở đầu cầu cánh (mỗi đầu cầu nghiêng về một phe).
- **Lực lượng ban đầu mỗi bên:** Tổng Hành Dinh, Xe Tư Lệnh, **2 Xe Vận Tải, 1 Lynx trinh sát**, mỏ Sắt nhà đã thuộc sở hữu.

## 9. Điều khiển (cảm ứng ngang hàng chuột)

| Thao tác | Cảm ứng | Chuột / bàn phím |
|---|---|---|
| Chọn 1 quân | Chạm vào quân | Nhấp trái |
| Chọn nhiều | **Giữ ~0.3s rồi kéo** để vẽ khung | Kéo chuột trái |
| Chọn mọi quân cùng loại đang thấy | Chạm đúp | Nhấp đúp |
| Ra lệnh đi / tấn công | Chạm mặt đất / chạm quân địch khi đang chọn quân | Nhấp phải |
| Gọi máy bay về Sân Đáp | Nút "Về sân" trên thanh lệnh | Phím B |
| Bỏ chọn | Nút ✕ trên thanh lệnh | Esc |
| Kéo màn hình | Một ngón kéo | Phím mũi tên, đưa chuột sát mép, hoặc kéo chuột giữa (A / S dành cho Tấn công-di chuyển / Dừng) |
| Thu phóng | Chụm hai ngón | Lăn chuột |
| Xoay camera | Hai ngón xoay | Q/E hoặc kéo chuột phải |
| Xây | Chọn công trình trên thanh xây, chạm vị trí, bấm ✓ | Chọn, nhấp đặt |
| Nhóm quân | Nút "Tất cả quân chiến" | Ctrl+1..5 để lưu, 1..5 để gọi |

- Camera là **3D tự do**, nhưng giới hạn góc nghiêng (30°–75°) để trận luôn dễ đọc.
- **Giao diện:** thanh tài nguyên ở trên (Sắt, Dầu, số quân, đồng hồ độc quyền khi có), minimap ở góc dưới, thanh lệnh và thanh xây ở dưới. Mỗi máy bay có **thanh nhiên liệu** riêng. Nút cỡ ít nhất 44px cho ngón tay.
- **Cảnh báo:** Xe Tư Lệnh bị tấn công, máy bay sắp hết dầu, kho Dầu cạn, đối phương sắp độc quyền.

## 10. Sương mù chiến tranh (bản đơn giản)

- Mỗi quân và công trình nhìn trong một **vòng tròn** (lấy chỉ số tầm nhìn trong `content.ts`).
- Ba trạng thái ô: **chưa khám phá** (đen), **đã khám phá** (tối, nhớ địa hình và công trình địch lần cuối thấy), **đang thấy**.
- Quân địch chỉ hiện khi nằm trong vùng đang thấy. Riêng **chủ sở hữu của mỗi mỏ** thì luôn biết, để HUD hiện được đồng hồ độc quyền.
- **AI cũng chịu sương mù:** AI chỉ được đọc phần mà phe nó đang thấy.

## 11. AI và chế độ AI đấu AI

- **1 độ khó.** AI xây theo thứ tự gần đúng: Xe Vận Tải → Xưởng Xe → chiếm mỏ và giàn Dầu → quân hỗn hợp → Sân Đáp → Tháp Phòng Thủ → đánh theo đợt.
- AI biết cả 3 điều kiện thắng: giữ Xe Tư Lệnh của mình an toàn, săn Xe Tư Lệnh địch khi có cơ hội, và **phá thế độc quyền** khi đối phương đang đếm ngược.
- AI ra lệnh **qua cùng kênh lệnh** với người chơi (`{ tick, playerId, order }`), không chạm trực tiếp vào trạng thái game.
- **AI đấu AI:** xem hai AI đánh nhau, có nút tốc độ ×1, ×2, ×4. Chế độ này cũng chạy được **không giao diện** bằng Node, dùng để đo chỉ số trước buổi bàn cân bằng sau bản demo.

## 12. Ngoài phạm vi MVP (để sau)

Kỹ năng Xe Tư Lệnh [Q][E][R], Valkyrie, Vàng, lưới điện, đường ray đạn, CIWS/SAM/EMP, bộ binh, đồi che tầm nhìn, tiền đồn, nhiều bản đồ, trình tạo bản đồ ngẫu nhiên, Last Stand, multiplayer, nhạc thích ứng (MVP chỉ có hiệu ứng âm thanh cơ bản).

## 13. Lộ trình xây MVP

| Mốc | Nội dung | "Xong" nghĩa là |
|---|---|---|
| **M0** | Lõi sim tất định: tick 10 Hz, RNG có seed, toán tự viết, hàng đợi lệnh, hàm băm | Kiểm thử: cùng seed và cùng lệnh thì ra cùng mã băm |
| **M1** | Bản đồ: heightmap, sông, 3 cầu, đồi; camera cảm ứng và chuột | Mở game là thấy bản đồ 3D, xoay, zoom, kéo được trên cả điện thoại |
| **M2** | Di chuyển: tìm đường (lưới + flow field), qua cầu; chọn quân và ra lệnh | Chọn Lynx, chạm bên kia sông thì xe tự tìm cầu mà đi |
| **M3** | Chiến đấu: tự nhắm, bắn đất/không, đạn bay, máu, nổ | 2 nhóm quân đánh nhau ra kết quả hợp lý |
| **M4** | Kinh tế: chiếm mỏ và giàn Dầu, Xe Vận Tải chở 2 loại, HQ đúc xe | Sắt và Dầu tăng đúng theo số mỏ và số xe |
| **M5** | Xây công trình, hàng chờ sản xuất, điểm tập kết; **3 điều kiện thắng** | Xây Xưởng Xe, đúc Titan, thắng được bằng cả 3 cách |
| **M6** | Không quân: Sân Đáp, cất và hạ cánh, nhiên liệu tiêu hao Dầu | Falcon xuất kích, tự về nạp, kho Dầu cạn thì nằm sân |
| **M7** | Sương mù chiến tranh | Không thấy quân địch ngoài tầm nhìn |
| **M8** | AI, chế độ AI đấu AI, chạy không giao diện | AI tự chơi trọn trận và có lúc thắng được người |
| **M9** | Hoàn thiện: HUD, minimap, cảnh báo, âm thanh, màn thắng/thua, đăng GitHub Pages | Gửi link là người khác chơi được. **Sau mốc này: buổi bàn kỹ chỉ số** |

## 14. Trạng thái bản v1 (04/11/2026)

Bản v1 đã dựng đủ M0–M9 ở mức chơi được (chưa đăng GitHub Pages vì chưa có repo):

| Mốc | Trạng thái | Ghi chú |
|---|---|---|
| M0 Lõi sim tất định | ✅ | Kiểm thử băm: cùng seed + lệnh → cùng mã băm |
| M1 Bản đồ, camera | ✅ | Chạm + chuột, xoay / nghiêng / thu phóng |
| M2 Di chuyển | ✅ | A* + kéo thẳng đường, qua cầu / bãi cạn, đội hình |
| M3 Chiến đấu | ✅ | Đạn bay theo thời gian, nổ lan, đất / không |
| M4 Kinh tế | ✅ | Chiếm mỏ, Xe Vận Tải chở Sắt / Dầu |
| M5 Công trình, 3 điều kiện thắng | ✅ | Đặt có bóng mờ xanh / đỏ, hàng chờ, tập kết, bán |
| M6 Không quân | ✅ | Cất / hạ cánh, đốt dầu, tự về sân, nạp trừ kho Dầu, rơi khi cạn |
| M7 Sương mù | ✅ | Bản đơn giản; AI cũng bị che |
| M8 AI, AI đấu AI | ✅ | Xem trực tiếp (×1 / ×2 / ×4) và chạy không giao diện |
| M9 Hoàn thiện | 🟨 | HUD, minimap, cảnh báo, âm thanh, màn kết thúc ✅ — đăng web ⬜ |

**Phát hiện từ máy giả lập (dữ liệu cho buổi bàn chỉ số):** 10 trận AI đấu AI đều kết thúc trong 3–8 phút, đa số bằng **độc quyền tài nguyên** (giàn Dầu đổi chủ liên tục; 30 giây là ngắn). Dầu dư (chỉ máy bay dùng) trong khi Sắt luôn cạn.

## 15. Điện (thêm sau bản chơi thử, 04/11/2026)

Người dùng chọn: **mô hình kết hợp** (tổng điện toàn phe + Cột Điện kéo vùng xây), **Nhà Máy Điện đốt Dầu**, và cả 4 hậu quả khi thiếu điện.

| | Thiết kế (số tạm) |
|---|---|
| Phát | Tổng Hành Dinh **+20 MW** miễn phí · **Nhà Máy Điện +40 MW**, đốt **0.4 Dầu/s**; kho Dầu cạn thì ngừng phát; có nút **Tắt máy** để tiết kiệm Dầu |
| Tiêu thụ | Xưởng Xe −10 · Sân Đáp −15 · Tháp Phòng Thủ −5 · **Trạm Radar −15** |
| Hiệu suất | `phát / tiêu thụ` (tối đa 100%), chung cho cả phe |
| Thiếu điện | Đúc quân và xây công trình chậm theo hiệu suất (trừ Nhà Máy Điện và Cột Điện) · Tháp Phòng Thủ bắn chậm, dưới 10% thì ngừng · Sân Đáp nạp dầu và sửa chậm · Radar tắt khi dưới 50% |
| Vùng xây | Chỉ **Tổng Hành Dinh (24 m), Nhà Máy Điện (18 m), Cột Điện (16 m)** mở vùng xây. Cột Điện (60 Sắt) dùng để kéo vùng xây ra xa, xây được Tháp Phòng Thủ cạnh mỏ xa |
| Trạm Radar | 200 Sắt, nhìn xuyên sương mù bán kính 55 m khi đủ điện |

Vì sao đốt Dầu: máy giả lập cho thấy Dầu dư trong khi Sắt cạn. Đốt Dầu để phát điện biến giàn Dầu thành mạch sống của cả căn cứ, không chỉ của không quân.

**Phát hiện mới từ máy giả lập:** khi Dầu quý hơn, các trận AI đấu AI còn ngắn hơn (1.8–3.7 phút), gần như toàn bộ kết thúc bằng **độc quyền Dầu**. Cần quyết định ở buổi bàn chỉ số (xem đề xuất trong lịch sử trao đổi).

## 16. Ý tưởng chờ thực hiện (ghi lại 04/11/2026, làm ở lượt sau)

1. **Điện đốt Dầu quá hao, và chưa có cách lưu trữ điện.**
   - Vấn đề: Nhà Máy Điện đốt Dầu liên tục kể cả khi điện đang dư, nên Dầu bị phí. Ngoài nút Tắt máy thì chưa có gì để "để dành" phần điện thừa.
   - Hướng cần thiết kế: một công trình **lưu trữ điện** (ví dụ Trạm Tích Điện / pin), nạp từ phần điện dư và xả ra khi thiếu. Cần chốt:
     - Dung lượng mỗi trạm (MWh), tốc độ nạp và xả.
     - Khi nào xả: tự động khi hiệu suất dưới 100%, hay người chơi bấm?
     - Nhà Máy Điện có tự giảm công suất (đốt ít Dầu hơn) khi pin đã đầy và điện đang dư không?
     - Điện lưu trữ có dùng được cho việc gì đặc biệt không (ví dụ kỹ năng của Xe Tư Lệnh, tháp EMP sau MVP)?
2. **Mỗi phe có một giàn Dầu gần nhà, trữ lượng nhỏ.**
   - Giống mỏ Sắt nhà: có sẵn từ đầu trận, đủ để khởi động điện và máy bay, nhưng cạn sớm, nên vẫn phải ra tranh giàn Dầu giữa bản đồ.
   - Ảnh hưởng tới luật độc quyền: tổng số giàn Dầu tăng từ 3 lên 5. Độc quyền Dầu sẽ phải chiếm cả giàn nhà của địch, nên khó hơn nhiều. Việc này cũng giải luôn phần nào vấn đề "độc quyền Dầu thắng quá sớm".
3. **Chờ quyết: độc quyền Dầu thắng quá sớm** (trận AI đấu AI kết thúc sau 2–4 phút). Các hướng: chỉ tính sau phút 8–10 · giữ 60–90 giây · thêm giàn Dầu (ý 2 ở trên) · mỏ mới chiếm cần 20 giây ổn định.

## 17. Định hướng: quản lý cấp sư đoàn, trận không quá 20 phút (ghi lại 04/11/2026, bàn tiếp ở lượt sau)

Người dùng có một bản thiết kế game đầu tiên (`Docs/REF_ARTOFWAR_GDD_MASTER.md`): RTS quản lý **cấp sư đoàn**, trận dài hơn 20 phút, chưa từng được làm. Người dùng **vẫn muốn đi theo hướng quản lý sư đoàn**, nhưng tối ưu để **một trận không quá 20 phút**.

### Bài toán cần giải
Quản lý sư đoàn tự nhiên kéo trận dài: nhiều quân, nhiều tầng hậu cần, xây dựng chậm. Muốn gói trong ≤ 20 phút thì phải:
- **Đúc theo lô / điều theo đội** thay vì từng xe, để người chơi ra lệnh ít mà quân vẫn đông. Cần chốt cỡ lô hợp với điện thoại.
- **Tự động hóa hậu cần:** mạng kho và ray tự tiếp tế, người chơi chỉ quy hoạch tuyến, không vi quản lý từng xe.
- **Nhịp kinh tế nhanh hơn**, mỏ hữu hạn để trận tự dồn về trận đánh cuối.
- **Đo bằng máy giả lập** (`npm run simulate`): mục tiêu mở màn ~3 phút, giữa trận ~8–12 phút, kết thúc trước phút 20.

### Ý tưởng nên mang sang từ bản thiết kế cũ
| Ý tưởng | Hướng áp dụng cho Iron Sky |
|---|---|
| Kho Mỏ tạm (Local Buffer) | Mỏ tích tài nguyên tại chỗ; chưa chở về thì chưa là của mình; địch chiếm mỏ thì lấy luôn phần đang tích |
| Thùng hàng rơi khi xe vận tải bị phá (70% nhặt được) | Xe Vận Tải chết thì rơi thùng Sắt/Dầu, ai chạm trước thì nhặt |
| Tàu hỏa không tốn dầu, chở nhiều, ray trúng bom thì phanh và tự sửa 5 giây | Xương sống của hệ thống ray (hướng B ở lượt bàn trước): Ga Tàu ở mỏ, ray tự dò đường về Tổng Hành Dinh, **chạy bằng điện** |
| Tụ điện nội bộ + ưu tiên cấp điện | Trả lời mục 16.1: pin nạp chậm từ điện dư; hạ tầng thiết yếu được cấp điện trước |
| Mạng Kho liên kết tự động | Sân Đáp và tháp đứng gần mạng kho / ray thì tự rút Dầu và đạn |
| 2 giây "tử thần" khi máy bay cất và hạ cánh | Máy bay đang cất/hạ cánh là mục tiêu mặt đất |
| Ma trận Giáp × Đạn 3×3 | Thay cho bảng khắc chế rời rạc hiện nay: gọn và dễ nhớ trên điện thoại |

### Nên bỏ hoặc để rất xa sau
- 5 tầng không gian: chỉ giữ ý đồi che tầm nhìn và cộng tầm bắn.
- Vàng và Thương Hội quy đổi: Sắt, Dầu, Điện đã đủ.
- Hải quân, tàu ngầm, hạt nhân, tên lửa quỹ đạo.
- Thắng khi đạt 2/3 điều kiện: Iron Sky giữ "đạt 1 trong 3".
- Hết dầu thì máy bay tự nổ: Iron Sky đã đổi sang dầu dự trữ đủ bay về.

### Câu hỏi để bàn ở lượt sau
1. **Cỡ lô:** đúc và điều theo đội bao nhiêu xe (3? 5?) để vừa màn hình điện thoại? Có giữ "Mất chỉ huy" khi đội còn quá ít xe không?
2. **Giới hạn quân:** hiện là 40 xe; quy mô sư đoàn có cần nâng không, và máy yếu có chịu nổi không?
3. **Đạn:** có đưa thanh đạn riêng cho từng xe (hết đạn thì ngừng bắn, chờ tiếp tế) vào không, hay chỉ áp dụng cho tháp phòng thủ?
4. **Ray:** chốt lại theo hướng tàu hỏa ở trên; người chơi kéo ray hay ray tự nối?
5. **Nhịp 20 phút:** giữ 3 điều kiện thắng hiện tại; độc quyền Dầu sửa theo mục 16.3.
