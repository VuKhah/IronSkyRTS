# Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần

Game chiến thuật thời gian thực 3D chạy ngay trên trình duyệt. Hai phe Liên Minh Lam và Tập Đoàn Đỏ tranh giành dòng sông chéo với 7 cây cầu, các mỏ Vàng, Dầu và Sắt. Trong game có mạng lưới điện, đường ray tiếp đạn phòng không và không quân phải nạp dầu.

> 🎮 **Bản v1 (MVP) chơi được.** TypeScript + Three.js, chạy trên trình duyệt, điều khiển bằng chạm hoặc chuột.

## Chơi thử
```
npm install
npm run dev
```
Mở http://localhost:5173 → **Chơi với AI** hoặc **Xem AI đấu AI**. Xưởng Mô Hình: http://localhost:5173/models.html

Thắng khi: diệt Xe Tư Lệnh địch, phá hết công trình địch, hoặc giữ trọn một loại mỏ (4/4 Sắt hoặc 3/3 Dầu) liên tục 30 giây.

## Cho nhà phát triển
- `npm test` — kiểm thử (gồm tất định và 1 trận AI đấu AI)
- `npm run simulate -- 20` — 20 trận AI đấu AI không giao diện để cân bằng

## Tài liệu
- [**Thiết kế MVP** (bản chơi được đầu tiên)](Docs/MVP_DESIGN.md)
- [Khung tính năng (danh sách việc cần làm chính)](Docs/FEATURE_FRAMEWORK.md)
- [Thiết kế game (GDD)](Docs/GAME_DESIGN_DOCUMENT.md)
- [Nội dung game](Docs/GAME_CONTENT.md)
- [Tham chiếu: Battle Drones](Docs/BATTLEDRONES_REFERENCE.md)
- [Tham chiếu: thiết kế gốc quản lý sư đoàn (Art of War)](Docs/REF_ARTOFWAR_GDD_MASTER.md)
