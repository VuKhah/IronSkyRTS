# IRON SKY RTS — Hướng Dẫn Cho Agent

Bộ nhớ kỹ thuật của dự án. Đọc hết trước khi sửa code.

## 1. Dự án là gì
- **Iron Sky: Tư Lệnh Chiến Thuật & Hậu Cần**: game chiến thuật thời gian thực (RTS) **3D** chạy trên trình duyệt, chơi được cả trên điện thoại.
- **Đang làm lại từ đầu (từ 03/11/2026)** bằng web. Bản Unity 6 cũ chỉ là bản thử, đã bỏ. Mã nguồn cũ được sao lưu ở `D:\workspaces\game-with-khanh\IronSkyRTS_Unity_Backup_2026-11-03.zip` để tham khảo logic, **không port từng dòng**.
- **Tài liệu tham chiếu:** (1) Battle Drones của Simon Willison, xem `Docs/reference/BATTLEDRONES_REFERENCE.md`; (2) bản thiết kế game đầu tiên của người dùng (RTS quản lý cấp sư đoàn), xem `Docs/reference/REF_ARTOFWAR_GDD_MASTER.md`. Iron Sky giữ hướng quản lý sư đoàn nhưng **mỗi trận không quá 20 phút** (`Docs/design/MVP_DESIGN.md` mục 17). Ta chỉ học **cơ chế thể loại**. Tên quân, mô hình, chỉ số, bối cảnh và code đều là của Iron Sky; không chép tên, art hay code của họ.
- **Thiết kế MVP (đang làm):** `Docs/design/MVP_DESIGN.md` gồm phạm vi, con số và lộ trình M0–M9 của bản chơi được đầu tiên. Đây là việc ưu tiên số một. Mọi thứ ngoài tài liệu này để sau MVP.
- **Khung tính năng:** `Docs/design/FEATURE_FRAMEWORK.md` là danh sách việc cần làm chính, có ưu tiên P1–P3 và trạng thái. Cập nhật trạng thái mỗi khi xong một tính năng.
- **Tài liệu thiết kế:** `Docs/legacy-unity/GAME_DESIGN_DOCUMENT.md` và `Docs/legacy-unity/GAME_CONTENT.md` được viết cho bản Unity; nội dung thiết kế vẫn dùng được, còn các chi tiết riêng của Unity thì bỏ qua.
- **Đầu việc:** `TASKS.md` (thư mục gốc) là danh sách ngắn, mỗi việc một dòng, cho người dùng biết đã làm tới đâu. **Cập nhật mỗi khi xong hoặc thêm một việc**, kể cả dòng tổng "Tiến độ".
- **Thư mục tài liệu:** `Docs/design/` (thiết kế đang dùng: MVP, quân đội, bản đồ, điện, khung tính năng), `Docs/reference/` (tham chiếu), `Docs/legacy-unity/` (tài liệu thời Unity).
- **Ngôn ngữ:** tiếng Việt có dấu đầy đủ, cả trong game lẫn khi giao tiếp.
- **NGUYÊN TẮC THIẾT KẾ: người chơi là Tư lệnh tối cao, không phải người lái xe** (phán quyết 04/11/2026). Mọi tối ưu hậu cần (điều độ điện, đốt Dầu, nạp/xả pin, cắt điện chỗ nào trước, sau này là ray, tiếp tế, đạn) do "bộ phận hậu cần" **tự động** làm. Người chơi chỉ thấy **con số tổng** (có bao nhiêu, dùng bao nhiêu) và được **báo trước** khi sắp thiếu để kịp phản ứng. Không thêm nút bật/tắt hay chỉnh tay kiểu vi quản lý; quyền của người chơi là quyết định chiến lược: xây gì, ở đâu, đánh lúc nào.

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

## 4. Cấu trúc mã nguồn (bản v1 — MVP chơi được, từ 04/11/2026)
- **`src/sim/` — lõi mô phỏng tất định** (không import Three.js / DOM):
  - `content.ts`: chỉ số binh chủng, công trình và `RULES` (luật MVP). Nguồn số liệu duy nhất. **Mọi số là số tạm** chờ buổi bàn chỉ số sau bản demo. Sát thương = gốc × `RULES.damageMatrix[armorClass][dmgType]` (4 lớp giáp Nhẹ/Nặng/Công sự/Kết cấu × 3 loại đạn Thường/Xuyên giáp/Nổ; không còn giảm % riêng lẻ). Mọi lựa chọn về quân (giáp, loại đạn, nổ lan, công phá `breach`, ma trận) phải là dữ liệu ở đây; `world.ts` không rẽ nhánh theo tên quân khi tính sát thương, để chỉnh về sau chỉ cần sửa số (`Docs/design/ARMY_DESIGN.md` Bước 3 mục 5). **Cơ chế bắn** cũng là trường dữ liệu tùy chọn dùng chung: vũ khí có `barrels` (súng nhiều nòng), `fireArc` (góc được bắn của máy bay), `burst`, `deploy` (Lockdown), `movePenalty`, `traverse` (tháp pháo xoay chậm), `carpet` (rải thảm), `minRange`, `reveal`, `scatter`, `interceptable`; binh chủng có `secondary` (vũ khí phụ có cơ số đạn mỗi lần xuất kích), `diveAlt`, `frontArmor`, `pointDefense` (bảng ở `Docs/design/ARMY_DESIGN.md` mục "Cơ chế bắn").
  - `fmath.ts`: `dsin/dcos` tự viết, `turnToward` (ngoặt không dùng góc), `Rng` (mulberry32).
  - **`maps/` — bản đồ là thành phần riêng** (`Docs/design/MAPS_PLAN.md`): `types.ts` (`MapDef`: kích thước, hình dáng `bounds`, căn cứ, mỏ đặt tay, đồi, đá, sông + lối qua, vùng địa hình `regions`), `game-map.ts` (`GameMap`: dựng từ `MapDef`, trả lời đi được / độ cao / mặt cầu / loại địa hình), **`terrain.ts` (file chung duy nhất cho hiệu ứng địa hình: tốc độ, tầm nhìn, che chắn, màu)**, mỗi bản đồ một file (`iron-valley.ts`; `proving-ground.ts` là bản đồ kiểm thử chữ nhật viền lục giác), `index.ts` (`MAP_DEFS` hiện ở menu, `DEV_MAP_DEFS` chỉ mở bằng `?map=`, `getMap(id)`), `maps.test.ts` (mọi bản đồ: đối xứng 180°, căn cứ không bị chặn, mỏ đi tới được). Thêm bản đồ = thêm file dữ liệu + đưa vào `MAP_DEFS`. **`MapDef.symmetric`**: chỉ khai báo nửa phía Lam, `GameMap` tự thêm bản xoay 180° (mỏ đổi chủ; thứ ở đúng tâm không nhân đôi; sông qua tâm tự đối xứng thì chỉ nhân đôi lối qua).
  - **Không còn hằng số bản đồ toàn cục** (B1, 05/11/2026): `World` nhận bản đồ qua `WorldOptions.map` (mã hoặc `GameMap`, mặc định "Thung Lũng Sông Sắt") và giữ ở `world.map`; lưới, sương mù, giới hạn bay (`map.airX/airZ`), kiểm tra ngoài bản đồ (`map.fits`) đều đọc từ đó. Phần vẽ nhận `GameMap` qua hàm khởi tạo (`BattleScene`, `Minimap`, `RtsCamera`, `Views`, `Fx`) hoặc đọc `world.map`. Đừng viết cứng kích thước, tọa độ căn cứ hay hướng sông ở bất cứ đâu. Kịch bản thiết kế luôn chạy trên `SCENARIO_MAP` ("Thung Lũng Sông Sắt", bãi thử `arenaPoint(v)`).
  - Độ cao: `GameMap.terrainHeight`/`groundY` dùng cho cả phần vẽ lẫn sim, phải giữ tất định. Sim lưu độ cao từng ô ở `World.cellH`: đứng cao cộng tầm nhìn / tầm bắn (`RULES.terrain`), đồi và đá che tầm nhìn quân mặt đất (`stampLos`, tia nhìn tính sẵn theo bán kính).
  - `grid.ts`: lưới 2 m, `cols × rows` ô lấy từ `GameMap` (chỉ số `cz * cols + cx`; Thung Lũng Sông Sắt là 80×80), A* 8 hướng + kéo thẳng đường bằng LOS, `nearestFree`.
  - `types.ts`: `Unit`, `Building`, `Mine`, `Order` (lệnh), `SimEvent` (sự kiện cho phần vẽ / âm thanh). Lệnh `sb*` (`sbSpawn`, `sbRemove`, `sbHeal`, `sbClear`, `sbHold`, `sbFuel`) chỉ có tác dụng khi `World` tạo với `{ sandbox: true }`; trận thường bỏ qua (có kiểm thử).
  - `world.ts`: `World.step(cmds)` — 1 tick = 0.1 s; kinh tế, chiếm mỏ, Xe Vận Tải, **điện** (`computePower`: phát/tiêu thụ/hiệu suất, Nhà Máy Điện đốt Dầu, vùng xây theo `zone`), sản xuất, chiến đấu, không quân + nhiên liệu (Bingo động, dầu dự trữ), sương mù + radar, 3 điều kiện thắng; `hashWorld()`. Chế độ thử nghiệm (`sandbox`): chỉ có 2 HQ, tài nguyên vô hạn, không xử thắng thua, `stats.damageDealt` để đo sát thương.
  - `scenarios.ts`: **kịch bản thiết kế**: ý đồ trong `Docs/design/ARMY_DESIGN.md` viết thành phép thử có tiêu chí đạt/chưa đạt (đạo diễn ra lệnh `sb*` mỗi tick, chấm điểm khi ngã ngũ). Chạy trong Phòng Thử Nghiệm hoặc `npm run balance`. Kịch bản đã chốt nằm trong `REQUIRED` của `sim.test.ts`: chỉnh số làm hỏng ý đồ thì `npm test` báo. Gồm `reaction-time` (giao tranh tầm trung mất nửa quân sau ≥ 7 giây, tiêu chí kịp phản ứng).
  - `ai.ts`: AI 1 độ khó, chỉ ra lệnh và chỉ đọc phần mình thấy; dùng seed trận để mỗi trận một khác.
  - Kiểm thử: `content.test.ts`, `sim.test.ts` (tất định, tìm đường, kinh tế, AI đấu AI trọn trận), `mechanics.test.ts` (hành vi từng cơ chế bắn; cơ chế chưa quân nào dùng thì tạm gắn cho quân có sẵn bằng `patchWeapon`).
- **`src/render/models/`**: mô hình 3D bằng code. Mỗi mô hình là một `Rig` (`root`, `actions`, `defaultOn`, `radius`, `update()`, tùy chọn `setAim()` cho tháp pháo và `setFlight()` cho máy bay do chiến trường điều khiển). Điểm vào: `buildModel(id, faction, showcase)`; mỏ: `buildNode(res)` trong `nodes.ts`.
  - Mô hình hiện là **BẢN NHẸ**. Bản chi tiết sẽ thay thế nhưng phải giữ giao diện `Rig` và tên hoạt ảnh (`move`, `aim`, `fire`, `fly`, `work`, `load`, `loadOil`…).
- **`src/game/` — trận đấu trên trình duyệt** (`index.html`):
  - `main.ts` (menu, vòng lặp, màn kết thúc), `match.ts` (tick cố định + nội suy, gom lệnh, nhật ký lệnh), `scene.ts` (địa hình, nước, cầu, cây, sương mù), `views.ts` (sim → mô hình, nội suy), `fx.ts` (đạn, nổ, khói), `controller.ts` (chọn, ra lệnh theo ngữ cảnh, đặt công trình, phím tắt), `input.ts` (cử chỉ chạm/chuột), `camera.ts`, `hud.ts`, `overlay.ts` (thanh máu/dầu 2D), `minimap.ts`, `audio.ts` (âm thanh tổng hợp), `sandbox.ts` (**Phòng Thử Nghiệm**: bảng thả quân/công trình, công cụ Xóa/Hồi đầy, ngừng bắn, đấu thử nhanh, bảng đo sát thương; mọi thao tác đi qua `match.issueAs(side, order)` nên vẫn tất định).
- **`src/tools/simulate.ts`**: chạy nhiều trận AI đấu AI không giao diện (`npm run simulate -- 20`).
- **`src/tools/balance.ts`**: chấm mọi kịch bản thiết kế, in ĐẠT / CHƯA ĐẠT (`npm run balance`, hoặc `npm run balance -- <mã>`). Không làm hỏng `npm test`: chỉ số còn tạm.
- `models.html` + `src/models-page/`: **Xưởng Mô Hình**. URL `models.html?act=fly,fire&f=do#valkyrie`; `?flight=1` thử chế độ bay do chiến trường điều khiển.

### Tham số URL để thử nghiệm trận (`index.html`)
`?play=vsai|aivai` vào thẳng trận · `&map=<mã>` chọn bản đồ (ví dụ `proving-ground`; menu chọn bản đồ là bước B6) · `&seed=N` · `&skip=N` tua nhanh N giây đầu · `&cam=x,z,dist` đặt camera · `&script=1` kịch bản tự chơi (đặt Xưởng Xe, chiếm mỏ, đúc Titan) và in log `[script]` · `&debug=1` in log vài khung hình đầu · `&nooverlay=1`, `&nofx=1`, `&noshadow=1` tắt từng lớp để khoanh vùng lỗi hình.
`?play=sandbox` Phòng Thử Nghiệm · `&duel=lynx:3,titan:1` vào thẳng trận đấu thử (Lam trước, Đỏ sau) · `&dist=44` khoảng cách hai nhóm (m) · `&skip=N` tua sau khi thả quân. Ví dụ chia sẻ kịch bản cân bằng: `?play=sandbox&duel=falcon:10,skyguard:4` · `&scenario=<mã>` chạy thẳng một kịch bản thiết kế (ví dụ `titan-vs-lynx-seq`).

### Hiệu năng (chống lag)
- **Lõi sim:** ~0.16 ms/tick trung bình, đỉnh ~5 ms khi nhiều xe cùng tìm đường (đo 04/11/2026) — không phải điểm nghẽn.
- **Phần vẽ là điểm nghẽn: số lệnh vẽ (draw call).** Mọi mô hình trên chiến trường đi qua `bakeStatic()` (`src/render/models/bake.ts`): tự dò bộ phận động bằng cách chạy thử hoạt ảnh, rồi gộp các khối đứng yên cùng vật liệu vào tổ tiên động gần nhất. Bánh xe đánh dấu `userData.cosmetic` → gộp luôn (mất hiệu ứng quay ở chiến trường). Kết quả: 766 → 387 lệnh vẽ ở cùng một cảnh. Mô hình mới **không cần làm gì thêm**; chỉ cần bộ phận chuyển động phải nằm trong khung (Group) riêng.
- **Tự hạ chất lượng** khi FPS < 40 (đo mỗi 2 giây): giảm độ phân giải → tắt bóng đổ → độ phân giải thấp; điện thoại khởi đầu ở mức nhẹ. Giới hạn 260 hạt hiệu ứng.
- Đo: `?perf=1` (FPS, lệnh vẽ, tam giác, số mesh) · `?hq=1` khóa chất lượng (dùng khi chụp ảnh bằng Chrome không giao diện, vì máy CPU luôn < 40 FPS) · Xưởng Mô Hình `?bake=1` xem mô hình đã gộp.
- Ngân sách mục tiêu cho điện thoại: < 500 lệnh vẽ khi trận đông.

### Bài học đã gặp (đừng lặp lại)
- **`dt` của khung hình phải chặn trong [0, 0.1]** và đo bằng `performance.now()`: mốc thời gian của `requestAnimationFrame` có thể sớm hơn mốc khởi tạo → `dt` âm làm nổ các phép nội suy `exp()` (càng máy bay dài hàng chục mét).
- CSS `display: flex` đè thuộc tính `hidden` → đã có luật `[hidden] { display: none !important; }`.
- Three.js 0.187 đã bỏ `PCFSoftShadowMap` → dùng `PCFShadowMap`.
- Chrome không giao diện vẽ bằng CPU nên ~1–2 giây mỗi khung hình: muốn xem giữa trận thì dùng `skip`/`script`, đừng chờ thời gian thật.
- **`Math.hypot` cũng không dùng trong sim**: chuẩn JS không bắt buộc kết quả giống nhau giữa các trình duyệt. Dùng `Math.sqrt(dx*dx + dz*dz)` (sqrt được IEEE bảo đảm làm tròn đúng). Phần giao diện tính tọa độ cho lệnh thì dùng thoải mái, vì lệnh được ghi lại nguyên giá trị.
- **Đổi luật chơi thì chạy lại `npm run simulate`**, không chỉ `npm run balance`: AI được viết theo luật cũ. Ví dụ: bỏ sát thương mặt đất của SkyGuard làm trận AI đấu AI hòa gần một nửa, dù mọi kịch bản vẫn đạt (`Docs/design/ARMY_DESIGN.md` Bước 4).
- **Chỉnh nhịp trận bằng máu, không bằng sát thương:** nhân máu mọi quân cùng hệ số thì ai thắng ai giữ nguyên, chỉ có trận dài ra. Đừng nhân theo vũ khí công trình, vì làm vậy phòng thủ áp đảo.
- **Máy bay đuổi mục tiêu bằng cách quay mũi về nó sẽ bay vòng tròn quanh mục tiêu** (bán kính ngoặt giới hạn). `fly()` có lượt bổ nhào: bay qua thì giữ thẳng (`u.ext`) tới khi đủ xa mới quay lại. Máy bay lái bằng `steerAir()`: tốc độ ngoặt tăng giảm dần (`u.yawRate`), đừng quay lại kiểu ngoặt hết cỡ ngay vì đường bay và độ nghiêng cánh sẽ giật. Có kiểm thử trong `mechanics.test.ts`.
- **Máy bay vẽ bằng nội suy Hermite** (`Views.hermite`), không nối thẳng giữa hai tick: bay nhanh, ngoặt gắt thì nối thẳng thành đa giác gãy khúc. Bộ phận ẩn/hiện theo trạng thái (ví dụ tên lửa dưới cánh, `setAmmo`) phải được `bakeStatic` chạy thử, không thì bị gộp vào thân và không ẩn được.
- **Tìm đường thất bại thì đừng thử lại mỗi tick**: A* thất bại quét gần cả bản đồ (~10 ms). `chase()` chỉ tìm lại khi tới hẹn (1 giây) hoặc đã đi hết một đường tìm được; đuổi công trình thì nhắm ô trống gần nhất cạnh nó (ô ở tâm bị chính nó chiếm). Lỗi cũ: 2 xe đuổi một tháp làm trận AI chậm 20 lần.
- `tsconfig` tắt `noUncheckedIndexedAccess`: mã lưới / mảng kiểu (typed array) truy cập chỉ số liên tục, bật lên thì toàn dấu `!` mà không an toàn hơn.

## 5. Quy trình và lệnh
- `npm run dev`: server phát triển, tự tải lại khi sửa code (http://localhost:5173 — game; /models.html — Xưởng Mô Hình).
- `npm run check`: kiểm tra kiểu TypeScript. `npm test`: chạy kiểm thử Vitest (gồm 1 trận AI đấu AI trọn vẹn).
- `npm run simulate -- N`: N trận AI đấu AI không giao diện, in kết quả và thống kê (dùng để cân bằng).
- `npm run balance`: chấm các kịch bản thiết kế (ý đồ binh chủng) với chỉ số hiện tại.
- `npm run build`: kiểm tra kiểu rồi build ra `dist/`. `npm run preview`: chạy thử bản build (http://localhost:4173).
- **Tự xem kết quả bằng Chrome không giao diện** (WebGL qua SwiftShader):
  `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1280,800 --virtual-time-budget=5000 --screenshot=<file.png> "http://localhost:4173/?play=aivai&seed=3&skip=170&hq=1"`
  Đọc log console: thêm `--enable-logging=stderr --v=0` và lọc dòng `CONSOLE`.
- Sau mỗi thay đổi phải chạy `npm run check` và `npm test`. Khi đụng tới phần hiển thị thì chụp màn hình để kiểm tra.
- Commit nhỏ, thông điệp rõ ràng. Chỉ push khi người dùng yêu cầu.
