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

Tài khoản `admin@music.com` (mật khẩu `12345678`) không nằm trong seed. Backend tự tạo nó khi khởi động.

## Chạy tự động

Nếu bạn chạy backend (`./mvnw spring-boot:run` trong thư mục `music-be`), Flyway tự chạy init và seed ở trên, nên không cần làm tay.

## Quy ước

- `init/V1__init_schema.sql` là file schema **duy nhất**. Cần đổi schema thì sửa thẳng file này, rồi xóa DB local và chạy lại (không thêm file ALTER riêng).
- `seed/V2..V8` là dữ liệu mẫu theo thứ tự phụ thuộc: vai trò → thành viên → thể loại → nhạc sĩ → bản nhạc → đánh giá/chia sẻ/playlist/kho mẫu → luyện tập/tác vụ AI/thông báo. Tất cả tài khoản có mật khẩu `12345678`.
- Sau khi xóa hoặc đổi tên file migration, chạy `./mvnw clean` (hoặc xóa `target/classes/db`): Maven không tự dọn file cũ, Flyway sẽ báo "Found more than one migration with version N".
