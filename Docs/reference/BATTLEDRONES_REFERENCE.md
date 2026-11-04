# Tham Chiếu: Battle Drones → Iron Sky RTS

> Ghi chú phân tích ngày 03/11/2026.
> Nguồn: bài viết của Simon Willison (https://simonwillison.net/2026/Oct/20/battledrones/), trang mô hình (https://simonw.github.io/battledrones/models.html), mã nguồn `simonw/battledrones` (TypeScript + Three.js, giấy phép Apache-2.0).
>
> **Nguyên tắc:** Ta chỉ học **cơ chế ở mức thể loại** (genre mechanics). Mọi tên quân, mô hình, chỉ số, bối cảnh và mã nguồn đều do Iron Sky tự thiết kế. Không chép tên (Stinger, Mastodon, Goliath, Condor…), không chép hình ảnh, không port code.

---

## 1. Battle Drones là gì

- RTS kiểu C&C chạy trên trình duyệt / điện thoại (PWA). Phiên bản 1–4 dùng Phaser 2D, từ v5 chuyển sang Three.js 3D với mô hình dựng hoàn toàn bằng code.
- Được làm gần như hoàn toàn bằng Claude Code: khoảng 321 commit qua 12 phiên bản lớn. Bản v4 chạy hơn 1000 trận tự động để cân bằng chỉ số.
- Âm nhạc được tổng hợp bằng code và dồn dập hơn khi giao tranh. Giống Iron Sky ở chỗ không dùng file âm thanh.
- Mô phỏng tất định với tick cố định 10 Hz và sin/cos tự viết. Nhờ vậy có replay, multiplayer lockstep qua WebSocket relay, và chế độ cho các LLM đấu với nhau.

## 2. Nội dung chính

| Hạng mục | Battle Drones |
|---|---|
| Kinh tế | Xe khai thác chạy ra bãi phế liệu (Scrap) hoặc pha lê (Crystal, giá trị ×1.6), chở về HQ hoặc Depot. HQ có thêm dòng thu nhỏ `+2/s` để bên cạn tiền không chết hẳn. Bán công trình hoàn 50%. |
| Công trình (9) | HQ, nhà máy xe, sân drone, Tech Lab (mở khóa quân T2), Depot tiền phương, tháp pháo, SAM, Radar (nhìn xuyên sương), trại bộ binh, Gantry (xây siêu mech). |
| Quân (16) | 1 xe khai thác, 5 xe tăng, 6 drone (trinh sát, cường kích, đánh chặn, ném bom, sửa chữa, vận tải), 3 đội bộ binh robot, 1 siêu mech. |
| Ma trận sát thương | 7 loại sát thương × 5 lớp giáp. Ví dụ: laser ×1.55 lên giáp nặng, nổ ×1.35 lên công trình, bắn tỉa ×3 lên bộ binh. |
| Địa hình | 11 loại, mỗi loại có hệ số tốc độ riêng cho xích, hover và bộ binh. Rừng giảm sát thương nhận vào (cover). Nước nông chỉ hover đi qua được. |
| Bộ binh | Mỗi đội là 1 đơn vị chung 1 thanh máu; cứ mất 1/5 máu thì ngã 1 robot và hỏa lực giảm theo. Bộ binh chiếm mục tiêu nhanh hơn xe. Lính bắn tỉa ẩn trong rừng. |
| Vận tải | Phi cơ chở 2 đội bộ binh vượt mọi địa hình. Bị bắn rơi trên đất liền thì lính nhảy dù thoát. |
| Siêu mech | Cơ động và có thể neo xuống làm căn cứ di động. Vũ khí hỏng dần theo % máu. Hai phi cơ vận tải có thể chở nó. Bên còn mech thì mất HQ vẫn chưa thua. |
| Cựu binh | XP tính theo giá trị quân đã hạ. 3 cấp, mỗi cấp `+15%` sát thương; cấp 3 tự hồi máu. |
| Xác quân | Quân chết để lại xác cháy đáng một phần giá. Xe mặt đất đầu tiên chạm vào sẽ nhặt được. |
| Kỹ năng gọi xuống | Pháo kích (Barrage), EMP, Thả quân (Drop Pod), Búa trời (Sky Hammer). |
| Chế độ chơi | Skirmish, Last Stand (đỡ các đợt tấn công), chiến dịch 8 nhiệm vụ, Daily Op, Mutators, lối mở đầu chọn trước trận (Blitz, Industry, Air Wing). |
| AI | 6 tính cách: Balanced, Rush, Air Swarm, Boom, Skyforce, Ironclad. Có chế độ xem AI đấu AI. |
| Bản đồ | 6 bản đồ trên 5 vùng khí hậu, cộng trình sinh bản đồ ngẫu nhiên đối xứng xoay theo seed. Bản quần đảo có 7 trạm uplink chỉ chiếm được bằng bộ binh thả từ phi cơ. |
| Sương mù chiến tranh | Có. Radar và trinh sát dùng để mở tầm nhìn. |

**Bài học thiết kế quan trọng nhất:** mọi đơn vị đều có **khắc chế rõ ràng** và có cả một bảng "ai khắc ai" (advisor `COUNTERS`). Chỉ số được tinh chỉnh bằng giả lập hàng nghìn trận. Thêm vào đó là rất nhiều "juice": thông báo, cảnh quay, nhạc thích ứng, cảnh báo chiến trường.

## 3. So sánh với Iron Sky hiện tại

| Battle Drones có | Iron Sky đã có | Iron Sky còn thiếu |
|---|---|---|
| Kinh tế bằng xe khai thác | Mỏ thụ động `+5/s` và Nhà máy đào dầu | Xe vận chuyển, Depot tiền phương |
| Sương mù và Radar | — | **Toàn bộ** |
| Ma trận sát thương × giáp | Nổ lan và khắc chế đất/không | Loại sát thương, lớp giáp |
| Bộ binh và phi cơ vận tải | — | **Toàn bộ** |
| Drone sửa chữa | Hào quang hồi máu của Xe Tư lệnh | Đơn vị sửa chữa riêng |
| Cựu binh và xác quân | — | **Toàn bộ** |
| Địa hình có cover và hover | Sông, 7 cầu, đá chắn | Rừng, nước nông, đường nhanh |
| Kỹ năng gọi xuống | 3 kỹ năng của Tư lệnh | Kỹ năng toàn cục |
| Siêu mech làm căn cứ di động | Xe Tư lệnh (thua khi chết) | Có thể mở rộng theo hướng của Iron Sky |
| Last Stand, nhiều tính cách AI | AI 3 cấp độ | Chế độ chơi và tính cách AI |
| — | **Lưới điện MW, đường ray đạn, nhiên liệu máy bay** | Đây là bản sắc riêng của Iron Sky, **giữ nguyên** |

## 4. Lộ trình đề xuất (phiên bản Iron Sky)

Các mốc xếp theo thứ tự "tăng độ vui nhiều nhất trên công sức bỏ ra":

1. **Mốc 1: Ma trận sát thương và cựu binh.** Thêm `DamageType` và `ArmorClass` vào `RTSTypes.cs`, thay công thức sát thương trong `RTSGameManager`, thêm XP và quân hàm 3 cấp hiển thị trên `WorldHealthBar`. Đổi ít code, nhưng làm cho các lựa chọn quân có ý nghĩa ngay.
2. **Mốc 2: Sương mù chiến tranh và Trạm Radar.** Lưới tầm nhìn đặt trên Minimap và địa hình, ẩn quân địch, thêm công trình `RadarStation` tiêu thụ MW.
3. **Mốc 3: Xác quân và trục vớt.** Xác xe cháy chứa Sắt, có thể dùng thêm một Xe Công binh để thu về.
4. **Mốc 4: Bộ binh cơ giới và trực thăng vận tải.** Tổ chức đội theo kiểu một thanh máu chung, thêm rừng làm chỗ ẩn nấp, và trực thăng chở quân (tốn dầu như máy bay hiện có).
5. **Mốc 5: Kỹ năng gọi xuống toàn cục.** Dùng điểm Chỉ huy tích lũy, gắn với lưới điện. Ví dụ: EMP cần Tháp EMP, Pháo kích cần Kho đạn.
6. **Mốc 6: Chế độ chơi và tính cách AI.** Last Stand, các lối mở đầu chọn trước trận, và 4–6 tính cách cho `EnemyCommanderAI`.
7. **Mốc 7: Pháo đài di động.** Phiên bản Iron Sky của siêu mech, ví dụ một Xe Tư lệnh hạng nặng có thể triển khai thành tiền đồn.

Ở mỗi mốc phải làm theo checklist trong `AGENTS.md` (Bootstrapper, ProjectBuilder, HUD, AI, kiểm tra biên dịch bằng Roslyn).

---

## 5. Đội hình và ma trận sát thương (đọc mã nguồn `src/sim/balance.ts`, 04/11/2026)

> Chỉ để học cơ chế. Tên quân của họ ghi ở đây để đối chiếu, **không** dùng trong Iron Sky.

### Ma trận sát thương (7 loại đạn × 5 lớp giáp)

| Đạn \ Giáp | Nhẹ | Vừa | Nặng | Công trình | Bộ binh |
|---|:---:|:---:|:---:|:---:|:---:|
| Động năng | 1.0 | 1.0 | 0.6 | 0.65 | 1.0 |
| Pháo | 0.8 | 1.0 | 1.3 | 1.0 | 0.4 |
| Flak | 1.25 | 1.0 | 1.15 | 0.5 | 1.25 |
| Tên lửa | 1.15 | 1.0 | 0.9 | 0.6 | 0.7 |
| Nổ | 1.2 | 0.9 | 0.85 | 1.35 | 1.3 |
| Laser | 1.0 | 1.0 | 1.55 | 0.8 | 0.7 |
| Bắn tỉa | 0.6 | 0.4 | 0.25 | 0.15 | 3.0 |

Nhận xét: ma trận **mềm** (hầu hết 0.6–1.35, chỉ bắn tỉa cực đoan); cột "Vừa" là mốc 1.0. Ai thắng ai chủ yếu do tầm, tốc độ, DPS và vai trò; ma trận chỉ nghiêng cán cân. Không có giảm sát thương % riêng từng quân. Thêm hai hệ số: `airMult` (vũ khí đa năng yếu với máy bay) và `cover` (rừng giảm sát thương).

### Đội hình (17 quân) theo vai trò
Khai thác (giáp vừa) · trinh sát bay không vũ khí · xe nhẹ nhanh · phòng không mặt đất (bó tay với quân đất) · pháo tầm xa có **tầm bắn tối thiểu** · tăng siêu nặng · **tăng lướt nước** bắn cả đất lẫn không · **drone chỉ đánh đất** · **tiêm kích chỉ đánh máy bay** · ném bom nặng · drone sửa chữa · 3 bộ binh (súng trường, tên lửa chống tăng, bắn tỉa) · phi cơ vận tải · siêu mech làm căn cứ di động.

### Cơ chế quanh đội hình đáng chú ý
- Máu quân chiến đấu ×1.5 để nửa đạo quân chết trong 7–9 giây thay vì 5–7: "đủ lâu để phản ứng trên điện thoại".
- Cân bằng bằng đấu tay đôi **giá ngang giá** trong `tools/balance.ts`, ghi điểm chênh lệch vào chú thích chỉ số.
- Lính bắn tỉa ẩn trong rừng, **lộ 2 giây sau mỗi phát bắn**.
- Quân tự ưu tiên bắn drone sửa chữa ("giết thằng sửa trước, không thì trận không bao giờ kết thúc").
- Quân đứng yên bị bắn tự đánh trả trong 9 ô; đồng minh trong 5 ô tự vào giúp.
- Siêu mech: vũ khí tắt dần ở 75/50/25% máu, luôn bị địch nhìn thấy, neo 4 giây / thu 6 giây, mỗi chiếc thêm đắt hơn 25%.
- Cựu binh: 3 cấp theo giá trị quân đã hạ, +15% sát thương mỗi cấp, cấp 3 tự hồi máu. Xác quân rơi 30% giá, xe đầu tiên chạm vào nhặt được.

Quyết định áp dụng cho Iron Sky: xem `Docs/design/ARMY_DESIGN.md`, mục "Bài học từ đội hình Battle Drones".

---

## 6. Bản đồ của Battle Drones làm thế nào (đọc mã nguồn `src/sim/maps.ts`, `src/game/three/terrain*.ts`, `art/terrain.py`, 05/11/2026)

> Chỉ học quy trình và kỹ thuật. Không chép code, ảnh, tên bản đồ.

**Dữ liệu (sim):**
- Bản đồ là **lưới ô** (48–108 ô mỗi cạnh), mỗi ô một trong 11 loại địa hình (đất, đá, mỏ phế liệu, nước, đường, đất xấu, rừng, pha lê, cầu, nước nông, biển sâu).
- Mỗi bản đồ là một khai báo (`MapDef`: tên, vùng khí hậu, kích thước, vị trí HQ, seed) kèm một hàm `paint(p)` vẽ bằng vài **nét cơ bản**: `blob` (vệt tròn, mép lượn theo nhiễu), `stroke` (đường gấp khúc có bề rộng: sông, đường, sống núi), `rect`, `scatter` (rải vệt nhỏ ngẫu nhiên theo seed). Tham số `only` cho phép chỉ tô đè lên loại đất nhất định (ví dụ chỉ tô rừng lên đất trống).
- **Bộ vẽ tự đối xứng:** mỗi ô vẽ ra được tô luôn ô đối xứng xoay 180° (hoặc xoay 4 lần cho bản đồ 4 người). Người thiết kế chỉ vẽ một nửa, công bằng có sẵn.
- Mép vệt và nét đều lượn bằng nhiễu giá trị (value noise) theo seed cố định, nên trông tự nhiên mà vẫn tất định.
- Có thêm trình sinh bản đồ ngẫu nhiên theo seed (`mapgen.ts`), chia sẻ bằng mã ngắn.

**Hình ảnh (vì sao đẹp):**
1. **Ảnh mặt đất vẽ sẵn, ngoại tuyến:** một chương trình Python (`art/terrain.py`, dùng Pillow, numpy, scipy) đọc lưới ô của từng bản đồ rồi vẽ một ảnh nhìn từ trên xuống, 48 điểm ảnh mỗi ô. Vật liệu (cỏ, đá, nước, cát…) và hình trang trí (tán cây, tảng đá) là ảnh do AI tạo sẵn (OpenAI Images). Mép giữa các loại đất được hòa trộn bằng nhiễu và làm méo tọa độ (domain warp), có bóng đổ theo hướng nắng cố định (trên trái), hillshade. Xuất ra các mảnh WebP 1024 điểm ảnh (khoảng 1,5 MB mỗi bản đồ) và một ảnh nhỏ 256 × 256 cho menu chọn bản đồ và minimap.
2. **Trong game:** lưới ô thành địa hình 3D (đá thành mỏm cao, sông thành lòng trũng), ảnh vẽ sẵn **phủ lên làm màu bề mặt**, nên vừa giữ nét vẽ tay vừa có ánh sáng và bóng thật. Vách dốc dùng vật liệu đá chiếu theo phương ngang (ảnh phủ từ trên xuống sẽ bị kéo vệt trên vách đứng).
3. **Chi tiết sống động:** nước có shader (bọt ven bờ, lấp lánh), băng trôi, dung nham; cây vẽ hàng loạt bằng instancing theo vùng khí hậu; cầu dựng theo trục lối qua; bóng mây trôi; **"váy" ngoài mép bản đồ** (bản đồ phản chiếu ra ngoài vài ô rồi mờ dần vào màu trời, nên không bao giờ thấy khoảng trống).
4. Bản đồ ngẫu nhiên không có ảnh vẽ sẵn: trình duyệt tự vẽ ảnh mặt đất từ lưới ô (`terrain-paint.ts`) với bảng màu lấy từ các bản đồ vẽ sẵn, độ phân giải bằng nửa.

**Bài học cho Iron Sky:** xem `Docs/design/MAPS_PLAN.md` mục "Học từ Battle Drones".

---

## 7. Lịch sử phiên bản Battle Drones (GitHub Releases, đọc 05/11/2026)

| Bản | Nội dung chính |
|---|---|
| v1 | Nguyên mẫu 2D: khai thác, xây dựng, chiến đấu, sương mù, AI |
| v2 | Bản gốc hoàn chỉnh: 6 quân, 4 công trình, bộ hình đầy đủ, điều khiển điện thoại, tính cách AI, chế độ xem |
| v3 | Mặt đất vẽ sẵn, 5 bản đồ / 4 vùng khí hậu, 11 quân, 8 công trình, cây công nghệ, hiệu ứng địa hình, cựu binh |
| v4 | **"The Fun Update"**: lối mở đầu chọn trước trận, kỹ năng gọi xuống, điểm chiếm (Uplink), thả hàng tiếp tế, xác quân, nhạc thích ứng và giọng nói, Last Stand, 8 nhiệm vụ, tiến trình sự nghiệp, biến thể luật, thử thách hằng ngày |
| v5 | Chuyển sang 3D (three.js): tháp pháo xoay, máy bay nghiêng cánh, địa hình có độ cao, bóng đổ |
| v6 | Đánh bóng hình ảnh: vách đá có vân, địa hình và ánh sáng giàu hơn, nổ đẹp hơn, HUD, sương mù chính xác hơn |
| v7 | Bộ binh robot (súng trường, tên lửa, bắn tỉa), phi cơ vận tải, ẩn trong rừng, cán bẹp bộ binh, đổ bộ đường không, chế độ đỡ đợt tấn công |
| v8–v9 | Bản đồ quần đảo lớn (96 → 108 ô) xoay quanh chở bộ binh đi chiếm 7 điểm, AI hiểu đảo, tìm đường tốt hơn |
| v10 | Goliath (căn cứ di động dạng mech), các mô hình AI đấu nhau, sim tất định để xem lại trận |
| v11 | Bản đồ ngẫu nhiên theo seed (6 kiểu bố cục), xem trước hoặc chơi mù, cầu chéo thẳng |
| v12 | Đấu tay đôi qua **âm thanh** (hai điện thoại gửi lệnh bằng modem âm thanh, không cần mạng), camera điện ảnh khi xem AI đấu |
| v13 | Đấu online qua relay WebSocket (link / mã QR), nút sao chép bản ghi trận |
| v14 | Bản đồ 4 người (Compass Rose), chế độ hỗn chiến |

So sánh với lộ trình Iron Sky: xem câu trả lời ngày 05/11/2026 (tóm tắt trong `TASKS.md` mục 6 khi người dùng chốt).
