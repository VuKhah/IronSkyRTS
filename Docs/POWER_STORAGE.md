# Nghiên Cứu: Lưu Trữ Điện

> Viết ngày 04/11/2026, theo phản hồi sau bản chơi thử: *"Điện đốt Dầu quá hao, và ta không có gì để lưu trữ điện, cũng chưa biết dùng điện lưu trữ thế nào."*
> Đây là **tài liệu nghiên cứu để duyệt**, chưa có code. Mọi con số đều là số tạm.

## 1. Thật ra có hai vấn đề riêng

| # | Vấn đề | Nguyên nhân trong code hiện tại |
|---|---|---|
| 1 | **Hao Dầu** | Mỗi Nhà Máy Điện bật lên là đốt đủ 0.4 Dầu/s, kể cả khi căn cứ chỉ dùng 10 MW trên 60 MW đang phát. Phần điện thừa bị bỏ phí. |
| 2 | **Không có chỗ lưu điện** | Điện chỉ tồn tại "ngay lúc này". Nhà máy bị phá hoặc hết Dầu là cả căn cứ sụp ngay trong tick tiếp theo, không có thời gian phản ứng. |

Vấn đề 1 có thể giải **mà không cần pin**: cho nhà máy đốt Dầu theo đúng lượng điện đang dùng. Pin là để giải vấn đề 2, và mở ra cách *dùng* điện như một nguồn lực chiến thuật.

## 2. Các game khác giải bài này thế nào

| Game | Cách làm | Học được gì |
|---|---|---|
| **Command & Conquer / Red Alert** | Nhà máy điện phát cố định, không lưu trữ. Thiếu điện thì đúc chậm, radar và một số tháp tắt. | Iron Sky đang làm đúng như vậy: dễ hiểu, nhưng không có chiều sâu về thời điểm. |
| **Supreme Commander / Planetary Annihilation** | Kinh tế "dòng chảy": thu nhập và tiêu thụ tính theo giây, cộng thêm **kho chứa** có trần. Kho cạn thì cả nền kinh tế bị nghẽn (stall). Công trình kho đặt sát nhà máy được cộng thưởng. | Kho là **bộ đệm thời gian**: cho người chơi vài giây để phản ứng thay vì sụp ngay. |
| **Factorio** | Máy phát hơi nước chỉ đốt nhiên liệu **theo tải thực tế**. Ắc quy nạp khi có điện dư, xả khi thiếu. | Đốt theo tải giải được vấn đề hao. Ắc quy giải chuyện "điện thừa lúc này, thiếu lúc khác". |
| **Thiết kế gốc của bạn** (`REF_ARTOFWAR_GDD_MASTER.md` mục 11.7) | Vũ khí tốn điện lớn có **tụ điện nội bộ** nạp chậm liên tục từ lưới, thay vì rút một lần thật lớn. Hạ tầng thiết yếu được **ưu tiên** cấp điện trước. | Hai ý hay: tụ điện cho phép một phát bắn mạnh mà không làm sập lưới, và thứ tự ưu tiên khi thiếu điện. |

## 3. Đề xuất cho Iron Sky

### 3.1. Nhà Máy Điện đốt Dầu theo tải (giải vấn đề hao)
- Tổng Hành Dinh phát 20 MW miễn phí, luôn được dùng trước.
- Phần còn lại chia đều cho các Nhà Máy Điện đang bật. Mỗi nhà máy đốt Dầu theo tỉ lệ công suất thực dùng:
  `Dầu đốt = 0.4 × (công suất đang dùng / 40)`, tối thiểu **10% để giữ lò**, tức 0.04 Dầu/s khi gần như không tải.
- Ví dụ: căn cứ dùng 30 MW, có 1 nhà máy. HQ lo 20 MW, nhà máy lo 10 MW, chỉ đốt 0.1 Dầu/s thay vì 0.4.
- Nút **Tắt máy** vẫn giữ, để ngừng hẳn cả mức giữ lò.

### 3.2. Trạm Tích Điện (giải vấn đề lưu trữ)

| Thông số (tạm) | Giá trị |
|---|---|
| Chi phí | 150 Sắt, xây 6 giây |
| Dung lượng | 1.200 MJ (= 30 MW trong 40 giây) |
| Nạp tối đa | 15 MW |
| Xả tối đa | 30 MW |
| Máu | 500. Bị phá thì mất hết điện đang chứa |

- **Nạp:** từ điện dư. Điện dư gồm phần HQ không dùng hết (miễn phí), và phần nhà máy còn rảnh (tốn Dầu theo tải như mục 3.1). Có công tắc **"Chỉ nạp điện miễn phí"** để không đốt Dầu cho việc nạp pin.
- **Xả tự động:** khi phát không đủ dùng (nhà máy bị phá, hết Dầu, hay vừa xây thêm công trình), pin tự bù vào. Căn cứ có **vài chục giây đệm** thay vì sụp ngay.
- Thanh điện trên HUD có thêm **% pin**. Cảnh báo "Đang chạy bằng pin" và "Pin sắp cạn".

### 3.3. Dùng điện lưu trữ chủ động: kỹ năng "Quá Tải"
Pin không chỉ là phương án dự phòng. Người chơi có thể **tiêu** điện đã tích:
- **Quá Tải Phòng Thủ:** xả 400 MJ. Mọi Tháp Phòng Thủ bắn nhanh hơn 50% trong 10 giây. Dùng khi căn cứ bị đánh.
- **Quá Tải Sản Xuất:** xả 400 MJ. Xưởng Xe và Sân Đáp đúc nhanh gấp đôi trong 15 giây. Dùng để kịp ra quân trước đợt tấn công.
- Hồi chiêu 45 giây.
- Về sau, các công trình tốn điện lớn trong thiết kế gốc (Tháp Pháo Năng Lượng, Tháp Trường Lực) sẽ **rút từ pin** theo đúng ý tưởng tụ điện, không rút trực tiếp từ lưới.

Nhờ vậy điện thành chuỗi quyết định có thời điểm: **tích điện lúc yên → xả đúng lúc giao tranh**, khớp với tinh thần "Tư Lệnh Chiến Thuật & Hậu Cần".

### 3.4. Thứ tự ưu tiên khi thiếu điện (tùy chọn)
Hiện tại thiếu điện thì **mọi thứ** cùng chậm theo một tỉ lệ. Thiết kế gốc đề xuất cấp điện theo thứ tự ưu tiên. Hai cách:

| Cách | Hành vi khi thiếu điện | Ưu / nhược |
|---|---|---|
| **Chia đều** (hiện tại) | Mọi công trình chạy cùng X% | Dễ hiểu; nhưng thiếu một chút là tháp phòng thủ cũng yếu đi |
| **Theo ưu tiên** | Tầng 1 (Tháp Phòng Thủ, Radar) được đủ điện trước, tầng 2 (Sân Đáp), rồi tầng 3 (Xưởng Xe) nhận phần còn lại | Căn cứ vẫn tự vệ được khi thiếu điện; nhưng người chơi phải hiểu thêm một luật |

## 4. Ảnh hưởng tới phần khác
- **Lõi mô phỏng:** thêm dung lượng pin cho mỗi phe và tính dòng điện mỗi tick. Vẫn tất định, thêm vào mã băm.
- **AI:** xây 1 Trạm Tích Điện sau Nhà Máy Điện đầu tiên; dùng Quá Tải Phòng Thủ khi căn cứ bị đánh.
- **Mô hình 3D:** Trạm Tích Điện bản nhẹ, gồm dãy khối pin và vạch sáng theo % pin.
- **Kiểm thử:** đốt Dầu theo tải, nạp/xả pin, pin đỡ được khi nhà máy bị phá, kỹ năng Quá Tải.
- **Cân bằng:** đo lại bằng máy giả lập sau khi làm. Tốc độ hao Dầu sẽ giảm mạnh, tác động lên nhịp trận.

## 5. Câu hỏi cần bạn chốt
1. Có đổi Nhà Máy Điện sang **đốt Dầu theo tải** (mục 3.1) không?
2. Trạm Tích Điện có được **đốt Dầu để nạp pin** không, hay chỉ nạp từ điện miễn phí của HQ?
3. Có làm **kỹ năng Quá Tải** (mục 3.3) không? Nếu có thì cả hai loại hay chỉ một?
4. Khi thiếu điện: **chia đều** như hiện tại hay **theo ưu tiên** (mục 3.4)?
