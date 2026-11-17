# Fine-tune Transcoda cho bản nhạc của Smart Music AI (Kaggle GPU)

Không train trên MacBook. Mac dùng để chạy dịch vụ (CPU hoặc `DEVICE=mps`) và chạy benchmark; Kaggle dùng để sinh dữ
liệu và train. Kết quả fine-tune chỉ được dùng nếu `scripts/omr_benchmark.py run` cho thấy tốt hơn Transcoda v1 trên
`benchmark/cases.json` (đừng chọn theo loss).

## Vì sao fine-tune, và fine-tune cái gì

* Transcoda v1 chỉ thấy ảnh Verovio của nhạc piano/thính phòng; dự án chủ yếu là thánh ca một khuông có lời, ảnh chụp.
* Bài báo train model 59M trong ~6 giờ trên một GPU, có mã train công khai (AGPL-3.0, `github.com/btrkeks/transcoda`; nhóm
  đã có fork `phduc9440/transcoda`), nên fine-tune vài giờ trên Kaggle (P100/T4) là khả thi.
* Giữ nguyên định dạng nhãn (kern đã chuẩn hóa, không có lời) để pipeline không phải đổi gì: chỉ đổi `MODEL_ID`.

## Các bước

1. **Dữ liệu nguồn** (giấy phép mở): OpenScore Lieder (CC0, giọng hát + piano, có lời), PDMX (chỉ lấy bản có giấy phép
   public domain/CC0). Tải về Kaggle Dataset riêng, không đưa vào repo.
2. **Bộ chuẩn hóa kern**: lấy từ repo gốc (21 bước). Xác định lệnh chuẩn hóa một file trong repo đó (đọc README/mã của
   fork), rồi truyền vào `--normalizer-cmd`. Không có chuẩn hóa thì model học nhãn không nhất quán (bài báo: OMR-NED
   18,7% → 82,5%).
3. **Sinh dữ liệu** (biến thể chỉ giọng hát, giọng hát + piano, piano; lời tiếng Việt ngẫu nhiên 1-5 lời, hợp âm; biến
   dạng ảnh chụp/scan):

   ```bash
   pip install verovio cairosvg opencv-python-headless numpy
   git clone <repo music> && cd music/music-ai
   python training/make_dataset.py --musicxml-dir /kaggle/input/<dataset> --out /kaggle/working/data \
       --pages 20000 --normalizer-cmd "<lệnh chuẩn hóa> {input} {output}"
   ```

   Ra `data/train|val/{images,labels,manifest.jsonl}`, chia theo bản nhạc (không rò rỉ trang giữa train/val), tự loại các
   bản trong `benchmark/cases.json`. Hiện script chỉ lấy bản render vừa **một trang** (nhãn từng trang khi bản dài nhiều
   trang cần cắt kern theo ô của trang, chưa làm).
4. **Train** bằng mã của repo gốc (PyTorch Lightning), khởi tạo từ trọng số `btrkeks/transcoda-59M-zeroshot-v1`:
   `python train.py config/train.json --<khóa cấu hình>=...` (cú pháp ghi đè dạng dấu chấm theo README của fork). Cần trỏ
   phần dữ liệu của cấu hình tới thư mục ở bước 3; định dạng loader của repo gốc thì xem `config/train.json` và mã
   dataset của repo (chưa kiểm chứng được từ môi trường làm nhánh này). Gợi ý: learning rate nhỏ (1e-5 đến 5e-5), trộn
   ~30% dữ liệu gốc của Transcoda để không quên miền piano, chọn checkpoint theo CER/SER trên `val`, không theo loss.
5. **Xuất checkpoint** về định dạng Hugging Face (thư mục có `config.json`, trọng số, tokenizer) để music-ai nạp bằng
   `MODEL_ID=/đường/dẫn`. Nếu repo chỉ xuất `.ckpt` thì dùng `OMR_ENGINE=command` với script suy luận của repo.
6. **Đánh giá trên Mac** (không dùng dữ liệu test để train):

   ```bash
   STORAGE_ROOT=../music-be/storage python scripts/omr_benchmark.py run \
       --variant v1: --variant ft:MODEL_ID=/path/checkpoint
   ```

## Tài nguyên ước tính

| Việc | Ở đâu | Ước tính |
|---|---|---|
| Sinh 20.000 trang | Kaggle CPU | vài giờ (Verovio + cairosvg ~0,3-0,5 s/trang) |
| Fine-tune 59M | Kaggle GPU T4/P100 16 GB | vài giờ, batch nhỏ + tích lũy gradient (bài báo: 6 giờ train từ đầu trên RTX 5090) |
| Suy luận | Mac M1 CPU/MPS | không đổi so với v1 (cùng kiến trúc) |

Các ước tính thời gian trên là ước lượng, chưa đo.

## Kiểm thử các công cụ ở đây

`pytest tests/test_training.py`: biến dạng ảnh giữ kích thước, lời ca tiếng Việt ngẫu nhiên đúng NFC, chèn lời không đổi
nhạc, bỏ spine `**text` khỏi nhãn, chia tập ổn định, loại bản benchmark. Phần render Verovio chỉ chạy được khi đã cài
`verovio` (chưa chạy trong môi trường làm nhánh này).
