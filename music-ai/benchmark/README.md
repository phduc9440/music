# Bộ kiểm thử cố định OMR

Dùng để so model/cấu hình cũ và mới **trên cùng dữ liệu**. Không bao giờ dùng các bản ở đây để huấn luyện
(`training/make_dataset.py` tự loại các file trong `cases.json`).

## Cấu trúc

```
benchmark/
  cases.json                 danh sách case: ảnh đầu vào (đường dẫn trong STORAGE_ROOT), loại, ground truth, các lần chạy đã lưu
  gt/<bài>/score.krn         ground truth phần nhạc (**kern, mỗi spine một khuông, spine phải nhất = khuông trên cùng)
  gt/<bài>/lyrics.json       ground truth lời ca gắn nốt: {"lyrics": [{"measure", "note", "number", "text"}]}
  gt/<bài>/lyrics_lines.json ground truth lời ca theo dòng (chỉ đo CER/WER): {"lines": [{"system", "number", "text"}]}
  results/                   kết quả mỗi lần chạy (không commit)
```

`note` là thứ tự **lần đánh nốt** trong ô trên khuông có lời (hợp âm tính một lần, dấu lặng và nốt nối tiếp của dấu nối
không tính). `number` là thứ tự dòng lời trong khối lời của hệ (trùng số lời `1.`, `2.` khi bản in có đánh số).

## Hiện có

| Case | Test | Loại | Ground truth |
|---|---|---|---|
| B1-dang-photo | B | Thánh ca 1 khuông, ảnh chụp, 3 lời + Đk, hợp âm 2 nốt | nhạc 32 ô + 131 âm tiết lời |
| B2-thanh-vinh-22 | B | Thánh vịnh 1 khuông, ảnh số, 5 lời + đáp ca + bài thứ hai | lời theo dòng (13 dòng) |
| A1-piano-two-staff | A | Piano 2 khuông | **chưa có**, cần bổ sung |

## Thêm một bản nhạc (quy trình tạo ground truth)

1. Tải bản nhạc lên ứng dụng như người dùng (để có ảnh trong storage và một lần chạy OMR), ghi lại `scoreId`.
2. Mở kết quả trong editor (hoặc MuseScore), **sửa tay cho đúng hoàn toàn theo ảnh**, lưu MusicXML. Người thứ hai kiểm
   lại từng ô (bài "Dâng": bản sửa tay của người dùng và bản chép độc lập khớp 100%, đây là cách kiểm chéo tốt).
3. Đặt MusicXML đã sửa vào `gt/<bài>/score.musicxml` (bộ đánh giá đọc được cả `.musicxml` lẫn `.krn`) và đổi
   `groundTruth.music` trong `cases.json` cho trỏ tới file đó. Lời ca nằm trong MusicXML thì bộ đánh giá lấy luôn; muốn
   tách riêng thì viết `lyrics.json`.
4. Thêm case vào `cases.json`: `input` (đường dẫn file gốc trong storage), `sourceType`, `test` (A: piano không lời,
   B: có lời), `storedRuns` (các `scoreId` đã chạy, để chế độ `stored` chấm).

Cần thêm tối thiểu để kết luận được (mục 4 của `docs/omr-architecture-v2.md`): 3 bản piano 2 khuông (có hợp âm, nốt đồng
thời, đổi nhịp/đổi hóa biểu), 3 bản giọng hát + piano, 3 bản lời tiếng Anh có gạch nối, mỗi loại có cả PDF xuất từ phần
mềm, bản scan và ảnh chụp điện thoại.

## Chạy

```bash
cd music-ai
export STORAGE_ROOT=../music-be/storage
python scripts/omr_benchmark.py stored          # chấm kết quả đã lưu (không cần model)
python scripts/omr_benchmark.py lyrics          # đo riêng nhánh lời ca (cần Tesseract, không cần model)
python scripts/omr_benchmark.py run --variant cu:OMR_OTTAVA=keep,OMR_LYRICS=off --variant moi:   # cần torch + model
```

Metric (`app/eval`): F1/precision/recall nốt (đúng ô đã căn, thời điểm, khuông, cao độ), đúng cao độ/trường độ, hợp âm
đúng nguyên tập nốt, dấu lặng, ô đúng hoàn toàn, ô thừa/thiếu, SER trên chuỗi ký hiệu chuẩn; lời ca: âm tiết đúng chữ ở
đúng nốt, CER, CER bỏ dấu, WER theo từng lời. Chế độ `run` ghi thêm thời gian/trang và RAM tối đa.
