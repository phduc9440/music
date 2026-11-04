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
cat seed/*.sql | mysql -uroot -p music_db
```

Tài khoản `admin@music.com` (mật khẩu `12345678`) không nằm trong seed. Backend tự tạo nó khi khởi động.

## Chạy tự động

Nếu bạn chạy backend (`./mvnw spring-boot:run` trong thư mục `music-be`), Flyway tự chạy init và seed ở trên, nên không cần làm tay.
