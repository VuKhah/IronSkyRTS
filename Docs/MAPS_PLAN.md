# Kế Hoạch Bản Đồ — Iron Sky

> Lập ngày 05/11/2026, **chờ người dùng duyệt**. Chưa có dòng code nào theo kế hoạch này.
> Yêu cầu của người dùng: có **vài bản đồ**, mỗi bản đồ có **đặc tính riêng**; căn cứ đặt ở **góc dưới trái và góc trên phải**; bản đồ **to hơn** hiện tại.

---

## 1. Hiện trạng

| Mục | Hiện tại |
|---|---|
| Số bản đồ | 1: "Thung Lũng Sông Sắt", 160 × 160 m, lưới 2 m (80 × 80 ô) |
| Căn cứ | Lam ở (-58, 58), Đỏ ở (58, -58): trong tọa độ thế giới đã là **góc Tây Nam và Đông Bắc** |
| Trên màn hình | Camera mặc định nhìn từ nhà mình về tâm (xoay 45°), minimap xoay theo camera, nên bản đồ hiện thành **hình thoi**: nhà mình ở giữa cạnh dưới, nhà địch ở giữa cạnh trên |
| Cách khai báo | Bản đồ là các hằng số và hàm viết cứng trong `src/sim/map.ts` (sông chéo theo hệ trục u/v, 3 lối qua, 4 khối đá, 6 đồi, 9 mỏ). 15 file đọc thẳng các hằng số này (`GRID`, `MAP_HALF`, `HQ_POS`, `MINES`, `CROSSINGS`…) |
| Địa hình trong luật chơi | Mới có (05/11): đồi và đá che tầm nhìn, đứng cao được cộng tầm nhìn / tầm bắn. Chưa có: độ dốc làm chậm |
| Vấn đề đã thấy | AI đấu AI lệch phe (20 trận gần nhất: Đỏ thắng 12, Lam 3). Chưa rõ do bản đồ hay do AI |

**Hệ quả:** muốn có nhiều bản đồ thì trước hết phải biến bản đồ thành **dữ liệu** (giống cách binh chủng đã là dữ liệu trong `content.ts`), rồi mới vẽ bản đồ mới.

## 2. Nguyên tắc

1. **Bản đồ là dữ liệu** (`MapDef`): kích thước, địa hình, sông, lối qua, đá, mỏ, căn cứ, đặc tính. Sim, AI, phần vẽ và minimap đều đọc cùng một `MapDef`. Thêm bản đồ = thêm một file dữ liệu, không sửa luật.
2. **Tất định:** độ cao chỉ tính bằng + − × ÷, trị tuyệt đối, min/max (không `Math.sin/cos`). Bản đồ chọn bằng mã (`mapId`), cùng `seed` + `mapId` + danh sách lệnh thì ra cùng trận. Sau này multiplayer chỉ cần gửi thêm `mapId` trong mã phòng.
3. **Công bằng:** mọi bản đồ 1 đấu 1 phải **đối xứng xoay 180°** quanh tâm (góc dưới trái ↔ góc trên phải). Có kiểm thử tự động soát đối xứng, và `npm run simulate` chạy riêng cho từng bản đồ (đổi phe hai lần để tách lệch do bản đồ khỏi lệch do AI).
4. **Đặc tính phải dùng cơ chế có thật:** mỗi đặc tính dựa trên luật đã có hoặc đã lên lịch (độ cao, che tầm nhìn, sông / lối qua, lối hẹp). Đặc tính cần luật chưa có (bùn làm chậm, tuyết, đô thị đổ nát) thì để sang đợt sau, khi luật đó xong.
5. **Trận vẫn ≤ 20 phút** (`MVP_DESIGN.md` mục 17): bản đồ to hơn thì phải đo lại thời gian hành quân và nhịp trận.
6. **Chạy được trên điện thoại:** bản đồ to làm tăng chi phí tìm đường, sương mù và lưới địa hình. Ngân sách giữ như AGENTS.md (< 500 lệnh vẽ khi trận đông).

## 3. Căn cứ ở góc dưới trái và góc trên phải

- **Thế giới:** căn cứ Lam ở góc Tây Nam, Đỏ ở góc Đông Bắc, cho mọi bản đồ.
- **Màn hình (đề xuất):** bản đồ hiện thành **hình vuông**, không phải hình thoi. Camera mặc định nhìn thẳng hướng Bắc, minimap không xoay theo camera.
- **Mỗi người chơi luôn thấy nhà mình ở góc dưới trái** (đề xuất): phe Đỏ được xoay góc nhìn 180°, nên với họ nhà mình cũng ở góc dưới trái và nhà địch ở góc trên phải. Đây là thói quen chung của thể loại, giúp người chơi đọc bản đồ giống nhau dù chơi phe nào.
- Người chơi vẫn xoay camera tự do như hiện tại. Chỉ góc nhìn **ban đầu** và minimap thay đổi.

## 4. Kích thước

| Phương án | Kích thước | Ô lưới (2 m) | Diện tích so với hiện tại | Lynx (7,2 m/s) đi chéo từ nhà tới nhà |
|---|---|---|---|---|
| Hiện tại | 160 × 160 m | 80 × 80 | 1× | ~23 giây |
| **Đề xuất mặc định** | **256 × 256 m** | 128 × 128 | 2,6× | ~40 giây |
| Lớn | 320 × 320 m | 160 × 160 | 4× | ~52 giây |

Đề xuất: bản đồ đầu tiên làm **256 m**, cho phép mỗi bản đồ có kích thước riêng. Sau khi đo hiệu năng trên điện thoại mới quyết có làm bản 320 m không. Lý do: diện tích tăng 2,6 lần đã đủ chỗ cho quy mô sư đoàn, trong khi chi phí tìm đường (A*) và sương mù tăng gần theo diện tích.

## 5. Bản đồ đợt đầu (đề xuất 3 bản, tên và ý tưởng của Iron Sky)

| Bản đồ | Đặc tính riêng | Cơ chế dùng | Lối chơi khuyến khích |
|---|---|---|---|
| **Thung Lũng Sông Sắt** (làm lớn bản hiện tại) | Sông chạy chéo giữa hai góc, nhiều cầu hơn (5–7), bãi cạn ở giữa | Sông, cầu, bãi cạn (đã có) | Giành cầu; Titan giữ đầu cầu, không quân vượt sông |
| **Cao Nguyên Gió** | Một cao nguyên lớn ở giữa, lên bằng vài dốc hẹp; mỏ giàu trên cao nguyên | Độ cao cộng tầm nhìn / tầm bắn, đồi che tầm nhìn (vừa có) | "Vua của ngọn đồi": ai giữ cao nguyên thì nhìn xa, bắn xa; bên dưới phải dùng không quân hoặc vòng sườn |
| **Đèo Đá Kép** | Hai dãy núi chia bản đồ thành ba hành lang, nối bằng hai con đèo hẹp; mỏ nằm trong các thung lũng bên | Đá chặn đường và che tầm nhìn, lối hẹp (đã có) | Phục kích ở đèo, chia quân giữ nhiều hành lang, trinh sát quan trọng |

Để sang đợt sau (cần luật chưa có): **Đầm Lầy** (bùn làm chậm, cần hệ thống hiệu ứng địa hình), **Thành Phố Đổ Nát** (công trình đổ nát chắn đường và tầm nhìn, phá được), **Đồng Tuyết** (chậm và giảm tầm nhìn), **Quần Đảo** (sau bản Hải quân, cần lưới nước).

## 6. Các bước làm

| Bước | Việc | Tiêu chí xong |
|---|---|---|
| **B0. Bản đồ thành dữ liệu** | Gom mọi thứ trong `map.ts` vào một `MapDef`; bản đồ hiện tại thành `MapDef` đầu tiên, **chưa đổi gì về luật** | Mọi kiểm thử cũ đạt; kiểm thử băm: cùng seed ra cùng kết quả như trước khi tách |
| **B1. Mọi nơi đọc `MapDef`** | `World`, lưới, AI, phần vẽ (`scene.ts`), minimap, camera nhận bản đồ qua tham số thay vì hằng số; kích thước bản đồ thay đổi được | Đổi kích thước trong dữ liệu là game chạy đúng, không còn hằng số `MAP_HALF` / `GRID` cố định |
| **B2. Góc nhìn mới** | Camera mặc định nhìn Bắc, minimap hình vuông, mỗi phe thấy nhà mình ở góc dưới trái | Chụp màn hình cả hai phe |
| **B3. Hiệu năng bản đồ to** | Đo tìm đường, sương mù, lưới địa hình ở 256 m và 320 m; tối ưu nếu vượt ngân sách (ví dụ tìm đường phân cấp, chia nhỏ lưới địa hình) | Số đo trên máy và trên Chrome giả lập điện thoại nằm trong ngân sách |
| **B4. Thung Lũng Sông Sắt bản lớn** | Vẽ lại ở 256 m, căn cứ ở góc, thêm cầu; AI chạy được trên bản mới | `npm run simulate`: trận kết thúc trước 20 phút, không lệch phe rõ rệt khi đổi phe |
| **B5. Chọn bản đồ** | Menu chọn bản đồ, Phòng Thử Nghiệm chọn bản đồ, tham số URL `?map=` | Vào được mọi bản đồ từ menu và từ link |
| **B6. Cao Nguyên Gió, Đèo Đá Kép** | Mỗi bản đồ một file dữ liệu, kèm kịch bản thiết kế đo đặc tính (ví dụ: giữ cao nguyên thì bắn tới được quân bên dưới mà bên dưới không bắn trả được) | Kiểm thử chung cho mọi bản đồ: đối xứng, mọi mỏ đi tới được từ cả hai nhà, AI đấu AI trọn trận |
| **B7. Xem trước bản đồ** (tùy chọn) | Trang xem bản đồ từ trên xuống, tô màu theo độ cao, như Xưởng Mô Hình | Thiết kế bản đồ mới không cần vào trận để xem |

B0–B1 là phần nặng nhất về kỹ thuật nhưng không đổi gì về lối chơi. Làm kỹ hai bước này thì các bước sau chỉ còn là thiết kế.

## 7. Câu hỏi chờ người dùng quyết

1. **Kích thước:** đồng ý 256 × 256 m làm mặc định (đo xong hiệu năng mới tính 320 m)?
2. **Góc nhìn:** đồng ý màn hình hiện bản đồ hình vuông, **mỗi phe luôn thấy nhà mình ở góc dưới trái**?
3. **Bản đồ đợt đầu:** đồng ý 3 bản ở mục 5 (Thung Lũng Sông Sắt bản lớn, Cao Nguyên Gió, Đèo Đá Kép)? Muốn đổi hay thêm đặc tính nào?
4. **Chỉ 1 đấu 1, hay chừa chỗ cho 2 đấu 2** (4 góc) về sau? Nếu có 2 đấu 2 thì `MapDef` nên có danh sách vị trí căn cứ ngay từ đầu.
5. **Bản đồ ngẫu nhiên theo seed** (như Battle Drones có): làm sau, hay bỏ? Kế hoạch này chỉ có bản đồ vẽ tay.
