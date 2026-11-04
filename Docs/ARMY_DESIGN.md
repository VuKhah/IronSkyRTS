# Thiết Kế Quân Đội — Iron Sky

> Bắt đầu 04/11/2026. Đi từng ý một: **chốt danh sách và phân vai trước**, ma trận Giáp × Đạn chỉnh sau.
> Danh sách gom từ ba nguồn: quân đang có trong game, Khung Tính Năng (`FEATURE_FRAMEWORK.md`) và thiết kế gốc quản lý sư đoàn (`REF_ARTOFWAR_GDD_MASTER.md`).
>
> **Cách dùng:** với mỗi loại quân, bạn ghi vào các dòng trống (sau dấu `:`). Muốn bỏ thì ghi "Bỏ" ở dòng **Quyết định**; muốn gộp với loại khác thì ghi "Gộp với …". Muốn thêm loại quân mới thì chép một khối mẫu ở cuối file.
> Dòng *Hiện tại* chỉ để tham khảo, là những gì đang có trong game. Bạn không cần giữ theo.

Ký hiệu: ✅ đang có trong game · 🗓 đã lên kế hoạch · 💡 từ thiết kế gốc

---

## A. CHỈ HUY

### 1. Xe Tư Lệnh ✅
*Hiện tại:* xe chỉ huy 6 bánh, có sẵn từ đầu trận, không đúc thêm. Hào quang +18% tốc bắn. Mất là thua.
- **Quyết định** (giữ / bỏ / gộp): Giữ, tái định hình
- **Vai trò mong muốn:*Trái tim lưu động của toàn quân; giữ mạng sống của người chơi và là nguồn tăng cường năng lực chiến thuật khẩn cấp*
- **Điểm mạnh nổi bật:*Tầm nhìn cực rộng, kháng hiệu ứng làm chậm (xem mục "Hệ thống hiệu ứng" cuối file), có giáp phòng thủ điểm chặn được 1–2 phát đạn pháo đầu tiên (bắt buộc giữ: chống chiến thuật Drone chỉ điểm + Pháo một phát hạ Tư Lệnh)*
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:*Tổng động viên (Kích hoạt): Tăng 30% tốc độ di chuyển và 20% tốc độ bắn cho mọi đơn vị trong bán kính hào quang;Giao thức khẩn cấp: Tự động tăng tốc rút chạy khi lượng máu tụt dưới 30%.*
- **Ghi chú:* sẽ có nhiều loại xe tư lệnh sẽ được thêm vào; Vai trò tư lệnh được tạo ra để có thể chạy trốn hoặc tổng động viên quân đội thay cho tòa nhà - nhà Tổng Hành Dinh có vai trò tạo tài nguyên ban đầu, giới hạn tối đa quân*

---

## B. HẬU CẦN

### 2. Xe Vận Tải ✅
*Hiện tại:* đào và chở 100 Sắt hoặc Dầu từ mỏ về Tổng Hành Dinh. Không vũ khí.
- **Quyết định:*Giữ*
- **Vai trò mong muốn:*Khai thác, kết nối kinh tế vi mô từ mỏ tài nguyên độc lập về căn cứ*
- **Điểm mạnh nổi bật:*Rẻ, chế tạo nhanh*
- **Điểm yếu chí mạng:*Giáp mỏng, không vũ khí*
- **Cơ chế riêng:*Bảo vệ hàng hóa — Khi phát hiện nguy hiểm gần đó, tự động quay đầu tháo chạy về chốt phòng thủ gần nhất thay vì đâm đầu qua vùng chiến sự, có thể bật tắt chế độ này.*
- **Ghi chú:**
- **Chốt bước 2:** Tạm **không có** chế độ tự tháo chạy (cũng không có nút bật/tắt). Xe Vận Tải giữ hành vi hiện tại.

### 3. Xe Công Binh 🗓
*Hiện tại:* chưa có. Ý tưởng: sửa xe và công trình, dựng nhanh công sự.
- **Quyết định:** đang có dấu hiệu giống Drone sửa chữa, nên tạm bỏ qua
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**

### 4. Tàu Hỏa Vận Tải 💡
*Hiện tại:* chưa có. Thiết kế gốc: chạy trên ray, không tốn Dầu, chở rất nhiều; ray trúng bom thì phanh và tự sửa 5 giây.
- **Quyết định:**Giữ
- **Vai trò mong muốn:*vận tải nhanh, toàn cục *
- **Điểm mạnh nổi bật:**Vận chuyển khối lượng tài nguyên khổng lồ hoặc chuyển quân cấp tốc; không tốn Dầu vận hành thường trực; máu trâu.
- **Điểm yếu chí mạng:**Bắt buộc chạy trên ray định sẵn
- **Cơ chế riêng:**Phanh khẩn cấp & Tự phục hồi — Khi đường ray phía trước đứt đoạn, tàu dừng lại và kích hoạt đội thợ hàn tự sửa ray trong 5–8 giây.
- **Ghi chú:** Tàu không thể bị phá hủy nhưng vẫn có thể bị tấn công, có gia tốc và khi đã gia tốc thì không một đơn vị mặt đất nào đuổi kịp
- **Chốt bước 2:**
    - Tàu rất khó đánh nát. Hết máu thì **tê liệt** (dừng lại, tự sửa rồi chạy tiếp), không bị xóa khỏi trận.
    - **Phá ray kiểu "cà vạt Sherman"**: không phải quân nào cũng phá được ray. Chỉ **đòn nổ phá công sự** (đạn Pháo Tự Hành, tên lửa Xe Tên Lửa Loạt, bom Valkyrie; sau này thêm mìn, công binh phá hoại) mới cắt được ray. Đạn pháo xe tăng hay súng máy bắn trúng ray thì không có tác dụng.
    - Cần bản đồ có đường ray: **ngoài phạm vi MVP**.

---

## C. THIẾT GIÁP & XE MẶT ĐẤT

### 5. Thiết Giáp Trinh Sát Lynx ✅
*Hiện tại:* xe bánh lốp nhanh nhất, nhìn xa, chiếm mỏ, săn Xe Vận Tải. Không bắn được máy bay.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**mở bản đồ, chiếm mỏ tài nguyên bỏ hoang và săn Xe Vận Tải địch.
- **Điểm mạnh nổi bật:**Tốc độ di chuyển nhanh nhất trên mặt đất; tầm nhìn cực xa qua sương mù chiến tranh.
- **Điểm yếu chí mạng:**Giáp cực mỏng; bị Titan hạ gục sau 2–3 phát bắn; 
- **Cơ chế riêng:**Chiếm cứ điểm cơ động
- **Ghi chú:**Vẫn bắn được không quân phản ứng nhanh (Falcon, Drone), vì đầu trận khó có ngay xe phòng không chuyên dụng; nhưng cần 2–3 chiếc Lynx mới hạ được một máy bay. Đây là biện pháp chữa cháy, không phải phòng không thật sự.

### 6. Xe Tăng Chủ Lực Titan ✅
*Hiện tại:* giáp dày, pháo 120mm nổ lan, phá công trình. Chậm, không bắn được máy bay.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Cột sống mở đường và hấp thụ sát thương chính diện của mũi tiến công mặt đất.
- **Điểm mạnh nổi bật:**Giáp trước cực dày, chịu được hỏa lực của 3 xe Lynx quây cùng lúc; pháo 120mm bắn phát nào thấm phát đó (tối đa 3 viên diệt gọn 1 Lynx).
- **Điểm yếu chí mạng:**Cồng kềnh như xe tank thật Bắn đơn mục tiêu (bắn nổ), nạp đạn chậm; xoay tháp pháo có độ trễ; hoàn toàn không có vũ khí phòng không.
- **Cơ chế riêng:**Giáp góc nghiêng — Giảm 25% sát thương nhận vào từ mặt trước xe
- **Ghi chú:**Luôn luôn cần SkyGuard đi kèm để bảo vệ khỏi Falcon và Valkyrie.
- **Chốt bước 2:** Titan là xe tăng thật sự, phải **trâu hơn** mọi xe mặt đất khác. Mặt đất không có xe săn tăng giá rẻ (bộ binh đã bỏ): khắc chế Titan là Pháo Tự Hành, Falcon, Valkyrie và Titan khác.
- **Tiêu chí đo (kịch bản thiết kế):**
    - **Lần lượt:** Lynx lao vào từng chiếc, Titan không hồi máu → Titan hạ đủ 3 Lynx (`titan-vs-lynx-seq`).
    - **Cùng lúc:** 3 Lynx đánh cùng lúc → Lynx thắng, còn đúng 1 chiếc (`titan-vs-lynx-sim`).
    - ⚠️ Chỉ số tạm hiện cho Titan **nổ lan 2,8 m**, trong khi ý đồ là "bắn đơn mục tiêu". Nổ lan làm kết quả "cùng lúc" phụ thuộc Lynx đứng sát hay dãn: đứng sát thì một phát trúng cả cụm và Titan thắng. Cần quyết khi chỉnh số.
    - **Chốt bước 3:** Titan vẫn là đạn **Nổ có lan**, nhưng bán kính **nhỏ nhất** trong mọi vũ khí nổ lan (tạm 1,0 m, nhỏ hơn khoảng cách 3,6 m giữa hai xe đứng cạnh nhau, nên chỉ trúng xe thứ hai khi địch dồn cục).

### 7. Phòng Không Cơ Động SkyGuard ✅
*Hiện tại:* tên lửa phòng không tầm xa 26.5m, đi kèm đoàn xe. Yếu khi bị xe tăng áp sát.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Chiếc ô phòng không di động bảo vệ các cụm tăng thiết giáp và căn cứ trước đòn không kích.
- **Điểm mạnh nổi bật:**Khóa mục tiêu trên không từ tầm rất xa (26.5m); tên lửa truy đuổi có xác suất trúng đích cao; tốc độ chạy nhanh hơn Titan để rút lui kịp thời
- **Điểm yếu chí mạng:**Giáp giấy; không có vũ khí bắn mục tiêu mặt đất; khi vừa chạy vừa bắn thì sát thương giảm 25% **và độ chính xác giảm** (một phần tên lửa trượt).
- **Chốt bước 2:** Giữ **cả hai** cơ chế (phạt khi chạy + Lockdown). Lý do: tên lửa truy đuổi rất mạnh, cần cái giá rõ ràng để không quân không quá đuối. SkyGuard chỉ phát huy hết sức khi đứng yên, tức là chỗ đứng là quyết định của người chơi.
- **Tiêu chí đo (kịch bản thiết kế):** 10 Falcon **bay ngang** không phận của 4 SkyGuard một lượt (không tấn công SkyGuard) → SkyGuard hạ được **5–8** chiếc (`falcon-flyover-skyguard`). Falcon **tấn công thẳng** vào SkyGuard là kịch bản khác, chưa đặt tiêu chí.
- **Cơ chế riêng:**Trạng thái triển khai (Lockdown) — Mất 1.2 giây để hạ chân chống đứng yên, tăng 25% tầm bắn và 33% sát thương (đạt 100% hiệu suất)
- **Ghi chú:**Bắn theo loạt 4–6 quả tên lửa nhỏ rồi nạp lại thay vì bắn rải rác từng phát. Khi một sư đội bay 10 chiếc Falcon bay ngang đầu 4 SkyGuard, lưới phòng không này phải hạ ít nhất được khoảng 7-8 chiếc

### 8. Pháo Tự Hành 🗓 / Sư đoàn Pháo Nặng 💡
*Hiện tại:* chưa có. Thiết kế gốc: đạn phá công trình, tầm xa; đặt trên núi được +20% tầm và bắn khuất tầm nhìn.
- **Quyết định:** Giữ
- **Vai trò mong muốn:*đơn vị quân siêu mạnh với tầm bắn vượt xa mọi thứ.*
- **Điểm mạnh nổi bật:**Tầm bắn xa vượt trội ngoài tầm nhìn; độ chính xác cao;1 phát bắn có thể xóa sổ công trình nhỏ hoặc làm tàn phế xe bọc thép trong bán kính nổ.
- **Điểm yếu chí mạng:**Tốc độ di chuyển rất chậm; tốc độ nạp đạn lâu; bắn từng viên; mù tầm nhìn trực tiếp
- **Cơ chế riêng:**Địa lợi tầm cao — Triển khai trên núi/đồi được cộng thêm 20% tầm bắn và triệt tiêu độ lệch đạn
- **Ghi chú:**Khẩu pháo này rất cồng kềnh, nhưng nó có thể một viên phá hủy mọi thứ trong phạm vi nhỏ, Cơ chế xoay thân xe mất thời gian trước khi ngắm bắn.
- **Chốt bước 2:** Pháo phải **thật sự mạnh**, tạo áp lực từ tầm cực xa. Cái giá: **mỗi lần bắn là lộ vị trí** (đối phương thấy chỗ khẩu pháo trong vài giây dù đang bị sương mù che), cộng với chậm, nạp lâu và cần quân khác nhìn thấy mục tiêu hộ. Khác Xe Tên Lửa Loạt: Pháo là **một viên chính xác, xuyên giáp**, khắc mục tiêu giáp dày (Titan, tháp pháo).
- **Chốt thêm (học cơ chế từ Battle Drones, 04/11/2026):**
    - **Tầm bắn tối thiểu:** không bắn được mục tiêu đứng quá gần. Điểm yếu "bị áp sát là bất lực" có sẵn mà không cần luật riêng: Lynx lao sát vào thì Pháo vô dụng.
    - **Lộ vị trí 2 giây sau mỗi phát bắn:** đối phương nhìn thấy khẩu pháo xuyên sương mù trong 2 giây (số tạm).

### 9. Xe Tên Lửa Loạt 💡
*Hiện tại:* chưa có. Thiết kế gốc: phóng loạt tên lửa nổ diện rộng, khắc chế cụm phòng thủ tĩnh và bộ binh đông.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Hỏa lực bão hòa diện rộng (AoE), giải tán đám đông thiết giáp hạng nhẹ và công trình dàn trải.
- **Điểm mạnh nổi bật:**Khả năng san phẳng cả một vùng đất lớn chỉ trong 1 lượt phóng; tính răn đe cực cao.
- **Điểm yếu chí mạng:**Tên lửa rơi tản mác (không thể dồn sát thương đơn mục tiêu); thời gian nạp lại loạt đạn rất lâu; hoàn toàn bất lực trước máy bay.
- **Cơ chế riêng:**Rải thảm mặt đất — Chọn 1 vùng tròn trên bản đồ, xe dựng dàn phóng và xả hết cơ số đạn trong vài giây rồi bắt buộc phải nạp lại 
- **Ghi chú:**Tôi rất muốn thấy điều này trong game của ta, bất kỳ thành phố nào bị dàn xe này nhắm tới đều thành bình địa;Tạo hiệu ứng âm thanh rít và khói mù mịt để tăng tính "điện ảnh"
- **Chốt bước 2:** Tầm bắn **chỉ nhỉnh hơn Titan** (xa hơn hẳn là phần của Pháo). Đạn nổ lan nhưng **tản**, không dồn được vào một mục tiêu, nên mạnh với cụm quân giáp mỏng và công trình dàn trải, yếu với giáp dày. Điểm yếu chính là **độ khựng**: dựng dàn phóng, xả loạt, nạp lại, trong lúc đó đứng im và dễ bị áp sát.

---

## D. BỘ BINH

Quyết định chung: tạm thời BỎ toàn bộ

### 10. Tiểu Đội Súng Trường 🗓 / Bộ Binh Cơ Bản 💡
*Hiện tại:* chưa có. Thiết kế gốc: rẻ, không tốn Dầu, đi chậm, ẩn trong rừng khỏi máy bay, là quân duy nhất chiếm được mỏ.
- **Quyết định:*bỏ*
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**

### 11. Tiểu Đội Tên Lửa Chống Tăng 🗓
*Hiện tại:* chưa có. Ý tưởng: bộ binh mang tên lửa vác vai, khắc chế xe tăng nặng.
- **Quyết định:*bỏ*
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**

### 12. Tổ Bắn Tỉa 🗓
*Hiện tại:* chưa có. Ý tưởng: bắn xa, diệt bộ binh, ẩn trong rừng.
- **Quyết định:*bỏ*
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**

---

## E. KHÔNG QUÂN

### 13. Tiêm Kích Đa Nhiệm Falcon ✅
*Hiện tại:* đòn đánh mạnh nhất trận, đánh cả đất lẫn không, bay khoảng 33 giây rồi về Sân Đáp nạp Dầu.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Đơn vị phản ứng nhanh, làm chủ bầu trời và dọn dẹp các mục tiêu cơ động cao.
- **Điểm mạnh nổi bật:**Tốc độ bay và khả năng đổi hướng nhanh nhất game; tấn công được cả mục tiêu trên không lẫn mặt đất.
- **Điểm yếu chí mạng:**Thời gian bay giới hạn (33 giây nhiên liệu), phụ thuộc hoàn toàn vào Sân Đáp; nếu Sân Đáp bị phá hủy khi đang bay sẽ rơi rụng khi cạn Dầu.
- **Cơ chế riêng:**Xả loạt đạn liên thanh (Burst Fire) — Lao xuống xả một chuỗi đạn pháo tự động 30mm xé toạc mục tiêu rồi lượn vòng lấy độ cao nạp lại đợt bắn tiếp theo.
- **Ghi chú:**cần giải pháp AI để đường bay thông minh hơn; và Ưu tiên số 1 trên không là đánh chặn Valkyrie của đối phương. 

### 14. Cường Kích Ném Bom Valkyrie ✅ (chưa có trong MVP)
*Hiện tại:* có mô hình và chỉ số, chưa vào trận. Rải chuỗi bom nổ lan, phá căn cứ, ngoặt chậm, cần hộ tống.
- **Quyết định:**Giữ
- **Vai trò mong muốn:** Điện ảnh nhất; Vũ khí hủy diệt chiến lược, đòn kết liễu căn cứ và công trình phòng thủ.
- **Điểm mạnh nổi bật:**Lượng máu và giáp vượt trội trong các dòng không quân; mang theo lượng thuốc nổ khổng lồ
- **Điểm yếu chí mạng:**Giá đắt; tiêu hao nhiều Dầu; quay đầu cực chậm; dễ làm mồi cho SkyGuard nếu bay lẻ loi không có Falcon hộ tống
- **Cơ chế riêng:**Rải thảm bom tạ (Carpet Bombing) — Thả một chuỗi vệt bom nổ liên hoàn theo đường bay thẳng, gây rung chuyển màn hình và sát thương diện rộng
- **Chốt bước 2 (đội hình):** Đội hình luôn phủ một vùng **dạng mũi tên**, tự xếp theo số máy bay: **số lẻ → tam giác nhọn**, **số chẵn → tam giác tù**. Người chơi chỉ định đường bay và vùng ném.
- **Ghi chú:**Cần chọn đội hình bay (tam giác, chữ nhật,...) và chỉ định đường bay, vùng ném. khi đã cất cánh thì không nhận lệnh điều hướng. tự động bay về sau nhiệm vụ; được ưu tiên sân đáp trước các Không quân khác khi quay về; Nạp nhiên liệu và bom tại Sân Đáp lâu gấp đôi Falcon.

### 15. Drone Trinh Sát 🗓
*Hiện tại:* chưa có. Ý tưởng: bay nhanh, nhìn xa, không vũ khí.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Mắt thần tiền duyên và đòn tấn công tự sát chiến thuật (Kamikaze).
- **Điểm mạnh nổi bật:**Tốc độ bay nhanh, chi phí rẻ, tốn ít tài nguyên; chỉ điểm sương mù cho Pháo Tự Hành bắn tỉa.
- **Điểm yếu chí mạng:**1 phát bắn của SkyGuard (hoặc phạm vi nổ) là nổ ngay; thời gian hoạt động ngắn.
- **Cơ chế riêng:**Cảm tử (Kamikaze Protocol) — Khi nhận lệnh hoặc sắp hết năng lượng, có thể lao thẳng vào mục tiêu mặt đất phát nổ (tập trung 3 drone đâm trúng có thể phá hủy hoàn toàn 1 xe trinh sát Lynx; với Titan thì không đủ, vì Titan phải trâu hơn).
- **Ghi chú:** Có thể đúc hàng loạt từ nhà máy

### 16. Trực Thăng Tấn Công 🗓
*Hiện tại:* chưa có. Ý tưởng: bay thấp, đứng yên giữa trời bắn được (khác máy bay phản lực), săn xe tăng.
- **Quyết định:**Tạm bỏ
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**Đây là đơn vị lơ lửng duy nhất (nhưng drone đã làm thay)
- **Ghi chú 04/11/2026:** đây sẽ là quân **không quân chỉ đánh đất** của Iron Sky khi quay lại (Battle Drones tách riêng drone đánh đất và tiêm kích; ta để Trực Thăng gánh vai này sau).

### 17. Trực Thăng Vận Tải 🗓 / Máy Bay Vận Tải Vũ Trang 💡
*Hiện tại:* chưa có. Thiết kế gốc: chở 3 thùng hàng hoặc quân, có vũ khí tự vệ; bị bắn rơi thì thùng hàng rơi nguyên vẹn, ai nhặt trước thì được.
- **Quyết định:**Tạm bỏ
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**đây là đơn vị vận chuyển ra biển đảo (vì xe vận tải không thể bơi) sẽ được nghiên cứu sau

### 18. Drone Sửa Chữa 🗓
*Hiện tại:* chưa có. Ý tưởng: bay theo đoàn quân, sửa xe và công trình.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Hậu cần chiến trường di động, kéo dài tuổi thọ cho mũi thọc sâu của xe bọc thép.
- **Điểm mạnh nổi bật:*sửa chữa trong khu vực*
- **Điểm yếu chí mạng:**Máu rất mỏng, không có vũ khí tấn công; tiêu tốn một lượng Dầu nhỏ để duy trì bay.
- **Cơ chế riêng:**Chùm tia hàn sửa chữa dập lửa — Hồi phục giáp theo thời gian thực; có thể ưu tiên cứu chữa xe Tư Lệnh trước nếu ở gần.
- **Ghi chú:**Tôi rất thích cái này

---

## F. SIÊU CỖ MÁY

### 19. Pháo Đài Di Động 🗓
*Hiện tại:* chưa có. Ý tưởng: cỗ máy khổng lồ nhiều vũ khí, neo xuống thành căn cứ tiền phương, vũ khí hỏng dần theo máu.
- **Quyết định:*tạm bỏ*
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**Pháo tự hành đang làm thay nó
- **Ghi chú 04/11/2026:** siêu vũ khí / siêu cỗ máy để dành cho bản cập nhật **sau bản Hải quân**.

---

## G. HẢI QUÂN 💡 (thiết kế gốc — cân nhắc có đưa vào Iron Sky hay không)

Giữ lại ý tưởng trong kho thiết kế để phát triển thành bản mở rộng chuyên về thủy chiến sau khi khung cạn/không đã cân bằng hoàn hảo. song sẽ nghiên cứu thêm vào sau vì tất cả hải quân điều là quái vật thật sự với cơ chế riêng độc đáo.

### 20. Chiến Hạm Tuần Dương 💡
*Thiết kế gốc:* pháo hạm tầm xa, sonar phát hiện tàu ngầm.
- **Quyết định:**
- **Ghi chú:**

### 21. Tàu Ngầm 💡
*Thiết kế gốc:* ẩn dưới nước, ngư lôi; nổi lên mới bắn được tên lửa.
- **Quyết định:**
- **Ghi chú:**

### 22. Siêu Tàu Sân Bay 💡
*Thiết kế gốc:* căn cứ nổi có 6 chỗ đậu máy bay, tự sửa và tiếp dầu, đạn.
- **Quyết định:**
- **Ghi chú:**

---

## H. LOẠI QUÂN MỚI (bạn tự thêm)

### 23. (tên)  Drone giáp/ khối
- **Nhánh:** Bay
- **Vai trò mong muốn:** Tạo một vùng Benzen chặn/ giảm sát thương hoặc tạo vùng ẩn tầm nhìn đơn vị bên trong
- **Điểm mạnh nổi bật:** 
- **Điểm yếu chí mạng:** Rất đắt, 
- **Cơ chế riêng:**
    Cơ chế một: bật vùng khiên
    Cơ chế hai: bật vùng khói
- **Ghi chú:**
    Chỉ chọn 1 trong hai cơ chế ,có thể bật tắt theo lệnh hoặc tự động bật khi chính nó tới một ngưỡng máu nhất định.
    phải bị giới hạn nào đó.
- **Chốt bước 2:**
    - Chọn Khiên hay Khói **lúc đúc** (hai biến thể), không đổi giữa trận.
    - Tự bật khi gặp nguy hiểm. Tư lệnh **vẫn được bật/tắt** khi chọn cả cụm quân tác chiến: đây là lệnh cấp cụm quân, không phải chỉnh từng chiếc.
    - **Chốt hạn chế (người dùng, 04/11/2026):** giới hạn bằng **thời gian và tài nguyên**, không bằng số lượng.
        - Cả hai chế độ **duy trì trong một khoảng thời gian cố định**, hết giờ thì tắt.
        - **Khiên** còn tắt sớm khi **bị bắn vỡ**: chỉ chịu được một lượng sát thương hữu hạn.
        - **Khói** che quân bên trong khỏi tầm nhìn của địch, và cho quân bên trong **tăng né tránh** (hoặc miễn thương, chốt sau).
        - Cả hai **phải sạc lại bằng tài nguyên** trước khi dùng lần tiếp theo.
    - **Chốt thêm (04/11/2026):**
        - Khói: đạn bắn vào quân bên trong có **xác suất trượt** (không miễn thương). Trong sim, tỉ lệ trượt dùng `Rng` có seed để vẫn tất định.
        - Sạc lại bằng **điện** cho cả hai (Khói tạm dùng điện, xem lại khi cân bằng). Hậu cần tự lo việc sạc, đúng nguyên tắc "Tư lệnh, không phải tài xế".
        - Thời lượng ≈ **một đợt tấn công**, số tạm **10 giây**.
        - **Chỉ sạc trong vùng lưới điện** (vùng `zone` quanh Tổng Hành Dinh, Nhà Máy Điện, Cột Điện). Drone phải về hậu phương hoặc tới chỗ có Cột Điện mới sạc được, nên mỗi lần bật là một quyết định chiến lược và lưới điện có thêm vai trò ở tiền tuyến. Điện sạc tính vào tiêu thụ của phe (hậu cần tự điều độ như các công trình khác).
    - Còn mở: sức chịu của khiên; tỉ lệ trượt trong khói; bán kính; thời gian sạc; mức ưu tiên điện của việc sạc so với công trình.

---

## Các bước tiếp theo
1. Bạn điền mô tả và quyết định cho từng loại quân.
2. Mình rà lại cả đội hình để không có hai loại trùng vai, và không có vai trò nào bị bỏ trống.
3. Chốt phân vai, rồi mới chỉnh **ma trận Giáp × Đạn**.
4. Biến ý đồ thành bài kiểm thử, cuối cùng mới nhập số vào `content.ts`.

### Trạng thái (04/11/2026)
- **Bước 1 xong (bản nháp đầu):** đã điền vai trò cho Tư Lệnh, Xe Vận Tải, Tàu Hỏa, Lynx, Titan, SkyGuard, Pháo Tự Hành, Xe Tên Lửa Loạt, Falcon, Valkyrie, Drone Trinh Sát, Drone Sửa Chữa và loại mới **Drone Khiên/Khói** (#23).
- **Tạm bỏ:** Xe Công Binh (trùng Drone Sửa Chữa), toàn bộ Bộ binh, Trực Thăng Tấn Công (Drone làm thay), Trực Thăng Vận Tải (để dành cho biển đảo), Pháo Đài Di Động (Pháo Tự Hành làm thay). Hải quân để dành cho bản mở rộng.
- **Bước 3 đang làm:** bản đề xuất ma trận Giáp × Đạn ở cuối file, chờ người dùng duyệt.
- **Bước 2 xong phần lớn (04/11/2026):** các quyết định ghi ở dòng **Chốt bước 2** trong từng loại quân, tóm tắt bên dưới.

### Rà soát bước 2 — tóm tắt

**Vòng khắc chế (bản nháp, chưa có số):**

| Quân | Thắng | Thua |
|---|---|---|
| Lynx | Xe Vận Tải, Pháo, Tên Lửa Loạt (khi áp sát) | Titan, 3 Drone cảm tử |
| Titan | Lynx, SkyGuard, công trình | Pháo, Falcon, Valkyrie |
| SkyGuard | Falcon, Valkyrie, Drone | Titan, Lynx, Pháo, Tên Lửa Loạt |
| Pháo Tự Hành | Titan, tháp pháo, công trình (từ tầm cực xa) | Lynx, Falcon, Drone (khi đã lộ vị trí) |
| Tên Lửa Loạt | cụm quân giáp mỏng, công trình dàn trải | Lynx, Falcon (trong lúc khựng) |
| Falcon | Valkyrie, Drone, Pháo, Tên Lửa Loạt | SkyGuard |
| Valkyrie | căn cứ, cụm quân đứng yên | Falcon, SkyGuard |
| Drone Trinh Sát | Lynx (3 chiếc), chỉ điểm cho Pháo | mọi hỏa lực phòng không |

**Đã tách hai khẩu "phá thành":**
- **Pháo Tự Hành** = tầm cực xa, một viên chính xác, xuyên giáp. Cái giá: lộ vị trí mỗi khi bắn.
- **Xe Tên Lửa Loạt** = tầm chỉ nhỉnh hơn Titan, nổ lan nhưng tản. Cái giá: độ khựng khi dựng dàn phóng và nạp lại.
- Valkyrie là đòn đánh sâu vào hậu phương, bị chặn bằng phòng không. Mỗi loại phá thành có một cách chặn riêng.

**Luật cho ma trận Giáp × Đạn (bước 3) rút ra từ bước 2:**
- Có loại đạn **phá công sự** (Pháo, Tên Lửa Loạt, bom Valkyrie, sau này mìn): chỉ loại này cắt được đường ray.
- Titan trâu nhất trên mặt đất: 3 Drone cảm tử hạ được Lynx nhưng không hạ được Titan.
- Lynx bắn được máy bay để chữa cháy đầu trận: 2–3 Lynx mới hạ được một máy bay.
- SkyGuard: vừa chạy vừa bắn thì giảm sát thương và độ chính xác; Lockdown mới đạt 100%.

**Hệ thống hiệu ứng (thiết kế sau, cần cho nhiều loại quân):** làm chậm do địa hình (cát, bùn, tuyết), hiệu ứng nổ, vùng khiên benzen, vùng khói. Xe Tư Lệnh kháng hiệu ứng làm chậm.

**Đã chốt thêm:** Xe Vận Tải tạm không có chế độ tháo chạy.

**Công cụ kiểm chứng:** Phòng Thử Nghiệm (`index.html?play=sandbox`). Đấu thử tùy ý bằng link, ví dụ `?play=sandbox&duel=lynx:3,titan:1`.

**Kịch bản thiết kế** (`src/sim/scenarios.ts`): mỗi ý đồ đo được viết thành một kịch bản có tiêu chí đạt/chưa đạt. Xem bằng mắt trong Phòng Thử Nghiệm (mục "Kịch bản thiết kế", hoặc `?play=sandbox&scenario=<mã>`), chấm không giao diện bằng `npm run balance`. Kết quả với chỉ số tạm (04/11/2026):

| Mã | Ý đồ | Kết quả |
|---|---|---|
| `titan-vs-lynx-seq` | Titan hạ đủ 3 Lynx lao vào lần lượt | ✅ Titan còn 9% máu |
| `titan-vs-lynx-sim` | 3 Lynx cùng lúc thắng, còn 1 | ❌ Titan thắng, còn 14% máu (do nổ lan, xem mục Titan) |
| `falcon-flyover-skyguard` | 4 SkyGuard hạ 5–8/10 Falcon bay ngang | ✅ hạ 5/10 (sát ngưỡng dưới) |

Khi chốt chỉ số (bước 4), kịch bản đã đạt sẽ chuyển thành kiểm thử bắt buộc trong `npm test`.

**Còn mở:**
- Drone Khiên/Khói: đã chốt hạn chế (10 giây, khiên vỡ theo sát thương, khói cho đạn xác suất trượt, sạc bằng điện, chỉ trong vùng lưới điện); còn mở: các con số, xem mục #23.
- Thêm kịch bản thiết kế cho các ý đồ khác (Falcon tấn công SkyGuard, 3 Drone cảm tử hạ Lynx, 2–3 Lynx hạ một máy bay…) khi các loại quân đó có trong game.
- Thứ tự đưa quân vào game: đề xuất đợt 1 là 7 loại đang có, chỉnh theo mô tả mới; sau đó Drone Sửa Chữa, Pháo Tự Hành, Drone Trinh Sát (ba loại này tạo combo).

---

## Bước 3 — Ma trận Giáp × Đạn (đã duyệt 04/11/2026, còn chờ giáp công trình)

Gốc: ma trận 3×3 trong thiết kế gốc (`REF_ARTOFWAR_GDD_MASTER.md` mục 8), MVP_DESIGN đã chọn mang sang vì "gọn, dễ nhớ trên điện thoại". Bản dưới đây giữ khung 3×3 nhưng sửa theo các quyết định ở bước 2.

### 1. Bốn trục độc lập (không gộp vào nhau)
Bước 2 cho thấy nếu gộp các khái niệm này vào một chỗ sẽ sinh mâu thuẫn (ví dụ: Titan "bắn nổ" nhưng không được phá ray, lại phải "bắn đơn mục tiêu"). Vì vậy tách thành 4 trục:

| Trục | Giá trị | Quyết định điều gì |
|---|---|---|
| **Bắn được** | đất / không / cả hai | Ai bắn được máy bay (đã có trong game) |
| **Loại đạn** | Thường · Xuyên giáp · Nổ | Hệ số sát thương theo ma trận bên dưới |
| **Nổ lan** | bán kính (m), 0 = đơn mục tiêu | Trúng một hay cả cụm. **Không** gắn với loại đạn: cùng là đạn Nổ, Titan lan nhỏ nhất (~1 m), Tên Lửa Loạt lan lớn và tản |
| **Phá công sự** | có / không | Cắt được đường ray (sau này: mìn, công sự). Chỉ Pháo Tự Hành, Xe Tên Lửa Loạt, bom Valkyrie, mìn |

### 2. Ma trận (hệ số nhân sát thương)

| Giáp \ Đạn | Thường | Xuyên giáp | Nổ |
|---|:---:|:---:|:---:|
| **Nhẹ** | 100% | 60% | 125% |
| **Nặng** | 50% | 150% | 60% |
| **Kiên cố** | 25% | 100% | 150% |

Ba câu để người chơi nhớ (hiện trong phần hướng dẫn):
- **Thường** (súng máy, pháo nhỏ): diệt xe nhẹ; gần như vô hại với công trình.
- **Xuyên giáp** (pháo xuyên, đạn 30mm xuyên giáp): diệt giáp nặng; phí khi bắn xe nhẹ.
- **Nổ** (tên lửa, bom, đạn nổ): diệt xe nhẹ và san phẳng công trình; yếu với giáp nặng.

So với ma trận gốc: hàng "Chống xuyên" và "Chống nổ" được thay bằng **Nặng** và **Kiên cố**. Lý do: ý đồ bước 2 cần công trình **sợ đạn Nổ** (Tên Lửa Loạt làm thành phố "bình địa", Valkyrie là "đòn kết liễu căn cứ"), trong khi bản gốc cho mọi công trình giáp Chống nổ (Nổ chỉ còn 50%). Các ô 10% / 30% của bản gốc cũng được nâng lên, để không có cặp nào gần như "miễn nhiễm" (khó đọc trên điện thoại và làm trận cứng nhắc).

### 3. Phân loại từng binh chủng

| Quân / công trình | Giáp | Loại đạn | Nổ lan | Phá công sự | Ghi chú |
|---|---|---|---|---|---|
| Xe Tư Lệnh | Nặng | Thường | nhỏ | – | + giáp phòng thủ điểm chặn 1–2 phát pháo |
| Xe Vận Tải | Nhẹ | – | – | – | |
| Lynx | Nhẹ | Thường | 0 | – | bắn được máy bay, sát thương lên không thấp |
| Titan | **Nặng** | **Nổ** | **nhỏ nhất** (~1 m) | – | lan nhỏ nhất trong các vũ khí nổ; + giáp góc nghiêng mặt trước |
| SkyGuard | Nhẹ | Nổ | nhỏ | – | chỉ bắn không (bỏ sát thương mặt đất) |
| Pháo Tự Hành | Nhẹ | **Xuyên giáp** | nhỏ–vừa | ✅ | Nhẹ để Lynx khắc được |
| Xe Tên Lửa Loạt | Nhẹ | Nổ | lớn, tản | ✅ | |
| Falcon | Nhẹ | **Xuyên giáp** | 0 | – | đạn 30mm: diệt tăng + chặn Valkyrie. **Tạm**, sẽ xem lại khi cân bằng |
| Valkyrie | Nặng | Nổ | lớn | ✅ | |
| Drone Trinh Sát (cảm tử) | Nhẹ | Nổ | nhỏ | – | |
| Drone Sửa Chữa, Drone Khiên/Khói | Nhẹ | – | – | – | |
| Tàu Hỏa | Kiên cố | – | – | – | tê liệt khi hết máu |
| Công trình | xem mục 3b | (tháp: Thường; phòng không: Nổ) | | – | |

### 3b. Giáp công trình (đề xuất, chờ duyệt)

Nếu mọi công trình cùng một hàng Kiên cố thì có hai vấn đề (tính bằng số tạm hiện tại):
- **Titan san tháp pháo quá nhanh.** Titan bắn Nổ, vào Kiên cố được 150%: hạ một Tháp Pháo (700 máu) trong ~10 giây, mất chừng một phần ba máu. Tuyến phòng thủ gần như vô dụng trước xe tăng chủ lực, xây tháp không còn đáng tiền.
- **Không có mục tiêu đột kích nào cho xe nhẹ.** Lynx bắn Thường vào Kiên cố chỉ 25%: phá một Cột Điện mất ~41 giây. Lối chơi "Lynx săn hậu cần" dừng ở Xe Vận Tải.

Đề xuất chia công trình vào **cả ba hàng giáp sẵn có** (không thêm hàng mới), mỗi nhóm cho một cách đánh khác nhau:

| Nhóm | Giáp | Công trình | Ai phá giỏi | Vì sao |
|---|---|---|---|---|
| **Công sự phòng thủ** | **Nặng** | Tháp Pháo, Tiền Đồn | Pháo Tự Hành (Xuyên 150%, lại bắn ngoài tầm tháp) | Bê tông cốt thép chịu nổ. Titan chỉ còn 60%: một Titan đấu một Tháp Pháo là ngang ngửa (~25 giây so với ~29 giây), muốn phá tuyến phải dồn quân hoặc mang Pháo theo |
| **Căn cứ, nhà xưởng** | **Kiên cố** | HQ, Xưởng Xe, Sân Bay, Nhà Máy Điện, Nhà Máy Dầu, Kho Đạn, Pin, Phòng không (CIWS, SAM, EMP) | Tên Lửa Loạt, bom Valkyrie, Titan (Nổ 150%) | Đúng ý đồ "Tên Lửa Loạt làm bình địa, Valkyrie kết liễu căn cứ". Phòng không xếp ở đây vì điểm yếu của nó là không bắn được quân đất: phải có tháp hoặc quân che |
| **Hạ tầng lộ thiên** | **Nhẹ** | Cột Điện, Radar | Lynx (Thường 100%): ~10 giây một Cột Điện | Rẻ, mỏng, rải khắp bản đồ: mục tiêu đột kích. Cắt Cột Điện làm mất vùng điện, phá Radar làm địch mù |

Hệ quả cho lối chơi: muốn phá một căn cứ phải **qua ba lớp, mỗi lớp cần một công cụ khác nhau**: Pháo cạy tuyến tháp, Titan và Tên Lửa Loạt san nhà xưởng, Lynx cắt điện phía sau. Không có binh chủng nào phá được tất cả một mình.

Theo nguyên tắc "Tư lệnh, không phải tài xế": khi Cột Điện hay Radar bị đánh, bộ phận hậu cần **tự báo** ("Cột Điện phía Đông đang bị tấn công, vùng xây phía Đông sắp mất điện") và tự điều độ lại điện. Người chơi chỉ quyết định có điều quân về giữ hay không.

Một chỗ dễ gây nhầm: với chia nhóm này, Tháp Pháo (thật sự kiên cố) lại mang giáp **Nặng**, còn nhà xưởng mang giáp **Kiên cố**. Đề xuất **đổi tên hàng thứ ba thành "Kết cấu"** (nhà xưởng, Tàu Hỏa, công trình lớn) để người chơi đọc "Giáp: Kết cấu" là hiểu ngay "sợ đạn Nổ".

### 4. Kiểm tra với ý đồ bước 2

| Ý đồ | Ma trận cho ra | Khớp? |
|---|---|---|
| Lynx săn Xe Vận Tải, khắc Pháo / Tên Lửa Loạt | Thường → Nhẹ 100% | ✅ |
| Lynx không phá được căn cứ | Thường → Kiên cố 25% | ✅ |
| Titan hạ Lynx trong ≤ 3 phát | Nổ → Nhẹ 125% | ✅ (chỉnh số gốc ở bước 4) |
| Pháo khắc giáp dày, xe nhẹ khắc Pháo | Xuyên → Nặng 150%, Xuyên → Nhẹ 60% | ✅ |
| Tên Lửa Loạt diệt cụm giáp mỏng, công trình; yếu với giáp dày | Nổ → Nhẹ 125%, Kiên cố 150%, Nặng 60% | ✅ |
| Falcon ưu tiên chặn Valkyrie; Titan cần SkyGuard che | Xuyên → Nặng 150% (cả Valkyrie lẫn Titan) | ✅ |
| SkyGuard diệt Falcon và drone | Nổ → Nhẹ 125% | ✅ |
| Valkyrie "máu và giáp vượt trội" trong không quân | Nặng: SkyGuard chỉ còn 60% | ✅ (vẫn dễ bị Falcon chặn) |
| 3 Drone cảm tử hạ Lynx, không hạ được Titan | Nổ → Nhẹ 125%, Nặng 60% | ✅ |
| Tàu hỏa "khó bị đánh nát" | Kiên cố: Thường 25% | ✅ |

**Phép tính mẫu, từ ý đồ ra con số** (dùng số gốc hiện tại: Lynx 24 sát thương / 0,65 giây, Titan 72 / 1,55 giây, Titan 720 máu, Lynx 340 máu; bỏ qua lúc tiếp cận):
- Titan (Nổ → Nhẹ 125%) gây 58 sát thương/giây → hạ một Lynx sau ≈ 5,9 giây.
- "3 Lynx cùng lúc thắng, còn đúng 1" nghĩa là Titan phải chết sau khi Lynx thứ hai bị hạ (≈ 11,7 giây) và trước khi Lynx thứ ba bị hạ (≈ 17,6 giây). Suy ra mỗi Lynx phải gây 20,5–24,6 sát thương/giây lên Titan, tức hệ số **Thường → Nặng ≈ 56–67%**.
- "Lần lượt thì Titan hạ đủ 3" thì chỉ cần mỗi Lynx gây dưới 41 sát thương/giây lên Titan: luôn đúng trong khoảng trên.
- Vì vậy ô Thường → Nặng đề xuất 50% là **mức sàn**; bước 4 sẽ dùng kịch bản thiết kế để chốt (khoảng 50–65%), hoặc giữ 50% và tăng sát thương gốc của Lynx.

### 5. Thay đổi trong code (làm ở bước 4, sau khi duyệt)
- `content.ts`: thêm `armorClass` cho mọi thực thể; thêm `dmgType`, `siege` cho vũ khí; bảng `RULES.damageMatrix`. **Bỏ trường `armor` (giảm % riêng lẻ)** để chỉ còn một nguồn: hệ số giáp do ma trận quyết định. Cơ chế riêng (giáp góc nghiêng Titan, phòng thủ điểm của Tư Lệnh) là hệ số cộng thêm, viết riêng.
- `world.ts`: `damage()` nhân theo ma trận; Titan nổ lan nhỏ nhất (tạm 1,0 m); SkyGuard bỏ sát thương mặt đất; Lynx có sát thương lên không.
- Kiểm thử: bảng ma trận đúng 3×3, mọi binh chủng có giáp và loại đạn; các kịch bản thiết kế đã đạt chuyển thành kiểm thử bắt buộc.

**Nguyên tắc "chỉnh được về sau"** (yêu cầu của người dùng 04/11/2026: mọi cập nhật nhẹ về quân đội phải chỉnh lại được):
- Mọi lựa chọn về quân là **dữ liệu** trong `content.ts`: giáp, loại đạn, bán kính nổ lan, phá công sự, bắn đất/không, và chính bảng ma trận (`RULES.damageMatrix`). Đổi Falcon sang đạn Thường hay đổi một ô ma trận chỉ là sửa một chữ, không đụng `world.ts`.
- `world.ts` **không rẽ nhánh theo tên quân** khi tính sát thương (không có `if (kind === "titan")`). Cơ chế riêng (giáp góc nghiêng, phòng thủ điểm) cũng khai báo bằng trường dữ liệu.
- Kiểm thử chỉ kiểm **cấu trúc** (đủ trường, bảng đúng 3×3, tất định), không khóa con số. Con số được chấm bằng kịch bản thiết kế (`npm run balance`): sửa số xong chạy lại là biết ý đồ nào còn đạt.

### 6. Tiêu chí chung cho cả đội hình
- **Thời gian kịp phản ứng (chốt 04/11/2026, học từ Battle Drones):** một trận giao tranh tầm trung (nửa đạo quân của một bên) phải kéo dài **ít nhất khoảng 8 giây** (mục tiêu 7–9 giây) trước khi bị xóa sổ, để người chơi trên điện thoại kịp nhìn ra và ra lệnh. Khi chỉnh máu và sát thương ở bước 4, tiêu chí này đứng trên mọi con số riêng lẻ. Sẽ có kịch bản thiết kế đo nó.

### 7. Duyệt (04/11/2026)
1. ✅ Tách 4 trục. Sửa: Titan **vẫn nổ lan**, nhưng bán kính nhỏ nhất.
2. ✅ Falcon = Xuyên giáp, **tạm thời**; sẽ điều chỉnh khi cân bằng.
3. ✅ Ba hàng giáp, bỏ giảm sát thương % riêng lẻ. Còn chờ: **giáp công trình** (mục 3b) và tên hàng thứ ba.
4. ✅ Giữ nguyên các hệ số như bảng.

---

## Bài học từ đội hình Battle Drones (04/11/2026)

So sánh chi tiết ở `Docs/BATTLEDRONES_REFERENCE.md` mục 5. Quyết định của người dùng:

| Bài học | Quyết định |
|---|---|
| ① Mục tiêu thời gian kịp phản ứng (~8 giây cho một trận giao tranh tầm trung) | ✅ **Thêm**: tiêu chí chung ở Bước 3 mục 6 |
| ② Cân bằng "giá ngang giá" (cùng số tiền đấu nhau) | ⏳ Cân nhắc khi cân bằng game sau |
| ③ Pháo có tầm bắn tối thiểu | ✅ **Thêm** vào Pháo Tự Hành |
| ④ Lộ vị trí một lúc sau mỗi phát bắn | ✅ **Thêm**: lộ **2 giây** cho Pháo Tự Hành |
| ⑤ Giới hạn mềm bằng giá tăng dần theo số lượng | ❌ **Không học.** Iron Sky là trận cấp sư đoàn: số lượng quân là một phần của quy mô hoành tráng |
| ⑥ Quân tự ưu tiên bắn quân sửa chữa của địch | ⏳ Chưa quyết |
| ⑦ Quân tự phản ứng (đứng yên bị bắn thì đánh trả, đồng minh gần đó vào giúp) | ⏳ **Bàn kỹ sau** (liên quan nguyên tắc "Tư lệnh, không phải tài xế") |
| ⑧ Siêu cỗ máy hỏng vũ khí dần theo máu | ⏳ Để dành cho bản cập nhật siêu vũ khí, **sau bản Hải quân** |
| Không quân chỉ đánh đất (tách khỏi tiêm kích) | ⏳ Vai của **Trực Thăng Tấn Công** (đang tạm bỏ) |
| Quân lướt nước / vượt sông | ⏳ Chắc chắn có **lưới nước** về sau (bản đồ, đơn vị…) |
