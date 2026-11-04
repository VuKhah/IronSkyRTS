# IRON SKY RTS — Hướng Dẫn Cho Agent

Bộ nhớ kỹ thuật của dự án. Đọc hết trước khi sửa code.

## 1. Dự án là gì
- **Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần**: game chiến thuật thời gian thực (RTS) **3D** chạy trên trình duyệt, chơi được cả trên điện thoại.
- **Đang làm lại từ đầu (từ 03/11/2026)** bằng web. Bản Unity 6 cũ chỉ là bản thử, đã bỏ. Mã nguồn cũ được sao lưu ở `D:\workspaces\game-with-khanh\IronSkyRTS_Unity_Backup_2026-11-03.zip` để tham khảo logic, **không port từng dòng**.
- **Game tham chiếu:** Battle Drones của Simon Willison. Xem `Docs/BATTLEDRONES_REFERENCE.md`. Ta chỉ học **cơ chế thể loại**. Tên quân, mô hình, chỉ số, bối cảnh và code đều là của Iron Sky; không chép tên, art hay code của họ.
- **Thiết kế MVP (đang làm):** `Docs/MVP_DESIGN.md` gồm phạm vi, con số và lộ trình M0–M9 của bản chơi được đầu tiên. Đây là việc ưu tiên số một. Mọi thứ ngoài tài liệu này để sau MVP.
- **Khung tính năng:** `Docs/FEATURE_FRAMEWORK.md` là danh sách việc cần làm chính, có ưu tiên P1–P3 và trạng thái. Cập nhật trạng thái mỗi khi xong một tính năng.
- **Tài liệu thiết kế:** `Docs/GAME_DESIGN_DOCUMENT.md` và `Docs/GAME_CONTENT.md` được viết cho bản Unity; nội dung thiết kế vẫn dùng được, còn các chi tiết riêng của Unity thì bỏ qua.
- **Ngôn ngữ:** tiếng Việt có dấu đầy đủ, cả trong game lẫn khi giao tiếp.

## 2. Công nghệ dự kiến
- **Vite + TypeScript + Three.js**, xuất ra web tĩnh (PWA) và đăng trên GitHub Pages.
- **Âm thanh và nhạc** tổng hợp bằng Web Audio API, không dùng file âm thanh.
- **Mô hình 3D** dựng bằng code từ các khối hình cơ bản của Three.js.
- **Multiplayer** (về sau): lockstep tất định, chuyển tin qua một relay WebSocket không trạng thái, vào trận bằng mã phòng. **Không có tài khoản.** Tiến trình lưu trong `localStorage`.

### Nghĩa của "3D" trong Iron Sky (chốt ngày 03/11/2026, thay cho 2.5D)
- **Hình ảnh 3D thật:** địa hình có độ cao (đồi, thung lũng, lòng sông trũng), mô hình 3D, đổ bóng, ánh sáng. Camera **xoay 360°, nghiêng và zoom** tự do, không khóa góc isometric.
- **Luật chơi đặt trên mặt đất (x, z) cộng với độ cao**, giống mọi game RTS 3D:
  - Quân mặt đất đi trên bản đồ độ cao (heightmap). Độ dốc làm chậm, chỗ dốc quá thì không đi được.
  - Máy bay có thêm biến độ cao (altitude) riêng.
  - Đứng trên cao được **cộng tầm nhìn và tầm bắn**. Đồi **che tầm nhìn** (sương mù có tính tới địa hình).
  - Đạn pháo và bom bay theo quỹ đạo, nhưng tính trong sim bằng công thức tất định chứ không dùng engine vật lý.
- Không dùng engine vật lý thời gian thực (Rapier, Cannon…) cho luật chơi, vì chúng phá tính tất định. Chỉ được dùng cho hiệu ứng thuần hình ảnh như mảnh vỡ hay xác xe văng ra.

## 3. Quy tắc kiến trúc bắt buộc
1. **Lõi mô phỏng (`src/sim/`) phải tất định và tách khỏi phần vẽ:**
   - Tick cố định (10 Hz). Phần vẽ nội suy giữa các tick.
   - Cấm dùng `Math.random`, `Date.now`, `performance.now` hay `Math.sin/cos/atan2` trong sim. Dùng RNG có seed và hàm toán học tự viết.
   - `src/sim/` không import Three.js hay DOM.
   - Sim chỉ thay đổi khi nhận **lệnh** của người chơi hoặc AI, theo dạng `{ tick, playerId, order }`.
   - Có hàm băm trạng thái. Kiểm thử bắt buộc: chạy cùng seed và cùng danh sách lệnh hai lần thì phải ra cùng mã băm.
2. **AI** chỉ ra lệnh qua cùng kênh lệnh với người chơi và chỉ nhìn thấy phần không bị sương mù che.
3. Có thể cho **AI đấu với AI không cần giao diện** bằng Node, để cân bằng chỉ số.

## 4. Cấu trúc mã nguồn
- `src/sim/content.ts`: chỉ số của mọi binh chủng và công trình (dữ liệu thuần). Là nguồn số liệu duy nhất cho sim, AI và UI.
- `src/render/models/`: mô hình 3D dựng bằng code. Mỗi mô hình là một `Rig` gồm `root`, `actions`, `defaultOn`, `radius` và `update()`. Điểm vào duy nhất là `buildModel(id, faction)`.
  - `kit.ts`: vật liệu theo phe (dùng chung, không dispose), các khối hình, `FireClock`, `approach`.
  - `units.ts`: 6 binh chủng. `buildings.ts`: 10 công trình.
  - Mô hình hiện là **BẢN NHẸ**. Bản chi tiết sẽ thay thế, nhưng phải giữ nguyên giao diện `Rig` và tên hoạt ảnh (`move`, `aim`, `fire`, `fly`, `work`…).
- `models.html` + `src/models-page/`: **Xưởng Mô Hình**. Gồm `stage.ts` (renderer, đèn, OrbitControls, chụp ảnh thu nhỏ) và `main.ts` (danh sách, phiếu thông số, nút hoạt ảnh). URL `models.html?act=fly,fire&f=do#valkyrie` mở thẳng một mô hình với hoạt ảnh và phe chọn sẵn.
- `index.html`: trang game (hiện là trang chờ).

## 5. Quy trình và lệnh
- `npm run dev`: server phát triển, tự tải lại khi sửa code (http://localhost:5173).
- `npm run check`: kiểm tra kiểu TypeScript. `npm test`: chạy kiểm thử Vitest.
- `npm run build`: kiểm tra kiểu rồi build ra `dist/`. `npm run preview`: chạy thử bản build (http://localhost:4173).
- **Tự xem kết quả bằng Chrome không giao diện** (WebGL qua SwiftShader):
  `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1280,800 --virtual-time-budget=5000 --screenshot=<file.png> "http://localhost:4173/models.html#titan"`
- Sau mỗi thay đổi phải chạy `npm run check` và `npm test`. Khi đụng tới phần hiển thị thì chụp màn hình để kiểm tra.
- Commit nhỏ, thông điệp rõ ràng. Chỉ push khi người dùng yêu cầu.
