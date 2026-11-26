# Music: nền tảng quản lý, số hóa và luyện tập bản nhạc

Ứng dụng web cho người chơi nhạc, ca đoàn và nhóm biểu diễn: nhập bản nhạc (MusicXML, MIDI, PDF/ảnh qua OMR), xem và
phát lại ngay trên trình duyệt, luyện tập có chấm điểm, gợi ý hợp âm, cộng tác theo nhóm, chia sẻ lên cộng đồng và
mua gói dịch vụ qua VNPay.

## Kiến trúc

```
                ┌──────────────┐  REST + JWT   ┌──────────────┐  POST /omr/jobs, /convert, /chords  ┌──────────────┐
 Trình duyệt ──>│  music-web   │──────────────>│   music-be   │────────────────────────────────────>│   music-ai   │
                │ React + Vite │<──── STOMP ───│ Spring Boot  │<──── callback /internal/** ─────────│   FastAPI    │
                └──────────────┘   WebSocket   └──────┬───────┘                                     └──────┬───────┘
                                                      │                                                    │
                                                 ┌────┴────┐          storage dùng chung (file nhạc)       │
                                                 │ MySQL 8 │          <───────────────────────────────────┘
                                                 └─────────┘
```

| Thư mục | Vai trò | Công nghệ chính |
|---|---|---|
| [`music-web/`](music-web) | Giao diện người dùng và trang quản trị | React 19, TypeScript, Vite, React Router, OpenSheetMusicDisplay, pdf.js, Recharts, STOMP |
| [`music-be/`](music-be) | API, phân quyền, nghiệp vụ, thanh toán, giao việc cho AI | Java 21, Spring Boot 3.5, Spring Security (JWT, Google), JPA, Flyway, WebSocket, MapStruct |
| [`music-ai/`](music-ai) | OMR (ảnh/PDF → MusicXML), chuyển đổi định dạng, so sánh bản, gợi ý hợp âm | Python 3.11, FastAPI, PyTorch (model Transcoda), music21, OpenCV |
| [`tools/`](tools) | Script phụ: tạo dữ liệu demo, render mẫu âm piano | Python |

`music-ai` không kết nối MySQL: nó đọc và ghi file trong thư mục storage dùng chung với `music-be`, rồi báo tiến độ
qua callback có header `X-Internal-Key`.

## Chức năng chính

- **Tài khoản và phân quyền**: đăng ký bằng email + OTP, đăng nhập Google, JWT có làm mới, vai trò `USER` / `ADMIN` /
  `SUPER_ADMIN` cùng quyền chi tiết.
- **Thư viện bản nhạc**: nhập MusicXML / MXL / MIDI (MIDI tự chuyển sang MusicXML), nhập nhiều file một lúc, tạo bản
  phối kèm giấy phép, thẻ, thùng rác, playlist, xuất file.
- **OMR**: tải PDF hoặc ảnh bản nhạc, `music-ai` tiền xử lý, nhận diện bằng Transcoda, kiểm tra từng ô nhịp và trả về
  MusicXML để người dùng rà lại. Trang tiến độ hỏi lại mỗi 2 giây khi đang mở; xong hoặc lỗi thì có thông báo trong
  chuông (đẩy qua WebSocket) dẫn thẳng tới trang kết quả, nên người dùng có thể rời trang trong lúc chờ. Các ô nghi ngờ
  hiện lại trong trình chỉnh sửa (bảng "Cần kiểm tra", kèm ảnh cắt từ trang gốc).
- **Xem, phát và luyện tập**: hiển thị bản nhạc bằng OpenSheetMusicDisplay, phát lại bằng mẫu âm piano, chế độ luyện
  tập (Studio) có chấm điểm, lịch sử và thống kê luyện tập.
- **Gợi ý hợp âm** cho bản chỉ có giai điệu: nút "Gợi ý hợp âm" ở trang chi tiết bản nhạc (cần quyền chỉnh sửa
  `EDIT`, vì gợi ý hợp âm là sửa bản nhạc), chọn bè giai điệu (part, khuông), màu hợp âm (Tự nhiên, Đơn giản, Có màu, Hợp âm 7 / Jazz), độ sáng tạo và mật độ hợp âm. `music-ai` dùng model AutoHarmonizer (LSTM, trọng số gốc của tác giả) và lấy mẫu nên mỗi lần ra cách đệm khác,
  kèm tới 3 phương án A, B, C (theo gói) để chọn trong trình chỉnh sửa. Hợp âm AI hiện ngay trong trình chỉnh sửa dưới dạng bản
  nháp để sửa, nghe thử từng phương án rồi lưu (kết quả cũng được lưu thành một đề xuất sửa do hệ thống gửi, chỉ người bấm
  nhận thông báo khi xong; mở lại trình chỉnh sửa sẽ nhắc nạp lại bản nháp chưa xem). Hộp gợi ý báo trước giới hạn ô
  nhịp của gói và các ô sai trường độ ở bè giai điệu.
  Bản đã có hợp âm ở mọi ô thì hộp gợi ý hỏi có muốn thay hợp âm cũ không, kèm nút xóa hết hợp âm. Player có thể đệm
  theo các hợp âm này.
- **Cộng tác**: chia sẻ theo quyền `VIEW` (xem, luyện tập, nhận xét và chấm sao), `COMMENT` (góp ý trên ô nhịp, gửi đề xuất sửa), `EDIT` (chỉnh sửa, duyệt đề xuất, gợi ý hợp âm); bản công khai ai đăng nhập cũng có quyền `VIEW`, bản riêng tư thì xin quyền chủ bản nhạc, góp ý gắn với ô nhịp, đề xuất sửa và so sánh khác biệt,
  fork bản nhạc công khai.
- **Nhóm và Show**: tạo Team, mời thành viên qua email, quản lý Show bằng bảng Kanban, giao việc và nhắc hạn, chế độ
  biểu diễn.
- **Cộng đồng**: trang chủ, Khám phá, trang Nhạc sĩ, diễn đàn, yêu cầu công khai / bản chính thức, báo cáo vi phạm.
- **Gói dịch vụ và thanh toán**: bảng giá, giới hạn theo gói, thanh toán VNPay (sandbox), giới thiệu bạn bè.
- **Quản trị**: dashboard, thành viên, vai trò, bản nhạc chờ duyệt, diễn đàn, báo cáo, gói và doanh thu, tác vụ AI,
  thông báo hệ thống, nhật ký hoạt động.
- **Thông báo** trong ứng dụng và email, **giao diện sáng/tối**, **đa ngôn ngữ** Tiếng Việt / English.

## Chạy nhanh bằng Docker

Cần Docker và Docker Compose.

```bash
cp .env.example .env        # chỉnh giá trị nếu cần, xem mục "Biến môi trường"
docker compose up --build
```

| Dịch vụ | Địa chỉ |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:8080/api |
| Swagger UI | http://localhost:8080/swagger-ui.html |

Lần đầu chạy, Flyway tự tạo bảng và nạp dữ liệu mẫu; `music-ai` tải model Transcoda từ Hugging Face (được cache
trong volume `hf-cache`). Trong Docker, `music-ai` chạy trên CPU nên thời gian chờ OMR đã được nới ra
(`INFERENCE_PAGE_TIMEOUT_S`, `TASK_TIMEOUT_S`).

### Tài khoản mẫu

Mọi tài khoản mẫu có mật khẩu `12345678`.

| Email | Vai trò |
|---|---|
| `admin@music.com` | `SUPER_ADMIN` |
| `admin2@music.com` | `ADMIN` |
| `user@music.com` | `USER` |

## Chạy từng phần khi phát triển

### Yêu cầu

| Thành phần | Phiên bản |
|---|---|
| Java | 21 |
| Node.js | 22 |
| Python | 3.11 hoặc 3.12 |
| MySQL | 8.x |

### 1. MySQL

Bật MySQL ở `localhost:3306`. Database `music_db` được tạo tự động (`createDatabaseIfNotExist=true`).

### 2. Backend (`music-be`)

```bash
cd music-be
cp src/main/resources/application.yaml.example src/main/resources/application.yaml
# sửa spring.datasource.password và các khóa cần dùng trong application.yaml
./mvnw spring-boot:run
```

Flyway chạy migration trong `db/init` (schema) và `db/seed` (dữ liệu mẫu). Cách chạy SQL bằng tay và quy ước đặt tên
migration: [`music-be/src/main/resources/db/README.md`](music-be/src/main/resources/db/README.md).

### 3. Dịch vụ AI (`music-ai`)

```bash
cd music-ai
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Kiểm tra tại http://127.0.0.1:8000/health. `INTERNAL_KEY` ở đây phải trùng `AI_INTERNAL_KEY` của backend. Chi tiết
pipeline OMR, biến môi trường và benchmark: [`music-ai/README.md`](music-ai/README.md).

Không cần OMR thì đặt `LOAD_MODEL=false` để khỏi cài và nạp PyTorch.

### 4. Frontend (`music-web`)

```bash
cd music-web
cp .env.example .env
npm install
npm run dev
```

Mở http://localhost:5173. Backend chỉ cho phép CORS từ `http://localhost:5173` và `http://localhost:3000` (đổi bằng
`APP_CORS_ORIGINS`).

### Dữ liệu demo

Khi backend (và tùy chọn `music-ai`) đang chạy, script sau nhập vài bản hợp xướng Bach, chia sẻ, góp ý, đề xuất sửa và
gợi ý hợp âm thông qua API như người dùng thật. Chạy lại nhiều lần không tạo trùng.

```bash
pip install music21
python tools/seed_demo.py --base-url http://localhost:8080
```

## Biến môi trường

Danh sách đầy đủ kèm giải thích nằm trong [`.env.example`](.env.example). Biến để trống thì tính năng tương ứng tắt.

| Nhóm | Biến | Ghi chú |
|---|---|---|
| Cơ sở dữ liệu | `MYSQL_ROOT_PASSWORD` | |
| Bảo mật | `JWT_SIGNER_KEY`, `JWT_VALID_DURATION`, `JWT_REFRESHABLE_DURATION` | Khóa ≥ 64 ký tự: `openssl rand -hex 64` |
| Nội bộ BE ↔ AI | `AI_INTERNAL_KEY` | Hai bên phải giống nhau |
| Email | `MAIL_USERNAME`, `MAIL_PASSWORD` | Gmail cần mật khẩu ứng dụng |
| Đăng nhập Google | `GOOGLE_CLIENT_ID` (+ iOS / Android) | Để trống thì ẩn nút Google |
| Ảnh đại diện | `CLOUDINARY_*` | |
| Thanh toán | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` | Sandbox; IPN cần địa chỉ công khai (ngrok...) |
| Địa chỉ, cổng | `APP_WEB_URL`, `WEB_PORT`, `BE_PORT` | |

Không commit `.env`, `music-web/.env` và `music-be/src/main/resources/application.yaml` (đã có trong `.gitignore`).

## Kiểm tra chất lượng code

```bash
# Backend: định dạng (Spotless) và test
cd music-be && ./mvnw spotless:check test      # sửa định dạng: ./mvnw spotless:apply

# AI
cd music-ai && python -m pytest

# Web
cd music-web
npm run lint            # ESLint
npm run lint:colors     # không dùng mã màu cứng, chỉ dùng biến theme
npm run lint:i18n       # khóa dịch VI/EN đầy đủ
npm run check:contrast  # độ tương phản màu của theme
npm run test:studio     # test chấm điểm luyện tập
npm run build           # kiểm tra kiểu TypeScript và build
```

CI ở [`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy các bước trên, hiện chỉ chạy khi bấm tay
(Actions → CI → Run workflow).

## Quy trình làm việc

- Nhánh chính: `main` (bản ổn định) và `dev` (tích hợp). Làm tính năng trên nhánh `feature/<tên>` tách từ `dev`, mở
  pull request vào `dev`.
- Migration mới đặt tên `V{yyyyMMddHHmm}__<module>_<mô_tả>.sql` để không trùng version giữa các nhánh; không sửa
  migration đã chạy.
