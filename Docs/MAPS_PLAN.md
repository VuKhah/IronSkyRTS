# Kế Hoạch Bản Đồ — Iron Sky

> Lập ngày 05/11/2026. Bản 2 (cùng ngày): đã có quyết định của người dùng (mục 2), đã duyệt. **B0 xong (05/11/2026).**
> Yêu cầu gốc: có **vài bản đồ**, mỗi bản đồ có **đặc tính riêng**; căn cứ ở **góc dưới trái và góc trên phải**; bản đồ **to hơn** hiện tại.

---

## 1. Hiện trạng

| Mục | Hiện tại |
|---|---|
| Số bản đồ | 1: "Thung Lũng Sông Sắt", 160 × 160 m, lưới 2 m (80 × 80 ô) |
| Căn cứ | Lam ở (-58, 58), Đỏ ở (58, -58): trong tọa độ thế giới đã là góc Tây Nam và Đông Bắc |
| Trên màn hình | Camera mặc định nhìn từ nhà mình về tâm (xoay 45°), minimap xoay theo camera, nên bản đồ hiện thành **hình thoi** |
| Cách khai báo | Hằng số và hàm viết cứng trong `src/sim/map.ts` (sông chéo theo hệ trục u/v, 3 lối qua, 4 khối đá, 6 đồi, 9 mỏ). 15 file đọc thẳng các hằng số này |
| Địa hình trong luật chơi | Đồi và đá che tầm nhìn, đứng cao cộng tầm nhìn / tầm bắn (05/11). Chưa có: loại địa hình, độ dốc làm chậm |
| Vấn đề đã thấy | AI đấu AI lệch phe (20 trận gần nhất: Đỏ 12, Lam 3), chưa rõ do bản đồ hay AI |

## 2. Quyết định của người dùng (05/11/2026)

1. **Bản đồ hiện hình vuông, đúng hướng gốc** (không xoay thành hình thoi), vì thân thiện với người dùng.
2. **Bản đồ là thành phần riêng**, để làm được nhiều bản đồ như tác giả Battle Drones, với **nhiều kích cỡ và hình dáng khác nhau**.
3. **Vị trí cố định (mỏ Sắt, giàn Dầu, căn cứ…) do ta đặt tay** trong dữ liệu từng bản đồ. Không có trình sinh bản đồ tự đặt mỏ.
4. **Hiệu ứng địa hình do bản đồ quyết định:** mỗi bản đồ tự "tô" các vùng địa hình (bùn, cát, rừng, đường…), luật của từng loại địa hình thì dùng chung, **nằm trong một file chung duy nhất `src/sim/maps/terrain.ts`** để dễ cập nhật.
5. **Phe Đỏ được xoay camera ban đầu 180°**: ai cũng thấy nhà mình ở góc dưới trái.

## 3. Thiết kế

### 3.1. Cấu trúc thư mục
```
src/sim/maps/
  types.ts          MapDef (dữ liệu khai báo) và các kiểu con
  terrain.ts        bảng loại địa hình dùng chung (TERRAIN): tốc độ, tầm nhìn, che chắn…
  game-map.ts       GameMap: dựng từ MapDef một lần lúc vào trận, trả lời mọi câu hỏi của sim
                    (ô này đi được không, cao bao nhiêu, loại địa hình gì, có phải cầu không)
  iron-valley.ts    "Thung Lũng Sông Sắt" (bản hiện tại, rồi bản lớn)
  ...               mỗi bản đồ một file dữ liệu
  index.ts          danh sách bản đồ: MAPS, getMap(id)
```
`World`, AI, phần vẽ (`scene.ts`), minimap và camera nhận một `GameMap` thay vì đọc hằng số.

### 3.2. `MapDef`: dữ liệu khai báo của một bản đồ
| Trường | Ý nghĩa |
|---|---|
| `id`, `name`, `blurb` | Mã (dùng trong URL, mã phòng multiplayer), tên tiếng Việt, mô tả đặc tính |
| `size: { w, h }` | Kích thước (m). **Cho phép hình chữ nhật**; mỗi bản đồ một cỡ |
| `bounds` | Hình dáng vùng chơi: đa giác; ngoài đa giác là vách núi. Mặc định là cả hình chữ nhật. Đây là cách làm "hình dáng khác nhau" (chữ L, đồng hồ cát, hình thoi lệch…) |
| `bases` | Vị trí căn cứ, đặt tay. Phần tử 0 = Lam (góc dưới trái), 1 = Đỏ (góc trên phải). Là **danh sách** để sau này có thể có 2 đấu 2 mà không đổi cấu trúc |
| `mines` | Mỏ Sắt / giàn Dầu: vị trí, chủ ban đầu, trữ lượng. Đặt tay |
| `hills` | Đồi (tâm, bán kính, độ cao, tùy chọn đỉnh bằng để làm cao nguyên) |
| `rocks` | Mỏm đá: chặn đường, che tầm nhìn |
| `rivers` | Sông: đường gấp khúc, bề rộng lòng sông và bờ dốc, độ sâu; danh sách lối qua (cầu / bãi cạn) theo vị trí dọc sông |
| `regions` | Các vùng tô loại địa hình (hình tròn hoặc đa giác) → `TERRAIN` ở 3.3 |
| `biome` | Bộ màu, cây cối, ánh sáng cho phần vẽ (không ảnh hưởng luật) |

### 3.3. Loại địa hình (`TERRAIN`, dùng chung cho mọi bản đồ; số tạm)
| Loại | Xe mặt đất | Tầm nhìn đứng trong đó | Khác |
|---|---|---|---|
| Cỏ / đất (mặc định) | ×1 | ×1 | |
| Đường | ×1,25 | ×1 | Hành quân nhanh |
| Cát | ×0,85 | ×1 | |
| Bùn | ×0,6 | ×1 | Xe Tư Lệnh kháng làm chậm (ARMY_DESIGN #1) |
| Tuyết | ×0,75 | ×0,85 | |
| Rừng | ×0,8 | ×0,8 | Che tầm nhìn (như đồi thấp); giảm sát thương nhận vào (che chắn) |
| Nước nông / bãi cạn | ×0,7 | ×1 | |
| Nước sâu, vách núi | không đi được | | |

Máy bay không chịu hiệu ứng địa hình. Độ dốc làm chậm (mục còn lại của B11) tính chung với bảng này: tốc độ = hệ số loại địa hình × hệ số độ dốc.

### 3.4. Góc nhìn
- Camera mặc định nhìn thẳng hướng Bắc; minimap hình vuông (hình chữ nhật nếu bản đồ chữ nhật), không xoay theo camera.
- Lam ở góc dưới trái. Phe Đỏ được xoay góc nhìn ban đầu 180° (đã chốt) để cũng thấy nhà mình ở góc dưới trái.
- Người chơi vẫn xoay camera tự do như hiện tại.

### 3.5. Kích thước
Mỗi bản đồ một cỡ. Gợi ý khởi điểm: nhỏ 192 m, vừa 256 m, lớn 320 m, chữ nhật ví dụ 320 × 200 m. Cỡ lớn nhất chốt sau khi đo hiệu năng (B4): chi phí tìm đường và sương mù tăng gần theo diện tích.

## 4. Nguyên tắc
1. **Bản đồ là dữ liệu.** Thêm bản đồ = thêm một file; luật không đổi.
2. **Tất định:** độ cao và loại địa hình chỉ tính bằng + − × ÷, trị tuyệt đối, min/max, tính sẵn vào lưới lúc vào trận. Trận được xác định bởi `mapId` + `seed` + danh sách lệnh.
3. **Công bằng:** bản đồ 1 đấu 1 đối xứng xoay 180° quanh tâm. Kiểm thử tự động soát đối xứng (mỏ, căn cứ, địa hình), và `npm run simulate` chạy theo từng bản đồ, đổi phe để tách lệch do bản đồ khỏi lệch do AI.
4. **Trận vẫn ≤ 20 phút**, chạy được trên điện thoại (< 500 lệnh vẽ khi trận đông).

## 5. Các bước làm

| Bước | Việc | Tiêu chí xong |
|---|---|---|
| **B0. Tách bản đồ thành thành phần riêng** ✅ | Tạo `src/sim/maps/` với `MapDef` và `GameMap`; bản đồ hiện tại thành `iron-valley.ts`; **chưa đổi gì về luật** | ✅ So 190.900 điểm: độ cao lệch tối đa 3·10⁻¹⁴ m, chặn đường và mặt cầu giống hệt; 10 trận AI đấu AI giống hệt từng con số; thêm `maps.test.ts` (đối xứng, mỏ đi tới được) |
| **B1. Mọi nơi đọc `GameMap`** | `World` nhận bản đồ qua tham số; lưới, AI, `scene.ts`, minimap, camera, Phòng Thử Nghiệm bỏ hằng số `MAP_HALF` / `GRID`; kích thước và hình dáng thay đổi được | Đổi kích thước / hình dáng trong dữ liệu là game chạy đúng |
| **B2. Góc nhìn hình vuông** | Camera nhìn Bắc, minimap hình vuông, Lam ở góc dưới trái (Đỏ theo mục 3.4) | Chụp màn hình cả hai phe |
| **B3. Loại địa hình** | Bảng `TERRAIN`, vùng tô `regions`, hiệu ứng tốc độ / tầm nhìn / che chắn, độ dốc làm chậm; phần vẽ tô màu theo loại | Kiểm thử: xe đi vào bùn chậm đúng hệ số, Xe Tư Lệnh không bị chậm |
| **B4. Hiệu năng theo cỡ** | Đo tìm đường, sương mù, lưới địa hình ở 192 / 256 / 320 m; tối ưu nếu vượt ngân sách | Số đo nằm trong ngân sách |
| **B5. Bản đồ mới** | Thung Lũng Sông Sắt bản lớn (256 m), Cao Nguyên Gió, Đèo Đá Kép, với cỡ và hình dáng khác nhau; mỗi bản có kịch bản đo đặc tính | Kiểm thử chung: đối xứng, mọi mỏ đi tới được từ cả hai nhà, AI đấu AI trọn trận trước 20 phút |
| **B6. Chọn bản đồ** | Menu, Phòng Thử Nghiệm, tham số URL `?map=` | Vào được mọi bản đồ từ menu và link |
| **B7. Xem trước bản đồ** (tùy chọn) | Trang xem bản đồ từ trên xuống, tô màu theo độ cao và loại địa hình | Thiết kế bản đồ không cần vào trận |
| **B8. Mặt đất đẹp và tương tác** | Ảnh màu mặt đất vẽ bằng code, vân chi tiết, lớp vết chiến trường (hố đạn, vết xích), nước, cây, bóng mây (chi tiết ở mục 7) | Đẹp hơn rõ rệt mà ≤ 4 lệnh vẽ cho mặt đất, FPS không giảm trên điện thoại |

Đề xuất 3 bản đồ đợt đầu (B5): **Thung Lũng Sông Sắt** (giành cầu), **Cao Nguyên Gió** (giữ cao nguyên giữa bản đồ: nhìn xa, bắn xa), **Đèo Đá Kép** (hai đèo hẹp, phục kích). Khi có loại địa hình (B3) thì thêm được **Đầm Lầy**, **Đồng Tuyết**, rừng. Thành Phố Đổ Nát (vật cản phá được) và Quần Đảo (sau bản Hải quân) để đợt sau.

## 6. Học từ Battle Drones (05/11/2026, chi tiết ở `Docs/BATTLEDRONES_REFERENCE.md` mục 6)

| Họ làm | Áp dụng cho Iron Sky | Trạng thái |
|---|---|---|
| Bộ vẽ tự đối xứng: người thiết kế chỉ vẽ một nửa | `MapDef` có cờ đối xứng; `GameMap` tự sinh nửa còn lại cho đồi, đá, sông, mỏ, vùng địa hình. Công bằng có sẵn, `maps.test.ts` vẫn kiểm | Đề xuất, thêm vào B1 |
| Nét vẽ cơ bản có mép lượn theo nhiễu (vệt tròn, đường gấp khúc có bề rộng, rải ngẫu nhiên theo seed) | Thêm vào `RegionDef`: `blob` có mép lượn, `stroke` (đường, sống núi, dải bùn), `scatter` (rừng thưa, đá vụn). Nhiễu tự viết, tất định | Đề xuất, làm ở B3 |
| Ảnh mặt đất vẽ sẵn bằng Python + ảnh AI, phủ lên địa hình 3D | **Chờ người dùng chọn** (mục 7) | |
| Shader nước, cây hàng loạt, bóng mây, "váy" ngoài mép bản đồ | Bước đồ họa mới **B8. Mặt đất đẹp** sau B5 | Đề xuất |

## 7. Đồ họa mặt đất (quyết định 05/11/2026)

Người dùng chốt: **phương án 1, vẽ mặt đất bằng code**, với ba yêu cầu: **đẹp**, **không làm máy thở hổn hển**, **tương tác được chỉ để nhìn** (ví dụ pháo nổ để lại hố đất; không ảnh hưởng luật chơi).

Phần vẽ mặt đất không đụng tới sim: địa hình 3D, chặn đường, đồi che tầm nhìn vẫn do `GameMap` và lưới ô của sim quyết định, như hiện nay.

### B8. Mặt đất đẹp và tương tác
| Phần | Cách làm | Chi phí |
|---|---|---|
| **B8a. Ảnh màu mặt đất** | Lúc vào trận, vẽ bằng code từ `GameMap` (loại địa hình, độ cao, khoảng cách tới nước): hòa trộn mép bằng nhiễu, bờ sông ẩm, bóng nắng cố định (hillshade). Độ phân giải **thấp** (khoảng 1024 × 1024 cho bản 256 m), vẽ trong luồng nền (Web Worker) để màn hình không khựng | Một lần lúc tải trận; ~4 MB bộ nhớ đồ họa |
| **B8b. Vân chi tiết** | Một ảnh vân nhỏ lặp lại (hạt sạn, cỏ, đá; sinh bằng code) trộn trong shader để lại gần không nhòe; vách dốc chuyển sang vân đá | Một ảnh nhỏ, đọc thêm 1–2 lần mỗi điểm ảnh |
| **B8c. Lớp vết chiến trường** | Ảnh phủ toàn bản đồ, ban đầu trong suốt. Mỗi vụ nổ **in một dấu** vào ảnh (hố đất: vành đất tơi, lòng sẫm, vệt cháy; cỡ theo bán kính nổ). Shader mặt đất đọc ảnh này để tối màu và đổ bóng giả cho hố trông lõm xuống. Dùng chung cho: vết xích trên bùn / tuyết, đống đổ nát khi công trình sập, vệt bom rải thảm. Thay cho các tấm "vết cháy" hiện tại (mỗi tấm một lệnh vẽ, sống 25 giây) | Mỗi vụ nổ một lệnh vẽ nhỏ, đúng một lần; mỗi khung hình **không đổi** dù bao nhiêu hố. Vết ở lại cả trận |
| **B8d. Chi tiết sống động** | Nước có shader rẻ (gợn, bọt ven bờ), cây vẽ hàng loạt (instancing) theo vùng rừng, bóng mây trôi (chỉ là một phép dịch trong shader), "váy" ngoài mép bản đồ mờ dần vào màu trời | Vài lệnh vẽ cố định |

**Bản thử (05/11/2026):** `src/tools/paint-ground-demo.ts` vẽ "Thung Lũng Sông Sắt" nhìn từ trên xuống hoàn toàn bằng code (nhiễu fBm, làm méo tọa độ, nhiễu ô Worley cho đá / quặng / nứt bùn, hillshade + bóng đổ theo nắng Tây Bắc, cây tán tròn có bóng, cầu ván, bọt ven bờ; rừng / đường / bùn là vùng mẫu). Kết quả: hình ảnh đạt yêu cầu "đẹp". **Nhưng chạy trên CPU (Node) mất ~7 giây cho ảnh 1200 × 1200**: không dùng được lúc vào trận. Hướng ra: chạy cùng phép vẽ bằng **shader GPU, vẽ một lần vào một texture** (tính song song mọi điểm ảnh, dự kiến vài chục mili giây kể cả điện thoại); dự phòng: CPU trong Web Worker ở 512 × 512 (~1 giây) cộng vân chi tiết.

**Ràng buộc:**
- Lớp vết chiến trường **chỉ nằm ở phần vẽ** (`src/game/`), sim không biết tới, nên trận vẫn tất định. Được dùng `Math.random` cho dáng hố.
- Ngân sách mặt đất: ≤ 4 lệnh vẽ, ≤ ~12 MB ảnh trên điện thoại. Máy yếu (tự hạ chất lượng như hiện có) thì ảnh màu 512 × 512, tắt bóng mây.
- Lưới địa hình bản đồ to chia thành mảnh, mảnh xa thưa đỉnh hơn (đo ở B4).
- Kiểm bằng `?perf=1` (số lệnh vẽ, FPS) trước và sau mỗi phần.
