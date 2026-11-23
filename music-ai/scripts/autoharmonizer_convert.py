"""Chuyển trọng số và danh sách hợp âm của AutoHarmonizer gốc sang định dạng dịch vụ dùng (chạy một lần, đã chạy sẵn).

Repo gốc (MIT): https://github.com/sander-wood/autoharmonizer. Tải về, ghép file nén chia đôi rồi chạy::

    zip -s 0 weights.zip --out weights-full.zip && unzip weights-full.zip      # ra weights.hdf5
    pip install h5py                                                          # chỉ cần cho script này
    python scripts/autoharmonizer_convert.py --repo <thư mục repo gốc> --weights <weights.hdf5>

Ghi ra ``app/chords/autoharmonizer/``:

- ``weights.npz``: mọi tham số của mạng (tên ``lớp/biến``), numpy đọc thẳng, không cần TensorFlow.
- ``chords.json``: 1450 hợp âm theo đúng thứ tự lớp đầu ra; mỗi hợp âm có ký hiệu gốc (music21), gốc, loại ``<kind>``
  MusicXML, chữ hiển thị theo cách gõ của editor, bass và nhóm (để điều chỉnh theo phong cách).

``chord_types.bin`` gốc là pickle: đọc bằng bộ giải mã chặn mọi lời gọi lớp, chỉ nhận list và chuỗi.
"""

from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "app" / "chords" / "autoharmonizer"

# kind của music21 → (kind MusicXML, hậu tố hiển thị theo bảng KINDS của music-web/.../harmony.ts, nhóm)
KIND_MAP = {
    "major": ("major", "", "major"),
    "minor": ("minor", "m", "minor"),
    "augmented": ("augmented", "aug", "aug"),
    "diminished": ("diminished", "dim", "dim"),
    "dominant-seventh": ("dominant", "7", "dom7"),
    "major-seventh": ("major-seventh", "maj7", "maj7"),
    "minor-seventh": ("minor-seventh", "m7", "min7"),
    "diminished-seventh": ("diminished-seventh", "dim7", "dim"),
    "augmented-seventh": ("augmented-seventh", "aug7", "aug"),
    "half-diminished-seventh": ("half-diminished", "m7b5", "hdim"),
    "minor-major-seventh": ("major-minor", "mM7", "minor"),
    "major-sixth": ("major-sixth", "6", "sixth"),
    "minor-sixth": ("minor-sixth", "m6", "sixth"),
    "dominant-ninth": ("dominant-ninth", "9", "ext"),
    "major-ninth": ("major-ninth", "maj9", "ext"),
    "minor-ninth": ("minor-ninth", "m9", "ext"),
    "dominant-11th": ("dominant-11th", "11", "ext"),
    "minor-11th": ("minor-11th", "m11", "ext"),
    "dominant-13th": ("dominant-13th", "13", "ext"),
    "major-13th": ("major-13th", "maj13", "ext"),
    "minor-13th": ("minor-13th", "m13", "ext"),
    "suspended-second": ("suspended-second", "sus2", "sus"),
    "suspended-fourth": ("suspended-fourth", "sus4", "sus"),
    "power": ("power", "5", "major"),
}


class _SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):  # noqa: D401 - chặn mọi lớp
        raise pickle.UnpicklingError(f"không cho phép {module}.{name}")


def _note(name: str) -> tuple[str, int]:
    step = name[0].upper()
    alter = sum(1 if ch == "#" else -1 if ch == "-" else 0 for ch in name[1:])
    return step, alter


def describe(figure: str) -> dict:
    """Một ký hiệu music21 → mô tả để ghi <harmony>; 'R' (không hợp âm) và ký hiệu không đọc được thành None."""
    if figure in ("R", "N.C."):
        return {"figure": figure, "rest": True}
    from music21 import harmony

    try:
        symbol = harmony.ChordSymbol(figure.replace("bpedal", "-pedal"))
        root = symbol.root()
        bass = symbol.bass()
        kind = symbol.chordKind or "major"
    except Exception:  # ký hiệu lạ music21 không đọc được
        return {"figure": figure, "rest": True}
    if root is None:
        return {"figure": figure, "rest": True}
    if kind in KIND_MAP:
        xml_kind, suffix, family = KIND_MAP[kind]
    else:  # pedal và các kind hiếm: quy về hợp âm ba theo quãng 3
        pcs = {(p.pitchClass - root.pitchClass) % 12 for p in symbol.pitches}
        xml_kind, suffix, family = KIND_MAP["minor"] if 3 in pcs and 4 not in pcs else KIND_MAP["major"]
    has_add = " add " in figure or " alter " in figure or " subtract " in figure
    root_step, root_alter = _note(root.name)
    out = {
        "figure": figure,
        "rest": False,
        "root": [root_step, root_alter],
        "kind": xml_kind,
        "text": suffix,
        "family": family,
        "added": has_add,  # có nốt thêm / đổi (bỏ khi ghi, chỉ dùng để giảm ưu tiên)
    }
    if bass is not None and bass.pitchClass != root.pitchClass:
        out["bass"] = list(_note(bass.name))
    return out


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", type=Path, required=True, help="thư mục repo autoharmonizer gốc (có chord_types.bin)")
    parser.add_argument("--weights", type=Path, required=True, help="weights.hdf5 đã giải nén")
    args = parser.parse_args(argv)

    import h5py

    with open(args.repo / "chord_types.bin", "rb") as handle:
        types = _SafeUnpickler(handle).load()
    if not isinstance(types, list) or not all(isinstance(t, str) for t in types):
        raise SystemExit("chord_types.bin không phải danh sách chuỗi")

    arrays: dict[str, np.ndarray] = {}
    with h5py.File(args.weights, "r") as handle:
        def take(name, obj):
            if isinstance(obj, h5py.Dataset):
                arrays[f"{name.split('/')[0]}/{name.split('/')[-1].split(':')[0]}"] = np.asarray(obj, dtype=np.float32)

        handle["model_weights"].visititems(take)

    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "weights.npz", **arrays)
    chords = [describe(t) for t in types]
    (OUT / "chords.json").write_text(json.dumps(chords, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    unreadable = sum(1 for c in chords if c["rest"]) - 1
    print(f"{len(arrays)} mảng trọng số, {len(chords)} hợp âm ({unreadable} ký hiệu không đọc được, coi như không hợp âm)")


if __name__ == "__main__":
    main()
