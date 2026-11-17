# OMR v2: audit, lựa chọn kiến trúc và kết quả đo (nhánh `feature/omr-recognition`, 17/11/2026)

Tài liệu này thay cho phần "kết luận" của `omr-multi-staff-plan.md` (plan đó vẫn đúng cho phần nhận diện lại theo hệ).
Mọi con số dưới đây tái lập được bằng `scripts/omr_benchmark.py` (mục 7). Chỗ nào chưa đo được thì ghi rõ.

## 0. Tóm tắt

* "Sai khoảng 50%" là cảm nhận, trước đây **không có ground truth nên chưa đo được**. Nay có bộ đánh giá (`app/eval`) và
  ground truth đầu tiên (bài "Dâng", 32 ô, 99 nốt, 131 âm tiết lời).
* Trên bài đó, Transcoda **đọc đúng gần như mọi nốt** (cao độ và trường độ đúng 100% trên các nốt đọc được) nhưng hỏng ở
  **cấu trúc**: lượt đọc cả trang lặp thừa 11-12 ô (precision 0,72, SER 0,38-0,40); bước nhận diện lại theo hệ sửa được
  số ô nhưng model thêm `*8va` không có thật làm 20 nốt sai quãng tám (F1 0,794). Và **lời ca hoàn toàn không được nhận
  diện** (bị xóa khỏi ảnh trước khi vào model).
* Không thay Transcoda: lỗi chính không nằm ở khả năng đọc ký hiệu. Kiến trúc mới giữ Transcoda làm nhánh A (sau lớp
  engine thay được), thêm nhánh B nhận diện lời ca riêng (OCR + gắn vào nốt), sửa lỗi 8va theo đúng phạm vi lần đọc, và
  bộ benchmark cố định để mọi thay đổi model (fine-tune, Transcoda v2.1) được đo cùng điều kiện.
* Kết quả trên ground truth hiện có: nhạc F1 0,794 -> **1,000**, SER 0,153 -> **0,000** (mô phỏng trên kern model đã sinh,
  1 bài); lời ca 0% -> **98,5%** âm tiết đúng chữ và đúng nốt, CER 0,8% (bài "Dâng"); CER 3,0% trên bài thứ hai (5 lời).
  Đây là số đo trên **2 trang**, chưa phải số đo tổng quát (xem mục 6.3).

## 1. Audit hệ thống cũ

### 1.1 Luồng xử lý

```
Web ─► Spring Boot ─POST /omr/jobs─► music-ai (FastAPI, 1 job/lần, luồng nền)
  SPLIT_PDF   PyMuPDF 300 DPI / đọc ảnh (EXIF)
  PREPROCESS  xám → khử nhiễu (PHOTO/SCAN) → deskew Hough → kiểm tra khuông → cắt lề → nhị phân → 1050×1485
              bố cục OpenCV: khuông, hệ, vai trò (giọng/piano), vạch nhịp, số ô
  INFERENCE   xóa chữ (lời ca, hợp âm) → Transcoda cả trang → **kern
              trang sai số khuông / lệch số ô → cắt từng hệ thành "trang ảo" → đọc lại (greedy → đọc riêng giọng/piano → beam 3)
  MERGE       làm sạch, ghép trang, kế thừa khóa/nhịp, đánh số ô, *Ivox/*Ipiano, kiểm tra trường độ, measureMap
  EXPORT      music21 kern → MusicXML → chuẩn hóa (part Giọng hát + part Piano 2 staff) → MIDI tự ghi
  callback    progress / files / complete(result_data) / fail
```

Mã: `app/omr/{pdf,preprocess,layout,barlines,textstrip,model_input,transcoda,routing,combine,merge,measure_map,
kern_check,pipeline}.py`, `app/convert/*`. Khoảng 6.000 dòng Python, 292 test (mọi test dùng model giả).

### 1.2 Transcoda là gì và có hợp bài toán không

| Câu hỏi | Trả lời (nguồn: model card, bài báo arXiv 2605.10835, mã trong repo) |
|---|---|
| Là gì, cơ chế | Vision-encoder-decoder 59M tham số: ConvNeXt-V2-Tiny → MLP → decoder Transformer 8 lớp, sinh tự hồi quy chuỗi **kern (BPE 3.000 token) từ **một ảnh trang 1485×1050**. End-to-end: không phát hiện ký hiệu, không có tọa độ. |
| Phù hợp? | Hợp với phần nhạc của bản in (đúng loại đầu vào), nhưng: không cho tọa độ (khó gắn lời, khó báo vị trí lỗi), sinh cả trang nên dễ "lạc chỗ" (đọc lặp hệ), cố định khổ trang. |
| Làm việc gì | Chuyển ảnh → chuỗi nhạc (ký hiệu + cấu trúc trong một bước). Không nhận diện văn bản. |
| Dataset train | Chỉ ảnh tổng hợp Verovio (310.554 trang từ PDMX, MuseTrainer, GrandStaff, OpenScore Lieder, Quartets). Không có ảnh thật, không có thánh ca Việt, không có ảnh chụp điện thoại. Theo bài báo, lời ca và dynamics bị **bỏ khỏi nhãn** nhưng được chèn vào ảnh làm nhiễu. |
| Giới hạn piano 2 khuông | Được train chủ yếu trên piano nên đây là miền mạnh nhất; lỗi theo bài báo là tách/gộp spine ảo rồi trôi cả trang. **Chưa đo được trong dự án: storage không có bản piano 2 khuông nào.** |
| Lời ca | Không hỗ trợ (bỏ khỏi nhãn khi train). |
| Chất lượng công bố | OMR-NED 18,46% trên trang Verovio, **63,97%** trên bản scan thật (Polish scores). Tức là ngoài miền tổng hợp, sai số lớn — khớp với cảm nhận "sai ~50%". |
| Giấy phép | Trọng số CC BY 4.0; mã repo gốc AGPL-3.0. |

Phiên bản mới hơn `btrkeks/transcoda-v2.1` (108M) báo OMR-NED 22,59% trên tập IMSLP thật (constrained greedy), nhưng
trọng số **CC BY-NC 4.0** (phi thương mại), chỉ nạp được bằng `scripts/infer.py` của repo AGPL, và model card ghi rõ không
xử lý giọng hát, khuông đơn, ảnh chụp. Đáng thử như một engine (mục 4), chưa thể kết luận là tốt hơn trên dữ liệu dự án.

### 1.3 Dữ liệu trong dự án

* **Không có dataset huấn luyện, không có ground truth, không có quy trình đánh giá** trước nhánh này. Script
  `omr_check.py` chỉ so số khuông/số ô, không so nội dung nốt.
* Storage có 18 lần chạy của 8 bản nhạc khác nhau, **tất cả đều là bản có lời**: 6 bản giai điệu một khuông (thánh ca, ảnh
  chụp màn hình/ảnh số/PDF, có hợp âm, 1-5 lời) và 2 bản giọng hát + piano (PDF 3 và 6 trang). **Không có bản piano 2
  khuông nào.**
* Hai bản MusicXML người dùng đã sửa tay (bài "Dâng" v2, v9) khớp 100% ground truth chép tay độc lập ở nhánh này: vừa xác
  nhận ground truth đúng, vừa là nguồn dữ liệu thật cho fine-tune sau này (không dùng bài nằm trong tập test).

### 1.4 Đo trên kết quả thật đã lưu (bài "Dâng", ảnh chụp, `omr_benchmark.py stored`)

| Kết quả | F1 nốt | Precision | Recall | Đúng cao độ* | Đúng trường độ* | Hợp âm | Ô đúng hoàn toàn | SER |
|---|---|---|---|---|---|---|---|---|
| Lượt đọc cả trang (5 lần chạy) | 0,809-0,840 | 0,711-0,724 | 0,938-1,000 | 1,000 | 1,000 | 0,906-1,000 | 0,938-1,000 | 0,382-0,397 |
| Kern cuối sau nhận diện lại theo hệ (2 lần chạy mới nhất) | 0,794 | 0,794 | 0,794 | 0,794 | 1,000 | 0,688 | 0,844 | 0,153 |

\* trên các nốt đọc đúng vị trí (ô đã căn). Ô thừa/thiếu được tính riêng: lượt cả trang thừa 11-12 ô trên 32.

### 1.5 Lỗi đã xác định (có bằng chứng)

1. **Đọc lặp ô nhịp** ở lượt cả trang: 4/6 bài một khuông thừa 4-12 ô (12-37% số ô) theo `omr_check.py`, một bài lệch
   1 ô, một bài không đếm được vạch nhịp. Đã có cơ chế sửa
   (nhận diện lại theo hệ, đếm vạch nhịp), đo trên "Dâng": về đúng 32/32 ô.
2. **`*8va` ảo**: kern của 6/18 lần chạy có `*8va`. Với hai bài đã kiểm tra ảnh ("Dâng", "Thánh Vịnh 22", đều một
   khuông) ảnh không có đường 8va nào; ở bản giọng hát + piano có `*8va` cả trên khuông tay phải piano (chưa kiểm ảnh nên
   chế độ `auto` không đụng tới khuông piano). Model viết nốt cao hơn nốt in một quãng tám. Thêm lỗi thứ hai: sau khi ghép các hệ, phạm vi `*8va` của hệ trước "rò" sang hệ sau.
   Trên "Dâng": 20/99 nốt sai quãng tám, hợp âm đúng chỉ còn 0,688.
3. **Lời ca không được nhận diện**: `textstrip.py` xóa lời ca khỏi ảnh trước khi vào model và không có bước nào đọc lại.
   Bản nhạc có lời ra MusicXML không lời (0/131 âm tiết).
4. **Khử nhiễu làm mất dòng kẻ ảnh số sạch**: `sourceType=SCAN` (median 3×3) trên "Thánh Vịnh 22" (PNG sạch) làm bố cục
   chỉ còn 1 hệ thay vì 5, kéo theo nhận diện lại theo hệ và measureMap sai. Nhị phân hóa đã có ngoại lệ cho ảnh sạch nhưng
   khử nhiễu thì chưa.
5. **Không đo được chất lượng**: không có ground truth, không có metric nốt/cao độ/trường độ, nên các bước sửa trước đây
   chỉ dựa vào số khuông/số ô.

### 1.6 Chưa đủ bằng chứng để kết luận

* Chất lượng trên **piano 2 khuông** (không có mẫu).
* `OMR_STRIP_TEXT=1` (xóa chữ trước khi vào model) có thực sự giúp không: bài báo cho biết lúc train có chèn chữ làm nhiễu.
  Cần chạy `omr_benchmark.py run --variant strip:OMR_STRIP_TEXT=1 --variant nostrip:OMR_STRIP_TEXT=0`.
* Greedy so với beam 3, CPU so với MPS trên M1: chưa chạy được model trong môi trường của nhánh này (không có torch).
* Transcoda v2.1 hoặc bản fine-tune có tốt hơn v1 trên dữ liệu dự án không.

## 2. Các phương án đã cân nhắc

| | P1 Giữ Transcoda + vá heuristic | P2 Thay bằng Audiveris | P3 homr | **P4 Lai: Transcoda (thay được) + nhánh lời ca + benchmark + fine-tune (chọn)** | P5 Một model đa nhiệm (nhạc + lời) |
|---|---|---|---|---|---|
| Kiến trúc | E2E ảnh → kern | Pipeline cổ điển (dò ký hiệu, quy tắc), MusicXML | Segmentation (oemer) + transformer theo từng khuông | Nhánh A E2E kern, nhánh B OCR + căn theo tọa độ, gộp ở MusicXML | Encoder chung, 2 decoder |
| Bằng chứng độ chính xác | Đo ở 1.4 | Chưa đo (cần Java 17; máy dev có Java 11) | Chưa đo; tác giả nhắm ảnh chụp, chỉ cao độ + trường độ | Đo ở mục 6 | Không có |
| Lời ca tiếng Việt | Không | Có (Tesseract chế độ legacy, gói ngôn ngữ cũ: dấu tiếng Việt kém) | Không | Có (Tesseract `vie` LSTM) | Phải tự gán nhãn |
| Dataset cần | Không | Không | Không | Không để chạy; fine-tune cần dữ liệu tổng hợp (có script) | Nhiều dữ liệu có nhãn cả nhạc lẫn lời: không có |
| Tài nguyên | CPU | CPU + JVM | CPU/ONNX | CPU (lời ca ~2 s/trang); fine-tune trên GPU Kaggle | GPU lớn |
| Tích hợp | Sẵn | Thêm JVM vào dịch vụ, chuyển MusicXML → kern hoặc đổi pipeline | Đổi pipeline | Giữ contract, chỉ thêm khóa `result_data` | Viết lại |
| Piano 2 khuông | Miền mạnh của model | Tốt trên bản sạch | Có | Như P1 | ? |
| Rủi ro | Không giải quyết lời ca | Lớn, chưa đo | Mất hợp âm/ký hiệu khác | Phụ thuộc chất lượng OCR và bố cục | Không khả thi trong đồ án |

Chọn **P4** vì: lỗi đo được nằm ở cấu trúc và lời ca chứ không ở khả năng đọc ký hiệu; tách nhạc và lời cho mỗi nhánh
dùng công cụ mạnh nhất cho việc của nó và không để lời ca làm nhiễu model nhạc; chạy được trên CPU/ARM64; không đổi
contract với Spring Boot; và để ngỏ việc thay/fine-tune model nhạc qua registry + benchmark thay vì đoán.

## 3. Kiến trúc mới

```
Input PDF/PNG/JPG
  └─ PREPROCESS: khử nhiễu (bỏ qua với ảnh số sạch), deskew, cắt lề, nhị phân → ảnh model 1050×1485
                 + ảnh độ phân giải cao chưa nhị phân (ocr/page-NNN.png) cho OCR
  └─ LAYOUT (OpenCV): khuông, hệ, vai trò, vạch nhịp, số ô;  text_mask: đâu là chữ, đâu là nhạc (dùng chung 2 nhánh)
        ├─ Nhánh A – ký hiệu nhạc (engine thay được: OMR_ENGINE=transcoda | command)
        │     xóa chữ → Transcoda cả trang → [sửa 8va theo từng lần đọc] → kiểm tra số khuông/số ô
        │     → nhận diện lại theo hệ → [sửa 8va] → làm sạch → ghép → kiểm tra trường độ → measureMap
        │     → MusicXML (part Giọng hát + Piano) 
        └─ Nhánh B – lời ca (OMR_LYRICS=auto)
              vùng chữ giữa các hệ → Tesseract vie+eng → dòng: LỜI / HỢP ÂM / KHÁC, số lời (1., 2., Đk:, (Đáp))
              → âm tiết (gạch nối, kéo dài) 
  └─ ALIGNMENT: lần đánh nốt của khuông giọng hát (MusicXML) + khung ô (measureMap) + cột đầu nốt (OpenCV)
                → gắn âm tiết bằng quy hoạch động đơn điệu, có độ tin cậy → <lyric number syllabic>
  └─ VALIDATION: cảnh báo theo trang/ô (định dạng "Trang N, ô nhịp M: ..."), result_data.lyrics.review
  └─ MusicXML (+ lời) → MIDI
Benchmark cố định (app/eval + scripts/omr_benchmark.py) đo mọi thay đổi; training/ tạo dữ liệu fine-tune cho Kaggle.
```

| Thành phần | File | Vai trò |
|---|---|---|
| Registry engine | `app/omr/engines.py`, `app/omr/command_engine.py` | Chọn engine nhạc bằng cấu hình; engine lệnh ngoài để thử model khác (v2.1, bản fine-tune) không cần sửa pipeline |
| Sửa 8va | `app/omr/ottava.py` | Bỏ `*8va` ảo trên khuông giọng hát/khuông đơn, trong phạm vi một lần đọc |
| OCR | `app/omr/lyrics/ocr.py` | Lớp trừu tượng engine OCR, Tesseract mặc định |
| Vùng chữ | `app/omr/lyrics/regions.py`, `app/omr/textstrip.py::text_mask` | Tách chữ khỏi nhạc, phân loại dòng, số lời, nhãn |
| Âm tiết | `app/omr/lyrics/syllables.py` | `single/begin/middle/end`, `extend` |
| Cột đầu nốt | `app/omr/lyrics/noteheads.py` | x của từng lần đánh nốt (Transcoda không có tọa độ) |
| Căn lời | `app/omr/lyrics/align.py` | Gắn âm tiết ↔ nốt, độ tin cậy |
| MusicXML lời | `app/omr/lyrics/musicxml_lyrics.py` | Chọn khuông giọng hát, chèn `<lyric>` đúng schema |
| Điều phối | `app/omr/lyrics/step.py`, `pipeline.py::_recognize_lyrics` | Không bao giờ làm job thất bại |
| Đánh giá | `app/eval/*` | Đọc kern/MusicXML, căn ô nhịp, metric nhạc/lời |
| Benchmark | `scripts/omr_benchmark.py`, `benchmark/` | Tập test cố định, ground truth, 3 chế độ đo |
| Huấn luyện | `training/augment.py`, `training/make_dataset.py`, `training/README.md` | Dữ liệu tổng hợp đúng miền + biến dạng ảnh chụp; chạy trên Kaggle |

## 4. Kế hoạch và trạng thái

| # | Việc | Loại | Phụ thuộc | Xong khi | Trạng thái |
|---|---|---|---|---|---|
| T1 | Bộ đánh giá nốt/cao độ/trường độ/hợp âm/SER/CER/WER/căn lời | Làm ngay | – | test + đo được kết quả đã lưu | Xong |
| T2 | Ground truth "Dâng" (nhạc + 3 lời) và dòng lời "Thánh Vịnh 22" | Thủ công | – | GT hợp lệ (mọi ô đủ phách) | Xong (2 trang) |
| T3 | Sửa 8va theo từng lần đọc | Làm ngay | T1 | F1/SER trên GT tốt hơn, không vỡ test cũ | Xong |
| T4 | Bỏ khử nhiễu với ảnh số sạch | Làm ngay | – | bố cục đúng 5 hệ với SCAN | Xong |
| T5 | Nhánh lời ca (OCR, phân loại dòng, âm tiết, cột đầu nốt, căn, MusicXML) | Làm ngay | T1 | ≥95% âm tiết đúng chỗ trên GT | Xong (98,5% trên 1 bài) |
| T6 | Tích hợp pipeline, cấu hình, `/health`, Dockerfile | Làm ngay | T3, T5 | test tích hợp với Java giả | Xong |
| T7 | Registry engine + engine lệnh ngoài | Làm ngay | – | test | Xong |
| T8 | Script benchmark (stored / lyrics / run) | Làm ngay | T1 | chạy được, test với engine giả | Xong |
| T9 | Chạy `omr_benchmark.py run` với model thật: `default` vs `OMR_OTTAVA=keep,OMR_LYRICS=off`, `OMR_STRIP_TEXT=0/1`, `NUM_BEAMS=1/3`, `DEVICE=cpu/mps` | Cần model (Mac của bạn) | T8 | bảng so sánh | **Chưa** (môi trường nhánh này không có torch) |
| T10 | Thêm ground truth: ≥3 bản piano 2 khuông, ≥3 bản giọng hát + piano, ≥5 bản lời (Việt/Anh), có ảnh chụp | Bổ sung dataset, thủ công | T1 | `cases.json` đủ Test A/B | **Chưa** |
| T11 | Thử Transcoda v2.1 qua `OMR_ENGINE=command` | Cần model, xét giấy phép | T8, T10 | bảng so với v1 | Chưa |
| T12 | Sinh dữ liệu tổng hợp đúng miền + fine-tune Transcoda | Cần GPU (Kaggle) | T10 (để đo), bộ chuẩn hóa của repo gốc | SER/F1 trên benchmark tốt hơn v1 | Script dữ liệu xong; train chưa chạy |
| T13 | Hợp âm (`<harmony>`) từ dòng CHORDS | Làm ngay (sau) | T5 | – | Chưa (dòng hợp âm đã được nhận diện và ghi vào lyrics.json) |

## 5. Những thay đổi đã triển khai

**Thêm:** `app/eval/{__init__,score,metrics,text,lyrics,export}.py`; `app/omr/{engines,command_engine,ottava}.py`;
`app/omr/lyrics/{__init__,ocr,regions,syllables,noteheads,align,musicxml_lyrics,step}.py`; `scripts/omr_benchmark.py`;
`benchmark/{README.md,cases.json,gt/dang/{score.krn,lyrics.json},gt/thanh-vinh-22/lyrics_lines.json}`;
`training/{__init__,augment,make_dataset}.py`, `training/README.md`; `docs/omr-architecture-v2.md`;
test: `tests/test_{eval,ottava,lyrics,pipeline_lyrics,benchmark,training}.py`.

**Sửa:** `app/omr/pipeline.py` (lưu ảnh OCR, sửa 8va ở lượt chính và nhận diện lại, bước lời ca trong EXPORT),
`app/omr/preprocess.py` (`PageResult.ocr_image/scale`, `canvas_scale`, bỏ khử nhiễu ảnh sạch), `app/omr/textstrip.py`
(tách `text_mask`, hành vi `strip_text` giữ nguyên), `app/omr/transcoda.py` (`get_recognizer` đi qua registry),
`app/config.py`, `app/main.py` (`/health` thêm `engine`, `lyricsOcr`), `requirements.txt`, `Dockerfile`, `.env.example`,
`.gitignore`, `README.md`.

**Không xóa file nào.** Bước xóa chữ, nhận diện lại theo hệ, ghép kern, xuất MusicXML/MIDI giữ nguyên.

**Contract với Spring Boot/web — chỉ thêm, không đổi:**

* `result_data.lyrics = {status, engine, syllables, placed, dropped, verses, lowConfidence, review[], path, millis}`
  (`status`: `done` | `skipped` (+`reason`) | `error`). Java lưu nguyên `resultData` (Map) nên không cần sửa.
* Cảnh báo mới theo định dạng có sẵn `Trang N, ...` (8va đã sửa, âm tiết gắn chưa chắc) để web hiển thị theo trang.
* MusicXML có thêm `<lyric number syllabic text>` trên khuông giọng hát (editor web đã hỗ trợ lời ca).
* File mới trong storage: `scores/<id>/ocr/page-NNN.png`, `scores/<id>/lyrics/lyrics.json`.
* `/health` thêm `engine`, `lyricsOcr` (Java không gọi `/health`).
* Biến môi trường mới đều có mặc định: `OMR_ENGINE`, `OMR_ENGINE_COMMAND`, `OMR_OTTAVA`, `OMR_LYRICS`,
  `LYRICS_OCR_ENGINE`, `LYRICS_LANG`, `LYRICS_MIN_CONFIDENCE`. Muốn hành vi y như cũ: `OMR_OTTAVA=keep OMR_LYRICS=off`.

## 6. Kết quả kiểm thử

### 6.1 Test tự động

`pytest -q`: **341 passed, 6 skipped** (292 test cũ vẫn pass; 49 test mới; 6 test bỏ qua vì môi trường chạy không có
PyMuPDF/music21, giống trước). Test Tesseract thật tự bỏ qua nếu máy chưa cài Tesseract.

### 6.2 Benchmark

Nhạc (bài "Dâng", `omr_benchmark.py stored`):

| | F1 nốt | Đúng cao độ | Hợp âm | Ô đúng hoàn toàn | SER |
|---|---|---|---|---|---|
| Cũ: kern cuối đã lưu | 0,794 | 0,794 | 0,688 | 0,844 | 0,153 |
| Mới: cùng kern từng hệ model đã sinh + sửa 8va theo lần đọc (mô phỏng) | **1,000** | **1,000** | **1,000** | **1,000** | **0,000** |

Lời ca (`omr_benchmark.py lyrics`, phần nhạc lấy từ ground truth để đo riêng nhánh B; Tesseract 5, `vie+eng`):

| Bài | Âm tiết đúng chữ + đúng nốt | CER | CER bỏ dấu | WER | Thời gian |
|---|---|---|---|---|---|
| "Dâng" (ảnh chụp, 3 lời, 131 âm tiết) | **98,5%** (129/131) | 0,8% | 0,5% | 1,5% | ~2,5 s/trang |
| "Thánh Vịnh 22" (ảnh số, 5 lời + đáp ca + Alleluia) | (chưa có GT nhạc) | 3,0% | – | 9,0% | ~2,4 s/trang |
| Hệ thống cũ | 0% | – | – | – | – |

Tham số chọn bằng đo trên cả hai trang (không chọn theo một trang): độ phóng vùng chữ theo chiều cao chữ ~32 px; số cột
đầu nốt đúng 32/32 ô trên "Dâng" (trước khi sửa thứ tự lấp lỗ: 21/32).

### 6.3 Giới hạn của các con số này

* Chỉ **1 bài có ground truth nhạc** và **2 trang có ground truth lời**; F1 = 1,000 là trên một bài, không phải "hệ thống đã
  đúng 100%". Kết quả mô phỏng chỉ áp dụng lần đọc greedy từng hệ đã lưu, không chạy lại model.
* Chưa chạy model thật trong môi trường này: thời gian/trang, RAM, ảnh hưởng của `OMR_STRIP_TEXT`, beam, MPS chưa đo.
* Chưa đo piano 2 khuông, bản PDF nhiều trang có lời, lời tiếng Anh có gạch nối (mới có test tổng hợp).
* Lỗi còn lại đã thấy: OCR mất dấu (`đôi→doi`, `Chóng→Chong`), nhãn số lời bị đọc nhầm (`5.`→`Š`), dòng hợp âm sát khuông
  không được đọc (không ảnh hưởng lời). Âm tiết không gắn được đều được liệt kê trong `lyrics.review`.

## 7. Hướng dẫn

Cài đặt (Mac M1): `brew install tesseract tesseract-lang` rồi `pip install -r requirements.txt`. Ubuntu ARM64:
`apt install tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng`. Chạy dịch vụ như cũ (`uvicorn app.main:app ...`);
`/health` → `lyricsOcr.enabled` phải là `true`.

```bash
# đo không cần model
STORAGE_ROOT=../music-be/storage python scripts/omr_benchmark.py stored
STORAGE_ROOT=../music-be/storage python scripts/omr_benchmark.py lyrics
# đo có model (trên Mac): hành vi cũ so với mới, cùng tập test
STORAGE_ROOT=../music-be/storage python scripts/omr_benchmark.py run \
  --variant cu:OMR_OTTAVA=keep,OMR_LYRICS=off --variant moi: --variant moi-khongxoachu:OMR_STRIP_TEXT=0
# thử Transcoda v2.1 / checkpoint fine-tune bằng lệnh ngoài (xem --help của script suy luận để điền cờ đúng)
OMR_ENGINE=command OMR_ENGINE_COMMAND='python /path/infer.py ... {image} ... {output}' python scripts/omr_benchmark.py run
```

Thêm bản nhạc vào benchmark: `benchmark/README.md`. Huấn luyện trên Kaggle: `training/README.md`.

## 8. Giấy phép

* Transcoda v1: trọng số CC BY 4.0 (ghi nguồn); mã repo gốc AGPL-3.0 — dự án không chép mã đó, chỉ gọi qua lệnh ngoài.
* Transcoda v2.1: trọng số **CC BY-NC 4.0** (phi thương mại). Dùng trong đồ án được, nhưng không dùng cho sản phẩm thương mại.
* Tesseract: Apache-2.0; gói `vie`: Apache-2.0.
* Dữ liệu fine-tune đề xuất: OpenScore Lieder (CC0), PDMX (chỉ phần public domain / CC0; kiểm tra lại cột giấy phép của
  từng bản trước khi dùng).
