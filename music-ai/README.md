# music-ai

Dịch vụ Python (FastAPI) cho phân hệ OMR. Spring Boot giao việc qua REST, music-ai đọc/ghi file trên **cùng thư mục
storage** với Spring Boot rồi báo tiến độ về bằng callback. music-ai **không kết nối MySQL**.

```
Web (React) ──REST+JWT──> Spring Boot ──POST /omr/jobs──> music-ai
                              ^                              │ đọc/ghi file
                              └── callback /internal/** ─────┘ (storage dùng chung)
```

Nhánh `feature/omr-preprocess` (bản hiện tại) **chỉ làm tiền xử lý ảnh**, chưa nạp model Transcoda
(`/health` trả `modelLoaded=false`). Nhận diện bằng Transcoda là nhánh `feature/omr-recognition`.

## Cài đặt

Cần Python 3.10 trở lên.

```bash
cd music-ai
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Chạy

```bash
cp .env.example .env               # chỉnh nếu cần (xem bảng dưới)
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Mở `http://127.0.0.1:8000/health` sẽ thấy `{"modelLoaded":false,"device":"cpu","queueSize":0}`.
Bên Spring Boot đặt `AI_INTERNAL_KEY` trùng với `INTERNAL_KEY` ở đây (mặc định cả hai là `dev-internal-key`).

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `INTERNAL_KEY` | `dev-internal-key` | Khóa dùng chung, header `X-Internal-Key` (cả hai chiều). **Đổi khi triển khai.** |
| `JAVA_BASE_URL` | `http://localhost:8080` | Nơi gọi callback `/internal/ai-tasks/**` |
| `STORAGE_ROOT` | `../music-be/storage` (so với repo) | Gốc storage dùng chung với Spring Boot |
| `TASK_TIMEOUT_S` | `600` | Tối đa cho cả job (10 phút) |
| `PAGE_TIMEOUT_S` | `90` | Tối đa cho mỗi trang |
| `PDF_DPI` | `300` | Độ phân giải khi vẽ PDF thành ảnh |
| `MAX_SIDE_PX` | `3600` | Cạnh dài tối đa của ảnh làm việc (lớn hơn thì thu nhỏ) |
| `QUEUE_MAX` | `50` | Số job tối đa trong hàng đợi (đầy thì trả 503) |

## API (Spring Boot gọi, đặc tả mục 6.2)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/health` | `{modelLoaded, device, queueSize}` |
| POST | `/omr/jobs` | Nhận job, trả **202** rồi chạy nền, **tuần tự 1 job một lúc**. Gửi lại cùng `taskId` vẫn 202, không chạy lần hai. Dữ liệu sai: 422. Hàng đợi đầy: 503 |
| DELETE | `/omr/jobs/{taskId}` | Hủy job đang chờ/chạy (dừng giữa các trang). Trả `{"cancelled": true/false}` |

`/omr/jobs` và DELETE cần header `X-Internal-Key`, sai trả 401.

Body `POST /omr/jobs`:

```json
{
  "taskId": "uuid",
  "scoreId": "uuid-của-bản-nhạc",
  "inputs": [{"path": "scores/<scoreId>/original/01-xxx.pdf", "kind": "PDF", "page": null}],
  "options": {"preprocess": true, "binarize": true, "sourceType": "PHOTO", "stopAfter": "PREPROCESS"}
}
```

Quy tắc kiểm tra (sai thì 422): `taskId` là UUID; `path` là đường dẫn **tương đối**, không có `..`, file phải tồn tại và
nằm trong `scores/<scoreId>/`; hoặc đúng 1 PDF, hoặc nhiều ảnh (không trộn).

## Tiền xử lý (đặc tả mục 2.2)

Tiến độ: **SPLIT_PDF 5-10%** → **PREPROCESS 10-30%** (báo sau mỗi trang) → lưu `scores/<id>/pages/page-NNN.png` →
callback `files` từng trang → callback `complete` (tạm dừng ở đây vì `stopAfter=PREPROCESS`).

Với mỗi trang: đọc ảnh (xoay theo EXIF; PDF vẽ bằng PyMuPDF 300 DPI) → xám → khử nhiễu (PHOTO: bilateral + cân bằng
ánh sáng nền; SCAN: median; PDF_NATIVE: bỏ qua) → deskew (Hough dò dòng kẻ rồi tinh chỉnh bằng profile chiếu, giới hạn
±15°) → kiểm tra có khuông nhạc → cắt bớt lề trắng → nhị phân hóa thích ứng → resize + pad về **1050 (rộng) × 1485
(cao)** → lưu PNG xám 8-bit.

### Đầu vào của Transcoda

Model `btrkeks/transcoda-59M-zeroshot-v1` nhận `pixel_values` shape `(1, 3, 1485, 1050)` = RGB, cao 1485 × rộng 1050,
float32 chuẩn hóa về [-1, 1] (`(x/255 - 0.5)/0.5`), kèm `image_sizes=[[1485, 1050]]`. **Một ảnh = một trang đầy đủ**
(không cắt theo hệ khuông). Vì vậy:

* PNG lưu ra luôn đúng 1050×1485 (`meta` ghi `{"width":1050,"height":1485}`; ví dụ `1485×1050` trong đặc tả mục 1.2
  bị ngược chiều).
* Trang cao hơn tỉ lệ thì **thu nhỏ cho vừa khung rồi pad trắng bên phải** (không cắt phần dưới như model card để
  khỏi mất nội dung); trang thấp hơn thì vừa chiều rộng, pad trắng phía dưới. Ảnh ngang xử lý như vậy và có cảnh báo.
* PNG xám 8-bit là đủ vì model tự chuyển sang RGB.
* `app/omr/model_input.py::to_model_input(png_path)` sinh đúng tensor trên (chưa dùng ở nhánh này).

### Tùy chọn

* `binarize=false`: tắt nhị phân hóa (nếu làm đứt dòng kẻ/đuôi nốt trên ảnh thật; model quen ảnh render sạch nền trắng).
* `preprocess=false`: chỉ resize + pad, không bỏ trang, dùng để so sánh có/không tiền xử lý ở script SER 1.7.

### Lỗi và cảnh báo

| Tình huống | Kết quả |
|---|---|
| Ảnh/PDF không đọc được | FAILED `PAGE_UNREADABLE: trang N` |
| Một trang không có dòng kẻ khuông | Bỏ trang, cảnh báo "Trang N không có khuông nhạc" |
| Mọi trang đều không có khuông | FAILED `NO_STAFF_DETECTED` |
| Góc nghiêng > 15° | Không xoay, cảnh báo trong `result_data.warnings` |
| Quá 90 giây một trang / 10 phút cả job | FAILED `TASK_TIMEOUT` |
| Java hủy | Dừng ở lần kiểm tra kế tiếp, không gọi callback |

Số trang PNG đánh liền mạch 1..N theo thứ tự đầu ra; trang gốc nằm trong `meta.sourcePage`.

## Test

```bash
pytest -q          # 50+ test, khoảng 1 phút; test PDF thật tự bỏ qua nếu chưa cài pymupdf
```

Test dùng trang nhạc tổng hợp (`tests/synth.py`) và một Spring Boot giả (`tests/fake_java.py`), không cần Java chạy.

### Thử music-ai riêng lẻ (không cần Spring Boot)

```bash
# cửa sổ 1: Spring Boot giả in ra mọi callback
python tests/fake_java.py 8080 dev-internal-key
# cửa sổ 2: music-ai (JAVA_BASE_URL mặc định http://localhost:8080)
uvicorn app.main:app --host 127.0.0.1 --port 8000
# cửa sổ 3: đặt một ảnh vào storage rồi giao job
mkdir -p ../music-be/storage/scores/demo/original
cp /đường/dẫn/trang.png ../music-be/storage/scores/demo/original/01-a.png
curl -i -X POST http://127.0.0.1:8000/omr/jobs -H 'X-Internal-Key: dev-internal-key' \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"11111111-1111-4111-8111-111111111111","scoreId":"demo",
       "inputs":[{"path":"scores/demo/original/01-a.png","kind":"IMAGE","page":1}],"options":{}}'
# ảnh đầu ra: ../music-be/storage/scores/demo/pages/page-001.png (1050x1485)
```

## Giấy phép

* Trọng số Transcoda: **CC BY 4.0** (theo model card). Cần ghi nguồn khi dùng/phân phối.
* Mã nguồn repo gốc `btrkeks/transcoda`: theo bạn tra cứu là **AGPL-3.0**; hãy đối chiếu lại file `LICENSE` của repo
  trước khi đưa mã của họ vào dự án (phần này chưa kiểm chứng được).
