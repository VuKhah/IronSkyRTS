# Kế Hoạch Bản Đồ — Iron Sky

> Lập ngày 05/11/2026. Bản 2 (cùng ngày): đã có quyết định của người dùng (mục 2). **Chờ duyệt bản 2 trước khi làm B0.**
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
4. **Hiệu ứng địa hình do bản đồ quyết định:** mỗi bản đồ tự "tô" các vùng địa hình (bùn, cát, rừng, đường…), luật của từng loại địa hình thì dùng chung.

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
- Lam ở góc dưới trái. **Đề xuất:** phe Đỏ được xoay góc nhìn ban đầu 180° để cũng thấy nhà mình ở góc dưới trái. Nếu muốn mọi người luôn thấy hướng gốc (Đỏ ở góc trên phải), chỉ cần bỏ phần xoay này.
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
| **B0. Tách bản đồ thành thành phần riêng** | Tạo `src/sim/maps/` với `MapDef` và `GameMap`; bản đồ hiện tại thành `iron-valley.ts`; **chưa đổi gì về luật** | Mọi kiểm thử cũ đạt; trận AI đấu AI cùng seed ra kết quả tương đương trước khi tách |
| **B1. Mọi nơi đọc `GameMap`** | `World` nhận bản đồ qua tham số; lưới, AI, `scene.ts`, minimap, camera, Phòng Thử Nghiệm bỏ hằng số `MAP_HALF` / `GRID`; kích thước và hình dáng thay đổi được | Đổi kích thước / hình dáng trong dữ liệu là game chạy đúng |
| **B2. Góc nhìn hình vuông** | Camera nhìn Bắc, minimap hình vuông, Lam ở góc dưới trái (Đỏ theo mục 3.4) | Chụp màn hình cả hai phe |
| **B3. Loại địa hình** | Bảng `TERRAIN`, vùng tô `regions`, hiệu ứng tốc độ / tầm nhìn / che chắn, độ dốc làm chậm; phần vẽ tô màu theo loại | Kiểm thử: xe đi vào bùn chậm đúng hệ số, Xe Tư Lệnh không bị chậm |
| **B4. Hiệu năng theo cỡ** | Đo tìm đường, sương mù, lưới địa hình ở 192 / 256 / 320 m; tối ưu nếu vượt ngân sách | Số đo nằm trong ngân sách |
| **B5. Bản đồ mới** | Thung Lũng Sông Sắt bản lớn (256 m), Cao Nguyên Gió, Đèo Đá Kép, với cỡ và hình dáng khác nhau; mỗi bản có kịch bản đo đặc tính | Kiểm thử chung: đối xứng, mọi mỏ đi tới được từ cả hai nhà, AI đấu AI trọn trận trước 20 phút |
| **B6. Chọn bản đồ** | Menu, Phòng Thử Nghiệm, tham số URL `?map=` | Vào được mọi bản đồ từ menu và link |
| **B7. Xem trước bản đồ** (tùy chọn) | Trang xem bản đồ từ trên xuống, tô màu theo độ cao và loại địa hình | Thiết kế bản đồ không cần vào trận |

Đề xuất 3 bản đồ đợt đầu (B5): **Thung Lũng Sông Sắt** (giành cầu), **Cao Nguyên Gió** (giữ cao nguyên giữa bản đồ: nhìn xa, bắn xa), **Đèo Đá Kép** (hai đèo hẹp, phục kích). Khi có loại địa hình (B3) thì thêm được **Đầm Lầy**, **Đồng Tuyết**, rừng. Thành Phố Đổ Nát (vật cản phá được) và Quần Đảo (sau bản Hải quân) để đợt sau.
