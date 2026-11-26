#!/usr/bin/env python3
"""Render sẵn mẫu âm piano từ SoundFont MuseScore_General.sf3 cho Player của music-web.

Chạy MỘT LẦN lúc build (không chạy lúc người dùng mở trang). Chỉ dùng thư viện chuẩn của Python; cần hai chương trình
ngoài trong PATH:
  - fluidsynth (đọc được .sf3):  brew install fluid-synth
  - ffmpeg (đổi sang mp3):       brew install ffmpeg

Kết quả (mặc định) nằm ở music-web/public/samples/piano/v1/:
  manifest.json            danh sách mẫu, lớp lực và bộ mẫu "nhẹ"
  v60/A0.mp3, v60/C1.mp3, v60/Ds1.mp3 ...   lớp lực nhẹ (velocity 60)
  v110/A0.mp3 ...                            lớp lực mạnh (velocity 110)

Mỗi 3 nửa cung một mẫu từ A0 (MIDI 21) đến C8 (MIDI 108) là 30 nốt, mỗi nốt dài 4 giây. Web dùng playbackRate để suy ra
các nốt ở giữa. Dấu thăng ghi bằng chữ "s" (Ds1 = Re thăng octave 1) để tên file an toàn trong URL.

Ví dụ:
  python3 tools/render_piano_samples.py
  python3 tools/render_piano_samples.py --soundfont ~/Downloads/MuseScore_General.sf3 --program 0
"""

import argparse
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOUNDFONT = ROOT / "tools" / "soundfonts" / "MuseScore_General.sf3"
DEFAULT_OUT = ROOT / "music-web" / "public" / "samples" / "piano" / "v1"

FIRST_MIDI = 21  # A0
LAST_MIDI = 108  # C8
STEP = 3  # nửa cung giữa hai mẫu
LAYERS = (("v60", 60), ("v110", 110))
LIGHT_STEP = 6  # bộ "nhẹ": mỗi 6 nửa cung, chỉ lớp lực mạnh
SAMPLE_SECONDS = 4.0
HOLD_SECONDS = 3.0  # giữ phím; phần còn lại là đuôi vang
FADE_SECONDS = 0.3
TARGET_PEAK_DB = -1.0  # đỉnh của mẫu to nhất sau khi chuẩn hóa chung
SAMPLE_RATE = 44100
MP3_BITRATE = "128k"
NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]


def note_name(midi: int) -> str:
    """Tên mẫu theo cao độ, ví dụ 21 -> A0, 63 -> Ds4."""
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def vlq(value: int) -> bytes:
    """Số nguyên độ dài biến đổi của MIDI."""
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def write_midi(path: Path, midi: int, velocity: int, bank: int, program: int) -> None:
    """Ghi file MIDI một nốt (120 BPM, 480 tick/phách = 960 tick/giây) bằng byte thô."""
    ticks_per_second = 960
    hold = int(HOLD_SECONDS * ticks_per_second)
    tail = int((SAMPLE_SECONDS + 0.5) * ticks_per_second) - hold  # đuôi vang để fluidsynth không cắt sớm
    track = bytearray()
    track += vlq(0) + b"\xff\x51\x03" + (500000).to_bytes(3, "big")  # tempo 120 BPM
    track += vlq(0) + bytes([0xB0, 0x00, bank & 0x7F])  # bank select MSB
    track += vlq(0) + bytes([0xC0, program & 0x7F])
    track += vlq(0) + bytes([0x90, midi, velocity])
    track += vlq(hold) + bytes([0x80, midi, 0])
    track += vlq(tail) + b"\xff\x2f\x00"
    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, 480)
    path.write_bytes(header + b"MTrk" + struct.pack(">I", len(track)) + bytes(track))


def fail(message: str) -> None:
    print(f"Lỗi: {message}", file=sys.stderr)
    sys.exit(1)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def peak_db(wav: Path) -> float:
    """Đỉnh (dB) của file wav, đọc từ bộ lọc volumedetect của ffmpeg."""
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af", "volumedetect", "-f", "null", "-"])
    match = re.search(r"max_volume:\s*(-?[\d.]+) dB", result.stderr)
    if not match:
        fail(f"không đo được âm lượng của {wav.name}:\n{result.stderr[-400:]}")
    return float(match.group(1))


def main() -> None:
    parser = argparse.ArgumentParser(description="Render mẫu âm piano từ MuseScore_General.sf3")
    parser.add_argument("--soundfont", type=Path, default=DEFAULT_SOUNDFONT, help="đường dẫn file .sf3/.sf2")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="thư mục đầu ra")
    parser.add_argument("--bank", type=int, default=0, help="bank của preset Grand Piano (mặc định 0)")
    parser.add_argument("--program", type=int, default=0, help="program của preset Grand Piano (mặc định 0)")
    args = parser.parse_args()

    soundfont: Path = args.soundfont.expanduser().resolve()
    if not soundfont.is_file():
        fail(
            f"không thấy SoundFont tại {soundfont}.\n"
            "Tải MuseScore_General.sf3 rồi đặt vào tools/soundfonts/ hoặc truyền --soundfont <đường dẫn>."
        )
    for tool, hint in (("fluidsynth", "brew install fluid-synth"), ("ffmpeg", "brew install ffmpeg")):
        if shutil.which(tool) is None:
            fail(f"không tìm thấy '{tool}' trong PATH. Cài bằng: {hint}")
    if not (0 <= args.bank <= 127 and 0 <= args.program <= 127):
        fail("--bank và --program phải nằm trong 0..127")

    midis = list(range(FIRST_MIDI, LAST_MIDI + 1, STEP))
    out: Path = args.out.expanduser().resolve()
    for layer, _ in LAYERS:
        (out / layer).mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="piano-samples-") as tmp_name:
        tmp = Path(tmp_name)
        wavs: dict[tuple[str, int], Path] = {}
        peaks: dict[tuple[str, int], float] = {}

        print(f"Render {len(midis)} nốt x {len(LAYERS)} lớp lực bằng FluidSynth...")
        for layer, velocity in LAYERS:
            for midi in midis:
                mid_file = tmp / f"{layer}-{midi}.mid"
                wav_file = tmp / f"{layer}-{midi}.wav"
                write_midi(mid_file, midi, velocity, args.bank, args.program)
                result = run(
                    ["fluidsynth", "-ni", "-g", "1.0", "-r", str(SAMPLE_RATE), "-F", str(wav_file),
                     str(soundfont), str(mid_file)]
                )
                if result.returncode != 0 or not wav_file.is_file() or wav_file.stat().st_size == 0:
                    fail(f"FluidSynth lỗi ở nốt {note_name(midi)} ({layer}):\n{(result.stderr or result.stdout)[-600:]}")
                wavs[(layer, midi)] = wav_file
                peaks[(layer, midi)] = peak_db(wav_file)

        # Một hệ số chung cho mọi mẫu để giữ nguyên chênh lệch to nhỏ giữa các nốt và giữa hai lớp lực
        loudest = max(peaks.values())
        gain_db = TARGET_PEAK_DB - loudest
        print(f"Mẫu to nhất {loudest:.1f} dB, áp hệ số chung {gain_db:+.1f} dB (đỉnh {TARGET_PEAK_DB} dBFS).")

        files: dict[tuple[str, int], str] = {}
        for (layer, midi), wav in wavs.items():
            relative = f"{layer}/{note_name(midi)}.mp3"
            filters = (
                f"volume={gain_db:.3f}dB,atrim=0:{SAMPLE_SECONDS},"
                f"afade=t=out:st={SAMPLE_SECONDS - FADE_SECONDS}:d={FADE_SECONDS}"
            )
            result = run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-af", filters,
                 "-ac", "1", "-b:a", MP3_BITRATE, str(out / relative)]
            )
            if result.returncode != 0:
                fail(f"ffmpeg lỗi khi đổi {relative}:\n{result.stderr[-600:]}")
            files[(layer, midi)] = relative

    manifest = {
        "version": 1,
        "source": "MuseScore_General.sf3 (Grand Piano)",
        "sampleSeconds": SAMPLE_SECONDS,
        "layers": [{"id": layer, "velocity": velocity} for layer, velocity in LAYERS],
        "samples": [
            {"note": note_name(midi), "midi": midi, "files": {layer: files[(layer, midi)] for layer, _ in LAYERS}}
            for midi in midis
        ],
        "light": {"layer": LAYERS[-1][0], "midis": [m for m in midis if (m - FIRST_MIDI) % LIGHT_STEP == 0]},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    total = sum((out / f).stat().st_size for f in files.values())
    print(f"Xong: {len(files)} file mp3, {total / 1_000_000:.1f} MB, manifest tại {out / 'manifest.json'}")


if __name__ == "__main__":
    main()
