# music-be

Backend của hệ thống Music, viết bằng Spring Boot. Phần này lo REST API, đăng nhập và phân quyền, lưu file bản nhạc,
gửi việc cho [`music-ai`](../music-ai) (OMR, chuyển đổi, gợi ý hợp âm), xuất file bằng MuseScore, thanh toán VNPay,
thông báo và đồng chỉnh sửa qua WebSocket.

Tổng quan cả hệ thống và cách chạy bằng Docker: [README ở thư mục gốc](../README.md).

## Công nghệ

| Mục | Thư viện |
|---|---|
| Nền tảng | Java 21, Spring Boot 3.5, Maven (có sẵn `mvnw`) |
| Dữ liệu | MySQL 8, Spring Data JPA, Flyway |
| Bảo mật | Spring Security, OAuth2 Resource Server, JWT HS512 (Nimbus), Google ID token |
| Thời gian thực | Spring WebSocket + STOMP (broker đơn giản trong bộ nhớ) |
| Ánh xạ | MapStruct, Lombok |
| Tài liệu API | springdoc-openapi (Swagger UI) |
| Khác | Spring Mail, Cloudinary (ảnh đại diện), PDFBox, MuseScore 3.6.2 (xuất file) |

## Chạy

Cần Java 21 và MySQL 8 ở `localhost:3306`.

```bash
cp src/main/resources/application.yaml.example src/main/resources/application.yaml
# sửa spring.datasource.password và các khóa cần dùng
./mvnw spring-boot:run
```

- API: http://localhost:8080/api
- Swagger UI: http://localhost:8080/swagger-ui.html, OpenAPI JSON ở `/v3/api-docs`

Database `music_db` được tạo tự động. Flyway chạy migration khi khởi động, và lúc đó backend cũng tự tạo tài khoản
`admin@music.com` (`SUPER_ADMIN`, mật khẩu `12345678`).

Các tính năng phụ thuộc dịch vụ ngoài sẽ tắt hoặc báo lỗi rõ ràng khi chưa cấu hình. Không có những dịch vụ này thì
phần còn lại vẫn chạy:

| Thiếu | Ảnh hưởng |
|---|---|
| `music-ai` | Không có OMR, gợi ý hợp âm, so sánh phiên bản; nhập MusicXML vẫn chạy |
| MuseScore (`MUSESCORE_PATH`) | Không xuất được MP3 / WAV / PDF / SVG / MIDI và không đổi được MIDI |
| VNPay | Không mua được gói |
| Google Client ID | Không đăng nhập được bằng Google |
| Cloudinary | Không tải được ảnh đại diện |

## Cấu hình

`application.yaml` bị gitignore vì chứa bí mật; file mẫu là `application.yaml.example`. Phần lớn giá trị đọc được từ
biến môi trường, nên khi chạy bằng Docker chỉ cần đặt biến (xem [`.env.example`](../.env.example)).

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD` | theo `application.yaml` | Kết nối MySQL |
| `JWT_SIGNER_KEY` | | Khóa ký JWT, tối thiểu 64 ký tự (`openssl rand -hex 64`) |
| `JWT_VALID_DURATION`, `JWT_REFRESHABLE_DURATION` | `7`, `24` | Thời hạn access token và thời hạn còn được làm mới (giờ) |
| `AI_BASE_URL` | `http://localhost:8000` | Địa chỉ `music-ai` |
| `AI_INTERNAL_KEY` | `dev-internal-key` | Khóa dùng chung với `INTERNAL_KEY` của `music-ai`. **Đổi khi triển khai** |
| `OMR_STOP_AFTER` | `EXPORT` | Dừng pipeline OMR sau bước nào (để thử từng bước) |
| `MUSESCORE_PATH` | trống | Đường dẫn chương trình MuseScore 3.6.2 |
| `MUSESCORE_TIMEOUT`, `MUSESCORE_MAX_CONCURRENT` | `120`, `2` | Thời gian tối đa mỗi lần chạy (giây) và số tiến trình chạy cùng lúc |
| `APP_STORAGE_LOCAL_ROOT` | `./storage` | Thư mục lưu file, phải trùng `STORAGE_ROOT` của `music-ai` |
| `MAX_FILE_SIZE`, `MAX_REQUEST_SIZE` | `50MB`, `200MB` | Giới hạn upload |
| `MAIL_USERNAME`, `MAIL_PASSWORD` | | SMTP Gmail (mật khẩu ứng dụng) |
| `GOOGLE_CLIENT_ID` (+ `_IOS_`, `_ANDROID_`) | | Kiểm tra Google ID token |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | | Lưu ảnh đại diện |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` | | VNPay sandbox |
| `APP_WEB_URL` | `http://localhost:5173` | Địa chỉ web, dùng dựng link trong email và luôn được phép CORS |
| `APP_CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Các origin khác được gọi API và mở WebSocket |

Một số thuộc tính chỉ đặt trong `application.yaml`, đều có giá trị mặc định trong code, ví dụ `app.auth.cookie-secure`,
`app.auth.cookie-same-site`, `app.omr.max-pdf-pages`, `app.omr.max-images`, `score.trash.retention-days`,
`export.max-audio-seconds`, `app.live.require-collab-plan`.

## Cấu trúc

```
src/main/java/com/ptit/music_be/
├── controller/      REST controller chia theo module (auth, score, ai, library, practice, team, forum, home,
│                    billing, notification, report, referral, export, live, admin)
├── service/         nghiệp vụ, cùng cách chia module; permission/ là kiểm tra quyền trên bản nhạc
├── repository/      Spring Data JPA
├── entity/          entity JPA
├── dto/             request / response / enums; ApiResponse là khung phản hồi chung
├── mapper/          MapStruct
├── configuration/   Security, JWT trong cookie, CORS, rate limit đăng nhập, filter /internal/**, cấu hình upload, MuseScore
├── websocket/       cấu hình STOMP, xác thực lúc bắt tay, quyền theo destination
├── client/          AiServiceClient gọi music-ai
├── worker/          job nền: gửi việc AI, watchdog, xuất file, dọn thùng rác / file xuất / phiên luyện tập
├── event/           sự kiện nội bộ (tạo tác vụ OMR, export, gợi ý hợp âm, nhập bản nhạc...)
├── exception/       AppException, GlobalExceptionHandler, mã lỗi chia theo nhóm trong code/
├── converter/       JPA AttributeConverter cho enum
├── monitoring/      lưu lỗi gần đây cho trang Hệ thống của admin
└── utils/           đọc MusicXML, dựng timeline, băm ô nhịp, SecurityUtils...

src/main/resources/
├── application.yaml.example
└── db/
    ├── init/        schema (V1) và các migration thay đổi schema
    └── seed/        dữ liệu mẫu (vai trò, thành viên, bản nhạc, team, diễn đàn, gói...)
```

## Quy ước API

### Phản hồi

Mọi endpoint trả về cùng một khung:

```json
{ "code": 200, "message": "...", "result": { } }
```

Khi lỗi, `code` là mã lỗi nghiệp vụ (ví dụ `1001`) và HTTP status đi theo mã đó. Mã lỗi khai báo trong
`exception/code/*ErrorCode.java`, mỗi nhóm một enum (tài khoản, bản nhạc, AI, thư viện, cộng tác, thanh toán, team,
cộng đồng). Có lỗi mới thì thêm vào đúng nhóm rồi ném `new AppException(XxxErrorCode.TEN_LOI)`.

### Nhóm đường dẫn

| Đường dẫn | Quyền |
|---|---|
| `/api/auth/**` | Công khai: đăng ký, OTP, đăng nhập, Google, làm mới token, đăng xuất |
| `/api/public/**` | Công khai, chỉ đọc: trang chủ khách, Khám phá, nhạc sĩ, diễn đàn, bản chia sẻ `/s/:id` |
| `/api/payments/*/ipn` | Công khai cho VNPay gọi về (kiểm tra chữ ký) |
| `/api/admin/**` | `ADMIN` / `SUPER_ADMIN`, kèm quyền chi tiết theo vai trò |
| `/api/**` còn lại | Người dùng đã đăng nhập |
| `/internal/ai-tasks/**` | Chỉ `music-ai`: header `X-Internal-Key` và địa chỉ nguồn trong mạng nội bộ, không dùng JWT |
| `/ws` | WebSocket STOMP, xác thực bằng cookie lúc bắt tay |

Danh sách đầy đủ xem trong Swagger UI.

### Đăng nhập

- Access token và refresh token được đặt vào **cookie HttpOnly**. `CookieBearerTokenResolver` đọc token từ cookie, nên
  frontend không phải tự gửi header `Authorization`.
- Chạy qua HTTPS thì bật `app.auth.cookie-secure=true` và chỉnh `cookie-same-site` cho phù hợp.
- Các endpoint đăng nhập và OTP có giới hạn số lần gọi (`AuthRateLimitFilter`, `OtpRequestLimiter`).
- `MemberStatusGuard` từ chối token của tài khoản bị khóa và token cấp trước lần đổi mật khẩu gần nhất. Vai trò của
  request lấy theo dữ liệu hiện tại (cache ngắn), không theo vai trò ghi trong token, nên cấp hay thu hồi vai trò có
  hiệu lực mà không cần đăng nhập lại.

### WebSocket

Endpoint `/ws`. Client gửi lên prefix `/app`, nhận từ `/topic` và `/queue`, tin riêng từng người qua `/user/queue/...`
(ví dụ thông báo ở `/user/queue/notifications`). Quyền theo từng destination nằm trong `websocket/*StompRule.java`.

## Làm việc với music-ai

1. Người dùng tải PDF / ảnh lên, backend lưu file vào storage và tạo `AiTask`.
2. `AiTaskDispatcher` gửi `POST /omr/jobs` sang `music-ai`. Hàng đợi đầy hoặc dịch vụ chưa sẵn sàng thì gửi lại sau.
3. `music-ai` đọc file từ storage dùng chung, xử lý, ghi kết quả vào storage rồi gọi
   `/internal/ai-tasks/{taskId}/progress`, `/files`, `/complete` hoặc `/fail` để báo tiến độ và kết quả.
4. Backend cập nhật tác vụ và báo cho người dùng qua WebSocket.
5. `AiTaskWatchdog` đánh dấu lỗi những tác vụ treo quá lâu (`app.ai.queued-timeout-minutes`,
   `app.ai.processing-timeout-minutes`).

Gợi ý hợp âm và xuất file chạy theo cùng mô hình: tạo tác vụ, worker xử lý, watchdog dọn tác vụ treo.

## Database

- Flyway đọc `classpath:db/init` và `classpath:db/seed`, có bật `out-of-order` vì migration từ nhiều nhánh có thể vào
  lệch thứ tự.
- Migration mới đặt tên `V{yyyyMMddHHmm}__<module>_<mô_tả>.sql` trong `db/init/`. Không sửa migration đã chạy.
- Hibernate để `ddl-auto: none`: schema chỉ đổi qua migration.
- Xóa hoặc đổi tên file migration xong thì chạy `./mvnw clean`. Nếu không, Flyway báo
  "Found more than one migration with version N".
- Chạy SQL bằng tay và danh sách tài khoản mẫu: [`src/main/resources/db/README.md`](src/main/resources/db/README.md).

## Kiểm tra code

```bash
./mvnw spotless:apply           # định dạng code
./mvnw spotless:check test      # như CI
```

- Spotless dùng Palantir Java Format, thụt lề bằng tab, thứ tự import `java, jakarta, org, com`, xóa import thừa.
  `spotless:check` chạy ở phase `verify`, nên `./mvnw verify` cũng báo lỗi nếu code chưa định dạng.
- Phần lớn test là `@SpringBootTest` nên cần MySQL đang chạy với cấu hình trong `application.yaml` (CI dựng sẵn
  MySQL 8.4). Test xuất file dùng `src/test/resources/fake-mscore.sh` thay cho MuseScore thật.

## Docker

`Dockerfile` build jar bằng `eclipse-temurin:21-jdk` (dùng `application.yaml.example`, giá trị thật lấy từ biến môi
trường), rồi chạy trên `eclipse-temurin:21-jre` có cài sẵn MuseScore 3.6.2:

- MuseScore chỉ có bản x86_64. Trên máy không chạy được x86_64 (ví dụ Mac chip Apple chưa bật mô phỏng), build vẫn
  thành công nhưng tính năng xuất file bị tắt.
- Storage trong container nằm ở `/data/storage` (`APP_STORAGE_LOCAL_ROOT`), dùng chung volume với `music-ai`.
