# IRON SKY RTS — Hướng Dẫn Cho Agent

Bộ nhớ kỹ thuật của dự án. Đọc hết trước khi sửa code.

## 1. Dự án là gì
- **Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần**: game chiến thuật thời gian thực (RTS) 2.5D chạy trên trình duyệt, chơi được cả trên điện thoại.
- **Đang làm lại từ đầu (từ 03/11/2026)** bằng web. Bản Unity 6 cũ chỉ là bản thử, đã bỏ. Mã nguồn cũ được sao lưu ở `D:\workspaces\game-with-khanh\IronSkyRTS_Unity_Backup_2026-11-03.zip` để tham khảo logic, **không port từng dòng**.
- **Game tham chiếu:** Battle Drones của Simon Willison. Xem `Docs/BATTLEDRONES_REFERENCE.md`. Ta chỉ học **cơ chế thể loại**. Tên quân, mô hình, chỉ số, bối cảnh và code đều là của Iron Sky; không chép tên, art hay code của họ.
- **Tài liệu thiết kế:** `Docs/GAME_DESIGN_DOCUMENT.md` và `Docs/GAME_CONTENT.md` được viết cho bản Unity; nội dung thiết kế vẫn dùng được, còn các chi tiết riêng của Unity thì bỏ qua.
- **Ngôn ngữ:** tiếng Việt có dấu đầy đủ, cả trong game lẫn khi giao tiếp.

## 2. Công nghệ dự kiến
- **Vite + TypeScript + Three.js**, xuất ra web tĩnh (PWA) và đăng trên GitHub Pages.
- **Âm thanh và nhạc** tổng hợp bằng Web Audio API, không dùng file âm thanh.
- **Mô hình 3D** dựng bằng code từ các khối hình cơ bản của Three.js.
- **Multiplayer** (về sau): lockstep tất định, chuyển tin qua một relay WebSocket không trạng thái, vào trận bằng mã phòng. **Không có tài khoản.** Tiến trình lưu trong `localStorage`.

## 3. Quy tắc kiến trúc bắt buộc
1. **Lõi mô phỏng (`src/sim/`) phải tất định và tách khỏi phần vẽ:**
   - Tick cố định (10 Hz). Phần vẽ nội suy giữa các tick.
   - Cấm dùng `Math.random`, `Date.now`, `performance.now` hay `Math.sin/cos/atan2` trong sim. Dùng RNG có seed và hàm toán học tự viết.
   - `src/sim/` không import Three.js hay DOM.
   - Sim chỉ thay đổi khi nhận **lệnh** của người chơi hoặc AI, theo dạng `{ tick, playerId, order }`.
   - Có hàm băm trạng thái. Kiểm thử bắt buộc: chạy cùng seed và cùng danh sách lệnh hai lần thì phải ra cùng mã băm.
2. **AI** chỉ ra lệnh qua cùng kênh lệnh với người chơi và chỉ nhìn thấy phần không bị sương mù che.
3. Có thể cho **AI đấu với AI không cần giao diện** bằng Node, để cân bằng chỉ số.

## 4. Quy trình
- Sau mỗi thay đổi, chạy kiểm tra kiểu và kiểm thử (lệnh cụ thể sẽ ghi vào đây khi dựng xong khung dự án).
- Commit nhỏ, thông điệp rõ ràng. Chỉ push khi người dùng yêu cầu.
