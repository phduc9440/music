"""Ghi danh sách hợp âm của AutoHarmonizer kèm chữ + <degree> sẽ ghi vào MusicXML và các nốt phải vang, ra file fixture
cho test của web (music-web/tests/editor/fixtures/autoharmonizer-chords.json). Chạy lại khi đổi chords.json hoặc symbols.py:

    cd music-ai && python scripts/export_chord_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.chords import symbols  # noqa: E402

table = json.loads((ROOT / "app/chords/autoharmonizer/chords.json").read_text(encoding="utf-8"))
rows = []
for chord in table:
    if chord["rest"]:
        continue
    mods = symbols.modifications(chord["figure"]) if chord.get("added") else []
    rows.append(
        {
            "figure": chord["figure"],
            "root": chord["root"],
            "bass": chord.get("bass"),
            "kind": chord["kind"],
            "text": symbols.chord_text(chord["kind"], chord["text"], mods),
            "degrees": [list(m) for m in mods],
            "pitchClasses": sorted(symbols.pitch_classes(chord["kind"], mods)),
        }
    )
out = ROOT.parent / "music-web/tests/editor/fixtures/autoharmonizer-chords.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(rows)} hợp âm -> {out}")
