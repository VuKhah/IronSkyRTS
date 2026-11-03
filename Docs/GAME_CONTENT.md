# NỘI DUNG GAME CHI TIẾT — IRON SKY: TƯ LỆNH CHIẾN THUẬT & HẬU CẦN 2.5D

Tài liệu này tổng hợp **toàn bộ nội dung, bối cảnh, binh chủng, kỹ năng, công trình, tài nguyên và thông số cân bằng** đang vận hành thực tế trong mã nguồn (`Assets/Scripts/Core/RTSTypes.cs`, `BattlefieldMap.cs`, `TacticalBuilding.cs`, `RTSGameManager.cs`). Dùng làm chuẩn tham chiếu nội dung cho các phiên phát triển và cân bằng tiếp theo.

---

## 1. Bối Cảnh Thế Giới & Hai Thế Lực Đối Đầu

### Bối cảnh chiến dịch: *Thung Lũng Sông Sắt (Iron River Basin)*
Sau cuộc khủng hoảng năng lượng toàn cầu, các mỏ khoáng sản lộ thiên cuối cùng tập trung dọc theo lưu vực **Sông Sắt** — nơi sở hữu đồng thời 3 huyết mạch công nghiệp quân sự: **Tinh thể Vàng dẫn điện**, **Vỉa Dầu thô áp suất cao**, và **Quặng Sắt luyện giáp**. Không có hậu phương tiếp viện từ bên ngoài, mỗi Tư lệnh chỉ có tối đa **15 phút** trên chiến trường để trực tiếp điều khiển **Xe Tư Lệnh**, xây dựng mạng lưới **Điện — Đào Dầu — Đường Ray Tiếp Đạn — Sân Đáp**, và chỉ huy binh đoàn **Thiết Giáp + Không Quân** định đoạt chiến cục.

### Hai phe tham chiến
| Thuộc tính | **LIÊN MINH LAM (Người Chơi)** | **TẬP ĐOÀN ĐỎ (Tư Lệnh AI)** |
|---|---|---|
| **Màu nhận diện** | Xanh Lam Chiến Thuật (`#2E9EFF`) | Đỏ Thẫm Công Nghiệp (`#F23D3D`) |
| **Vị trí Tổng Hành Dinh** | Góc Tây Nam `(-66, 0, -66)` | Góc Đông Bắc `(66, 0, 66)` |
| **Mỏ Sắt hậu phương đầu trận** | *Mỏ Sắt Hậu Phương Lam* `(-44, 0, -54)` | *Mỏ Sắt Hậu Phương Đỏ* `(44, 0, 54)` |
| **Đặc trưng chỉ huy** | Người chơi trực tiếp điều binh, quy hoạch lưới điện, đường ray và căn thời điểm xuất kích Không quân | AI 3 cấp độ tự quy hoạch nhà máy điện/dầu, nối đường ray phòng không 3 tầng và săn lùng phá thế độc quyền mỏ |

---

## 2. Hệ Thống Kinh Tế 3 Tài Nguyên & 9 Mỏ Chiến Lược

### 2.1. Vai trò & Nguồn thu của 3 loại Tài nguyên
| Tài nguyên | Ký hiệu | Màu HUD | Vai trò chiến thuật chủ đạo | Nguồn thu thụ động & công nghiệp |
|---|---|---|---|---|
| **VÀNG (`Gold`)** | `V` | `#FFD54F` | Ngân sách chỉ huy, chế tạo Không quân tinh nhuệ (`110V–150V`), xây Tháp Phòng Không công nghệ cao (`Patriot`, `EMP`) và kích hoạt Tuyệt kỹ Tư lệnh `[Q]`, `[R]`. | • HQ gốc: **`+4 V/s`**<br>• Mỗi Tiền đồn: **`+2 V/s`**<br>• Mỗi Mỏ Vàng: **`+5 V/s`** |
| **DẦU (`Oil`)** | `D` | `#D17AF2` | **Huyết mạch sống còn của Không quân & Tăng chủ lực:** vừa tốn khi xuất xưởng, vừa **bơm trực tiếp từ kho quốc gia vào bình nhiên liệu máy bay** (`1 Dầu kho = 2.5L Dầu máy bay`) mỗi khi máy bay đáp xuống Sân Đáp! | • HQ gốc: **`+2 D/s`**<br>• Mỗi Tiền đồn: **`+1 D/s`**<br>• Mỗi Giàn Dầu: **`+5 D/s`**<br>• **Nhà Máy Đào Dầu:** **`+7 D/s`** (**`+12 D/s`** khi đặt cách Mỏ Dầu `<= 21m`!) |
| **SẮT (`Iron`)** | `S` | `#8FC7F5` | Đúc giáp chế tạo toàn bộ đội hình Thiết giáp (`75S–140S`), xây dựng hạ tầng Điện, Sân đáp, Kho đạn Đường ray, Tháp phòng không và kỹ năng Sửa chữa `[E]`. | • HQ gốc: **`+4 S/s`**<br>• Mỗi Tiền đồn: **`+2 S/s`**<br>• Mỗi Lò Luyện Sắt: **`+5 S/s`** |

### 2.2. Danh sách 9 Mỏ Tài nguyên trên Bản đồ (`CaptureRadius = 9.5m`)
> **Luật Độc Quyền (`Resource Monopoly`):** Phe nào nắm giữ đồng thời **cả 3/3 mỏ** của cùng một loại tài nguyên (Vàng, Dầu hoặc Sắt) và bảo vệ thành công suốt **45 giây** sẽ giành **Chiến thắng Tuyệt đối ngay lập tức**!

1. **Hệ thống 3 Mỏ Vàng (`Gold`):**
   - *Mỏ Vàng Nam*: `(-68, 0, -24)` — Trung lập đầu trận (gần cánh trái Liên Minh Lam).
   - *Mỏ Vàng Cao Nguyên (Tranh Chấp)*: `(-62, 0, 62)` — Nằm ngay trên cầu thượng lưu Tây Bắc.
   - *Mỏ Vàng Bắc*: `(68, 0, 24)` — Trung lập đầu trận (gần cánh phải Tập Đoàn Đỏ).
2. **Hệ thống 3 Giàn Khoan Dầu (`Oil`):**
   - *Giàn Khoan Dầu Tây*: `(-24, 0, -68)` — Trung lập đầu trận (vị trí vàng để Liên Minh Lam đặt thêm *Nhà Máy Đào Dầu* đạt `+12 Dầu/s`!).
   - *Giàn Khoan Thung Lũng (Tranh Chấp)*: `(62, 0, -62)` — Nằm ngay trên cầu hạ lưu Đông Nam.
   - *Giàn Khoan Dầu Đông*: `(24, 0, 68)` — Trung lập đầu trận (vùng mở rộng Dầu của Tập Đoàn Đỏ).
3. **Hệ thống 3 Lò Luyện Sắt (`Iron`):**
   - *Mỏ Sắt Hậu Phương Lam*: `(-44, 0, -54)` — Thuộc Liên Minh Lam ngay đầu trận.
   - *Lò Luyện Sắt Cầu Trung Tâm*: `(-16, 0, 16)` — Điểm nóng giao tranh sát trung tâm sông.
   - *Mỏ Sắt Hậu Phương Đỏ*: `(44, 0, 54)` — Thuộc Tập Đoàn Đỏ ngay đầu trận.

---

## 3. Hệ Thống 5 Căn Cứ Chiến Lược (`TacticalBase`)

| Tên Căn Cứ | Loại | Tọa độ | Chủ sở hữu đầu trận | Độ bền (`HP`) | Đặc tính Chiến thuật & Hỏa lực Tự vệ |
|---|---|---|---|---|---|
| **Tổng Hành Dinh Liên Minh** | `MainHQ` | `(-66, 0, -66)` | Liên Minh Lam | `3,600 HP` | Phát điện gốc **`+40 MW`** (`34m`), pháo kép tự vệ trên nóc, tự hồi `8 HP/s` khi sạch bóng địch. Mất HQ = Thua! |
| **Tổng Hành Dinh Tập Đoàn Đỏ** | `MainHQ` | `(66, 0, 66)` | Tập Đoàn Đỏ | `3,600 HP` | Phát điện gốc **`+40 MW`** (`34m`), pháo kép tự vệ. Bị hạ xuống `< 18% HP` có thể bị Tank đột kích chiếm nhanh. |
| **Pháo Đài Trung Tâm Alpha** | `Outpost` | `(0, 0, 0)` | Trung lập | `1,150 HP` | Khống chế cầu chính giữa bản đồ; cho phép **Xuất quân Tank trực tiếp ra tiền tuyến** + cộng `+2V +1D +2S/s`. |
| **Căn Cứ Tiền Đồn Tây Bắc** | `Outpost` | `(-34, 0, 34)` | Trung lập | `1,150 HP` | Khống chế hành lang cầu Tây Bắc dẫn sang Mỏ Vàng Cao Nguyên; có tháp pháo tự động & mở rộng vùng xây dựng (`44m`). |
| **Căn Cứ Tiền Đồn Đông Nam** | `Outpost` | `(34, 0, -34)` | Trung lập | `1,150 HP` | Khống chế hành lang cầu Đông Nam dẫn sang Giàn Khoan Thung Lũng; bàn đạp tấn công sườn HQ đối phương. |

---

## 4. Biên Chế Quân Đội: 6 Binh Chủng Tác Chiến (`UnitKind`)

### 4.1. Bảng Thông Số Chiến Đấu & Chi Phí Toàn Binh Chủng
*(Giới hạn biên chế tối đa: `30` đơn vị chiến đấu ngoài Xe Tư Lệnh; hàng đợi tối đa `6` đơn vị)*

| Binh chủng | Mã / Phím | Chi phí (`V / D / S`) | Thời gian chế tạo | Máu (`HP`) | Giáp giảm ST | Tốc độ (`m/s`) | Sát thương Đất / Không | Tầm bắn / Chu kỳ bắn | Nổ lan (`m`) | Vai trò & Đặc tính nổi bật |
|---|---|---|---|---|---|---|---|---|---|---|
| **Xe Tư Lệnh Chiến Thuật** | `CMD` (`[F1]`) | Khởi đầu (Không bán) | — | `1,350` | `25%` | `8.4` | `44` / `32` | `20.0m` / `1.05s` | `2.0m` | Hào quang `+18%` tốc bắn & hồi máu (`13.5m`), chiếm mỏ/tiền đồn **x2.2**, mở vùng xây dựng `26m`, thi triển `[Q][E][R]`. **Chết = Thua!** |
| **Thiết Giáp Trinh Sát Lynx** | `LYNX` (`[Z]`) | `50V • 20D • 75S` | `4.5s` | `340` | `8%` | `12.2` | `24` / `0` | `15.5m` / `0.65s` | `0m` | Cơ động nhanh nhất mặt đất; chuyên cướp mỏ, tập kích cắt Cột điện & Đường ray cấp đạn của địch. |
| **Xe Tăng Chủ Lực Titan** | `MBT` (`[X]`) | `90V • 65D • 140S` | `7.5s` | `720` | `24%` | `7.5` | `72` / `0` | `19.5m` / `1.55s` | `2.8m` | Giáp dày, pháo chính `120mm` sát thương nổ lan; mũi nhọn nghiền nát đội hình Tank, Tháp AA và Tổng Hành Dinh. |
| **Phòng Không Cơ Động SkyGuard** | `AA-MOB` (`[C]`) | `75V • 45D • 110S` | `6.0s` | `430` | `12%` | `8.8` | `16` / `56` | `26.5m` / `0.90s` | `1.5m` | Tên lửa phòng không tự hành không phụ thuộc lưới điện; đi kèm bảo vệ đoàn Tank khi tiến công xa căn cứ. |
| **Tiêm Kích Đa Nhiệm Falcon** | `JET` (`[N]`) | `110V • 65D • 45S` | `6.5s` | `360` | `8%` | `22.5` *(min `14.5`)* | `38` / `68` | `27.0m` / `0.55s` | `1.8m` | Khắc chế cứng Cường kích địch trên không & bổ nhào bắn tên lửa xuống đất. Độ cao bay `12.5m`, khoang đạn `6` loạt. |
| **Cường Kích Ném Bom Valkyrie** | `BOMB` (`[M]`) | `150V • 90D • 80S` | `9.0s` | `580` | `16%` | `16.8` *(min `11.5`)* | `98` / `0` | `23.0m` / `0.42s` | `4.6m` | Pháo đài bay độ cao `15.0m`, rải chuỗi `3` quả bom parabol hủy diệt cụm Tăng Titan, Nhà máy Điện & Kho đạn địch. |

### 4.2. Thông Số Nhiên Liệu Dầu & Khí Động Học Của Không Quân
| Chỉ số Không quân | **Tiêm Kích Falcon (`StrikeFighter`)** | **Cường Kích Valkyrie (`HeavyBomber`)** |
|---|---|---|
| **Dung tích Bình Dầu trên máy bay (`maxFuelOil`)** | **`65.0 Lít`** | **`95.0 Lít`** |
| **Ngưỡng Dầu tối thiểu để được phép cất cánh** | **`35%`** (`>= 22.8L`) | **`35%`** (`>= 33.3L`) |
| **Tốc độ trừ Dầu khi bay tuần tiễu (`fuelBurnPerSec`)** | **`1.05 L/giây`** (~62 giây bay tối đa) | **`1.40 L/giây`** (~68 giây bay tối đa) |
| **Hệ số đốt Dầu khi Không chiến / Bật tăng lực thoát ly** | `x1.32` (`1.39 L/giây`) | `x1.32` (`1.85 L/giây`) |
| **Hệ số đốt Dầu khi giảm độ cao hạ cánh (`LandingApproach`)** | `x0.55` (`0.58 L/giây`) | `x0.55` (`0.77 L/giây`) |
| **Ngưỡng Bingo Fuel (Tự động rút về Sân Đáp tiếp Dầu)** | **`<= 24%`** | **`<= 24%`** |
| **Tỷ lệ bơm Dầu từ Kho quốc gia tại Sân Đáp** | `1 Dầu kho = 2.5L Dầu máy bay` | `1 Dầu kho = 2.5L Dầu máy bay` |
| **Tốc độ góc ngoặt tối đa (`maxTurnRateDeg`)** | `112 độ/giây` (nghiêng cánh linh hoạt) | `76 độ/giây` (đầm chắc, bán kính vòng lượn `18.5m`) |

---

## 5. Kỹ Năng Tư Lệnh & Học Thuyết Tác Chiến

### 5.1. 3 Tuyệt Kỹ Chủ Động Của Xe Tư Lệnh
*(Yêu cầu Xe Tư Lệnh còn sống trên chiến trường)*

| Phím | Tên Tuyệt Kỹ | Chi phí | Hồi chiêu | Bán kính | Hiệu ứng Chiến thuật |
|---|---|---|---|---|---|
| **`[Q]`** | **Quét Radar Khóa Mục Tiêu** (`RadarLock`) | `55 Vàng` | `16s` | `18.0m` | Đánh dấu toàn bộ quân địch trong vùng suốt **11 giây**, khiến chúng nhận thêm **`+25%` sát thương** từ mọi đòn bắn và bị Patriot SAM ưu tiên khóa bắn. |
| **`[E]`** | **Sửa Chữa & Khiên Xung Kích** (`OverdriveRepair`) | `35 Dầu • 55 Sắt` | `22s` | `14.0m` | Hồi ngay **`165 HP`** cho quân đồng minh + **`200 HP`** cho Công trình đồng minh trong vùng; đồng thời kích hoạt Khiên Xung Kích **8.5 giây** (`-30%` sát thương nhận vào, `+22%` tốc chạy, `+12%` tốc bắn). |
| **`[R]`** | **Pháo Kích Tọa Độ Hạng Nặng** (`ArtilleryBarrage`) | `85 Vàng • 60 Dầu` | `28s` | `11.5m` | Gọi đợt pháo kích dồn dập **6 quả đạn pháo hạng nặng** giáng xuống vùng chỉ định (`145` sát thương nổ lan mỗi quả), phá tan cụm phòng không và xe tăng địch. |

### 5.2. 3 Học Thuyết Tác Chiến (`TacticalDoctrine`)
1. **Cân Bằng (`Balanced`):** Duy trì tốc độ, giáp và quỹ đạo công kích tiêu chuẩn.
2. **Xung Kích (`Blitz`):** Tăng **`+18%` tốc độ di chuyển/bay**, **`+10%` tốc độ bắn**, đổi lại nhận thêm `+10%` sát thương — lý tưởng khi đua chiếm Mỏ hoặc truy kích Xe Tư Lệnh địch.
3. **Phòng Ngự / Né Phòng Không (`Fortify`):**
   - *Với Thiết giáp mặt đất:* Giảm **`-22%` sát thương nhận vào**, tốc độ di chuyển `x0.88` để giữ vững cứ điểm.
   - *Với Không quân:* Ưu tiên **mở rộng cung vòng sườn né tâm hỏa lực phòng không địch** trước khi bổ nhào.

---

## 6. Hệ Thống 8 Công Trình Hậu Cần, Năng Lượng & Phòng Không (`BuildingKind`)

*(Mở bảng xây dựng bằng phím **`[F4]`**; giữ `Shift` khi click đặt để xây liên tiếp nhiều công trình)*

| Công trình | Nhãn HUD | Chi phí (`V / D / S`) | Thời gian xây | Độ bền (`HP`) | Điện năng (`MW`) | Thông số Vận hành, Đường Ray & Chiến đấu |
|---|---|---|---|---|---|---|
| **Nhà Máy Phát Điện** (`PowerPlant`) | `ĐIỆN +45MW` | `60V • 0D • 85S` | `5.0s` | `850` | **`+45 MW`** | Nguồn phát điện độc lập, phủ sóng lưới điện bán kính **`30m`**. |
| **Trạm Truyền Tải Điện** (`PowerPylon`) | `DẪN ĐIỆN +8MW` | `25V • 0D • 35S` | `2.5s` | `380` | **`+8 MW`** | Cột cáp cao thế kéo lưới điện nối tiếp ra tiền tuyến (**`30m`**) kèm tụ bù `+8 MW`. |
| **Nhà Máy Đào Dầu** (`OilExtractor`) | `KHAI THÁC DẦU` | `65V • 0D • 95S` | `5.5s` | `780` | `-10 MW` | Bơm **`+7 Dầu/s`**; nếu xây gần Mỏ Dầu (`<= 21m`) đạt **`+12 Dầu/s`**. Mất điện chỉ còn `28%` công suất! |
| **Sân Đáp Không Quân** (`Airfield`) | `4 BÃI ĐÁP BAY` | `90V • 30D • 125S` | `6.5s` | `1,150` | `-12 MW` | Cung cấp **4 bãi đáp vật lý**; tự động sửa vỏ (`55 HP/s`), nạp bom và bơm Dầu vào máy bay đang đậu. |
| **Kho Đạn & Trạm Đường Ray** (`AmmoDepot`) | `RAY CẤP ĐẠN` | `70V • 20D • 110S` | `5.5s` | `950` | `-10 MW` | Chế tạo (`4.2 viên/s` khi đủ điện) & trữ tối đa **`160` đạn AA**; nối đường ray thép `<= 46m` và xuất **Xe Goòng (`AmmoRailCart`)** chở `4–16` viên/chuyến tiếp đạn tự động. |
| **Pháo Phòng Không CIWS Vulcan** (`AA_CIWS`) | `AA TỐC BẮN CAO` | `55V • 15D • 85S` | `4.0s` | `620` | `-6 MW` | Tầm bắn **`22.5m`**, bắn siêu tốc `0.24s/phát` (`19` ST, `1` đạn/phát), băng đạn tại tháp **`28` viên**. Vẫn quay chậm được nếu yếu điện, nhưng hết đạn ray sẽ ngừng bắn. |
| **Tên Lửa Tầm Xa Patriot SAM** (`AA_SAM`) | `AA TẦM XA 38M` | `95V • 35D • 115S` | `5.5s` | `700` | `-14 MW` *(Bắt buộc)* | Tầm bắn cực xa **`38.5m`**, **`112` ST nổ lan `2.6m`** (`2` đạn/phát, chu kỳ `1.65s`), băng đạn **`14` viên**. **Ngừng hoạt động hoàn toàn nếu mất điện hoặc cạn đạn Đường ray!** |
| **Tháp Xung Điện Từ EMP SkyShield** (`AA_EMP`) | `AA LÀM CHẬM BAY` | `105V • 40D • 95S` | `5.0s` | `680` | `-16 MW` *(Bắt buộc)* | Tầm bắn **`30.0m`**, nổ xung EMP bán kính lớn **`5.2m`** (`48` ST, `1` đạn/phát, chu kỳ `1.25s`), băng đạn **`16` viên**. **Làm nhiễu động cơ máy bay địch: `-35%` tốc bay & tốc ngoặt trong `3.8 giây`!** |

---

## 7. Cấu Hình Khởi Đầu Trận Đấu & 3 Cấp Độ AI Địch

### 7.1. Tài nguyên & Lực lượng Khởi đầu (Đối xứng cho cả 2 phe)
- **Kho dự trữ đầu trận:** **`300 Vàng • 220 Dầu • 320 Sắt`**
- **Tài sản lãnh thổ đầu trận:** 1 Tổng Hành Dinh (`+40 MW` điện) + 1 Mỏ Sắt Hậu Phương (`+5 Sắt/s`).
- **Hạ tầng hậu cần dựng sẵn cạnh HQ:**
  - `1` **Sân Đáp Không Quân** (`-12 MW`)
  - `1` **Kho Đạn & Trạm Đường Ray** (`-10 MW`, có sẵn `70/160` đạn)
  - `1` **Pháo Phòng Không CIWS Vulcan** (`-6 MW`, đã nối cáp điện HQ & đường ray thép với Kho Đạn; tổng tải điện đầu trận = `28 / 40 MW` đạt `100%` hiệu suất).
- **Quân lực xuất phát:** `1` Xe Tư Lệnh + `2` Thiết giáp Lynx + `1` Tăng chủ lực Titan + `1` Tiêm kích Falcon (đang đậu sẵn trên Bãi đáp #0 của Sân Đáp với `85%` bình Dầu).

### 7.2. Bảng Phân Cấp 3 Độ Khó Của Tư Lệnh AI (`AIDifficulty`)
| Cấp độ AI | Tài nguyên cộng thêm đầu trận | Hệ số thu nhập mỏ/HQ | Nhịp xây Công trình / Sản xuất Quân | Hành vi Chiến thuật |
|---|---|---|---|---|
| **Chiến Dịch Tiêu Chuẩn** (`Standard`) | `+0V • +0D • +0S` | `x1.00` | Mỗi `6.0s` / `3.2s` | Phát triển cân bằng, phù hợp làm quen chuỗi hậu cần Điện — Dầu — Đường ray — Không quân. |
| **Tư Lệnh Kỳ Cựu** (`Veteran`) | `+40V • +35D • +50S` | `x1.08` | Mỗi `4.8s` / `2.4s` | Chủ động kéo Trạm điện ra vỉa Dầu, dựng trận địa Patriot SAM + EMP và dùng kỹ năng Tư lệnh mỗi `3.5s`. |
| **Đô Đốc Tinh Nhuệ** (`Elite`) | `+90V • +75D • +100S` | `x1.18` | Mỗi `3.8s` / `1.8s` | Mở rộng 2 Sân đáp, 2 Nhà máy đào dầu, phản ứng cực gắt khi người chơi giữ `3/3` mỏ và cử Valkyrie ném bom phá Nhà máy Điện của người chơi. |
