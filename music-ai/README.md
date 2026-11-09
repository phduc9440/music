# music-ai

Dịch vụ Python (FastAPI) cho phân hệ OMR. Spring Boot giao việc qua REST, music-ai đọc/ghi file trên **cùng thư mục
storage** với Spring Boot rồi báo tiến độ về bằng callback. music-ai **không kết nối MySQL**.

```
Web (React) ──REST+JWT──> Spring Boot ──POST /omr/jobs──> music-ai
                              ^                              │ đọc/ghi file
                              └── callback /internal/** ─────┘ (storage dùng chung)
```

Pipeline hiện có: **tiền xử lý ảnh** (nhánh `feature/omr-preprocess`) rồi **nhận diện bằng Transcoda và ghép kern**
(nhánh `feature/omr-recognition`). Xuất MusicXML/MIDI là nhánh `feature/omr-export-musicxml-midi`.

## Cài đặt

Cần Python 3.10 trở lên. **Khuyến nghị Python 3.11 hoặc 3.12**: `torch` và `music21` hỗ trợ các bản này chắc chắn nhất; nếu
`pip install` báo không tìm được bản `torch` cho Python của bạn thì tạo lại venv bằng 3.12.

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

Mở `http://127.0.0.1:8000/health`:

* khi vừa chạy, model đang nạp ở luồng nền: `{"modelLoaded":false,"modelState":"loading","device":"cpu",...}`;
* nạp xong (lần đầu phải tải về, xem mục "Model Transcoda"): `{"modelLoaded":true,"modelState":"ready","device":"cpu",...}`;
* nạp lỗi: `modelState":"failed"` kèm `modelError` ghi nguyên nhân.

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
| `LOAD_MODEL` | `true` | `false`: không nạp Transcoda (chỉ chạy được tiền xử lý, không cần cài torch) |
| `MODEL_ID` | `btrkeks/transcoda-59M-zeroshot-v1` | Repo Hugging Face, hoặc đường dẫn thư mục model đã tải (ví dụ `models/transcoda`) |
| `DEVICE` | `auto` | `auto` (cuda nếu có, ngược lại cpu), `cpu`, `cuda`, `mps` (Mac Apple Silicon, thử nếu CPU chậm) |
| `NUM_BEAMS` | `1` | 1 = greedy (nhanh); 3 = beam search như bài báo (chính xác hơn, chậm hơn nhiều) |
| `MAX_TOKENS` | `2048` | Số token sinh tối đa mỗi trang |
| `REPETITION_PENALTY` | `1.1` | Phạt lặp token (theo model card) |
| `INFERENCE_PAGE_TIMEOUT_S` | `90` | Tối đa cho suy luận mỗi trang. **Chạy CPU thì nên tăng** (kèm `TASK_TIMEOUT_S`) |
| `MODEL_WAIT_S` | `600` | Job đến khi model còn đang nạp thì chờ tối đa bấy nhiêu giây |
| `KERN_PARSE_MODE` | `fail` | `fail`: music21 không đọc được kern ghép thì task FAILED `KERN_PARSE_ERROR`; `warn`: chỉ cảnh báo |
| `MAX_REPEAT_LINES` | `24` | Một dòng kern lặp liên tiếp quá số này bị coi là model sinh lặp và cắt bớt |
| `OMR_ROUTING` | `fallback` | `off`: như cũ. `fallback`: trang có số spine khác số khuông trên ảnh thì nhận diện lại từng hệ. `always`: nhận diện cả hai cách cho mọi trang rồi chọn (để đo, chậm gấp đôi). Xem "Bố cục và nhận diện lại theo hệ" |
| `OMR_ROUTING_BARS` | `1` | `1`: đếm vạch nhịp trên ảnh; trang có số ô lệch nhiều (model đọc lặp, đọc lại hệ trước) cũng được nhận diện lại theo hệ, model bị dừng sớm khi sinh vượt số ô, lần đọc đúng số ô được ưu tiên. `0`: tắt (để so sánh). Xem "Đếm ô nhịp trên ảnh" |
| `OMR_ROUTING_MEASURES` | `0` | `1`: trang đúng số spine nhưng có ô nhịp lệch trường độ cũng được nhận diện lại theo hệ (chậm hơn, đọc lại mọi hệ của trang) |
| `ROUTING_RETRY_BEAMS` | `3` | Hệ vẫn sai số khuông thì thử lại bằng beam search với số beam này; `0`/`1`: không thử lại |
| `ROUTING_RESERVE_S` | `30` | Giây giữ lại cho bước ghép/xuất: nhận diện lại chỉ chạy khi job còn nhiều thời gian hơn mức này |

## API (Spring Boot gọi, đặc tả mục 6.2)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/health` | `{modelLoaded, device, queueSize}` |
| POST | `/omr/jobs` | Nhận job, trả **202** rồi chạy nền, **tuần tự 1 job một lúc**. Gửi lại cùng `taskId` vẫn 202, không chạy lần hai. Dữ liệu sai: 422. Hàng đợi đầy: 503 |
| DELETE | `/omr/jobs/{taskId}` | Hủy job đang chờ/chạy (dừng giữa các trang). Trả `{"cancelled": true/false}` |
| POST | `/convert/kern-to-musicxml` | Đồng bộ: kern → MusicXML đã chuẩn hóa. Body `{kernPath, outPath, tempoBpm?}`; trả số ô nhịp, giọng, nhịp, tempo |
| POST | `/convert/musicxml-to-midi` | Đồng bộ: MusicXML → MIDI (Java gọi khi MIDI cũ hơn MusicXML). Body `{musicXmlPath, outPath, tempoBpm}`; trả `{notes, tracks, seconds}` |

Mọi endpoint trừ `/health` cần header `X-Internal-Key`, sai trả 401. Hai endpoint `/convert/**` chạy ngoài hàng đợi OMR; đường
dẫn phải nằm trong `scores/<scoreId>/` (cùng một bản nhạc cho vào và ra), `outPath` có đuôi `.musicxml` / `.mid`; sai: 422.

Body `POST /omr/jobs`:

```json
{
  "taskId": "uuid",
  "scoreId": "uuid-của-bản-nhạc",
  "inputs": [{"path": "scores/<scoreId>/original/01-xxx.pdf", "kind": "PDF", "page": null}],
  "options": {"preprocess": true, "binarize": true, "sourceType": "PHOTO", "stopAfter": "EXPORT", "musicXmlVersion": 1}
}
```

Quy tắc kiểm tra (sai thì 422): `taskId` là UUID; `path` là đường dẫn **tương đối**, không có `..`, file phải tồn tại và
nằm trong `scores/<scoreId>/`; hoặc đúng 1 PDF, hoặc nhiều ảnh (không trộn).

## Các bước và tiến độ

| Bước | Tiến độ | Việc làm |
|---|---|---|
| `SPLIT_PDF` | 5-10% | Tách PDF / đọc các ảnh đầu vào |
| `PREPROCESS` | 10-30% | Tiền xử lý từng trang → `pages/page-NNN.png` → callback `files` (PNG); bố cục → `layout/page-NNN.json` |
| `INFERENCE` | 30-85% | Transcoda nhận diện từng trang → `kern/page-NNN.krn`; tiến độ `30 + 55 × trang_xong / tổng_trang`. Sau đó (vẫn ở 85%) trang sai số khuông hoặc lệch số ô được nhận diện lại theo hệ → `routing/` |
| `MERGE` | 85-90% | Làm sạch, ghép kern, kiểm tra → `kern/merged.krn` → callback `files` (KERN) |
| `EXPORT` | 90-98% | kern → `musicxml/v{n}.musicxml` → `midi/v{n}.mid` → callback `files` (MUSICXML, MIDI) → `complete` |

`stopAfter` (Java gửi, biến `OMR_STOP_AFTER`): `PREPROCESS` dừng sau tiền xử lý (không cần model); `MERGE` dừng sau ghép
kern; `EXPORT` (mặc định) chạy đủ. `musicXmlVersion` do Java tính (`scores.current_version + 1`): nhận diện lại sinh
`v2`, `v3`... và không ghi đè bản cũ. Chỉ khi chạy đủ thì `result_data` không có khóa `stoppedAfter`.

## Bố cục và nhận diện lại theo hệ (bản giọng hát + piano)

Transcoda đôi khi bỏ hẳn một khuông ở cả trang (ví dụ khuông giọng hát) hoặc tách/gộp spine sai rồi trôi tới cuối trang.
Plan và lý do chọn cách làm: `docs/omr-multi-staff-plan.md`.

1. **Bố cục** (`app/omr/layout.py`, chỉ OpenCV, ~10 ms/trang): trên chính ảnh 1050×1485 model nhận, dò khuông, gom hệ
   theo vạch nối ở lề trái, gán vai trò (cặp có ngoặc nhọn là piano; không thấy ngoặc thì hai khuông dưới cùng là
   piano, khuông phía trên là giọng hát). Mọi hệ cùng số khuông thì bố cục được coi là tin cậy.
2. **Kiểm tra**: kern trang phải có số spine bằng số khuông mỗi hệ. Sai thì có cảnh báo ghi rõ trang.
3. **Nhận diện lại theo hệ** (`app/omr/routing.py`, `OMR_ROUTING=fallback`): sau khi mọi trang đã có kết quả, mỗi hệ của
   trang sai được đặt lên một trang trắng giữ nguyên tỉ lệ (`routing/page-NNN-sKK.png`) rồi nhận diện riêng. Hệ "sai" (sai số spine, hoặc hệ có cả giọng lẫn piano mà ô nhịp lệch trường độ) được thử theo
   thứ tự rẻ trước: đọc cả hệ (greedy) → **đọc riêng từng nhóm khuông** (khuông giọng một ảnh, grand staff piano một ảnh,
   `routing/page-NNN-sKK-r1-single.png`, `...-r2-piano.png`; mỗi lần greedy và ngắn) rồi ghép theo ô nhịp và thời điểm
   (`app/omr/combine.py`); không ghép được (số ô khác nhau, đổi khóa giữa ô...) thì ghi cảnh báo lý do và độn như trước.
   Kern các hệ được ghép (`routing/page-NNN-systems.krn`) và chỉ thay kết quả cả trang khi
   có hệ đọc đúng số khuông và điểm cấu trúc cao hơn. Chỉ dùng thời gian còn dư của job (trừ `ROUTING_RESERVE_S`):
   không đủ thời gian thì giữ kết quả cả trang kèm cảnh báo, không bao giờ làm job FAILED. `result_data.routing` ghi
   trang nào dùng ứng viên nào.
4. **Vai trò → kern**: bản có cả khuông đơn và piano thì `merged.krn` có dòng `*Ivox`/`*Ipiano` (mã nhạc cụ Humdrum)
   ngay sau `**kern`; `result_data.staffRoles` ghi vai trò từ trên xuống. Bản chỉ có piano hoặc chỉ một khuông giữ
   nguyên như cũ.

## Đếm ô nhịp trên ảnh (sửa lỗi model đọc lặp)

Transcoda giải mã cả trang tự hồi quy nên đôi khi "lạc chỗ": đọc xong một hệ lại quay về đọc lại hệ trước, hoặc lặp nguyên
một khối ô nhịp tới hết `MAX_TOKENS`. Số khuông vẫn đúng nên bước kiểm tra spine không thấy (ví dụ bài 6 hệ, 32 ô mà kern
ra 44 ô).

1. **Dò vạch nhịp** (`app/omr/barlines.py`, gọi từ `analyze_layout`): cột phủ kín chiều cao khuông, mảnh, không vượt ra
   ngoài khuông (trừ khi nối sang khuông kề trong hệ), bốn góc hai đầu không có đầu nốt (thân nốt luôn có đầu nốt ở một
   đầu); gộp theo hệ, giữ vạch có ở ít nhất nửa số khuông. `layout/page-NNN.json` có thêm `measureCount` và từng hệ
   `measures`, `barlines`, `barsClosed`. Số ô của trang chỉ được dùng khi mọi hệ kết thúc bằng vạch nhịp
   (`bars_confident`); bản quét mờ/nghiêng thì không dùng, pipeline chạy như cũ.
2. **Dừng sinh sớm**: lượt cả trang được sinh tối đa `số ô + max(4, 20%)` vạch nhịp, trang ảo một hệ tối đa `số ô + 3`
   (`max_measures` của `recognize`), để vòng lặp không ăn hết thời gian của bước nhận diện lại.
3. **Nhận diện lại theo hệ khi lệch số ô**: trang lệch từ 2 ô và từ 10% (`routing.measures_off`) được nhận diện lại theo
   hệ như trang sai số khuông; mỗi hệ phải đúng số ô của hệ đó (sai thì thử đọc riêng giọng/piano rồi beam). Khi chọn
   ứng viên, lệch 0 hay 1 ô coi như nhau (bộ dò có thể sót một vạch), lệch từ 2 ô bị xếp sau.
4. **Bỏ khối lặp**: mọi lần đọc vẫn thừa ô thì bỏ các khối ô nhịp lặp liền nhau giống hệt
   (`merge.drop_repeated_blocks`), chỉ tới khi bằng số ô trên ảnh (nhạc thật cũng có thể lặp).
5. **Bản đồ ô nhịp** (`app/omr/measure_map.py`): `result_data.measureMap = [{measure, page, system, box, flags}]` (khung
   `[x0, y0, x1, y1]` trên ảnh `pages/page-NNN.png`; `flags`: `DURATION` lệch trường độ, `COUNT_MISMATCH` hệ/trang lệch
   số ô) và `result_data.measureCheck = {imageMeasures, kernMeasures, pagesRerouted, pages}` cho trang review.

Đo trên bản nhạc thật (script không ghi vào storage, không gọi Java):

```bash
python scripts/omr_check.py <scoreId>                          # không cần model: số khuông trên ảnh so với kern đã lưu
python scripts/omr_check.py <scoreId> --run off,fallback,always  # có model: bảng trang/hệ đúng số khuông, ô đúng trường độ, s/trang
python scripts/omr_check.py <scoreId> --run fallback --dump /tmp/omr  # lưu ảnh + kern từng lần đọc và systems.txt để đối chiếu
python scripts/omr_check.py --all --bars omr-dump/bars           # ảnh trang có vạch nhịp dò được, kiểm tra bộ dò bằng mắt
OMR_ROUTING_BARS=0 python scripts/omr_check.py --all --run fallback  # so sánh trước/sau khi dùng số ô trên ảnh
```

## Xuất MusicXML và MIDI (đặc tả mục 2.4)

1. **kern → MusicXML** (`app/convert/kern.py`): music21 đọc `merged.krn` rồi ghi MusicXML thô.
2. **Chuẩn hóa** (`app/convert/musicxml.py`, chỉ dùng thư viện chuẩn): gộp các khuông thành **1 part "Piano" nhiều staff**
   (`<staves>2</staves>`, staff 1 = tay phải). Kern có `*Ivox` thì mỗi khuông giọng là **một part "Giọng hát"** riêng
   (chương trình MIDI 53) đứng trên part "Piano" 2 khuông. Đưa các part về cùng `divisions`, đánh lại `<staff>`/`<voice>` cho không trùng,
   thêm `<sound tempo>` ở ô nhịp 1, đánh lại số ô nhịp từ 1. Khuông trên/dưới được xác định từ **khóa nhạc và cao độ**,
   không dựa vào thứ tự part music21 trả về. Metadata (`measureCount`, `keySignature` dạng `G`/`Bb`/`F#m`, `timeSignature`,
   `tempoBpm`, `staffCount`) rút từ chính MusicXML này và ghi đè giá trị tạm rút từ kern.
3. **MusicXML → MIDI** (`app/convert/midi.py`): tự ghi MIDI chuẩn (SMF 1, 480 tick/phách): **track i = khuông thứ i+1 từ trên
   xuống qua mọi part, kênh i** (bỏ qua kênh 9; bản giọng hát + piano: track 0 giọng, 1 tay phải, 2 tay trái), chương trình
   theo `<midi-program>` của part, tempo và nhịp ở track đầu; nốt nối (tie) gộp thành một nốt. Không dùng `music21 write('midi')` vì cách
   music21 gán track/kênh cho bản nhiều staff thay đổi theo phiên bản.

Hai file chỉ được báo về Java (callback `files`) sau khi cả hai đã ghi xong; `complete` kèm `pageMeasures`
(`[{page, firstMeasure, lastMeasure}]`, để web vẽ đúng phần nhạc của từng trang bên cạnh ảnh gốc).

| Tình huống | Kết quả |
|---|---|
| music21 không đọc/ghi được kern, thiếu music21, MusicXML không có ô nhịp | FAILED `EXPORT_ERROR: chi tiết` (file kern vẫn giữ) |
| Số ô nhịp theo kern khác theo MusicXML | Cảnh báo: ảnh trang và bản nhạc đặt cạnh nhau có thể lệch |
| Số staff khác 2 | Cảnh báo: nút Tắt/Solo từng tay có thể không dùng được |

## Tiền xử lý (đặc tả mục 2.2)

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
* `app/omr/model_input.py::to_model_input(png_path)` sinh đúng tensor trên; `app/omr/transcoda.py` dùng nó.

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

## Model Transcoda

`btrkeks/transcoda-59M-zeroshot-v1` (~59 triệu tham số, vài trăm MB). **Không cần tải tay**: lần chạy đầu `transformers`
tự tải từ Hugging Face vào cache (`~/.cache/huggingface`), vì thế lần đầu cần Internet và mất vài phút. Model còn tải thêm
trọng số ConvNeXt-V2-Tiny rồi ghi đè bằng trọng số Transcoda (model card nói đây là bình thường).

Muốn tải trước để dùng offline hoặc để vào thư mục dự án:

```bash
pip install -U "huggingface_hub[cli]"
huggingface-cli download btrkeks/transcoda-59M-zeroshot-v1 --local-dir models/transcoda
# rồi chạy với: MODEL_ID=models/transcoda uvicorn app.main:app ...
```

`models/` đã nằm trong `.gitignore`, không commit file trọng số. Nếu lúc nạp báo `ModuleNotFoundError` (ví dụ `timm`) thì
`pip install` đúng gói đó rồi chạy lại.

Mỗi trang gồm các bước: ảnh PNG 1050×1485 → tensor → `generate` (greedy, `repetition_penalty=1.1`, tối đa 2048 token) →
decode thành `**kern`. Mỗi token sinh ra đều kiểm tra hủy/timeout nên bấm Hủy dừng được ngay giữa một trang.

**Tốc độ:** trên CPU mỗi trang có thể mất từ vài chục giây đến vài phút. Nếu gặp `TASK_TIMEOUT` hãy tăng
`INFERENCE_PAGE_TIMEOUT_S` và `TASK_TIMEOUT_S` (và `app.ai.processing-timeout-minutes` bên Spring Boot nếu một job chạy
quá 10 phút). Có GPU NVIDIA thì `DEVICE=auto` tự dùng; trên Mac Apple Silicon có thể thử `DEVICE=mps`.

## Ghép kern và kiểm tra (đặc tả mục 2.3)

* Làm sạch từng trang: bỏ trang không có `**kern` hoặc không có nốt nào (cảnh báo); cắt đoạn dòng lặp vô hạn; nếu model
  chạm giới hạn 2048 token thì bỏ dòng cuối (có thể bị cắt dở) và cảnh báo.
* Ghép: giữ header trang 1, bỏ header `**kern` và `*-` của các trang sau; trang sau thiếu khóa/dấu hóa/khóa điệu/nhịp thì
  kế thừa từ trang trước; vạch nhịp trùng ở chỗ nối bị bỏ bớt; **đánh lại số ô nhịp liên tục**.
* Số spine khác trang đầu: căn theo trang đầu (bỏ cột thừa/thêm cột trống) kèm cảnh báo; không căn được thì FAILED
  `MERGE_SPINE_MISMATCH`.
* Tổng trường độ một ô nhịp khác số chỉ nhịp: cảnh báo kèm số trang và số ô nhịp (tối đa 10 cảnh báo); ô nhịp đầu
  (lấy đà) và ô cuối được phép ngắn hơn.
* Số spine khác 2: cảnh báo, `staffCount` ghi theo thực tế.
* `music21` đọc thử `merged.krn`: không đọc được thì FAILED `KERN_PARSE_ERROR` (file kern **vẫn được lưu và đăng ký**
  để xem lại); đặt `KERN_PARSE_MODE=warn` để chỉ cảnh báo. Chưa cài music21 thì bỏ qua bước này kèm cảnh báo.

### Lỗi mới của nhánh này

| Tình huống | Kết quả |
|---|---|
| Mọi trang đều rỗng / không có `**kern` | FAILED `RECOGNITION_EMPTY` |
| Số spine giữa các trang không căn được | FAILED `MERGE_SPINE_MISMATCH: trang N` |
| music21 không đọc được kern ghép | FAILED `KERN_PARSE_ERROR: chi tiết` |
| Model tắt hoặc nạp lỗi | FAILED `MODEL_NOT_LOADED: nguyên nhân` |
| Quá `INFERENCE_PAGE_TIMEOUT_S` một trang | FAILED `TASK_TIMEOUT: trang N quá ... giây` |

## Test

```bash
pytest -q          # 130+ test, khoảng 2-3 phút; test PDF thật và test music21 thật tự bỏ qua nếu chưa cài
```

`tests/test_convert_kern.py` chạy music21 thật (kern → MusicXML → MIDI) và chỉ chạy khi đã `pip install music21`; các test
còn lại (`test_convert_xml.py`, `test_export.py`) dùng MusicXML dựng tay nên chạy ở mọi nơi.

Test dùng trang nhạc tổng hợp (`tests/synth.py`), Spring Boot giả (`tests/fake_java.py`) và Transcoda giả
(`tests/fake_recognizer.py`), nên **không cần Java, torch hay tải model** để chạy test. Việc chạy model thật phải thử tay.

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
# kern đầu ra (khi model đã nạp): ../music-be/storage/scores/demo/kern/page-001.krn và merged.krn
```

Chỉ thử tiền xử lý (không cần model): đặt `"stopAfter":"PREPROCESS"` trong `options`, hoặc chạy với `LOAD_MODEL=false`.

## Giấy phép

* Trọng số Transcoda: **CC BY 4.0** (theo model card). Cần ghi nguồn khi dùng/phân phối.
* Mã nguồn repo gốc `btrkeks/transcoda`: theo bạn tra cứu là **AGPL-3.0**; hãy đối chiếu lại file `LICENSE` của repo
  trước khi đưa mã của họ vào dự án (phần này chưa kiểm chứng được).
