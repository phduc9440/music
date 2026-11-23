"""Mạng AutoHarmonizer (mã MIT: github.com/sander-wood/autoharmonizer, bài báo arXiv:2112.11122) chạy bằng numpy.

Mã gốc cần Keras 2.3 / TensorFlow 2.2 / Python 3.7, không chạy được trên Python 3.11 của dịch vụ, nên mạng được dựng lại ở
đây và nạp đúng trọng số gốc (``weights.npz`` chuyển từ ``weights.hdf5`` của tác giả, không train lại). Kiến trúc lấy từ
``model.py`` gốc và sơ đồ nối lớp lưu trong file trọng số:

- 5 nhánh, mỗi nhánh nhận 32 bước (mỗi bước một nốt móc kép): giai điệu bên trái, giai điệu bên phải (đảo ngược), điều kiện
  (độ mạnh phách + giọng) trái, phải, và 32 hợp âm đã chọn trước đó.
- Mỗi nhánh: Dense theo bước (relu) → 3 lớp LSTM 128 (lớp 1, 2 trả cả chuỗi, thêm Dense 128 relu theo bước) → BatchNorm.
- Ghép 5 nhánh → 3 × (Dense 128 relu → BatchNorm) → Dense softmax trên 1450 hợp âm.
- Dropout tắt khi suy luận (mã gốc truyền ``training=False``). LSTM của Keras 2.3: cổng sigmoid, tanh, thứ tự i, f, c, o.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_DIR = Path(__file__).parent
SEGMENT = 32
MELODY_CLASSES = 128  # cao độ MIDI, 0 là dấu lặng
BEAT_CLASSES = 5  # int(beatStrength × 4)
KEY_CLASSES = 16  # số dấu thăng (âm là giáng) + 8
BN_EPSILON = 1e-3

# Tên lớp trong file trọng số của từng nhánh: (Dense đầu vào, [LSTM], [Dense sau LSTM 1, 2], [BatchNorm sau mỗi LSTM])
BRANCHES = {
    "melody_left": ("time_distributed_1", ["time_distributed_6", "time_distributed_11"], [1, 6, 11]),
    "melody_right": ("time_distributed_2", ["time_distributed_7", "time_distributed_12"], [2, 7, 12]),
    "condition_left": ("time_distributed_3", ["time_distributed_8", "time_distributed_13"], [3, 8, 13]),
    "condition_right": ("time_distributed_4", ["time_distributed_9", "time_distributed_14"], [4, 9, 14]),
    "chord_left": ("time_distributed_5", ["time_distributed_10", "time_distributed_15"], [5, 10, 15]),
}
MERGE = [("merge0", 16), ("merge1", 17), ("merge2", 18)]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + np.tanh(0.5 * x))  # = 1 / (1 + e^-x), không tràn số


class AutoHarmonizerNet:
    def __init__(self, weights: dict[str, np.ndarray], chord_types: list[str]):
        self.w = weights
        self.chord_types = chord_types
        if self.w["output_chord/kernel"].shape[1] != len(chord_types):
            raise ValueError("Số hợp âm trong chord_types.json không khớp lớp đầu ra của trọng số")

    # ---------------------------------------------------------------------------------------------- các lớp

    def _dense(self, name: str, x: np.ndarray, relu: bool = True) -> np.ndarray:
        y = x @ self.w[f"{name}/kernel"] + self.w[f"{name}/bias"]
        return np.maximum(y, 0.0) if relu else y

    def _bn(self, index: int, x: np.ndarray) -> np.ndarray:
        name = f"batch_normalization_{index}"
        mean, var = self.w[f"{name}/moving_mean"], self.w[f"{name}/moving_variance"]
        return self.w[f"{name}/gamma"] * (x - mean) / np.sqrt(var + BN_EPSILON) + self.w[f"{name}/beta"]

    def _lstm(self, name: str, x: np.ndarray, sequences: bool) -> np.ndarray:
        """x: [batch, thời gian, đặc trưng] → [batch, thời gian, 128] hoặc [batch, 128]."""
        kernel, recurrent, bias = self.w[f"{name}/kernel"], self.w[f"{name}/recurrent_kernel"], self.w[f"{name}/bias"]
        units = recurrent.shape[0]
        batch, steps, _ = x.shape
        projected = x @ kernel + bias  # tính trước phần đầu vào cho mọi bước
        h = np.zeros((batch, units), dtype=np.float32)
        c = np.zeros((batch, units), dtype=np.float32)
        outputs = np.empty((batch, steps, units), dtype=np.float32) if sequences else None
        for t in range(steps):
            z = projected[:, t] + h @ recurrent
            i = _sigmoid(z[:, :units])
            f = _sigmoid(z[:, units : 2 * units])
            g = np.tanh(z[:, 2 * units : 3 * units])
            o = _sigmoid(z[:, 3 * units :])
            c = f * c + i * g
            h = o * np.tanh(c)
            if sequences:
                outputs[:, t] = h
        return outputs if sequences else h

    def branch(self, name: str, x: np.ndarray) -> np.ndarray:
        """Một nhánh: [batch, 32, đầu vào one-hot] → [batch, 128]."""
        first, _, _ = BRANCHES[name]
        return self.branch_from_embedding(name, self._dense(first, x))

    def branch_from_embedding(self, name: str, y: np.ndarray) -> np.ndarray:
        """Phần còn lại của nhánh khi đã có đầu ra lớp Dense đầu vào (one-hot @ W = lấy hàng của W, nhanh hơn nhiều)."""
        _, middles, norms = BRANCHES[name]
        for layer in range(3):
            last = layer == 2
            y = self._lstm(f"{name}_{layer + 1}", y, sequences=not last)
            if not last:
                y = self._dense(middles[layer], y)
            y = self._bn(norms[layer], y)
        return y

    def head(self, parts: list[np.ndarray]) -> np.ndarray:
        """Ghép 5 nhánh → xác suất [batch, số hợp âm]."""
        y = np.concatenate(parts, axis=-1)
        for name, norm in MERGE:
            y = self._bn(norm, self._dense(name, y))
        logits = self._dense("output_chord", y, relu=False)
        logits -= logits.max(axis=-1, keepdims=True)
        probs = np.exp(logits)
        return probs / probs.sum(axis=-1, keepdims=True)


def one_hot(indices: np.ndarray, classes: int) -> np.ndarray:
    out = np.zeros(indices.shape + (classes,), dtype=np.float32)
    np.put_along_axis(out, indices[..., None].astype(int), 1.0, axis=-1)
    return out


@lru_cache(maxsize=1)
def load_net(model_dir: str = str(MODEL_DIR)) -> AutoHarmonizerNet:
    folder = Path(model_dir)
    with np.load(folder / "weights.npz") as data:
        weights = {k: data[k] for k in data.files}
    chords = json.loads((folder / "chords.json").read_text(encoding="utf-8"))
    return AutoHarmonizerNet(weights, [c["figure"] for c in chords])
