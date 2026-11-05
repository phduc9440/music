# Plan đã chốt: OMR cho bản nhiều khuông (giọng hát + piano)

Bản này thay cho plan "kết hợp nhiều model". Giữ chẩn đoán cũ, đổi cách sửa cho gọn, đo được và không làm chậm các bản
piano đang chạy tốt.

## 1. Chẩn đoán (đã kiểm lại trên dữ liệu thật)

Bản Ave Maria (score `37ca0796…`), đo trên chính ảnh `pages/page-NNN.png` mà model nhận:

| Trang | Bố cục thật (OpenCV) | Spine trong `kern/page-NNN.krn` |
|---|---|---|
| 1 | 4 hệ × 3 khuông (giọng + piano) | 2: mất cả khuông giọng |
| 2 | 5 hệ × 3 khuông | 3 |
| 3 | 5 hệ × 3 khuông | 3 |

Sau đó `merge.align_pages_leniently` độn một cột trống cho trang 1 và `convert/musicxml` gộp mọi khuông vào một part
"Piano". Ba nguyên nhân trong plan cũ đều đúng.

## 2. Những điểm của plan cũ được giữ, sửa hoặc bỏ

| Plan cũ | Quyết định | Lý do |
|---|---|---|
| Phân tích bố cục bằng OpenCV | Giữ | Rẻ (vài chục ms/trang), là thước đo khách quan duy nhất về số khuông |
| Kiểm tra số spine theo bố cục (Phase 2) | Giữ, làm trước | Riêng nó đã chặn được lỗi "mất giọng hát" lặng lẽ |
| "Trang ảo" tách theo vai trò (trang giọng riêng, trang piano riêng) | **Đổi** thành trang ảo **theo hệ** (mỗi hệ đủ cả giọng + piano) | Tách theo vai trò làm mất đồng bộ giữa giọng và piano, phải ghép lại hai luồng kern theo ô nhịp và hỏng đúng lúc số ô lệch nhau. Trang chỉ có khuông đơn xếp chồng còn dễ bị model đọc thành từng cặp grand staff. Cắt theo hệ thì mỗi trang ảo biết chắc số khuông phải ra, kern vẫn liền một khối nên bước ghép hiện có dùng lại nguyên. Dữ liệu train của Transcoda có trang 1-6 hệ, căn trên, không giãn dọc, nên trang chỉ có một hệ vẫn đúng phân phối |
| Phóng to trang ảo | Không phóng | Khoảng cách dòng kẻ trên ảnh hiện tại ~8 px, đã ở mức lớn nhất trong khoảng render lúc train (ước lượng 4-8,5 px từ bảng tham số Verovio của bài báo). Phóng to sẽ ra ngoài phân phối |
| Audiveris làm ứng viên thứ hai | **Hoãn** | Cần Java 17 + Tesseract trên máy chạy music-ai, chưa đo được lợi ích. Chỉ thêm khi bảng đo cho thấy cần (nhất là cho lời ca), chạy bằng tiến trình con ở luồng nền |
| homr | Bỏ khỏi đợt này | Chỉ pitch + rhythm, bản mới cần Python 3.11, thêm onnx |
| Trọng tài theo từng ô nhịp giữa nhiều engine | **Đổi** thành chọn ứng viên theo trang/hệ | Chọn theo ô cần căn ô nhịp giữa các ứng viên, mà khi các ứng viên lệch số ô (đúng trường hợp lỗi) thì phép căn này mơ hồ. Với các biến thể của cùng Transcoda, chọn theo hệ là đủ và kiểm chứng được |
| Điểm log-xác suất token | Hoãn | Model tùy biến chưa chắc trả `output_scores`; dùng điểm cấu trúc trước |
| MusicXML nhiều part | Giữ | Bắt buộc để có part "Giọng hát" |
| Lời ca | Hoãn | Transcoda bỏ lời ca khi train (lời ca chỉ là nhiễu thị giác). Để cho đợt Audiveris/OCR |
| Bộ đánh giá Lieder render | Giữ ở dạng script, mở rộng sau | Đợt này có `scripts/omr_check.py` để đo trên bản thật |

Một chỗ trích dẫn cần chỉnh: Mục 5 bài báo Transcoda nói lỗi chủ yếu là **tách/gộp spine ảo** rồi trôi cả trang, không
nói trực tiếp "bỏ khuông". Bài báo còn có bộ giải mã ràng buộc theo dõi số spine đang mở; đây là hướng sửa tận gốc nếu
sau này dùng code GitHub của Transcoda thay cho bản Hugging Face (ép số spine = số khuông của bố cục).

## 3. Kiến trúc

```
PREPROCESS  ảnh trang ─► layout.analyze() ─► layout/page-NNN.json   (hệ, khuông, vai trò, độ tin cậy)
INFERENCE   lượt chính: Transcoda cả trang (như cũ) ─► so số spine với số khuông của bố cục
            trang sai ─► xếp vào hàng "nhận diện lại", chạy SAU khi xong mọi trang
            nhận diện lại: mỗi hệ một trang ảo ─► sai số spine thì thử beam 3 ─► ghép các hệ thành kern trang
            chọn ứng viên: đúng số khuông > ít ô sai trường độ > ứng viên cả trang
MERGE       ghép như cũ ─► thêm *Ivox / *Ipiano (mã nhạc cụ Humdrum, music21 đọc thành tên part) theo vai trò
EXPORT      MusicXML: part "Giọng hát" (1 khuông) + part "Piano" (2 khuông); MIDI mỗi khuông một track
```

### Luồng và thời gian (không chặn luồng chính)

* API không bao giờ bị chặn: job đã chạy trên luồng worker riêng (`jobs.JobManager`), endpoint chỉ xếp hàng.
* Model là tài nguyên dùng chung một thiết bị: chạy song song hai lần `generate` trên cùng model không nhanh hơn (CPU
  tranh lõi, MPS không an toàn đa luồng), nên không tạo thêm luồng suy luận.
* Nhận diện lại được **trì hoãn** tới sau lượt chính: mọi trang có kết quả trước, tiến độ chạy đều; phần nhận diện lại
  chỉ dùng thời gian còn dư. Hết ngân sách thì giữ kết quả lượt chính kèm cảnh báo, **không** làm job FAILED.
* Mỗi trang ảo có hạn riêng, hủy/timeout vẫn ngắt được giữa các token như cũ.
* Engine ngoài (Audiveris, nếu thêm) sẽ chạy bằng tiến trình con ở luồng nền ngay từ đầu job và chỉ được dùng nếu xong
  kịp lúc ghép.

Cấu hình `OMR_ROUTING`: `off` (như cũ), `fallback` (mặc định: chỉ nhận diện lại trang sai), `always` (nhận diện cả
hai cách cho mọi trang có bố cục tin cậy, để đo).

## 4. Các phase

1. **Bố cục** (`app/omr/layout.py`): dò dòng kẻ trên ảnh 1050×1485, gom 5 dòng thành khuông (chịu được thiếu 1-2
   dòng), gom khuông thành hệ theo vạch nối ở lề trái (dự phòng: theo khoảng cách), vai trò theo ngoặc nhọn ở lề trái,
   không thấy thì theo quy ước (2 khuông dưới cùng là piano). Test bằng ảnh tổng hợp + kiểm tay trên Ave Maria.
2. **Kiểm tra + nhận diện lại theo hệ** (`app/omr/routing.py`, `pipeline.py`): như Mục 3; lưu trang ảo và kern từng
   hệ trong `routing/`, kern trang đã ghép ở `routing/page-NNN-systems.krn`; `result_data.routing` ghi trang nào dùng
   ứng viên nào.
3. **Vai trò → kern → MusicXML/MIDI** (`merge.py`, `convert/musicxml.py`, `convert/midi.py`): bản chỉ có piano ra
   y như trước (test hồi quy).
4. **Script** `scripts/omr_check.py`: đối chiếu bố cục với kern đã lưu (không cần model); có model thì chạy lại một
   bản nhạc ở từng chế độ và in bảng: trang đúng số khuông, tỉ lệ ô đúng trường độ, thời gian/trang.
5. (Sau, nếu số đo cho thấy cần) Audiveris ở luồng nền cho lời ca và ý kiến thứ hai; bộ Lieder render để đo trên
   20-30 trang.

## 5. Xong khi

* Ave Maria: MusicXML có 2 part (Giọng hát 1 khuông, Piano 2 khuông); trang 1 có khuông giọng (nếu Transcoda đọc
  được khi cắt theo hệ), không còn cột bị độn lặng lẽ: chỗ nào vẫn phải độn đều có cảnh báo ghi rõ trang và hệ, và cột
  độn có khóa/nhịp kế thừa cùng dấu lặng đủ ô để giọng hát không lệch ô so với piano.
* Bản piano 2 khuông: kern, MusicXML, MIDI giống hệt trước (test hồi quy).
* `scripts/omr_check.py` chạy được trên bản thật để lấy số cho báo cáo.

## 6. Rủi ro

* Bố cục OpenCV sai với ảnh chụp nghiêng/mờ: khi độ tin cậy thấp thì không nhận diện lại, pipeline chạy như cũ.
* Thời gian: trang sai số khuông tốn thêm khoảng 1-2 lần suy luận một trang. Chạy CPU nên tăng `TASK_TIMEOUT_S`.
* Hệ có số khuông khác nhau trên cùng trang (giấu khuông trống ở đoạn dạo đầu): chỉ cảnh báo, không nhận diện lại.

## 7. Kết quả đo lần 1 và bước điều chỉnh

Đo trên Ave Maria (CPU): cắt cả hệ chỉ cứu được 2/4 hệ ở trang 1, và 0/10 hệ ở trang 2-3 (trong khi cả trang vốn đúng).
Vì vậy "mỗi hệ riêng lẻ dễ đọc hơn" không đúng với model này. Điều chỉnh: hệ nào vẫn sai thì đọc riêng khuông giọng và
grand staff (cả hai là loại đầu vào model làm tốt, xem 5 bản một khuông trong storage đều đọc đúng 1 spine) rồi ghép theo ô
nhịp (`app/omr/combine.py`). Chỉ số so sánh là `systemsOk` (đếm trước khi độn cột), không dùng `pagesOk`.

## 8. Trạng thái

Đã làm Phase 1-4 (code + test, chưa commit). Chưa đo bằng model thật: cần chạy
`python scripts/omr_check.py 37ca0796-2b70-47e3-9d65-844bb0dfa366 --run off,fallback,always` trên máy có Transcoda để
lấy số cho báo cáo và quyết định có cần Phase 5 (Audiveris) không.
