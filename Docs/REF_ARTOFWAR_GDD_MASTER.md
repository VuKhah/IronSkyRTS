> **Tài liệu tham chiếu** (bản sao ngày 04/11/2026 từ `SeconeGame_ArtOfWar/Ideas/GameDesignDocument_Master.md`, không sửa nội dung).
> Đây là ý tưởng game đầu tiên của người dùng: RTS quản lý **cấp sư đoàn**, trận dài hơn 20 phút, chưa từng được làm.
> Iron Sky giữ **hướng quản lý sư đoàn** nhưng tối ưu để **một trận không quá 20 phút**. Xem phân tích ở `Docs/MVP_DESIGN.md` mục 17.

# TÀI LIỆU THIẾT KẾ GAME - BẢN TỔNG HỢP (MASTER)
## ĐẠI CHIẾN KHÔNG BINH: SƯ ĐOÀN KHÉP KÍN (DIVISION-SCALE HARDCORE RTS)

> File này là **nguồn tham chiếu duy nhất** cho toàn bộ dự án — mọi ghi chú rời rạc trước đó đã được gộp vào đây và xóa. Nền tảng mục tiêu: **PC (Windows/Mac)**. Phong cách đồ họa: **2.5D Isometric** (giả lập trục Z bằng kích thước sprite + bóng đổ). **Thời lượng 1 trận mục tiêu: 10-30 phút.**

---

## 1. TỔNG QUAN

* **Thể loại:** RTS chuyên sâu (Hardcore), mô phỏng hậu cần (Logistics), tác chiến đa quân chủng cấp Sư đoàn (Division-scale).
* **Bối cảnh:** Chiến tranh hiện đại giả tưởng — quản lý tài nguyên vi mô + vĩ mô, chuỗi cung ứng có thể đứt gãy, phòng thủ - tác chiến không quân là trọng tâm.
* **Vòng lặp cốt lõi:** Chiếm mỏ / khai thác tài nguyên → sản xuất quân theo lô (sư đoàn) → vận hành logistics (đạn, dầu, điện) → tấn công/phòng thủ → mở rộng bản đồ.

---

## 2. HỆ THỐNG ĐỊA HÌNH & KHÔNG GIAN 5 TẦNG

| Tầng | Tên | Đơn vị hoạt động | Quy luật đặc biệt |
| :--- | :--- | :--- | :--- |
| **5** | Không trung cao | Tiêm kích, Ném bom, Vận tải | Trạng thái hành quân mặc định Không quân. +35% né đạn tự nhiên. Miễn nhiễm vũ khí tầm ngắn mặt đất (Flak, tiểu liên). Không tấn công đất trực tiếp được — phải bổ nhào xuống Tầng 3. |
| **4** | Quỹ đạo thấp | Tên lửa hành trình, tên lửa hạt nhân, UAV cao cấp | Không bị pháo thường bắn hạ, chỉ bị đánh chặn bởi Tháp Tên Lửa Chống Đạn chuyên dụng. |
| **3** | Núi cao / Không trung thấp | Pháo nặng (đặt cố định), bộ binh leo núi, Không quân bổ nhào xả đạn | Né đạn máy bay = 0%. Pháo trên núi Tầng 3: +20% tầm bắn, bắn khuất tầm nhìn (góc mù) đối với quân Tầng 2. |
| **2** | Mặt đất & mặt nước | Tăng, bộ binh, chiến hạm, tàu sân bay | Địa hình cơ bản chứa tài nguyên. Rừng rậm che giấu hoàn toàn bộ binh khỏi Tầng 5 (máy bay phải bổ nhào xuống Tầng 3 mới thấy). |
| **1** | Dưới mặt nước | Tàu ngầm hạt nhân | Ẩn mình tuyệt đối, chỉ bị lộ bởi Sonar của Chiến hạm Tầng 2, hoặc khi tự nổi lên khai hỏa hạt nhân. |

### 2.1. Loại địa hình trên bản đồ (mặt phẳng, Tầng 2)

* **Thảo nguyên:** Không che chắn, tăng tốc độ di chuyển.
* **Rừng tự nhiên:** Ẩn bộ binh khỏi không kích từ Tầng 5 (phải bổ nhào Tầng 3 mới phát hiện).
* **Núi tự nhiên:** Hạn chế di chuyển của Không quân; đóng vai trò **khiên tự nhiên** che chắn quân đội đứng sau núi; tạo **lối đi tự nhiên** riêng cho bộ binh (đường mòn núi mà xe/tăng không đi được); là bệ pháo cho Pháo nặng (+20% tầm bắn, góc bắn mù).
* **Đầm lầy:** Hạn chế sức tác chiến / tốc độ của Bộ binh khi di chuyển qua.
* **Biển, sông:** Vùng di chuyển của tàu chiến (Tầng 2) và tàu ngầm (Tầng 1).

*(Số liệu cụ thể cho Đầm lầy và Núi "khiên tự nhiên" vẫn chưa được định lượng — xem mục 10.)*

---

## 3. TÀI NGUYÊN & LOGISTICS

### 3.1. Bốn loại tài nguyên

1. **Vàng:** Tài nguyên vĩ mô — mua/huấn luyện toàn bộ đơn vị quân. Nguồn: Mỏ Vàng (chiếm đóng), quy đổi tại Thương Hội, và "Máy sản xuất" (**chưa định nghĩa rõ — xem mục 10**).
2. **Sắt:** Tài nguyên kép — vừa xây kết cấu cơ giới (nhà, xe, máy bay) vừa được "đóng gói" tại Nhà Kho thành Thùng đạn tiếp tế.
3. **Dầu:** Tài nguyên động cơ, tiêu hao theo thời gian khi đơn vị di chuyển; hệ số hao dầu khác nhau theo từng loại đơn vị.
4. **Điện:** Cấp bởi Lò Phản Ứng Hạt Nhân, nuôi toàn bộ Nhà máy sản xuất và các Tháp phòng thủ công nghệ cao.

### 3.2. Quy tắc Dầu & Đạn

* Mỗi đơn vị cơ giới có **Thanh Dầu riêng (Local Fuel Bar)**. Kho toàn cục cạn dầu không làm đơn vị dừng ngay — chỉ ngừng được tiếp dầu, tạo áp lực dây chuyền.
* **Hết Dầu nội tại:** giảm ngay 80% tốc độ di chuyển, khóa "Gia tốc".
* **Hết Đạn nội tại:** ngừng bắn, đứng chịu trận tới khi được tiếp tế.

### 3.3. Chiếm đóng mỏ & cướp bóc

* Bộ binh chiếm Mỏ Vàng/Sắt (30-60s tùy loại) → tài nguyên tích lũy dần vào **Kho Mỏ (Local Buffer)**. Rút quân → mỏ về trạng thái Bỏ hoang.
* Tài nguyên tại Kho Mỏ chưa chở về căn cứ = **chưa thuộc sở hữu thật** — địch chiếm được Kho Mỏ thì người chơi mất trắng.
* **Cướp Thùng Hàng (đường bộ/biển):** xe/tàu vận tải bị phá hủy → 70% tài nguyên rơi ra có thể bị nhặt (kể cả bởi địch), 30% mất do nổ.
* **Ngoại lệ Không quân:** máy bay vận tải bị bắn rơi → thùng hàng rơi nguyên vẹn xuống Tầng 2/3, ai nhặt trước nhận 100%.

### 3.4. Tuyến hậu cần không tốn dầu

* **Đường ray:** Tàu hỏa không tốn dầu, máu cao, sức chở khổng lồ. Ray bị bom trúng → tàu tự phanh, tự sửa trong 5s (không cần Engineer), sau đó khởi động lại từ vận tốc 0.
* **Hải trình:** người chơi có thể tự vẽ tuyến để né tàu ngầm địch; nếu không vẽ, AI tự tìm đường ngắn nhất.

### 3.5. Mạng lưới Kho liên kết tự động

Nhiều Kho xây gần nhau tự động liên kết chia sẻ tài nguyên. Sân bay/Tháp phòng thủ cạnh mạng lưới tự rút Sắt/Dầu mà không cần thao tác thủ công.

---

## 4. QUY TẮC ĐIỀU KHIỂN SƯ ĐOÀN

* Không quân: sản xuất & quản lý theo **lô 3 chiếc**.
* Lục quân: sản xuất & di chuyển đồng bộ theo **lô 5 chiếc**. Dưới 3 chiếc còn sống → **Mất chỉ huy** (AI tự rút lui, từ chối lệnh mới).
* Hải quân: hoạt động **đơn lẻ** (Tàu ngầm, Siêu tàu sân bay: 1 chiếc/lệnh sản xuất) trừ Tuần dương (lô 2 chiếc).
* **Chưa có ngưỡng "Mất chỉ huy" cho Không quân và Hải quân** — xem mục 10.

---

## 5. MA TRẬN ĐƠN VỊ TÁC CHIẾN

### 5.1. KHÔNG QUÂN (lô 3 chiếc, hành quân mặc định Tầng 5, bổ nhào Tầng 3 để đánh đất, mất 1.5s bổ nhào)

| Đơn vị | Chi phí (lô 3) | Giáp | Dầu | Vũ khí |
| :--- | :--- | :--- | :--- | :--- |
| Tiêm kích Đánh chặn & Hỗ trợ | 650V / 450S | I | 120/chiếc, 1.0/s | 6 loạt tên lửa tầm nhiệt (đối không, Tầng 5); 1 cụm Pháo Gatling Đạn I (đối đất, Tầng 3). "Gia tốc khẩn cấp" né tên lửa (tốn 5 dầu). |
| Pháo Đài Bay Ném Bom Hạng Nặng | 1000V / 950S | II | 200/chiếc, 2.0/s | 6 loạt Bom rải thảm Đạn III (AOE). Không có vũ khí tự vệ đối không. Chậm, quán tính lớn. |
| Máy Bay Vận Tải Vũ Trang | 450V / 550S | I | 180/chiếc | Chở tối đa 3 thùng hàng. Tự vệ: 2 loạt tên lửa tầm ngắn + 1 súng máy đuôi. AI tiếp tế tự động, không rời tuyến để truy đuổi địch. |

### 5.2. LỤC QUÂN (lô 5 chiếc, Tầng 2)

| Đơn vị | Chi phí (lô 5) | Giáp | Dầu | Vũ khí |
| :--- | :--- | :--- | :--- | :--- |
| Sư đoàn Tăng Nặng | 750V / 850S | II | 150/xe, 1.5/s | Đạn II xuyên giáp, 20 viên/xe. Đơn vị càn quét chủ lực. |
| Sư đoàn Pháo Nặng | 1000V / 750S | II | 100/xe, 2.0/s | Đạn III phá công trình, 10 viên/xe. +20% tầm bắn & góc bắn mù khi đặt trên Núi (Tầng 3). |
| Xe Tên Lửa Loạt | 800V / 800S | I | 110/xe, 1.0/s | Đạn III AOE diện rộng, 15 loạt. Khắc chế cụm phòng thủ tĩnh & bộ binh đông. |
| Xe Hỏa Tiễn Phòng Không (SAM/Flak di động) | 650V / 800S | I | 120/xe, 1.0/s | Tên lửa bám đuôi (đối không Tầng 5) + Flak (đối không Tầng 3). 30 loạt tổng. |
| Xe Tải Vận Tải | 300V / 450S | I | 90/xe, 0.5/s | Trung chuyển tài nguyên. Nổ → 70% loot cho kẻ nhặt, 30% mất. |
| Bộ Binh Cơ Bản (lô 10 lính) | 150V / 0S | I | 0 (không tốn dầu) | Đi bộ chậm nhất game. Duy nhất có thể chiếm Mỏ. Ẩn trong Rừng khỏi Tầng 5. |

### 5.3. HẢI QUÂN (hoạt động đơn lẻ, trừ Tuần dương lô 2)

| Đơn vị | Chi phí | Giáp | Dầu | Vũ khí |
| :--- | :--- | :--- | :--- | :--- |
| Tàu Ngầm Hạt Nhân | 600V / 500S | II | 300, 0.5/s | Ngư lôi (Tầng 1). Tên lửa Hạt nhân (Tầng 4) — phải nổi lên Tầng 2 trong 5s, lộ diện hoàn toàn khi bắn. |
| Siêu Tàu Sân Bay | 1500V / 1800S | III | rất chậm | Căn cứ nổi: 6 Slot đỗ máy bay, tự sửa/tiếp dầu-đạn. 4 súng máy tự vệ đối không tầm ngắn. |
| Chiến Hạm Tuần Dương (lô 2) | 900V / 1100S | II | 250/chiếc, 2.5/s | Pháo hạm Đạn II tầm xa. Sonar quét Tầng 1 (phát hiện tàu ngầm địch). |

---

## 6. CÔNG TRÌNH & CÔNG SỰ

*Mọi công trình mặc định Giáp III, tĩnh, không tốn dầu, tốn Điện, tự nạp đạn từ Kho liên kết.*

**Hạ tầng kinh tế (tự xây):** Tòa Nhà Tư Lệnh (HQ) · Lò Phản Ứng Hạt Nhân (+200 Điện, sập → đóng băng sản xuất + giảm 50% tốc nạp/quay nòng phòng không) · Nhà Máy Không/Lục/Hải Quân (500V/500S, 30 Điện) · Kho Chứa Tiếp Vận (200V/300S, 10 Điện, tự liên kết mạng lưới) · Giàn Khoan Dầu (300V/400S, 40 Điện) · Thương Hội Quốc Tế (400V/400S, 20 Điện, quy đổi chéo tài nguyên theo tỷ giá thị trường).

**Phòng thủ & tháp năng lượng (tự xây):**
* Tháp Pháo Cao Xạ Flak — 300V/500S, 20 Điện. AOE Tầng 3/5, hạ 1 máy bay → hồi 20 viên đạn.
* Trận Địa SAM Tầm Xa — 500V/700S, 40 Điện. Tầng 5/4, homing hoặc prediction.
* Tháp Tên Lửa Chống Đạn — 600V/800S, 60 Điện. Chuyên đánh chặn Tầng 4 (tên lửa hành trình/hạt nhân).
* Tháp Phát Trường Lực (Shield) — 700V/900S, duy trì 50 Điện, sạc lại tốn 100 Điện/s trong 10s khi vỡ khiên.
* Tháp Pháo Năng Lượng (Plasma/Laser) — 900V/1200S, 150 Điện/phát, xuyên mọi giáp, hồi 15s/phát.
* Đường Băng Khẩn Cấp Dã Chiến — 200V/300S, 10 Điện, 3 slot đỗ.
* Tường Thành Kiên Cố — 50S/đoạn, chặn đường tạo choke-point.

**Địa hình cố định (chỉ chiếm đóng, không tự xây):**
* Mỏ Vàng/Sắt hoang — cơ chế như mục 3.3.
* Di Tích Cổ — giảm phí quy đổi Thương Hội + mở khóa quy đổi tài nguyên ngay không cần xây Thương Hội.
* Tòa Nhà Thánh — chọn 1 Buff toàn cục: (A) +10% tốc hồi/truyền đạn từ mạng lưới Kho; (B) +15% gia tốc & bẻ lái cho Không quân. (Có thể còn Buff khác chưa viết — xem mục 10.)

---

## 7. CƠ CHẾ KHÔNG QUÂN NÂNG CAO

* **Vật lý bay:** không đứng im/bẻ góc vuông, phải bay theo cung tròn; gia tốc càng cao, bán kính cua càng lớn.
* **Vòng lặp bổ nhào:** hành quân Tầng 5 → tăng tốc, thu hẹp bán kính cua → bổ nhào Tầng 3 → xả vũ khí → bay vòng rộng lấy lại thăng bằng → leo lại Tầng 5.
* **Slot ID:** mỗi máy bay gắn cố định vào 1 slot của Sân bay/Tàu sân bay chủ quản. Hết slot ở mọi sân bay → lô máy bay mới kẹt trong Nhà máy, tự AI quét slot trống, người chơi không thể can thiệp.
* **Đường băng cố định hướng:** cất/hạ cánh phải đúng hướng hình chữ nhật của đường băng. **2 giây tử thần** cho mỗi lần cất/hạ cánh — không né được.
* **Sân bay bị phá:** máy bay đang bay → "Mất định vị", bay vòng tới cạn dầu rồi tự nổ. Máy bay đang đỗ sống sót → "Di cư khẩn cấp" (0% tốn dầu, chậm, khóa chiến đấu, chỉ đi trên đất phẳng) tìm sân bay mới; hết chỗ → báo động đỏ, người chơi phải tự dời.
* **Đường băng dã chiến:** không cần công trình kiên cố, chỉ cần AI quét được 1 vùng phẳng đủ rộng (Thảo nguyên, Thung lũng).

---

## 8. MA TRẬN CHIẾN ĐẤU (GIÁP x ĐẠN)

| Giáp \ Đạn | Đạn I (Thường) | Đạn II (Xuyên giáp) | Đạn III (Nổ/AOE) |
| :--- | :---: | :---: | :---: |
| **I — Nhẹ** | 100% | 50% | 150% |
| **II — Chống xuyên** | 30% | 100% | 80% |
| **III — Chống nổ** | 10% | 150% | 50% |

**Cơ chế đạn phòng không:**
* Tên lửa tầm nhiệt (homing) — mất khóa nếu máy bay bo cua gắt hơn góc quay tối đa của tên lửa.
* Tên lửa đón đầu (prediction) — khắc chế bằng đổi hướng đột ngột trước khi đạn tới.
* Flak — AOE dày đặc Tầng 3/5, khắc bomber chậm.

---

## 9. ĐIỀU KIỆN THẮNG / THUA (2 trên 3)

Thua khi đáp ứng đồng thời **≥2/3** tiêu chí:
1. **Mất Tư Lệnh** — HQ bị phá hủy.
2. **Mất Điện Toàn Cục** — tất cả Lò Phản Ứng sập, Điện ≤ 0 → đóng băng sản xuất, giảm 50% tốc nạp/quay nòng phòng không.
3. **Phá Sản Tài Nguyên** — mất toàn bộ Nhà Sản Xuất + Thương Hội + quyền kiểm soát Di Tích (không còn cách tạo/quy đổi Vàng).

---

## 10. DANH SÁCH THỰC THỂ (ENTITIES CATALOG)

**Đơn vị quân sự:** Tiêm Kích Đánh Chặn & Hỗ Trợ · Pháo Đài Bay Ném Bom Hạng Nặng · Máy Bay Vận Tải Vũ Trang · Tăng Nặng · Pháo Nặng · Xe Tên Lửa Loạt · Xe Hỏa Tiễn Phòng Không di động · Xe Tải Vận Tải · Bộ Binh Cơ Bản · Tàu Ngầm Hạt Nhân · Siêu Tàu Sân Bay · Chiến Hạm Tuần Dương · Tàu Hỏa Vận Tải.

**Công trình tự xây — kinh tế/hạ tầng:** Tòa Nhà Tư Lệnh (HQ) · Lò Phản Ứng Hạt Nhân · Nhà Máy Không Quân · Nhà Máy Lục Quân · Nhà Máy Hải Quân · Kho Chứa Tài Nguyên Tiếp Vận · Giàn Khoan Dầu · Tòa Nhà Thương Hội Quốc Tế · Ga Tàu + đoạn Đường Ray.

**Công trình tự xây — phòng thủ:** Tháp Pháo Cao Xạ Flak · Trận Địa SAM Tầm Xa · Tháp Tên Lửa Chống Đạn · Tháp Phát Trường Lực · Tháp Pháo Năng Lượng (Plasma/Laser) · Đường Băng Khẩn Cấp Dã Chiến · Tường Thành Kiên Cố.

**Công trình địa hình — chỉ chiếm đóng:** Mỏ Vàng hoang · Mỏ Sắt hoang · Di Tích Cổ Thần Bí · Tòa Nhà Thánh Lộ Thiên.

**Địa hình bản đồ:** Thảo Nguyên · Rừng Tự Nhiên · Núi Tự Nhiên · Đầm Lầy · Biển/Sông · 5 tầng độ cao bao trùm toàn bản đồ.

**Tài nguyên:** Vàng · Sắt · Dầu · Điện.

**Đối tượng/thực thể phụ trợ:** Thùng Hàng Vận Tải (rơi ra khi bị phá, có thể bị cướp) · Kho Mỏ tại chỗ (Local Buffer) · Slot ID đỗ máy bay · Mạng Lưới Kho Liên Kết (Supply Network) · Khiên năng lượng (thanh HP riêng của Trường Lực).

**Phân loại trừu tượng (áp lên mọi thực thể chiến đấu):** 3 loại Giáp (I Nhẹ / II Chống xuyên / III Chống nổ) · 3 loại Đạn (I Thường / II Xuyên giáp / III Nổ-AOE) · 5 mức Tầm bắn.

*(Danh sách này sẽ tiếp tục bổ sung nếu nghĩ ra thực thể mới — hiện tại chưa có: anh hùng/chỉ huy, hệ thống nâng cấp công nghệ, vật cản môi trường như xác xe cháy.)*

---

## 11. VẤN ĐỀ ĐANG MỞ / CẦN QUYẾT ĐỊNH (TBD)

1. **Thời lượng trận 10-30 phút** — đã chốt mục tiêu này, nhưng nhịp độ kinh tế/sản xuất trong tài liệu (chi phí, tốc độ khai thác) chưa được tính lại cho phù hợp với khung thời gian ngắn này. Cần thiết kế lại tốc độ khai thác tài nguyên, chi phí, và thời gian sản xuất sao cho một trận đấu diễn ra trọn vẹn (mở màn – giữa trận – kết thúc) trong 10-30 phút thay vì hàng chục phút như một RTS truyền thống kiểu Age of Empires dài hơi.
2. **"Máy sản xuất"** (nguồn tạo Vàng, nhắc trong ý tưởng gốc) — chưa có định nghĩa số liệu chính thức.
3. **Ngưỡng "Mất chỉ huy" cho Không quân và Hải quân** — chưa được định nghĩa, chỉ có cho Lục quân.
4. **Số liệu cụ thể cho Đầm lầy** (giảm bao nhiêu % tốc độ/sức chiến đấu bộ binh?) và **Núi — khiên tự nhiên** (giảm sát thương bao nhiêu %?) và **lối đi riêng cho bộ binh trên núi**.
5. **Tòa Nhà Thánh** — chỉ có 2 Buff (A, B) được viết ra, cần xác nhận có Buff khác dự kiến hay không.
6. **HP, sát thương gốc, tốc độ di chuyển, tầm bắn/tầm nhìn cụ thể, tốc độ khai thác tài nguyên, thời gian sản xuất** — hoàn toàn chưa có số liệu chính thức. Từng thử một bộ baseline suy từ công thức chi phí nhưng **cần làm lại sau khi chốt được nhịp độ 10-30 phút/trận** (mục 1), vì baseline cũ giả định trận đấu dài hơi hơn.
7. **Hệ thống Điện năng** — mô hình kỹ thuật đã thống nhất theo hướng: Điện là tài nguyên bị trừ trực tiếp, nhưng vũ khí tốn điện lớn (Plasma, Trường Lực) dùng **tụ điện nội bộ nạp chậm liên tục từ lưới** thay vì rút một cục lớn tức thời, và hạ tầng thiết yếu luôn được ưu tiên cấp điện trước — để tránh 1 khẩu súng làm sập cả căn cứ. Ngân sách điện (công suất Lò Phản Ứng, chi phí điện của từng công trình) cần tính lại theo số liệu HP/sát thương mới ở mục 6.
8. **Phạm vi/khung game khác:** kích thước bản đồ, số người chơi/trận, hành vi AI đối thủ, có hệ thống công nghệ/nâng cấp hay không, camera/điều khiển/UI.
