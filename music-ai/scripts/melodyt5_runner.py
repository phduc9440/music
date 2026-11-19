"""Chạy MelodyT5 (tác vụ harmonization) trên các đoạn ABC do ``chord_compare_melodyt5.py prepare`` tạo ra.

Chạy bằng môi trường riêng của MelodyT5 (Python 3.10, torch CPU, transformers 4.18), không phải ``.venv`` của music-ai::

    training/chords/data/melodyt5/venv/bin/python scripts/melodyt5_runner.py \
        --code training/chords/data/melodyt5/code/melodyt5-main \
        --weights training/chords/data/melodyt5/weights/weights.pth \
        --chunks training/chords/data/compare/chunks.jsonl \
        --out training/chords/data/compare/melodyt5.jsonl

Mỗi dòng ra: ``{id, output, seconds}``. Đoạn đã có trong ``--out`` thì bỏ qua, nên ngắt giữa chừng chạy lại được.
Trọng số nạp bằng ``mmap`` để không chiếm thêm RAM cho phần optimizer trong checkpoint.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def build_model(code_dir: Path, weights: Path):
    sys.path.insert(0, str(code_dir))
    os.chdir(code_dir)  # PatchLevelEnDecoder đọc thư mục "random_model" theo đường dẫn tương đối
    import torch  # noqa: PLC0415
    from config import CHAR_NUM_LAYERS, PATCH_LENGTH, PATCH_NUM_LAYERS, PATCH_SIZE  # noqa: PLC0415
    from transformers import GPT2Config, GPT2Model  # noqa: PLC0415
    from utils import MelodyT5, Patchilizer  # noqa: PLC0415

    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 2))
    patch_config = GPT2Config(
        num_hidden_layers=PATCH_NUM_LAYERS, max_length=PATCH_LENGTH, max_position_embeddings=PATCH_LENGTH, vocab_size=1
    )
    char_config = GPT2Config(
        num_hidden_layers=CHAR_NUM_LAYERS, max_length=PATCH_SIZE, max_position_embeddings=PATCH_SIZE, vocab_size=128
    )
    if not (code_dir / "random_model").exists():
        GPT2Model(patch_config).save_pretrained("random_model")  # như random_model.py của tác giả
    model = MelodyT5(patch_config, char_config)
    try:
        checkpoint = torch.load(str(weights), map_location="cpu", mmap=True, weights_only=True)
    except Exception:  # noqa: BLE001 - checkpoint có đối tượng ngoài tensor
        checkpoint = torch.load(str(weights), map_location="cpu", mmap=True)
    model.load_state_dict(checkpoint["model"])
    del checkpoint
    model.eval()
    return model, Patchilizer(), torch


def harmonize(model, patchilizer, torch, abc: str, seed: int, top_p: float, top_k: int, temperature: float) -> str:
    """Như ``inference.py`` của tác giả, một bản cho một đầu vào, không có phần prompt cho decoder."""
    max_patch = len(patchilizer.encode(abc, add_special_patches=True)) + 2
    patches = torch.tensor([patchilizer.encode(abc, add_special_patches=True)])
    decoder_patches = torch.tensor([patchilizer.encode("", add_special_patches=True)[:-1]])
    out = ""
    with torch.no_grad():
        while decoder_patches.shape[1] < max_patch:
            predicted, seed = model.generate(
                patches, decoder_patches, None, task="harmonization", top_p=top_p, top_k=top_k,
                temperature=temperature, seed=seed,
            )
            if predicted[0] == patchilizer.eos_token_id:
                break
            bar = patchilizer.decode([predicted])
            if bar == "":
                break
            out += bar
            nxt = torch.tensor(patchilizer.bar2patch(bar)).unsqueeze(0)
            decoder_patches = torch.cat([decoder_patches, nxt.unsqueeze(0)], dim=1)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--chunks", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0, help="chỉ chạy bấy nhiêu đoạn (0 = tất cả)")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--top_p", type=float, default=0.8)
    parser.add_argument("--top_k", type=int, default=8)
    parser.add_argument("--temperature", type=float, default=2.6)
    args = parser.parse_args()

    chunks = [json.loads(line) for line in args.chunks.read_text().splitlines() if line.strip()]
    out_path = args.out.resolve()
    done = set()
    if out_path.exists():
        done = {json.loads(line)["id"] for line in out_path.read_text().splitlines() if line.strip()}
    todo = [c for c in chunks if c["id"] not in done]
    if args.limit:
        todo = todo[: args.limit]

    model, patchilizer, torch = build_model(args.code.resolve(), args.weights.resolve())
    print(f"Tham số: {sum(p.numel() for p in model.parameters())}; còn {len(todo)} đoạn", flush=True)
    with out_path.open("a", encoding="utf-8") as sink:
        for index, chunk in enumerate(todo, start=1):
            start = time.time()
            output = harmonize(model, patchilizer, torch, chunk["abc"], args.seed, args.top_p, args.top_k, args.temperature)
            seconds = round(time.time() - start, 1)
            sink.write(json.dumps({"id": chunk["id"], "output": output, "seconds": seconds}, ensure_ascii=False) + "\n")
            sink.flush()
            print(f"[{index}/{len(todo)}] {chunk['id']} {seconds}s", flush=True)


if __name__ == "__main__":
    main()
