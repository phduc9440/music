"""Đánh giá chất lượng OMR bằng metric thực tế (nốt, cao độ, trường độ, hợp âm, cấu trúc).

Tách riêng khỏi pipeline: không import torch, music21 hay FastAPI, nên chạy được ở mọi nơi (máy dev, CI, Kaggle).

* :mod:`app.eval.score`: đọc ``**kern`` và MusicXML thành cùng một dạng sự kiện nốt (:class:`~app.eval.score.ScoreData`).
* :mod:`app.eval.metrics`: căn ô nhịp, so nốt/cao độ/trường độ/hợp âm/dấu lặng, SER theo chuỗi ký hiệu chuẩn.
* :mod:`app.eval.text`: khoảng cách chỉnh sửa.
"""
