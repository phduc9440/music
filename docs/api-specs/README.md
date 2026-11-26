# API Specs — music-be

Đặc tả REST API của `music-be` theo chuẩn **OpenAPI 3.0.3**, mỗi file một nhóm chức năng. Mở bằng Swagger Editor
(https://editor.swagger.io), plugin OpenAPI của VS Code / IntelliJ, hoặc import vào Postman.

| File | Nhóm | Số API |
|------|------|-------:|
| [auth-account.yaml](auth-account.yaml) | Đăng ký, đăng nhập, quên / đổi mật khẩu, hồ sơ, thông báo, mời bạn, trang làm việc | 29 |
| [score-library.yaml](score-library.yaml) | Bản nhạc của tôi, Khám phá, kho nhạc mẫu, tạo / nhập, nội dung MusicXML / MIDI, phiên bản, thùng rác, xuất file | 41 |
| [score-collaboration.yaml](score-collaboration.yaml) | Chia sẻ và xin quyền, góp ý theo ô nhịp, đánh giá sao, đề xuất sửa, báo cáo vi phạm | 29 |
| [ai-processing.yaml](ai-processing.yaml) | Nhận dạng OMR, tác vụ AI, gợi ý hợp âm, callback nội bộ từ music-ai | 11 |
| [practice.yaml](practice.yaml) | Practice Studio, lịch sử và thống kê luyện tập, playlist | 27 |
| [team.yaml](team.yaml) | Team, thành viên, lời mời, show, hạng mục, Kanban | 38 |
| [forum.yaml](forum.yaml) | Diễn đàn (thành viên và khách) | 16 |
| [billing.yaml](billing.yaml) | Bảng giá, gói hiện tại, đơn mua và thanh toán VNPay | 8 |
| [public.yaml](public.yaml) | API cho khách chưa đăng nhập: trang chủ, Khám phá, nhạc sĩ | 8 |
| [admin.yaml](admin.yaml) | Trang quản trị `/api/admin/**` | 71 |
| | **Tổng** | **278** |

## Quy ước chung

- **Server:** `http://localhost:8080` (đường dẫn đã gồm tiền tố `/api`, riêng callback nội bộ là `/internal/**`).
- **Phản hồi:** JSON bọc trong `ApiResponse { code, message, result }`; thành công `code = 200`. Riêng các API trả
  file (MusicXML, MIDI, kern, ZIP, ảnh) và Practice Studio trả thẳng nội dung.
- **Lỗi:** body `{ code, message }` với mã nghiệp vụ (ví dụ `1001` chưa đăng nhập, `1002` không có quyền, `2001`
  không có bản nhạc); mã riêng của từng API ghi trong `description`.
- **Xác thực:**
  - `bearerAuth`: header `Authorization: Bearer <access token>`;
  - `cookieAuth`: cookie HttpOnly `access_token` (web app dùng cách này);
  - `internalKey`: header `X-Internal-Key`, chỉ music-ai gọi `/internal/**` từ mạng nội bộ;
  - API có `security: []` không cần đăng nhập (`/api/auth/**`, `GET /api/public/**`, IPN của cổng thanh toán).

## Cập nhật

Các file được sinh từ chính controller của music-be (springdoc, `GET http://localhost:8080/v3/api-docs`), chia theo
tag, chuyển sang OpenAPI 3.0.3 và dịch mô tả sang tiếng Việt. Khi thêm hoặc sửa endpoint, cập nhật `@Operation` /
`@Tag` trong controller rồi sửa file YAML tương ứng cho khớp.
