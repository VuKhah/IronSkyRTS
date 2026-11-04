# Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần

Game chiến thuật thời gian thực 3D chạy ngay trên trình duyệt. Hai phe Liên Minh Lam và Tập Đoàn Đỏ tranh giành dòng sông chéo với 7 cây cầu, các mỏ Vàng, Dầu và Sắt. Trong game có mạng lưới điện, đường ray tiếp đạn phòng không và không quân phải nạp dầu.

> 🎮 **Bản v1 (MVP) chơi được.** TypeScript + Three.js, chạy trên trình duyệt, điều khiển bằng chạm hoặc chuột.

## Chơi thử
```
npm install
npm run dev
```
Mở http://localhost:5173 → **Chơi với AI** hoặc **Xem AI đấu AI**. Xưởng Mô Hình: http://localhost:5173/models.html

Thắng khi: diệt Xe Tư Lệnh địch, phá hết công trình địch, hoặc giữ trọn một loại mỏ (4/4 Sắt hoặc 5/5 Dầu) liên tục 30 giây.

## Cho nhà phát triển
- `npm test` — kiểm thử (gồm tất định và 1 trận AI đấu AI)
- `npm run simulate -- 20` — 20 trận AI đấu AI không giao diện để cân bằng

## Đầu việc
- [**TASKS.md**: đã làm tới đâu, còn những gì](TASKS.md) (mỗi việc một dòng)

## Tài liệu
`Docs/design/`: thiết kế đang dùng
- [**Thiết kế MVP** (bản chơi được đầu tiên)](Docs/design/MVP_DESIGN.md)
- [Thiết kế quân đội](Docs/design/ARMY_DESIGN.md)
- [Kế hoạch bản đồ](Docs/design/MAPS_PLAN.md)
- [Điện và lưu trữ điện](Docs/design/POWER_STORAGE.md)
- [Khung tính năng (danh sách tính năng có ưu tiên)](Docs/design/FEATURE_FRAMEWORK.md)

`Docs/reference/`: tham chiếu
- [Battle Drones](Docs/reference/BATTLEDRONES_REFERENCE.md)
- [Thiết kế gốc quản lý sư đoàn (Art of War)](Docs/reference/REF_ARTOFWAR_GDD_MASTER.md)

`Docs/legacy-unity/`: tài liệu thời bản Unity (đã bỏ; ý tưởng vẫn tham khảo được)
- [Thiết kế game (GDD)](Docs/legacy-unity/GAME_DESIGN_DOCUMENT.md)
- [Nội dung game](Docs/legacy-unity/GAME_CONTENT.md)
