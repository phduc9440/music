# music-ai

Dịch vụ Python (FastAPI) lo phần xử lý nhạc của hệ thống Music:

- **OMR**: đọc PDF / ảnh bản nhạc thành `**kern`, rồi MusicXML và MIDI (model Transcoda).
- **Chuyển đổi**: kern → MusicXML, MusicXML → MIDI, chuẩn hóa MusicXML nhập vào, chuẩn bị MusicXML trước khi
  MuseScore xuất file.
- **So sánh** hai phiên bản MusicXML theo từng ô nhịp.
- **Gợi ý hợp âm** cho bản chỉ có giai điệu (model AutoHarmonizer, lấy mẫu ra 3 phương án, mỗi lần một khác).

Tổng quan cả hệ thống: [README ở thư mục gốc](../README.md).

## Cách hoạt động

```
Web (React) ──REST+JWT──> music-be (Spring Boot) ──POST /omr/jobs, /convert/**, /chords──> music-ai
                                   ^                                                          │ đọc/ghi file
                                   └──────────── callback /internal/ai-tasks/** ──────────────┘ (storage dùng chung)
```

- Chỉ `music-be` gọi tới đây. Mọi endpoint trừ `/health` cần header `X-Internal-Key`; callback ngược về backend cũng
  gửi kèm header đó.
- music-ai **không kết nối MySQL**. Hai bên trao đổi đường dẫn tương đối trong thư mục storage dùng chung
  (`scores/<scoreId>/...`), không gửi nội dung file qua HTTP.
- Job OMR chạy nền, **mỗi lần một job** theo hàng đợi. Các endpoint chuyển đổi, so sánh và hợp âm chạy đồng bộ, không
  phải xếp hàng sau OMR.

## Cài đặt

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Python | 3.11 hoặc 3.12 (tối thiểu 3.10) | Docker dùng 3.11. Từ 3.13 trở lên chưa thử: `torch`, `music21` có thể chưa có bản phù hợp |
| Gói Python | theo `requirements.txt` | `torch` chạy được trên CPU, CUDA hoặc MPS (Mac Apple Silicon) |

```bash
cd music-ai
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/check_env.py
```

`check_env.py` in phiên bản Python, từng gói và các cảnh báo; thấy `OK` là chạy được. Khi cần nhờ hỗ trợ thì dán kết
quả của lệnh này.

Luôn cài bằng `python -m pip`, không gõ `pip` trần. Lý do: nếu venv được tạo từ một bản Python khác, `pip` có thể cài
gói vào chỗ mà `python` không đọc, nên cài xong vẫn báo thiếu gói. Gặp trường hợp này thì tạo lại venv:
`rm -rf .venv && python3.12 -m venv .venv`.

## Chạy

```bash
cp .env.example .env
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Kiểm tra tại http://127.0.0.1:8000/health. Trường `modelState` có các giá trị:

| `modelState` | Nghĩa |
|---|---|
| `loading` | Model đang nạp ở luồng nền (lần đầu phải tải từ Hugging Face, mất vài phút) |
| `ready` | Sẵn sàng (`modelLoaded: true`) |
| `failed` | Nạp lỗi, nguyên nhân ở `modelError` |
| `disabled` | `LOAD_MODEL=false`: chỉ chạy tiền xử lý, chuyển đổi, so sánh, hợp âm |

`INTERNAL_KEY` phải trùng `AI_INTERNAL_KEY` của backend (mặc định cả hai đều là `dev-internal-key`).

Khi chạy bằng Docker (`docker compose` ở thư mục gốc), image cài PyTorch bản CPU, model được cache trong volume
`hf-cache`, storage nằm ở `/data/storage`. Trong container có thể chạy
`docker exec <container> python scripts/check_env.py` để kiểm tra môi trường.

## Cấu hình

Mọi biến đều có giá trị mặc định. [`.env.example`](.env.example) liệt kê đủ, kèm giải thích ngắn.

### Kết nối và giới hạn

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `INTERNAL_KEY` | `dev-internal-key` | Khóa dùng chung với backend. **Đổi khi triển khai** |
| `JAVA_BASE_URL` | `http://localhost:8080` | Địa chỉ backend để gọi callback |
| `STORAGE_ROOT` | `../music-be/storage` | Thư mục storage dùng chung với backend |
| `CALLBACK_RETRIES`, `CALLBACK_TIMEOUT_S` | `3`, `10` | Số lần gọi lại callback khi lỗi và thời gian chờ mỗi lần |
| `QUEUE_MAX` | `50` | Số job tối đa trong hàng đợi; đầy thì trả 503 |
| `TASK_TIMEOUT_S` | `3600` | Trần thời gian của một job, dù nhiều trang |
| `TASK_TIMEOUT_BASE_S` | `300` | Ngân sách cố định của một job; ngân sách thật = cơ sở + số trang × `TASK_TIMEOUT_PER_PAGE_S` (không quá trần) |
| `TASK_TIMEOUT_PER_PAGE_S` | `180` | Thời gian cộng thêm cho mỗi trang |
| `PROGRESS_HEARTBEAT_S` | `240` | Quá khoảng này chưa có tiến độ mới thì gửi lại tiến độ cũ để watchdog 10 phút của Java không cắt nhầm |
| `PAGE_TIMEOUT_S` | `90` | Thời gian tối đa cho tiền xử lý mỗi trang |
| `MAX_PAGES` | `40` | Số trang PDF tối đa mỗi job |
| `PDF_DPI`, `MAX_SIDE_PX` | `300`, `3600` | Độ phân giải khi vẽ PDF thành ảnh; cạnh dài tối đa của ảnh làm việc |

### Model

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LOAD_MODEL` | `true` | `false`: không nạp Transcoda, không cần cài `torch` |
| `MODEL_ID` | `btrkeks/transcoda-59M-zeroshot-v1` | Repo Hugging Face, hoặc thư mục model đã tải về (ví dụ `models/transcoda`) |
| `DEVICE` | `auto` | `auto` (có CUDA thì dùng, không thì CPU), `cpu`, `cuda`, `mps` |
| `OMR_PROFILE` | `default` | `accurate`: mặc định cho các biến chưa đặt chuyển sang cấu hình chính xác hơn nhưng chậm (`NUM_BEAMS=3`, `OMR_ROUTING_MEASURES=1`, `OMR_TTA=3`, `OMR_TTA_MAX_SYSTEMS=12`, nới thời gian). Biến đặt riêng vẫn thắng. A/B: `omr_benchmark.py run --variant moi: --variant chinhxac:OMR_PROFILE=accurate` |
| `NUM_BEAMS` | `1` | `1` = greedy (nhanh); `3` = beam search như bài báo (chính xác hơn, chậm hơn nhiều) |
| `MAX_TOKENS`, `REPETITION_PENALTY` | `2048`, `1.1` | Số token sinh tối đa mỗi lần đọc; hệ số phạt lặp |
| `INFERENCE_PAGE_TIMEOUT_S` | `90` | Thời gian tối đa cho nhận diện mỗi trang. **Chạy CPU thì nên tăng**, cùng với `TASK_TIMEOUT_S` |
| `MODEL_WAIT_S` | `600` | Job đến khi model còn đang nạp thì chờ tối đa bấy nhiêu giây |
| `OMR_ENGINE` | `transcoda` | `command`: chạy lệnh ngoài `OMR_ENGINE_COMMAND` (có `{image}`, `{output}`, `{beams}`) để thử model khác |

### Ghép kern và sửa lỗi nhận diện

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `KERN_PARSE_MODE` | `fail` | `fail`: music21 không đọc được kern ghép thì job lỗi `KERN_PARSE_ERROR`; `warn`: chỉ cảnh báo |
| `MERGE_LENIENT_SPINES` | `true` | Căn các trang về số spine phổ biến nhất thay vì báo lỗi `MERGE_SPINE_MISMATCH` |
| `MAX_REPEAT_LINES` | `24` | Một dòng kern lặp liên tiếp quá số này thì coi là model đọc lặp và cắt bớt |
| `OMR_ROUTING` | `fallback` | `off`; `fallback`: trang sai số khuông hoặc lệch số ô thì nhận diện lại theo từng hệ; `always`: đọc cả hai cách cho mọi trang (để đo, chậm gấp đôi) |
| `OMR_ROUTING_BARS` | `1` | Dùng số ô nhịp đếm trên ảnh để phát hiện model đọc lặp và dừng sinh sớm |
| `OMR_ROUTING_MEASURES` | `0` | `1`: trang đúng số spine nhưng có ô lệch trường độ cũng được nhận diện lại theo hệ |
| `OMR_ROLES_FIRST` | `1` | Hệ có cả giọng hát lẫn piano: đọc riêng từng nhóm khuông trước rồi mới đọc cả hệ |
| `ROUTING_RETRY_BEAMS` | `3` | Hệ vẫn sai số khuông thì đọc lại bằng beam search; `0` hoặc `1` là tắt |
| `ROUTING_RESERVE_S` | `30` | Số giây giữ lại cho bước ghép và xuất; nhận diện lại không bao giờ làm job quá hạn |
| `OMR_STRIP_TEXT` | `1` | Xóa lời ca, tên hợp âm và chữ ngoài khuông trước khi đưa vào model |
| `OMR_OTTAVA` | `auto` | `auto`: bỏ dấu `*8va` / `*8ba` model tự thêm trên khuông giọng hát và khuông đơn; `drop`: bỏ ở mọi khuông; `keep`: giữ nguyên |
| `OMR_PITCH_CHECK` | `1` | Dò đầu nốt trên ảnh (OpenCV) để sửa nốt đúng tên nhưng sai quãng tám; PDF vector dùng đầu nốt đọc từ font nhạc của PDF và sửa cả tên nốt |
| `OMR_RHYTHM_FIX` | `1` | Sửa ô sai trường độ do đọc nhầm nhịp ba (`12` → `8`...), bỏ nốt thừa trong hợp âm |

### Độ tin cậy từng ô

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `OMR_TTA` | `2` | Số lần đọc lại (ảnh dịch vài pixel) cho hệ có ô nghi ngờ; `0` là tắt; từ `2` trở lên mới tự thay ô |
| `OMR_TTA_SHIFT_PX` | `3` | Độ dịch ảnh giữa các lần đọc lại (pixel, trên ảnh 1050×1485) |
| `OMR_TTA_MAX_SYSTEMS` | `4` | Số hệ tối đa được đọc lại mỗi job |
| `OMR_EXTRA_ENGINES` | (rỗng) | Engine nhận diện thêm chạy trên từng trang để so theo ô với Transcoda, ví dụ `copisteria,homr` (xem mục "Engine thêm") |
| `OMR_ENGINE_<TÊN>_COMMAND`, `OMR_ENGINE_<TÊN>_CWD` | | Lệnh chạy engine `<TÊN>` (có `{image}`, `{outdir}`; lệnh phải ghi MusicXML vào `{outdir}`) và thư mục chạy lệnh |
| `OMR_EXTRA_ENGINE_TIMEOUT_S` | `600` | Hạn mỗi lần chạy một engine thêm trên một trang |
| `OMR_LLM` | `off` | `anthropic`: gửi ảnh cắt các ô tin cậy thấp nhất cho AI xác minh (cần `ANTHROPIC_API_KEY`) |
| `OMR_LLM_MODEL` | `claude-haiku-5-5` | Model AI dùng để xác minh (nên chọn model rẻ) |
| `OMR_LLM_MAX_MEASURES`, `OMR_LLM_TIMEOUT_S` | `10`, `30` | Số ô tối đa gửi AI mỗi job; thời gian chờ mỗi lần gọi. Kết quả được cache ở `{storage}/cache/llm/` |

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/health` | `{modelLoaded, modelState, modelError?, device, queueSize, engine}`. Không cần khóa |
| POST | `/omr/jobs` | Nhận job OMR, trả **202** rồi chạy nền. Gửi lại cùng `taskId` vẫn trả 202 nhưng không chạy lần hai. Dữ liệu sai: 422. Hàng đợi đầy: 503 |
| DELETE | `/omr/jobs/{taskId}` | Hủy job đang chờ hoặc đang chạy (dừng ngay cả giữa một trang). Trả `{cancelled}` |
| POST | `/convert/kern-to-musicxml` | `{kernPath, outPath, tempoBpm?}` → MusicXML đã chuẩn hóa, kèm metadata (số ô, số khuông, giọng, nhịp, tempo) |
| POST | `/convert/musicxml-to-midi` | `{musicXmlPath, outPath, tempoBpm}` → MIDI. Trả `{notes, tracks, seconds}` |
| POST | `/convert/normalize` | `{inPath, outPath, tempoBpm?}`: chuẩn hóa MusicXML nhập từ file hoặc do MuseScore sinh từ MIDI. Trả metadata như trên |
| POST | `/convert/prepare` | `{inPath, outPath, transpose, tempoPercent, hands, title, composer, showTitle, stripHarmony}`: chuẩn bị MusicXML trước khi MuseScore xuất file |
| POST | `/analysis/diff` | `{basePath, targetPath}`: so sánh hai MusicXML theo ô nhịp. Trả `{measures: [{base, target, status, errors}], summary}` |
| POST | `/chords/generate` | `{inPath, outPath, style, creativity, density, options, seed, replaceExisting}`: ghi tới `options` (1–3) phương án, A ra `outPath`, B, C ra `<outPath>-2/-3.musicxml`. Trả `{key, steps, filled, skipped, keptExisting, seed, options: [{outPath, filled, score}]}` |

Quy tắc chung:

- Thiếu hoặc sai `X-Internal-Key` thì trả 401.
- Đường dẫn phải là đường dẫn **tương đối**, không chứa `..`, và nằm trong `scores/<scoreId>/`; file vào và file ra
  phải thuộc cùng một bản nhạc. Sai thì trả 422.
- XML hỏng, không phải `score-partwise` hoặc có khai báo `ENTITY` thì trả 422 kèm lý do.
- `/chords/generate` báo lỗi dạng `detail = {code, message}`, trong đó `code` là `NO_MELODY`, `ALREADY_HARMONIZED`,
  `NO_CHORDS`, `TOO_LONG` hoặc `PARSE_ERROR`.

Body `POST /omr/jobs`:

```json
{
  "taskId": "uuid",
  "scoreId": "uuid-của-bản-nhạc",
  "inputs": [{ "path": "scores/<scoreId>/original/01-xxx.pdf", "kind": "PDF", "page": null }],
  "options": { "preprocess": true, "binarize": true, "sourceType": "PHOTO", "stopAfter": "EXPORT", "musicXmlVersion": 1 }
}
```

Mỗi job nhận hoặc đúng một PDF, hoặc nhiều ảnh, không được trộn hai loại. Callback báo về backend gồm
`/internal/ai-tasks/{taskId}/progress`, `/files`, `/complete` và `/fail`.

## Pipeline OMR

| Bước | Tiến độ | Việc làm | File ghi ra (trong `scores/<scoreId>/`) |
|---|---|---|---|
| `SPLIT_PDF` | 5–10% | Tách PDF hoặc đọc các ảnh đầu vào | |
| `PREPROCESS` | 10–30% | Tiền xử lý từng trang, phân tích bố cục | `pages/page-NNN.png`, `layout/page-NNN.json` |
| `INFERENCE` | 30–85% | Transcoda nhận diện từng trang; trang nghi sai được nhận diện lại theo hệ | `kern/page-NNN.krn`, `routing/` |
| `MERGE` | 85–90% | Làm sạch, ghép kern, kiểm tra, chấm tin cậy từng ô | `kern/merged.krn` |
| `EXPORT` | 90–98% | kern → MusicXML → MIDI, rồi báo `complete` | `musicxml/v{n}.musicxml`, `midi/v{n}.mid` |

- `options.stopAfter` (backend lấy từ biến `OMR_STOP_AFTER`) cho phép dừng sau `PREPROCESS` (không cần model), sau
  `MERGE`, hoặc chạy đủ với `EXPORT`.
- `musicXmlVersion` do backend tính: nhận diện lại sinh ra `v2`, `v3`... và không ghi đè bản cũ.

### Tiền xử lý (`app/omr/preprocess.py`)

Các bước với mỗi trang:

1. Đọc ảnh (xoay theo EXIF); với PDF thì vẽ bằng PyMuPDF ở 300 DPI.
2. Chuyển sang ảnh xám rồi khử nhiễu theo loại nguồn: `PHOTO` dùng bilateral và cân bằng nền, `SCAN` dùng median,
   `PDF_NATIVE` bỏ qua bước này.
3. Chỉnh nghiêng: Hough dò dòng kẻ rồi tinh chỉnh bằng profile chiếu, tối đa ±15°.
4. Kiểm tra trang có khuông nhạc, cắt lề trắng, nhị phân hóa thích ứng.
5. Thu nhỏ và pad trắng về đúng **1050 × 1485** (rộng × cao).

Model nhận nguyên một trang ở kích thước này (tensor RGB `(1, 3, 1485, 1050)`, giá trị trong [-1, 1]; xem
`app/omr/model_input.py`). Trang cao hơn tỉ lệ thì được thu nhỏ rồi pad bên phải, để không bị cắt mất nội dung.

Tùy chọn trong `options`: `binarize=false` để tắt nhị phân hóa, `preprocess=false` để chỉ resize và pad.

### Bố cục và nhận diện lại theo hệ

Transcoda chỉ được train trên nhạc piano không có lời. Với bản giọng hát + piano, model hay bỏ sót một khuông, tách
hoặc gộp spine sai, hoặc đọc xong một hệ lại quay về đọc lại hệ trước. Các bước khắc phục:

1. **Bố cục** (`layout.py`, `barlines.py`, chỉ dùng OpenCV, khoảng 10 ms/trang):
   - dò khuông và gom thành hệ;
   - gán vai trò từng khuông: cặp có ngoặc nhọn là piano, khuông còn lại là giọng hát;
   - đếm vạch nhịp để biết số ô của từng hệ.
2. **Kiểm tra**: kern của mỗi trang phải có số spine bằng số khuông, và số ô gần bằng số ô đếm được trên ảnh.
3. **Nhận diện lại theo hệ** (`routing.py`, `combine.py`): mỗi hệ của trang sai được cắt ra đặt lên một trang trắng rồi
   đọc riêng, thử theo thứ tự từ rẻ đến đắt:
   - đọc riêng từng nhóm khuông (giọng hát một ảnh, piano một ảnh) rồi ghép lại theo ô nhịp;
   - đọc cả hệ;
   - đọc lại bằng beam search.

   Kết quả mới chỉ thay kết quả cả trang khi có điểm cấu trúc cao hơn, và bước này chỉ dùng thời gian còn dư của job.
4. **Bỏ khối lặp**: nếu kern vẫn thừa ô so với ảnh, bỏ các khối ô nhịp lặp liền nhau giống hệt, cho tới khi bằng số ô
   trên ảnh.
5. **Gán vai trò vào kern**: `merged.krn` có thêm `*Ivox` / `*Ipiano`. Khi xuất, mỗi khuông giọng hát thành một part
   riêng, đứng trên part "Piano" hai khuông.

### Độ tin cậy từng ô

Chạy ở bước `MERGE`. Có ba lớp; lớp sau chỉ xử lý những ô mà lớp trước còn nghi ngờ:

1. **Luật nhạc lý** (`review.py`, luôn bật): gắn cờ `DURATION`, `COUNT_MISMATCH`, `RANGE`, `LEAP`, `ACCIDENTAL`. Mỗi ô
   có `confidence` (0..1) và danh sách lý do.
2. **Đọc lại và bỏ phiếu** (`stability.py`, `OMR_TTA`): đọc lại hệ với ảnh dịch ±3 px. Ô đọc mỗi lần một khác bị gắn
   cờ `UNSTABLE`. Ô chỉ được tự thay khi các lần đọc lại giống hệt nhau và đúng luật hơn bản đầu.
3. **AI xác minh** (`llm_check.py`, `OMR_LLM`, mặc định tắt): gửi ảnh cắt một ô kèm các cách đọc, AI chọn cách đúng
   hoặc gắn cờ `AI_DOUBT`.

Kết quả nằm trong `result_data` của job:

| Khóa | Nội dung |
|---|---|
| `measureMap` | Vị trí từng ô trên ảnh trang kèm cờ, để trang review của web tô vùng cần kiểm tra |
| `measureCheck` | Số ô trên ảnh so với kern, các trang đã nhận diện lại, và phần tóm tắt `review` (gồm thống kê số lần gọi AI và token) |
| `routing` | Trang nào dùng kết quả nào |
| `staffRoles` | Vai trò các khuông, từ trên xuống |
| `warnings` | Các cảnh báo |

### Ghép kern và xuất file

- **Ghép** (`merge.py`):
  - bỏ trang rỗng và cắt các dòng lặp vô hạn;
  - trang sau kế thừa khóa nhạc, hóa biểu và số chỉ nhịp từ trang trước;
  - đánh lại số ô nhịp liên tục;
  - cảnh báo ô sai tổng trường độ (ô lấy đà và ô cuối được phép ngắn hơn);
  - cuối cùng cho music21 đọc thử `merged.krn`.
- **kern → MusicXML** (`convert/kern.py`, `convert/musicxml.py`):
  - music21 ghi MusicXML thô, sau đó bước chuẩn hóa gộp các khuông thành một part "Piano" nhiều staff;
  - đồng bộ `divisions`, đánh lại `<staff>` / `<voice>`, thêm tempo;
  - rút metadata (số ô, giọng, nhịp, tempo, số khuông) từ chính file MusicXML này.
- **MusicXML → MIDI** (`convert/midi.py`):
  - tự ghi file SMF 1 với 480 tick/phách: track i ứng với khuông thứ i+1 từ trên xuống, trên kênh i (bỏ qua kênh 9);
  - nốt nối (tie) được gộp thành một nốt;
  - không dùng `music21 write('midi')` vì cách music21 gán track thay đổi theo phiên bản.
- File MusicXML và MIDI chỉ được báo về backend sau khi cả hai đã ghi xong. Callback `complete` kèm `pageMeasures` để
  web hiển thị đúng đoạn nhạc bên cạnh ảnh của từng trang.

### Lỗi của job

| Tình huống | Kết quả |
|---|---|
| Ảnh hoặc PDF không đọc được | `PAGE_UNREADABLE: trang N` |
| Không trang nào có khuông nhạc | `NO_STAFF_DETECTED` (trang lẻ không có khuông thì chỉ bị bỏ, kèm cảnh báo) |
| Model tắt hoặc nạp lỗi | `MODEL_NOT_LOADED: nguyên nhân` |
| Mọi trang đều nhận diện ra rỗng | `RECOGNITION_EMPTY` |
| Số spine giữa các trang không căn được | `MERGE_SPINE_MISMATCH: trang N` |
| music21 không đọc được kern ghép | `KERN_PARSE_ERROR` (file kern vẫn được lưu để xem lại) |
| Không ghi được MusicXML | `EXPORT_ERROR: chi tiết` |
| Quá thời gian một trang hoặc cả job | `TASK_TIMEOUT` |
| Backend hủy | Dừng ở lần kiểm tra kế tiếp, không gọi callback |

Góc nghiêng lớn hơn 15°, số ô theo kern khác số ô theo MusicXML, hay số khuông khác 2 chỉ sinh cảnh báo, không làm job
lỗi.

## Model Transcoda

`btrkeks/transcoda-59M-zeroshot-v1` có khoảng 59 triệu tham số. **Không cần tải tay**: lần chạy đầu, `transformers` tự
tải về `~/.cache/huggingface`. Muốn dùng offline thì tải trước:

```bash
python -m pip install -U "huggingface_hub[cli]"
huggingface-cli download btrkeks/transcoda-59M-zeroshot-v1 --local-dir models/transcoda
MODEL_ID=models/transcoda uvicorn app.main:app --env-file .env --port 8000
```

`models/` đã có trong `.gitignore`. Nếu lúc nạp báo `ModuleNotFoundError` (ví dụ thiếu `timm`) thì cài đúng gói đó.

**Tốc độ**: trên CPU, mỗi trang mất từ vài chục giây đến vài phút. Gặp `TASK_TIMEOUT` thì tăng
`INFERENCE_PAGE_TIMEOUT_S` và `TASK_TIMEOUT_S`. Nếu job chạy quá 10 phút, tăng cả
`app.ai.processing-timeout-minutes` bên backend. Có GPU NVIDIA thì `DEVICE=auto` tự dùng; trên Mac Apple Silicon có
thể thử `DEVICE=mps`.

Fine-tune Transcoda cho bản giọng hát có lời (sinh dữ liệu, train trên Kaggle): [`training/README.md`](training/README.md).

## Gợi ý hợp âm

Dùng model **AutoHarmonizer** (mã MIT, [github.com/sander-wood/autoharmonizer](https://github.com/sander-wood/autoharmonizer),
bài báo arXiv:2112.11122): mạng LSTM đọc giai điệu và dự đoán hợp âm cho từng nốt móc kép, chọn trong 1450 hợp âm. Trọng số
gốc của tác giả được giữ nguyên, chỉ đổi định dạng (`scripts/autoharmonizer_convert.py`). Mạng được dựng lại bằng numpy
(`app/chords/autoharmonizer/model.py`) vì mã gốc cần TensorFlow 2.2 / Python 3.7; test `test_numpy_network_matches_original_keras_model`
so với xác suất do model Keras gốc tính (sai khác < 1e-5).

`app/chords/` chạy theo các bước:

1. Tách giai điệu (nốt cao nhất của khuông 1) thành lưới nốt móc kép, kèm độ mạnh phách (`beatStrength` của music21) và
   giọng (số dấu thăng), đúng như đầu vào lúc tác giả train.
2. Chạy model tự hồi quy: mỗi bước nhìn 32 bước giai điệu hai bên và 32 hợp âm vừa chọn, ra xác suất 1450 hợp âm.
3. **Lấy mẫu** thay vì luôn chọn hợp âm xác suất cao nhất như mã gốc, nên mỗi lần chạy ra cách đệm khác (truyền `seed` để
   tái hiện). Chạy song song 3 dãy, bỏ trùng, xếp theo log xác suất trung bình của model: phương án A hợp tai nhất.
4. Chèn `<harmony>` thẳng vào XML gốc ở mỗi chỗ đổi hợp âm, giữ nguyên mọi phần khác.

Điều khiển (đều là cách chỉnh xác suất của model, kiểu `gamma_sampling` của tác giả: tổng xác suất x của một nhóm hợp âm →
x^tan(πγ/2)):

| Tham số | Giá trị | Tác dụng |
|---|---|---|
| `creativity` | `SAFE` / `BALANCED` / `BOLD` | Nhiệt độ lấy mẫu 0,6 / 1,0 / 1,4 và top-p 0,85 / 0,92 / 0,97 |
| `density` | `SPARSE` / `NORMAL` / `DENSE` | Đổi hợp âm ở phách mạnh / đầu phách / thêm chỗ nốt móc đơn; gamma của hợp âm vừa chọn 0,3 / 0,5 / 0,6 |
| `style` (màu hợp âm) | `NATURAL` / `SIMPLE` / `COLORFUL` / `JAZZY` | Tăng / giảm nhóm hợp âm (`STYLE_GAMMAS` trong `harmonize.py`): tự nhiên (model tự chọn) / ưu tiên hợp âm ba / ưu tiên maj7, m7, sus, 6 / ưu tiên hợp âm 7 và mở rộng. Model không có khái niệm thể loại nên không có lựa chọn theo thể loại nhạc |

Mặc định, ô đã có hợp âm sẵn được giữ lại (model vẫn thấy chúng trong 32 hợp âm trước); mọi ô đều đã có thì báo
`ALREADY_HARMONIZED`. Gửi `replaceExisting: true` thì gỡ hết `<harmony>` cũ rồi gợi ý lại cả bài. Bài quá 4096 nốt móc kép
(khoảng 256 ô 4/4) báo `TOO_LONG`. Thời gian chạy khoảng 0,2–2 giây cho bài 10–20 ô trên CPU.

## Script

Chạy từ thư mục `music-ai`. Mở đầu mỗi file có ghi đủ các cách dùng.

| Script | Việc làm |
|---|---|
| `scripts/check_env.py` | Kiểm tra phiên bản Python và các gói đã cài |
| `scripts/omr_check.py` | So số khuông / số ô trên ảnh với kern đã lưu; chạy lại pipeline với nhiều cấu hình để so sánh; lưu ảnh và kern từng lần đọc (`--dump`) |
| `scripts/omr_benchmark.py` | Đo chất lượng OMR trên bộ kiểm thử cố định `benchmark/cases.json` (thư mục chỉ có trên máy cục bộ, không commit) |
| `scripts/omr_quality_report.py` | So bản OMR `v1` với bản đã sửa mới nhất của mọi bản nhạc trong storage, ghi `reports/omr-quality.csv` |
| `scripts/autoharmonizer_convert.py` | Chuyển trọng số `weights.hdf5` và `chord_types.bin` của AutoHarmonizer gốc sang `weights.npz` + `chords.json` (đã chạy sẵn) |

## Test

```bash
python -m pytest -q
```

Hơn 500 test dùng trang nhạc tổng hợp (`tests/synth.py`), backend giả (`tests/fake_java.py`) và Transcoda giả
(`tests/fake_recognizer.py`), nên **không cần Java, torch hay model** để chạy. Test cần music21 thật hoặc PDF thật tự
bỏ qua nếu thiếu gói. Chạy model thật thì phải thử tay.

### Chạy riêng music-ai, không cần backend

```bash
# cửa sổ 1: backend giả, in ra mọi callback nhận được
python tests/fake_java.py 8080 dev-internal-key

# cửa sổ 2: music-ai
uvicorn app.main:app --host 127.0.0.1 --port 8000

# cửa sổ 3: đặt một ảnh vào storage rồi giao job
mkdir -p ../music-be/storage/scores/demo/original
cp /đường/dẫn/trang.png ../music-be/storage/scores/demo/original/01-a.png
curl -i -X POST http://127.0.0.1:8000/omr/jobs -H 'X-Internal-Key: dev-internal-key' \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"11111111-1111-4111-8111-111111111111","scoreId":"demo",
       "inputs":[{"path":"scores/demo/original/01-a.png","kind":"IMAGE","page":1}],"options":{}}'
```

Kết quả nằm trong `../music-be/storage/scores/demo/`: `pages/page-001.png`, rồi `kern/` khi model đã nạp. Chỉ muốn
thử tiền xử lý thì đặt `"stopAfter": "PREPROCESS"` trong `options`, hoặc chạy với `LOAD_MODEL=false`.

## Cấu trúc

```
app/
├── main.py         FastAPI: định nghĩa endpoint
├── config.py       đọc biến môi trường
├── jobs.py         hàng đợi và vòng đời job OMR (hủy, timeout)
├── callback.py     gọi callback về backend
├── storage.py      kiểm tra và phân giải đường dẫn trong storage
├── schemas.py      model Pydantic của request
├── omr/            pipeline OMR: preprocess, layout, barlines, textstrip, transcoda, engines, routing, combine,
│                   merge, ottava, pitch_check, rhythm_fix, review, stability, llm_check, measure_map,
│                   vector_pdf, glyphs (PDF xuất từ phần mềm), arbiter, extra_engines (engine thêm)
├── convert/        kern / MusicXML / MIDI, normalize, prepare
├── analysis/       so sánh hai MusicXML
├── chords/         gợi ý hợp âm: model AutoHarmonizer (autoharmonizer/: mạng numpy, trọng số, bảng hợp âm), chèn <harmony>
└── eval/           metric cho benchmark
scripts/            công cụ đo và kiểm tra
training/           sinh dữ liệu fine-tune Transcoda
tests/
```

## Giấy phép

- Trọng số Transcoda: **CC BY 4.0** (theo model card), phải ghi nguồn khi dùng hoặc phân phối.
- Mã nguồn `github.com/btrkeks/transcoda`: AGPL-3.0. Hãy đối chiếu file `LICENSE` của repo đó trước khi đưa mã của họ
  vào dự án.
- Gợi ý hợp âm: mã và trọng số AutoHarmonizer (`github.com/sander-wood/autoharmonizer`) theo giấy phép **MIT**, giữ
  thông báo bản quyền ở `app/chords/autoharmonizer/LICENSE`.

## PDF xuất từ phần mềm chép nhạc

PDF xuất thẳng từ Sibelius, MuseScore, Finale, Dorico... vẽ ký hiệu nhạc bằng ký tự của font nhạc (Opus/OpusStd, SMuFL
như Leland/Bravura, Maestro/Anastasia...). Với loại PDF này (tự nhận theo nội dung, không cần chọn gì thêm):

- `app/omr/vector_pdf.py` xóa lời ca, tên hợp âm theo đúng khung chữ trong file và lấy tên bài, tác giả, nhịp độ;
- `app/omr/glyphs.py` đọc vị trí chính xác của đầu nốt, chấm dôi (phân biệt với chấm staccato), dấu hóa, khóa, dấu lặng,
  đặt lên ảnh trang và kiểm lại trên ảnh (không khớp thì bỏ, quay về dò ảnh). Đầu nốt PDF thay cho đầu nốt dò bằng OpenCV:
  `pitch_check` sửa cả tên nốt lẫn quãng tám theo từng ô ở mọi khuông (mã `PDF_PITCH_FIXED`), mỗi ô được so số đầu nốt,
  số chấm dôi, cao độ với PDF (cờ `PDF_MISMATCH`; ô khớp hoàn toàn thì bỏ các cờ đoán theo nhạc lý), trọng tài engine thêm
  ưu tiên cách đọc khớp PDF.

Kết quả ghi ở `vectorPdf` (`glyphPages`: trang dùng được ký hiệu PDF, `glyphs`: số ký hiệu theo loại) và
`measureCheck.pdfMeasures` (số ô được so với PDF). Kiểm nhanh một file trước khi chạy:
`python scripts/pdf_glyphs.py duong/dan/file.pdf` (in số ký hiệu từng trang và các mã font chưa có trong bảng).

## Engine thêm (so theo từng ô)

Transcoda vẫn là engine chính. Bật `OMR_EXTRA_ENGINES` thì sau khi ghép kern, mỗi engine thêm đọc lại ảnh gốc từng trang
(`scores/{id}/engine-input/page-NNN.png`) và ra MusicXML; `app/omr/arbiter.py` so từng ô với kết quả Transcoda:

- giống nhau: ô được cộng điểm tin cậy;
- Transcoda sai tổng trường độ, engine kia đúng (hoặc với PDF vector: engine kia khớp ký hiệu nhạc của PDF, Transcoda
  không khớp): thay ô (ghi vào "Đã tự sửa", mã `ENGINE_REPLACED`);
- cả hai đều đúng trường độ nhưng khác nhau: gắn cờ `ENGINE_DISAGREE` (cần kiểm tra) và đưa cách đọc kia cho AI xác minh;
- trang mà engine kia đọc ra số ô khác thì bỏ qua (không biết ô nào ứng với ô nào).

Kết quả nằm ở `measureCheck.engines` (số ô so được, giống, đã thay, khác nhau, lỗi từng engine). Mặc định tắt: đo trên
bộ benchmark trước (`--variant engines:OMR_EXTRA_ENGINES=copisteria`), vì số liệu công bố của các engine là do chính tác giả đo.

Cài thử ngoài Docker (engine cần Python riêng; music-ai chạy thẳng trên máy cũng được):

```bash
# copisteria (Apache-2.0, cần Python 3.12)
git clone https://github.com/kobimusic/copisteria /opt/copisteria && cd /opt/copisteria
python3.12 -m venv .venv && .venv/bin/pip install torch && .venv/bin/pip install -e . huggingface_hub
.venv/bin/hf download kobimusic/copisteria evidence-2m.pt --local-dir models
.venv/bin/hf download kobimusic/copisteria v7_obj-recall-30m_best.pt v7_obj-recall_best.pt --local-dir models/small
export OMR_ENGINE_COPISTERIA_COMMAND='/opt/copisteria/.venv/bin/python -m copisteria.pipeline {image} --out {outdir}'
export OMR_ENGINE_COPISTERIA_CWD=/opt/copisteria

# homr (AGPL-3.0: giữ nguyên mã gốc, gọi như chương trình riêng)
python3 -m venv /opt/homr && /opt/homr/bin/pip install homr
export OMR_ENGINE_HOMR_COMMAND='/opt/homr/bin/homr {image}'

export OMR_EXTRA_ENGINES=copisteria,homr
```

Kiểm tra lệnh trước khi bật: chạy tay lệnh với một ảnh trang và xem file MusicXML được ghi ra đâu (cờ dòng lệnh thật của
mỗi engine xem `--help` của engine đó). Audiveris (AGPL-3.0, Java) dùng được tương tự với lệnh xuất `.mxl` vào `{outdir}`.
