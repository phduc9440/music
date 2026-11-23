# Huấn luyện HMM gợi ý hợp âm (R3)

Sinh ba bảng xác suất `app/chords/model/{pop,ballad,jazz}.json` cho `POST /chords/generate`. Đây chỉ là số thống kê
(log xác suất); dữ liệu gốc không được commit (`training/chords/data/` nằm trong `.gitignore`).

## Dữ liệu và giấy phép

| Bộ | Nguồn | Giấy phép | Dùng cho |
|---|---|---|---|
| POP909 | <https://github.com/music-x-lab/POP909-Dataset> (Wang và cộng sự, ISMIR 2020) | MIT | Chuyển của Pop/Ballad, toàn bộ xác suất phát |
| iRealPro Corpus of Jazz Standards (iRb) | <https://zenodo.org/records/3546040> (Shanahan, Broze, Rodgers) | CC BY 4.0 (phải ghi nguồn) | Chuyển của Jazz |
| Chorale bốn bè của J.S. Bach | Có sẵn trong `music21` (`music21.corpus`, không cần tải) | Phạm vi công cộng (bản nhạc); corpus music21 BSD | Toàn bộ Cổ điển |
| ~~Nottingham Music Database~~ | <https://abc.sourceforge.net/NMD/> | Bản gốc không ghi giấy phép, bản làm sạch (jukedeck) là GPL-3.0 | **Không dùng** |

Nhãn hợp âm POP909 do thuật toán gán (không sửa tay), nên bảng học được có lẫn lỗi nhận diện.

## Tải dữ liệu

```bash
cd music-ai/training/chords
mkdir -p data && cd data
curl -L -o pop909.zip https://codeload.github.com/music-x-lab/POP909-Dataset/zip/refs/heads/master
curl -L -o irealpro.zip "https://zenodo.org/records/3546040/files/shanahdt/irealb-v1.0.zip?download=1"
unzip -q pop909.zip -d pop909 && unzip -q irealpro.zip -d irealpro
(cd irealpro/shanahdt-irealb-*/ && unzip -q iRb_v1-0.zip)
```

## Huấn luyện

```bash
cd music-ai
python -m training.chords.train \
    --pop909 training/chords/data/pop909/POP909-Dataset-master \
    --irb training/chords/data/irealpro
```

- Lưới bước giống lúc chạy: ô 4 phách chia đôi ở phách 3, ô khác lấy cả ô.
- Nhãn rút về 7 loại (`maj`, `min`, `7`, `maj7`, `min7`, `hdim7`, `sus4`): sus2 → maj, maj6/69 → maj, min6/minmaj7 → min,
  9/13/các hợp âm át biến đổi/7sus → 7, min9/min11 → min7; dim, dim7, aug, N không dùng (làm đứt dãy).
- Làm mượt add-k (`--k`, mặc định 0,5). Cuối bài cộng thêm 2 lượt cho hợp âm chủ (câu kết).
- Ballad: bảng chuyển đếm trên từ vựng Ballad rồi nhân `BALLAD_COLOR_BOOST` (trong `train.py`) vào cột hợp âm màu.
- Phát (định dạng v2): mỗi hợp âm theo bậc một bảng P(bậc của nốt trong giọng | hợp âm), học từ giai điệu POP909, làm mượt
  về bảng theo loại hợp âm (xoay theo gốc) với trọng số `EMISSION_BACKOFF` = 4 phách.
- Jazz: bảng phát học từ POP909 với nhãn rút về từ vựng Jazz, cộng 0,02 cho nốt 9, 11, 13 rồi chuẩn hóa lại.
- `test_split.txt`: 10% bài POP909 (seed 42), không dùng khi huấn luyện, chỉ dùng cho `scripts/chord_eval.py`.
- **Cổ điển**: đọc 368 chorale bốn bè (`read_bach_chorales`). Giai điệu là bè soprano. Hợp âm của mỗi bước được nhận bằng
  cách so trọng số 12 cao độ của cả bốn bè với mẫu hợp âm (`match_chord`: điểm = nốt thuộc hợp âm − 0,6 × nốt ngoài, gốc
  phải có mặt, hợp âm 7 phải có nốt 7). Bass là bè thấp nhất ở đầu bước, chỉ giữ khi là thế đảo thật. vii° và hợp âm giảm 7
  coi là V7 thiếu gốc. Giọng lấy từ `score.analyze("key")` cho cả bài (bỏ qua chuyển giọng giữa bài).
  `test_split_classical.txt`: 10% chorale để kiểm thử. Đọc corpus mất khoảng 1 phút.
- **Dân ca**: bảng chuyển của POP909 đếm trên từ vựng hẹp (I, ii, IV, V, V7, vi). Xác suất ở lại cùng hợp âm nhân
  `FOLK_STAY_BOOST` = 1,6, xác suất mở đầu bằng hợp âm chủ nhân `FOLK_TONIC_START` = 6.
- **Bolero**: không có bộ dữ liệu mở nào có nhãn hợp âm bolero / trữ tình Việt, nên bảng chuyển dựng tay theo nhạc lý
  (`BOLERO_TRANSITIONS`). Bảng phát vẫn học từ POP909.
- **Blues**: iRb không ghi thể loại, nên bài blues được nhận theo cấu trúc 12 ô (`is_twelve_bar_blues`: số ô là bội của 12,
  ô 1 là I, ô 5 là IV, ô 7 về I). Có 44 bài. Bảng chuyển đếm từ các bài này, bảng phát học từ POP909.

## So sánh với MelodyT5 (tùy chọn)

Cần môi trường riêng (Python 3.10, torch CPU, transformers 4.18), mã nguồn MelodyT5 (MIT, github `sanderwood/melodyt5`) và
trọng số `weights.pth` (1,36 GB, HuggingFace `sander-wood/melodyt5`), tất cả đặt trong `training/chords/data/melodyt5/`
(gitignore). Máy ít RAM: script nạp trọng số bằng `mmap`, dùng khoảng 1,2 GB.

```bash
python scripts/chord_compare_melodyt5.py prepare --pop909 training/chords/data/pop909/POP909-Dataset-master
training/chords/data/melodyt5/venv/bin/python scripts/melodyt5_runner.py \
    --code training/chords/data/melodyt5/code/melodyt5-main \
    --weights training/chords/data/melodyt5/weights/weights.pth \
    --chunks training/chords/data/compare/chunks.jsonl --out training/chords/data/compare/melodyt5.jsonl
python scripts/chord_compare_melodyt5.py score --pop909 training/chords/data/pop909/POP909-Dataset-master
```

Kết quả ở `RESULTS.md`.
