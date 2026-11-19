# music-web

Giao diện web của hệ thống Music: trang cho khách, khu làm việc của người dùng và trang quản trị. Ứng dụng một trang
(SPA) viết bằng React + TypeScript, build bằng Vite, gọi API của [`music-be`](../music-be).

Tổng quan cả hệ thống và cách chạy bằng Docker: [README ở thư mục gốc](../README.md).

## Công nghệ

| Mục | Thư viện |
|---|---|
| Khung | React 19, TypeScript 6, Vite 8 |
| Điều hướng | React Router 7 (`createBrowserRouter`, chuyển trang bằng View Transitions) |
| Gọi API | Axios (cookie HttpOnly, tự làm mới token khi gặp 401) |
| Thời gian thực | STOMP qua WebSocket (`@stomp/stompjs`): thông báo, đồng chỉnh sửa |
| Bản nhạc | OpenSheetMusicDisplay (hiển thị MusicXML), pdf.js (xem PDF gốc) |
| Biểu đồ | Recharts |
| Khác | `@react-oauth/google` (đăng nhập Google), `react-toastify` |

Đa ngôn ngữ và theme sáng/tối tự viết, không dùng thư viện ngoài.

## Chạy

Cần Node.js 22 và `music-be` đang chạy ở `http://localhost:8080`.

```bash
cp .env.example .env
npm install
npm run dev
```

Mở http://localhost:5173. Phải giữ cổng 5173 vì backend chỉ cho phép CORS từ `http://localhost:5173` và
`http://localhost:3000`.

### Biến môi trường

Vite chỉ đọc biến bắt đầu bằng `VITE_`, và giá trị được gắn cứng vào bản build (đổi biến thì phải build lại).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api` | Địa chỉ API mà trình duyệt gọi. Địa chỉ WebSocket suy ra từ đây (`http` → `ws`, bỏ `/api`, thêm `/ws`) |
| `VITE_GOOGLE_CLIENT_ID` | trống | Client ID loại Web, phải trùng `GOOGLE_CLIENT_ID` của backend. Để trống thì ẩn nút đăng nhập Google |

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy server phát triển có HMR |
| `npm run build` | Kiểm tra kiểu (`tsc -b`) rồi build ra `dist/` |
| `npm run preview` | Xem thử bản build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier cho `src/` |
| `npm run lint:colors` | Báo mã màu viết cứng ngoài `src/styles/tokens.css` |
| `npm run lint:i18n` | Kiểm tra khóa dịch VI/EN và chuỗi tiếng Việt viết cứng trong code |
| `npm run check:contrast` | Kiểm tra độ tương phản chữ/nền ở cả hai theme |
| `npm run test:studio` | Test bộ chấm điểm luyện tập (`FreeRunScorer`) |

CI chạy `test:studio`, `tsc -b`, `eslint src`, `lint:colors`, `lint:i18n`, `check:contrast` và `build`. Nên chạy đủ
trước khi mở pull request.

## Cấu trúc thư mục

```
src/
├── main.tsx, App.tsx      điểm vào, gắn ThemeProvider, I18nProvider, router
├── routes/                khai báo route, GuestRoute / ProtectedRoute, layout gốc, tiêu đề tab và favicon theo trang
├── pages/                 mỗi trang một file, chia theo khu
│   ├── home/              trang giới thiệu (khách) và trang làm việc (đã đăng nhập)
│   ├── scores/            thư viện, nhập file / OMR, xem, chỉnh sửa, phát, luyện tập, playlist, đề xuất sửa
│   ├── teams/             Team, lời mời, bảng Show (Kanban), việc của tôi
│   ├── forum/, composers/, billing/, notifications/
│   └── admin/             các trang quản trị
├── components/
│   ├── layout/            khung trang người dùng, thanh điều hướng, thanh tab trên điện thoại, bảng lệnh
│   ├── editor/            trình chỉnh sửa bản nhạc: core (lệnh, lịch sử, cầu nối OSMD), notes, notation,
│   │                      structure, audio, live (đồng chỉnh sửa), version (lịch sử phiên bản, so sánh)
│   ├── player/            Player: engine (lấy mẫu âm, metronome, timeline, chấm điểm), controls, chế độ biểu diễn
│   ├── scores/, admin/, forum/, billing/, export/, composers/, home/
│   └── ui/                component dùng chung: Icon, hộp thoại, menu ngữ cảnh, Skeleton...
├── services/              hàm gọi API theo module, xuất lại qua services/index.ts; client.ts là Axios dùng chung
├── types/                 kiểu dữ liệu trả về từ API
├── hooks/                 hook dùng chung (WebSocket thông báo, hiệu ứng hiện dần)
├── i18n/, locales/        lõi đa ngôn ngữ và chuỗi dịch vi/en
├── theme/                 chọn và áp dụng theme sáng/tối/theo hệ thống
└── styles/                tokens.css (mọi mã màu), hiệu ứng chuyển động
public/samples/piano/      mẫu âm piano render sẵn cho Player
scripts/                   các script kiểm tra lint:colors, lint:i18n, check:contrast
tests/studio/              test của bộ chấm điểm
```

## Quy ước

### Gọi API và đăng nhập

- Luôn gọi qua `apiClient` trong `src/services/client.ts` (hoặc hàm trong `src/services/`), không tạo Axios mới.
- Access token và refresh token nằm trong cookie HttpOnly do backend đặt, frontend không tự lưu token. Khi gặp 401,
  client gọi `/auth/refresh` một lần (dùng chung cho các request đồng thời) rồi gửi lại; làm mới thất bại thì về
  `/auth/login`.
- Mọi request có header `Accept-Language` theo ngôn ngữ đang chọn, để backend trả thông báo và email đúng ngôn ngữ.
- `ProtectedRoute` chỉ chặn ở giao diện (đọc vai trò trong `localStorage`); quyền thật do backend kiểm tra.

### Route

- `/` là trang làm việc khi đã đăng nhập, trang giới thiệu khi chưa (`UserArea`).
- Trang công khai cho khách: `/explore`, `/composers`, `/forum`, `/pricing`, `/s/:scoreId` (liên kết chia sẻ).
- Trang toàn màn hình nằm ngoài khung chung: `/scores/:id/edit`, `/scores/:id/play`,
  `/teams/:teamId/shows/:showId/perform`.
- Trang quản trị nằm dưới `/admin`, dùng `AdminLayout`.
- Thêm trang mới thì khai báo trong `src/routes/AppRoutes.tsx`, thêm tiêu đề tab và biểu tượng
  favicon trong `src/routes/pageMetaRoutes.ts` (chuỗi tiêu đề ở `src/locales/*/meta.json`, mục `titles`).

### Đa ngôn ngữ

- Chuỗi nằm ở `src/locales/{vi,en}/<ns>.json`, gọi bằng `t('<ns>.đường.dẫn', { tham_số })` từ `useI18n()`.
- Số nhiều: truyền `{ count }`, thêm khóa `<khóa>_one` / `<khóa>_other`.
- Tiếng Việt là ngôn ngữ mặc định và là bản dự phòng khi thiếu chuỗi tiếng Anh.
- Không viết chuỗi tiếng Việt cứng trong `.ts` / `.tsx`. Dòng cố ý giữ chữ tiếng Việt thì thêm comment `i18n-ignore`.
- `lint:i18n` dùng mốc trong `scripts/i18n-baseline.json`: file cũ không được tăng số dòng vi phạm. Dọn bớt thì chạy
  `npm run lint:i18n -- --update` để hạ mốc.

### Theme và màu

- Theme đặt bằng thuộc tính `data-theme="light|dark"` trên `<html>`. Script trong `index.html` đặt sẵn trước khi
  React chạy để trang không bị nháy sáng; sửa `src/theme/theme.ts` thì sửa cả script đó.
- Mọi mã màu nằm trong `src/styles/tokens.css`, nơi khác chỉ dùng `var(--ui-...)`. Theme tối chỉ ghi đè các giá trị
  khác đi trong khối `:root[data-theme='dark']`.
- Mỗi cặp chữ/nền cần độ tương phản ≥ 4,5:1 (biểu tượng, viền ≥ 3:1) ở cả hai theme.
- `lint:colors` cũng dùng mốc (`scripts/colors-baseline.json`), hạ mốc bằng `npm run lint:colors -- --update`.

### Định dạng code

Prettier: nháy đơn, có dấu chấm phẩy, dòng tối đa 120 ký tự, thụt 2 khoảng trắng (`.prettierrc`).

## Mẫu âm piano

Player tải file `mp3` trong `public/samples/piano/v1/` rồi đổi cao độ bằng `playbackRate`, không đọc SoundFont lúc
chạy. Cách sinh lại mẫu âm: [`public/samples/piano/README.md`](public/samples/piano/README.md).

## Build bằng Docker

`Dockerfile` build bằng `node:22-alpine` rồi phục vụ `dist/` bằng `nginx:1.27-alpine`. Hai biến `VITE_*` truyền vào
lúc build bằng build arg:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=http://localhost:8080/api \
  --build-arg VITE_GOOGLE_CLIENT_ID=<client-id> \
  -t music-web .
```

`nginx.conf` trả `index.html` cho mọi đường dẫn lạ để React Router xử lý, và chuyển tiếp `/api/` cùng `/ws` sang
`music-be:8080` (giới hạn upload 200 MB, khớp với backend). Khi chạy bằng `docker compose` ở thư mục gốc, các biến này
được truyền sẵn.
