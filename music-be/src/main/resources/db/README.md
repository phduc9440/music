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

- `init/V1__init_schema.sql` là schema khởi tạo cho DB mới. Thay đổi schema sau đó cần migration riêng trong `init/`; đặt version theo `V{yyyyMMddHHmm}__<module>_<mô_tả>.sql` để hạn chế trùng version giữa các nhánh. Không sửa V1 nếu DB đã áp dụng migration này.
- `seed/V2..V8` là dữ liệu mẫu theo thứ tự phụ thuộc: vai trò → thành viên → thể loại → nhạc sĩ → bản nhạc → đánh giá/chia sẻ/playlist/kho mẫu → luyện tập/tác vụ AI/thông báo. Tất cả tài khoản có mật khẩu `12345678`.
- Sau khi xóa hoặc đổi tên file migration, chạy `./mvnw clean` (hoặc xóa `target/classes/db`): Maven không tự dọn file cũ, Flyway sẽ báo "Found more than one migration with version N".
- Seed SQL không ghi được file, nên khi backend khởi động, `SeedMusicXmlInitializer` ghi MusicXML (`classpath:seed/musicxml`) cho mọi bản `COMPLETED` còn `current_version = 0`. Nhờ vậy bản mẫu mở được Chỉnh sửa, Phát, Luyện tập và Gợi ý hợp âm. Bài quen thuộc có đoạn mở đầu đúng giai điệu, bài khác dùng bài tập gam. Tắt bằng `app.seed.musicxml.enabled=false`.
- Ảnh bìa của mọi bản công khai, chờ duyệt và kho mẫu nằm ở `seed/V202611231200__seed_score_covers.sql` (ảnh Wikimedia Commons, ghi nguồn và giấy phép trong file).
