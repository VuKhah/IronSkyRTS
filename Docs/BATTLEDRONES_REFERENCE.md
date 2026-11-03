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
