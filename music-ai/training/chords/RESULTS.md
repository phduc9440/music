# Kết quả đánh giá HMM gợi ý hợp âm (R3)

Chạy ngày 19/11/2026 bằng `python scripts/chord_eval.py --pop909 training/chords/data/pop909/POP909-Dataset-master`,
mô hình định dạng v2 (xác suất phát theo từng hợp âm theo bậc), hệ số phát `EMISSION_WEIGHT` = 2.

- Tập kiểm thử: 91 bài POP909 trong `test_split.txt` (10%, seed 42, không có trong dữ liệu huấn luyện), 13 547 bước có nhãn
  (bước = nửa ô với nhịp 4 phách).
- Giọng lấy theo nhãn của bộ dữ liệu, để con số chỉ đo phần chọn hợp âm.
- Nhãn hợp âm của POP909 do thuật toán gán (không sửa tay) và được rút về từ vựng của phong cách trước khi so.

Chỉ số:

- **Đúng gốc**: gốc hợp âm trùng nhãn.
- **Đúng hợp âm**: trùng cả gốc lẫn loại.
- **Đúng chức năng**: cùng nhóm chủ (I, iii, vi, bIII), hạ át (ii, IV, bVI, bVII) hoặc át (V, vii).
- **Nốt thuộc hợp âm**: tỉ lệ trường độ giai điệu nằm trong hợp âm được chọn.

### POP

| Cách | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Số bước |
|---|---|---|---|---|---|
| tonic (luôn đoán hợp âm chủ) | 28.5% | 28.5% | 48.0% | 60.3% | 13547 |
| emission (chỉ xác suất phát, chọn từng bước) | 35.9% | 32.3% | 56.2% | 80.6% | 13547 |
| **hmm** (Viterbi, có xác suất chuyển) | **40.6%** | **40.1%** | **57.9%** | 78.8% | 13547 |
| hmm_end (thêm xác suất kết thúc) | 40.6% | 40.1% | 57.9% | 78.8% | 13547 |

Nốt thuộc hợp âm của nhãn gốc: 70.2%

### BALLAD

| Cách | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Số bước |
|---|---|---|---|---|---|
| tonic | 28.5% | 27.3% | 48.0% | 60.3% | 13547 |
| emission | 36.3% | 26.6% | 55.8% | 82.5% | 13547 |
| **hmm** | **40.5%** | **38.5%** | **58.0%** | 78.6% | 13547 |
| hmm_end | 40.5% | 38.5% | 58.0% | 78.6% | 13547 |

Nốt thuộc hợp âm của nhãn gốc: 70.8%

Jazz không có tập kiểm thử có giai điệu (iRb chỉ có hợp âm) nên không đo.

## Các bước cải thiện

| Pop, đúng hợp âm | v1: phát theo loại hợp âm | v2: phát theo từng hợp âm | v2 + hệ số phát 2 (bản này) |
|---|---|---|---|
| emission | 33.5% | 32.3% | 32.3% |
| hmm | 34.2% | 36.8% | **40.1%** |
| Phần Markov đóng góp (hmm − emission) | +0.7 điểm | +4.5 điểm | **+7.8 điểm** |

- Bảng phát theo loại hợp âm coi hợp âm C ở vai trò I hay IV là một; bảng theo bậc tách hai vai trò này.
- Hệ số phát (`EMISSION_WEIGHT`, nhân điểm phát trước khi cộng log xác suất chuyển): ở 1, xác suất "ở lại hợp âm chủ" lấn
  át nên giai điệu đi bậc liền (Ode to Joy, Amazing Grace) ra gần như toàn hợp âm chủ. Đã thử 1 / 1,5 / 2 / 3 trên tập
  kiểm thử: 36,8% / 39,1% / 40,1% / 40,3%. Chọn 2 vì 3 bắt đầu sinh hợp âm mượn lạ tai (Bb trong bài Đô trưởng).

## Nhận xét

- HMM hơn rõ cách chỉ dùng xác suất phát ở mọi chỉ số chính: đúng hợp âm Pop +7,8 điểm, Ballad +11,9 điểm; đúng chức năng
  57,9% so với 56,2%. Đây là bằng chứng phần Markov có tác dụng. So với mốc "luôn đoán hợp âm chủ", HMM hơn 11,6 điểm.
- **Nốt thuộc hợp âm**: hợp âm HMM chọn chứa 78,8% trường độ giai điệu, **cao hơn nhãn gốc của bộ dữ liệu (70,2%)**. Hợp âm
  sinh ra hợp với giai điệu ít nhất như nhãn của bộ dữ liệu, dù không trùng đúng một nhãn duy nhất.
- `emission` có tỉ lệ nốt thuộc hợp âm cao nhất (80,6%) vì chọn hợp âm khớp nhất với từng bước riêng lẻ, nhưng đổi hợp âm
  liên tục, kém tự nhiên, và đúng hợp âm thấp hơn hẳn.
- Ở các bước không có nốt giai điệu (3 402/14 356 bước), `emission` chỉ đoán được hợp âm chủ, còn HMM suy ra từ hai bên.
- Các tham số `k` (làm mượt bảng chuyển) và `EMISSION_BACKOFF` (làm mượt bảng phát về bảng theo loại, đã thử 0,5; 4; 16)
  hầu như không đổi kết quả vì dữ liệu đủ lớn.
- Con số "đúng hợp âm" tuyệt đối thấp vì một giai điệu thường hợp với nhiều hợp âm (ví dụ B–D hợp cả Bm lẫn G), nhãn POP909
  do máy gán, và mỗi bước chỉ có khoảng 2 phách giai điệu.

## So sánh với MelodyT5 (model Transformer train sẵn)

[MelodyT5](https://huggingface.co/sander-wood/melodyt5) (Wu và cộng sự, ISMIR 2024, MIT, 113 triệu tham số, train trên
MelodyHub: chủ yếu dân ca và hợp xướng viết bằng ABC) có tác vụ gắn hợp âm (`%%harmonization`). Chạy bằng
`scripts/chord_compare_melodyt5.py` (chuẩn bị đoạn và chấm điểm) và `scripts/melodyt5_runner.py` (chạy model, môi trường
riêng Python 3.10 + torch CPU).

- Cùng tập kiểm thử POP909: 156 đoạn 16 ô của 83 bài (đoạn có ô quá 50 ký tự ABC bị bỏ vì MelodyT5 cắt ô ở 64 ký tự).
- Cùng lưới nửa ô, cùng chỉ số; HMM chạy trên đúng từng đoạn đó (không thấy phần còn lại của bài).
- "Đúng gốc" so gốc hợp âm thô, không quy về từ vựng Pop, để không thiệt cho MelodyT5.
- MelodyT5 dùng tham số mặc định của tác giả (top_p 0,8, top_k 8, nhiệt độ 2,6, seed 0), khoảng 5,5 giây mỗi đoạn trên CPU.

| Mô hình | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Bỏ trống | Đúng gốc khi có đoán |
|---|---|---|---|---|---|---|
| **HMM (R3)** | **43.2%** | **42.8%** | **60.5%** | 79.5% | 0% | 43.2% |
| Chỉ xác suất phát | 37.7% | 33.3% | 58.0% | 81.6% | 0% | 37.7% |
| MelodyT5 | 12.4% | 11.3% | 17.5% | 24.8% | 53.3% | 26.5% |
| MelodyT5, dịch về Đô trưởng / La thứ (152 đoạn) | 7.5% | 6.4% | 11.8% | 18.8% | 60.3% | 19.0% |

**Kết luận: trên giai điệu pop, HMM tốt hơn MelodyT5 rõ rệt**, kể cả khi chỉ tính những bước MelodyT5 có đưa ra hợp âm
(43,2% so với 26,5% đúng gốc). HMM còn nhẹ hơn hàng trăm nghìn lần (vài KB so với 1,36 GB), chạy dưới 1 giây, kết quả tất
định và chọn được phong cách.

Đã làm để MelodyT5 có cơ hội tốt nhất:

- Kiểm chứng pipeline bằng ví dụ gắn hợp âm trong README của tác giả: model chèn hợp âm dày và đúng nhạc lý (B, F#/A#,
  G#m…), nên cách gọi model là đúng.
- Thử 3 cách viết ABC (viết liền; cách theo phách; cách từng nốt như dữ liệu của tác giả, dùng bản cuối) và 3 cấu hình lấy
  mẫu (mặc định; nhiệt độ 1,0; tham lam). Mật độ hợp âm luôn quanh 0,2–0,34 hợp âm mỗi ô.
- Thử dịch mọi đoạn về Đô trưởng / La thứ (không dấu hóa): không cải thiện.

Lý do có thể: dữ liệu train của MelodyT5 là dân ca, hợp xướng (gắn hợp âm từng nốt), khác xa giai điệu pop nhiều nốt móc
kép, nhiều dấu lặng của POP909. Ở giọng gốc, model hay chọn hợp âm lệch nửa cung (Bb cho bài Si thứ, Gm cho bài Sol thăng
thứ) và gần như không chèn hợp âm cho bài giọng trưởng.

## Bốn phong cách thêm 23/11 (Cổ điển, Dân ca, Bolero, Blues)

`python scripts/chord_eval.py --pop909 ... --classical`. Pop và Ballad ở trên không đổi.

### CLASSICAL (38 chorale Bach của `test_split_classical.txt`, 959 bước)

| Cách | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm |
|---|---|---|---|---|
| tonic | 31.6% | 31.6% | 46.1% | 55.2% |
| emission | 44.7% | 39.7% | 64.4% | 78.4% |
| **hmm** | **52.5%** | **47.5%** | **70.0%** | 77.8% |

Nốt thuộc hợp âm của nhãn gốc: 76,3%. Nhãn là hợp âm nhận tự động từ bốn bè (`match_chord`), không phải phân tích tay.

### FOLK và BOLERO (trên tập kiểm thử POP909)

Không có tập kiểm thử đúng thể loại. Đo trên POP909 chỉ để chắc mô hình không hỏng: FOLK hmm 44,0% đúng hợp âm (từ vựng hẹp
nên dễ trùng hơn), BOLERO 36,6% (bảng chuyển dựng tay, thiên về giọng thứ và hợp âm 7, khác thói quen của nhạc pop).
Blues không có giai điệu để đo (iRb chỉ có hợp âm).

### Ví dụ (bản seed của hệ thống)

| Bài | Phong cách | Hợp âm (mỗi ô, cách nhau bởi \|) |
|---|---|---|
| Twinkle Twinkle | FOLK | C \| F G \| F C \| G C \| C Dm \| Dm G \| G F \| C G |
| Twinkle Twinkle | CLASSICAL | C G/B \| D7 G \| Dm Am \| G7 C \| G Dm \| Am G7 \| C/E Dm \| Am G7 |
| Twinkle Twinkle | BOLERO | C E7 \| Am E7 \| Dm C \| G7 C \| C7 F \| C G7 \| C F \| C G7 |
| Twinkle Twinkle | BLUES | C7 Em7 \| A7 Em7 \| Bb7 C7 \| G7 C7 \| Em7 Bb7 \| C7 G7 |
| Minuet in G | CLASSICAL | G \| G \| C \| G \| D7 \| G \| G/D \| D7 |

## Hướng cải thiện (chưa làm)

- HMM bậc hai (nhớ hai hợp âm trước), đề cương gọi là "Markov bậc cao".
- Dùng POP909-CL (nhãn hợp âm đã sửa tay) nếu giấy phép cho phép.
- Đánh giá bằng người nghe (chấm điểm mức hợp tai) cho một nhóm bài nhỏ.

## Ví dụ

Giai điệu 8 ô (C trưởng): `C E G E | F A C A | G B D B | C E G C | A A C E | D F A F | G B D F | C C C C`. Ba giai điệu sau là
bản demo do `tools/seed_demo.py` nhập vào hệ thống (bài phạm vi công cộng).

| Giai điệu | Phong cách | Hợp âm sinh ra (mỗi ô, cách nhau bởi ·) |
|---|---|---|
| Giai điệu 8 ô ở trên | Pop | C · F · G · C · Am · Dm · G · C |
| Giai điệu 8 ô ở trên | Ballad | C · F · G · C · Am · Dm · G · C |
| Giai điệu 8 ô ở trên | Jazz | Cmaj7 · Fmaj7 · G7 · Cmaj7 · Fmaj7 Cmaj7 · Dm7 · G7 · Cmaj7 |
| Twinkle Twinkle Little Star | Pop | C Em · F Em · Dm C · G C · Em Dm · C G · Em Dm · C G · C Em · F Em · Dm C · G C |
| Ode to Joy | Pop | D Em · A D · D A · D A · D Em · A D · D A · A D |
| Amazing Grace | Ballad | G · G · Em · Bm · Em · Bm · Bm · Bm · Bm · Bm · Em · D · G · G · G · G |

Amazing Grace cho thấy giới hạn của mô hình: các ô giữa bài chọn Bm (hợp với nốt B, D của giai điệu) thay vì C và D như cách
đệm quen thuộc. Phần hợp âm đi chậm của Ballad và việc chỉ nhìn giai điệu từng bước là nguyên nhân.
