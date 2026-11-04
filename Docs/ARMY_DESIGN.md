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
- **Điểm mạnh nổi bật:*Tầm nhìn cực rộng, kháng hiệu ứng làm chậm, có giáp phòng thủ điểm chặn được 1–2 phát đạn pháo đầu tiên*
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:*Tổng động viên (Kích hoạt): Tăng 30% tốc độ di chuyển và 20% tốc độ bắn cho mọi đơn vị trong bán kính hào quang;Giao thức khẩn cấp: Tự động tăng tốc rút chạy khi lượng máu tụt dưới 30%.*
- **Ghi chú:* sẽ có nhiều loại xe tư lệnh sẽ được thêm vào; Vai trò tư lệnh được tạo ra để có thể chạt trốn hoặc tổng động viên quân đội thay cho tòa nhà - nhà Tổng hành vinh có vai trò tạo tài nguyên ban đầu, giới hạn tối đa quân*

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

---

## C. THIẾT GIÁP & XE MẶT ĐẤT

### 5. Thiết Giáp Trinh Sát Lynx ✅
*Hiện tại:* xe bánh lốp nhanh nhất, nhìn xa, chiếm mỏ, săn Xe Vận Tải. Không bắn được máy bay.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**mở bản đồ, chiếm mỏ tài nguyên bỏ hoang và săn Xe Vận Tải địch.
- **Điểm mạnh nổi bật:**Tốc độ di chuyển nhanh nhất trên mặt đất; tầm nhìn cực xa qua sương mù chiến tranh.
- **Điểm yếu chí mạng:**Giáp cực mỏng; bị Titan hạ gục sau 2–3 phát bắn; 
- **Cơ chế riêng:**Chiếm cứ điểm cơ động
- **Ghi chú:**Vẫn đánh được không quân Lynk, nhưng cần từ 2-3 chiếc để hạ một lynk

### 6. Xe Tăng Chủ Lực Titan ✅
*Hiện tại:* giáp dày, pháo 120mm nổ lan, phá công trình. Chậm, không bắn được máy bay.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Cột sống mở đường và hấp thụ sát thương chính diện của mũi tiến công mặt đất.
- **Điểm mạnh nổi bật:**Giáp trước cực dày, chịu được hỏa lực của 3 xe Lynx quây cùng lúc; pháo 120mm bắn phát nào thấm phát đó (tối đa 3 viên diệt gọn 1 Lynx).
- **Điểm yếu chí mạng:**Cồng kềnh như xe tank thật Bắn đơn mục tiêu (bắn nổ), nạp đạn chậm; xoay tháp pháo có độ trễ; hoàn toàn không có vũ khí phòng không.
- **Cơ chế riêng:**Giáp góc nghiêng — Giảm 25% sát thương nhận vào từ mặt trước xe
- **Ghi chú:**Luôn luôn cần SkyGuard đi kèm để bảo vệ khỏi Falcon và Valkyrie.

### 7. Phòng Không Cơ Động SkyGuard ✅
*Hiện tại:* tên lửa phòng không tầm xa 26.5m, đi kèm đoàn xe. Yếu khi bị xe tăng áp sát.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Chiếc ô phòng không di động bảo vệ các cụm tăng thiết giáp và căn cứ trước đòn không kích.
- **Điểm mạnh nổi bật:**Khóa mục tiêu trên không từ tầm rất xa (26.5m); tên lửa truy đuổi có xác suất trúng đích cao; tốc độ chạy nhanh hơn Titan để rút lui kịp thời
- **Điểm yếu chí mạng:**Giáp giấy; không có vũ khí bắn mục tiêu mặt đất; sát thương giảm 25% khi vừa chạy vừa bắn.
- **Cơ chế riêng:**Trạng thái triển khai (Lockdown) — Mất 1.2 giây để hạ chân chống đứng yên, tăng 25% tầm bắn và 33% sát thương (đạt 100% hiệu suất)
- **Ghi chú:**Bắn theo loạt 4–6 quả tên lửa nhỏ rồi nạp lại thay vì bắn rải rác từng phát. Khi một sư đội bay 10 chiếc Falcon bay ngang đầu 4 SkyGuard, lưới phòng không này phải hạ ít nhất được khoảng 7-8 chiếc

### 8. Pháo Tự Hành 🗓 / Sư đoàn Pháo Nặng 💡
*Hiện tại:* chưa có. Thiết kế gốc: đạn phá công trình, tầm xa; đặt trên núi được +20% tầm và bắn khuất tầm nhìn.
- **Quyết định:** Giữ
- **Vai trò mong muốn:*đơn vị quân siêu mạnh với tầm bắn vược xa mọi thứ.*
- **Điểm mạnh nổi bật:**Tầm bắn xa vượt trội ngoài tầm nhìn; độ chính xác cao;1 phát bắn có thể xóa sổ công trình nhỏ hoặc làm tàn phế xe bọc thép trong bán kính nổ.
- **Điểm yếu chí mạng:**Tốc độ di chuyển rất chậm; tốc độ nạp đạn lâu; bắn từng viên; mù tầm nhìn trực tiếp
- **Cơ chế riêng:**Địa lợi tầm cao — Triển khai trên núi/đồi được cộng thêm 20% tầm bắn và triệt tiêu độ lệch đạn
- **Ghi chú:**Khẩu pháo này rất cồng kềnh, nhưng nó có thể một viên phá hủy mọi thứ trong phạm vi nhỏ, Cơ chế xoay thân xe mất thời gian trước khi ngắm bắn.

### 9. Xe Tên Lửa Loạt 💡
*Hiện tại:* chưa có. Thiết kế gốc: phóng loạt tên lửa nổ diện rộng, khắc chế cụm phòng thủ tĩnh và bộ binh đông.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Hỏa lực bão hòa diện rộng (AoE), giải tán đám đông thiết giáp hạng nhẹ và công trình dàn trải.
- **Điểm mạnh nổi bật:**Khả năng san phẳng cả một vùng đất lớn chỉ trong 1 lượt phóng; tính răn đe cực cao.
- **Điểm yếu chí mạng:**Tên lửa rơi tản mác (không thể dồn sát thương đơn mục tiêu); thời gian nạp lại loạt đạn rất lâu; hoàn toàn bất lực trước máy bay.
- **Cơ chế riêng:**Rải thảm mặt đất — Chọn 1 vùng tròn trên bản đồ, xe dựng dàn phóng và xả hết cơ số đạn trong vài giây rồi bắt buộc phải nạp lại 
- **Ghi chú:**Tôi rất muốn thấy điều này trong game của ta, bất kỳ thành phố nào bị dàn xe này nhắm tới điều thành bình địa;Tạo hiệu ứng âm thanh rít và khói mù mịt để tăng tính "điện ảnh"

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
- **Ghi chú:**Cần chọn đội hình bay (tam giác, chữ nhật,...) và chỉ định đường bay, vùng ném. khi đã cấp cánh thì không nhận lệnh điều hướng. tự động bay về sau nhiệm vụ; được ưu tiên sân đáp trước các Không quân khác khi quay về; Nạp nhiên liệu và bom tại Sân Đáp lâu gấp đôi Falcon.

### 15. Drone Trinh Sát 🗓
*Hiện tại:* chưa có. Ý tưởng: bay nhanh, nhìn xa, không vũ khí.
- **Quyết định:**Giữ
- **Vai trò mong muốn:**Mắt thần tiền duyên và đòn tấn công tự sát chiến thuật (Kamikaze).
- **Điểm mạnh nổi bật:**Tốc độ bay nhanh, chi phí rẻ, tốn ít tài nguyên; chỉ điểm sương mù cho Pháo Tự Hành bắn tỉa.
- **Điểm yếu chí mạng:**1 phát bắn của SkyGuard (hoặc phạm vi nổ) là nổ ngay; thời gian hoạt động ngắn.
- **Cơ chế riêng:**Cảm tử (Kamikaze Protocol) — Khi nhận lệnh hoặc sắp hết năng lượng, có thể lao thẳng vào mục tiêu mặt đất phát nổ (tập trung 3 drone đâm trúng có thể phá hủy hoàn toàn 1 xe tăng Titan).
- **Ghi chú:** Có thể đúc hàng loạt từ nhà máy

### 16. Trực Thăng Tấn Công 🗓
*Hiện tại:* chưa có. Ý tưởng: bay thấp, đứng yên giữa trời bắn được (khác máy bay phản lực), săn xe tăng.
- **Quyết định:**Tạm bỏ
- **Vai trò mong muốn:**
- **Điểm mạnh nổi bật:**
- **Điểm yếu chí mạng:**
- **Cơ chế riêng:**
- **Ghi chú:**Đây là đơn vị lơ lửng duy nhất (nhưng drone đã làm thay)

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
- **Điểm mạnh nổi bật:*sửa chửa trong khu vực*
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
- **Vai trò mong muốn:** Tạo một vùng Benzen chặn/ giảm xác thương hoặc tạo vùng ấn tầm nhìn đơn vị bên trong
- **Điểm mạnh nổi bật:** 
- **Điểm yếu chí mạng:** Rất đắt, 
- **Cơ chế riêng:**
    Cơ chế một: bật vùng khiên
    Cơ chế hai: bật vùng khói
- **Ghi chú:**
    Chỉ chọn 1 trong hai cơ chế ,có thể bật tắt theo lệnh hoặc tự động bật khi chính nó tới một ngưỡng máu nhất định.
    phải bị giới hạn nào đó.

---

## Các bước tiếp theo
1. Bạn điền mô tả và quyết định cho từng loại quân.
2. Mình rà lại cả đội hình để không có hai loại trùng vai, và không có vai trò nào bị bỏ trống.
3. Chốt phân vai, rồi mới chỉnh **ma trận Giáp × Đạn**.
4. Biến ý đồ thành bài kiểm thử, cuối cùng mới nhập số vào `content.ts`.

### Trạng thái (04/11/2026)
- **Bước 1 xong (bản nháp đầu):** đã điền vai trò cho Tư Lệnh, Xe Vận Tải, Tàu Hỏa, Lynx, Titan, SkyGuard, Pháo Tự Hành, Xe Tên Lửa Loạt, Falcon, Valkyrie, Drone Trinh Sát, Drone Sửa Chữa và loại mới **Drone Khiên/Khói** (#23).
- **Tạm bỏ:** Xe Công Binh (trùng Drone Sửa Chữa), toàn bộ Bộ binh, Trực Thăng Tấn Công (Drone làm thay), Trực Thăng Vận Tải (để dành cho biển đảo), Pháo Đài Di Động (Pháo Tự Hành làm thay). Hải quân để dành cho bản mở rộng.
- **Phiên sau bắt đầu ở bước 2:** rà trùng vai / thiếu vai, gom các câu hỏi còn mở (ví dụ: Lynx bắn máy bay, Xe Vận Tải có nút bật/tắt tháo chạy so với nguyên tắc "không vi quản lý", tàu hỏa không thể bị phá hủy, giới hạn cho Drone Khiên/Khói).
