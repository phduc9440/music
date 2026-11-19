# Kết quả đánh giá HMM gợi ý hợp âm (R3)

Chạy ngày 19/11/2026 bằng `python scripts/chord_eval.py --pop909 training/chords/data/pop909/POP909-Dataset-master`,
mô hình định dạng v2 (xác suất phát theo từng hợp âm theo bậc).

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
| **hmm** (Viterbi, có xác suất chuyển) | **37.2%** | **36.8%** | 54.6% | 74.4% | 13547 |
| hmm_end (thêm xác suất kết thúc) | 37.1% | 36.8% | 54.6% | 74.3% | 13547 |

Nốt thuộc hợp âm của nhãn gốc: 70.2%

### BALLAD

| Cách | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Số bước |
|---|---|---|---|---|---|
| tonic | 28.5% | 27.3% | 48.0% | 60.3% | 13547 |
| emission | 36.3% | 26.6% | 55.8% | 82.5% | 13547 |
| **hmm** | **37.1%** | **35.2%** | 54.7% | 74.3% | 13547 |
| hmm_end | 37.1% | 35.2% | 54.7% | 74.3% | 13547 |

Nốt thuộc hợp âm của nhãn gốc: 70.8%

Jazz không có tập kiểm thử có giai điệu (iRb chỉ có hợp âm) nên không đo.

## So với bản đầu (xác suất phát theo loại hợp âm)

| Pop, đúng hợp âm | Bản đầu (v1) | Bản này (v2) |
|---|---|---|
| emission | 33.5% | 32.3% |
| hmm | 34.2% | **36.8%** |
| Phần Markov đóng góp (hmm − emission) | +0.7 điểm | **+4.5 điểm** |

Bảng phát theo loại hợp âm coi hợp âm C ở vai trò I hay IV là một. Bảng theo bậc tách hai vai trò này, nhờ đó bảng chuyển
(phần Markov) phát huy tác dụng.

## Nhận xét

- HMM hơn rõ cách chỉ dùng xác suất phát về đúng hợp âm: Pop +4,5 điểm, Ballad +8,6 điểm. Đây là bằng chứng phần Markov
  có tác dụng. So với mốc "luôn đoán hợp âm chủ", HMM hơn 8 điểm.
- **Nốt thuộc hợp âm**: hợp âm HMM chọn chứa 74,4% trường độ giai điệu, **cao hơn nhãn gốc của bộ dữ liệu (70,2%)**. Hợp âm
  sinh ra hợp với giai điệu ít nhất như nhãn của bộ dữ liệu, dù không trùng đúng một nhãn duy nhất.
- `emission` có tỉ lệ nốt thuộc hợp âm cao nhất (80,6%) và đúng chức năng cao hơn HMM một chút (56,2% so với 54,6%). Nó chọn
  hợp âm khớp nhất với từng bước riêng lẻ nên đổi hợp âm liên tục, kém tự nhiên, và đúng hợp âm thấp hơn hẳn. HMM chấp nhận
  khớp giai điệu kém hơn một chút để có vòng hợp âm hợp lý. Đây là đánh đổi có chủ đích của mô hình Markov.
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
| **HMM (R3)** | **39.5%** | **39.1%** | 57.1% | 74.9% | 0% | 39.5% |
| Chỉ xác suất phát | 37.7% | 33.3% | 58.0% | 81.6% | 0% | 37.7% |
| MelodyT5 | 12.4% | 11.3% | 17.5% | 24.8% | 53.3% | 26.5% |
| MelodyT5, dịch về Đô trưởng / La thứ (152 đoạn) | 7.5% | 6.4% | 11.8% | 18.8% | 60.3% | 19.0% |

**Kết luận: trên giai điệu pop, HMM tốt hơn MelodyT5 rõ rệt**, kể cả khi chỉ tính những bước MelodyT5 có đưa ra hợp âm
(39,5% so với 26,5% đúng gốc). HMM còn nhẹ hơn hàng trăm nghìn lần (vài KB so với 1,36 GB), chạy dưới 1 giây, kết quả tất
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

## Hướng cải thiện (chưa làm)

- HMM bậc hai (nhớ hai hợp âm trước), đề cương gọi là "Markov bậc cao".
- Dùng POP909-CL (nhãn hợp âm đã sửa tay) nếu giấy phép cho phép.
- Đánh giá bằng người nghe (chấm điểm mức hợp tai) cho một nhóm bài nhỏ.

## Ví dụ

Giai điệu 8 ô (C trưởng): `C E G E | F A C A | G B D B | C E G C | A A C E | D F A F | G B D F | C C C C`

| Phong cách | Hợp âm sinh ra |
|---|---|
| Pop | C · F · G · C · Am · Dm · G · C |
| Ballad | C · F · G · C · Am · Dm · G · C |
| Jazz | Cmaj7 · Dm7 · G7 · Cmaj7 · Am7 · Dm7 · G7 · Cmaj7 |
