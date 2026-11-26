# Chạy database

Cần bật MySQL trước. Mật khẩu MySQL lấy ở `spring.datasource.password` trong `application.yaml`.

Vào thư mục `db`:

```bash
cd ~/Documents/code/music/music-be/src/main/resources/db
```

## 1. Chạy init (tạo table)

```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS music_db CHARACTER SET utf8mb4"
mysql -uroot -p music_db < init/V1__init_schema.sql
```

## 2. Chạy seed (dữ liệu mẫu)

```bash
for f in $(ls -v seed/*.sql); do mysql -uroot -p music_db --default-character-set=utf8mb4 < $f; done
```

Tài khoản gốc `admin@music.com` (`SUPER_ADMIN`, mật khẩu `12345678`) nằm trong seed V3. DB không chạy seed thì backend
tự tạo nó khi khởi động.

## Chạy tự động

Nếu bạn chạy backend (`./mvnw spring-boot:run` trong thư mục `music-be`), Flyway tự chạy init và seed ở trên, nên không cần làm tay.

## Quy ước

- `init/V1__init_schema.sql` là toàn bộ schema (đủ mọi bảng và cột của entity), không tách migration riêng. Đổi schema thì sửa thẳng V1; DB đã chạy V1 cũ sẽ báo lệch checksum, khi đó tạo lại DB (`DROP DATABASE music_db; CREATE DATABASE music_db CHARACTER SET utf8mb4`) rồi chạy lại backend.
- `seed/V2..V8` là dữ liệu mẫu theo thứ tự phụ thuộc: vai trò → thành viên → thể loại → nhạc sĩ → bản nhạc → đánh giá/chia sẻ/playlist/kho mẫu → luyện tập/tác vụ AI/thông báo. Tất cả tài khoản có mật khẩu `12345678`.
- Sau khi xóa hoặc đổi tên file migration, chạy `./mvnw clean` (hoặc xóa `target/classes/db`): Maven không tự dọn file cũ, Flyway sẽ báo "Found more than one migration with version N".
- Seed SQL không ghi được file, nên khi backend khởi động, `SeedMusicXmlInitializer` ghi MusicXML (`classpath:seed/musicxml`) cho mọi bản `COMPLETED` còn `current_version = 0`. Nhờ vậy bản mẫu mở được Chỉnh sửa, Phát, Luyện tập và Gợi ý hợp âm. Bài quen thuộc có đoạn mở đầu đúng giai điệu, bài khác dùng bài tập gam. Tắt bằng `app.seed.musicxml.enabled=false`.
- Ảnh bìa của mọi bản công khai, chờ duyệt và kho mẫu nằm ở `seed/V17__seed_score_covers.sql` (ảnh Wikimedia Commons, ghi nguồn và giấy phép trong file).
- Không thêm migration theo ngày (`V2026…`) cho dữ liệu mẫu hay bảng mới: sửa thẳng V1 hoặc file seed tương ứng, rồi tạo lại DB.

## Chuẩn hóa (3NF)

Schema đạt 3NF: mọi cột không phải khóa chỉ phụ thuộc vào khóa của bảng. Các điểm đã tách hoặc ràng buộc:

| Chỗ | Cách làm |
|---|---|
| Chủ bản nhạc trong lời xin đưa vào kho mẫu | Không có cột `owner_id`: chủ là `scores.member_id` của `official_requests.score_id` |
| Tên tác giả | `scores.composer_id` trỏ tới `composers`; cột `composer` chỉ giữ tên gõ tay khi không khớp nhạc sĩ nào (CHECK `chk_scores_composer_one`) |
| Tên khác của nhạc sĩ | Bảng `composer_aliases`, mỗi dòng một tên (thay cột danh sách cách nhau bằng dấu phẩy) |
| % đúng, % đúng nhịp, điểm của phiên tập | Cột sinh tự động (`GENERATED ... STORED`) từ các cột đếm; công thức giống `StudioReportServiceImpl` |

Ngoài 3NF, dữ liệu Nhóm được tách thành bốn bảng `team_members`, `team_invitations`, `team_activities`,
`team_role_permissions` (trước là một bảng `team_members` có cột `kind`). Bảng cũ vẫn đạt 3NF; tách để mỗi bảng là một
thực thể: không còn cột bỏ trống theo loại dòng, đặt được `NOT NULL` và CHECK riêng cho từng loại (lời mời phải có mã
mời, thành viên phải có người và vai trò...), truy vấn không phải nhớ lọc `kind`, và bỏ được cột sinh `member_key`.

Các cột trông giống dữ liệu lặp nhưng **không** vi phạm 3NF (giữ có chủ đích):

- `scores.measure_count`, `staff_count`, `key_signature`, `time_signature`, `tempo_bpm`, `page_count`: trích từ file MusicXML nằm ngoài DB, trong DB không có cột nào xác định được chúng.
- `scores.current_version`, `score_files.is_current`, `practice_sessions.*_count`: giá trị gộp từ bảng khác (chuẩn hóa không xét giá trị gộp), giữ để truy vấn nhanh.
- `practice_sessions.duration_seconds`: web gửi, đã trừ thời gian tạm dừng, không tính được từ `ended_at - started_at`.
- `payment_orders.amount`: giá lúc mua; giá gói đổi theo thời gian nên gói + kỳ hạn không xác định được số tiền.
- `content_reports.target_type`: báo cáo bài trả lời ghi cả `forum_thread_id` lẫn `forum_post_id`, đối tượng bị xóa thì khóa ngoại về NULL, nên không suy ra được từ các khóa ngoại.
- `notifications.message`: thông báo của quản trị viên gửi hàng loạt là câu tự gõ, nhiều thông báo không có `params`, nên không suy ra được từ `type` + `params`.
- Ảnh chụp lúc tạo: `score_comments.measure_count_at`, `score_suggestions.base_version`, `base_shape`.
- Cột JSON (`plans.limits`, `ai_tasks.input_data`, `result_data`, `notifications.params`, `score_files.meta`, `score_comments.note_ids`, `team_activities.params`, `team_role_permissions.permissions`) được coi là một giá trị đơn: hệ thống không truy vấn vào bên trong.
