# Mẫu âm piano cho Player

Thư mục này chứa mẫu âm piano render sẵn từ SoundFont **MuseScore_General.sf3** (Grand Piano) cho trang phát nhạc và
thanh Player. Web không đọc `.sf3` lúc chạy; nó tải các file `mp3` ở đây rồi đổi cao độ bằng `playbackRate`.

```
v1/
  manifest.json        30 nốt (A0..C8, mỗi 3 nửa cung), 2 lớp lực, bộ "nhẹ"
  v60/A0.mp3 ...       lớp lực nhẹ (velocity 60)
  v110/A0.mp3 ...      lớp lực mạnh (velocity 110)
```

Tên file dùng chữ `s` thay dấu thăng: `Ds1.mp3` là Rê thăng, octave 1.

## Sinh lại

```bash
brew install fluid-synth ffmpeg
# đặt MuseScore_General.sf3 vào tools/soundfonts/ (thư mục này không được commit)
python3 tools/render_piano_samples.py
```

Đổi mẫu âm thì tăng số phiên bản thư mục (`v1` -> `v2`) và `DEFAULT_OUT` trong script, để trình duyệt không dùng bản cache cũ.

## Cache

Vì đường dẫn có số phiên bản, khi triển khai nên trả header `Cache-Control: public, max-age=31536000, immutable` cho
`/samples/piano/`. Vite dev không cần cấu hình.

## Nguồn và giấy phép

MuseScore_General do S. Christian Collins phát hành theo giấy phép MIT. Giữ nguyên ghi công này khi phân phối mẫu âm.
