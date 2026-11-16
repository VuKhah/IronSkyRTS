# Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần

Game chiến thuật thời gian thực 3D chạy ngay trên trình duyệt. Hai phe Liên Minh Lam và Tập Đoàn Đỏ tranh giành mỏ Sắt và Dầu trên địa hình bậc thang. Người chơi là Tư lệnh: xây căn cứ, đúc quân theo lô, điều cả sư đoàn; hậu cần (lưới điện, xe vận tải chở quặng, máy bay về nạp Dầu) tự vận hành.

> 🎮 **Bản v1 (MVP) chơi được.** TypeScript + Three.js, chạy trên trình duyệt, điều khiển bằng chạm hoặc chuột.

## Chơi thử
**Chơi ngay trên trình duyệt (cả điện thoại):** https://vukhah.github.io/IronSkyRTS/ · Xưởng Mô Hình: https://vukhah.github.io/IronSkyRTS/models.html

Chạy trên máy mình:
```
npm install
npm run dev
```
Mở http://localhost:5173 → **Chơi với AI** hoặc **Xem AI đấu AI**. Xưởng Mô Hình: http://localhost:5173/models.html

Thắng khi: diệt Xe Tư Lệnh địch, phá hết công trình địch, hoặc giữ trọn mọi mỏ của một loại (Sắt hoặc Dầu) liên tục 30 giây.

## Cho nhà phát triển
- `npm test` — kiểm thử (gồm tất định và 1 trận AI đấu AI)
- `npm run simulate -- 20` — 20 trận AI đấu AI không giao diện để cân bằng
