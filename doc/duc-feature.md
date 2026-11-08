# Danh sách chức năng (music)

Dùng file này để hỏi nhanh: "làm mục 3.6", "kiểm tra 4.4"...

**Trạng thái:** ✅ xong · 🟡 có một phần / chưa kiểm tra · ⬜ chưa làm
**Ưu tiên:** BB = Bắt buộc · NC = Nâng cao

> Cột trạng thái dựa trên những gì đã đọc trong code (entity, controller, enum). Mục 🟡 cần kiểm tra lại trước khi coi là xong.

## Phân hệ xác thực / phân quyền

| STT | Chức năng | Mô tả | Ưu tiên | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 3.3 | Phân quyền RBAC | ROLE_USER / ROLE_ADMIN | BB | ✅ | `SecurityConfig` chặn `/api/admin/**`, bảng `roles` + `member_roles`, role nằm trong claim `scope` của JWT |

## Personal Score Library

| STT | Chức năng | Mô tả | Ưu tiên | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 3.4 | Upload sheet nhạc | Hỗ trợ PDF, MusicXML, MIDI | BB | ✅ | PDF/ảnh qua OMR (`POST /api/omr/upload`). MusicXML (.musicxml/.xml/.mxl) và MIDI (.mid/.midi) qua `POST /api/scores/import`, trang FE `/scores/import`. MIDI mới lưu bản gốc (`ORIGINAL_MIDI`), chưa chuyển sang MusicXML để hiển thị sheet |
| 3.5 | CRUD thông tin bài | Tên, tác giả, độ khó (Easy/Medium/Hard/Expert), ghi chú | BB | ✅ | Có xem/sửa/xóa. Enum `DifficultyLevel` đã có EASY/MEDIUM/HARD/EXPERT (BE + FE) |
| 3.6 | Gắn nhãn thể loại (Tags) | Cổ điển, Pop, Ballad, Jazz, Nhạc Việt... | BB | ✅ | `GET /api/tags` (9 thể loại seed ở V5), `PUT /api/scores/{id}/tags` (tối đa 10). Tag hiện trên thẻ, trang chi tiết và chọn trong form Sửa. Quản lý danh sách tag là 4.6; lọc theo tag là 3.7 |
| 3.7 | Tìm kiếm, lọc, sắp xếp | Theo tên / tác giả / tag / độ khó / ngày tạo | BB | ✅ | Lọc theo keyword (tên/tác giả), status, source, độ khó (`difficulty`), thể loại (`tagId`); sắp xếp newest (cập nhật), created (ngày tạo mới nhất), oldest, title |
| 3.8 | Quyền riêng tư | Private (chủ sở hữu) / Public (cộng đồng) | BB | 🟡 | Có field `visibility` (PRIVATE/PUBLIC). Chưa có luồng duyệt Public (xem 4.4) |

## Playlists / Collections

| STT | Chức năng | Mô tả | Ưu tiên | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 3.9 | Tạo / Sửa / Xóa Playlist | Playlist luyện tập theo mục tiêu | BB | ⬜ | Có entity `Playlist`, chưa có API |
| 3.10 | Quản lý bài trong Playlist | Thêm/xóa bài, kéo thả đổi thứ tự | NC | ⬜ | Có entity `PlaylistItem`, chưa có API |

## Analytics Dashboard

| STT | Chức năng | Mô tả | Ưu tiên | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 3.11 | Lưu lịch sử phiên tập | Thời gian, bài tập, % đúng, log lỗi chi tiết (JSONB) | BB | ⬜ | Có entity `PracticeSession`, chưa có API. Cần cột log lỗi JSON |
| 3.12 | Practice Streak & Heatmap | Chuỗi ngày luyện tập kiểu GitHub | NC | ⬜ | Phụ thuộc 3.11 |
| 3.13 | Biểu đồ thời gian luyện tập | Thống kê Ngày / Tuần / Tháng (Chart.js/Recharts) | BB | ⬜ | Phụ thuộc 3.11; frontend chưa có thư viện chart |
| 3.14 | Biểu đồ Radar kỹ năng | Pitch Accuracy / Timing / Tốc độ ngón / Chăm chỉ | NC | ⬜ | Phụ thuộc 3.11 |

## Phân hệ 4: Admin Portal

| STT | Chức năng | Mô tả | Ưu tiên | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 4.1 | Xem danh sách người dùng | Toàn bộ tài khoản trong hệ thống | BB | ✅ | `GET /api/admin/members` (phân trang, tìm keyword) + trang `/admin` |
| 4.2 | Kích hoạt / Khóa tài khoản | Quản lý tài khoản vi phạm | BB | ✅ | `PATCH /api/admin/members/{id}` field `status`. Token cũ vẫn dùng được đến khi hết hạn |
| 4.3 | Cấp / Thay đổi vai trò | USER ↔ ADMIN | BB | ✅ | `PATCH` field `roles`. Admin không tự hạ quyền/khóa chính mình |
| 4.4 | Kiểm duyệt sheet Public | Duyệt bản nhạc user yêu cầu chia sẻ cộng đồng | BB | ⬜ | Cần trạng thái duyệt (PENDING/APPROVED/REJECTED) cho score |
| 4.5 | Quản lý kho sheet mẫu | Curated Scores cho người mới học | BB | ⬜ | Cần cờ "official/curated" + API admin |
| 4.6 | Quản lý Tags Master Data | Thêm / Sửa / Xóa thể loại tag | NC | ⬜ | Phụ thuộc 3.6 |
| 4.7 | Giám sát AI Task Queue | OMR / Chord AI / Audio Synthesis (PENDING/PROCESSING/DONE/FAILED) | NC | 🟡 | Có entity `AiTask`, API xem task của user. Chưa có view cho admin |
| 4.8 | Error Logs & Server Metrics | Nhật ký lỗi và thông số tải máy chủ | NC | ⬜ | Có thể dùng Spring Actuator |

## Thứ tự làm gợi ý

1. Hoàn thiện Library: 3.5 (thêm EXPERT) → 3.6 Tags → 3.7 lọc/sắp xếp → 3.4 MusicXML/MIDI.
2. Playlist: 3.9 (rồi 3.10).
3. Quyền Public: 3.8 + 4.4 kiểm duyệt, rồi 4.5 sheet mẫu.
4. Analytics: 3.11 → 3.13 (bắt buộc) → 3.12, 3.14 (nâng cao).
5. Nâng cao của Admin: 4.6, 4.7, 4.8.

## Cấu trúc code (để biết chỗ sửa)

- Backend: `music-be/src/main/java/com/ptit/music_be/` gồm `controller/`, `service/(impl)/`, `repository/`, `entity/`, `dto/`, `configuration/`.
- Frontend: `music-web/src/` gồm `pages/`, `components/`, `services/` (gọi API), `types/`, `routes/`.
- Seed DB: `music-be/src/main/resources/db/seed/`.
