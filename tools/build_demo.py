"""Build the fixed-editor 58-second demo with its original score."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[1]
BUILD = ROOT / "build"


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, check=True)


def require(command: str) -> None:
    if shutil.which(command) is None:
        raise SystemExit(f"Required executable not found: {command}")


def media_info(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=BUILD / "codex-model-picker-58s.mp4")
    parser.add_argument("--chrome-channel", default="chrome")
    args = parser.parse_args(argv)

    require("ffmpeg")
    require("ffprobe")
    index = ROOT / "index.html"
    if not index.exists():
        raise SystemExit(f"Missing repository entry page: {index}")

    BUILD.mkdir(parents=True, exist_ok=True)
    picture = BUILD / "picker-58s-picture.mp4"
    score = BUILD / "score58-premaster.wav"
    destination = args.output.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    run([
        sys.executable,
        str(SCRIPT.with_name("render_picker_58s.py")),
        "--input", str(index),
        "--output", str(picture),
        "--chrome-channel", args.chrome_channel,
    ])
    run([
        sys.executable,
        str(SCRIPT.with_name("score58.py")),
        "--output", str(score),
        "--hits", "32.24", "36.64", "40.64",
    ])

    # The premaster measures about -28.4 LUFS / -12.7 dBTP. The established
    # release gain is +10.55 dB, yielding roughly -17.9 LUFS / -2.2 dBTP.
    run([
        "ffmpeg", "-nostdin", "-v", "error", "-y",
        "-i", str(picture),
        "-i", str(score),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-af", "volume=10.55dB",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        "-t", "58.000", "-movflags", "+faststart",
        "-metadata", "title=Codex Model Picker · Beyond the Horizon",
        str(destination),
    ])

    info = media_info(destination)
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in info["streams"] if stream["codec_type"] == "audio")
    duration = float(info["format"]["duration"])
    assert (video["codec_name"], video["width"], video["height"]) == ("h264", 1920, 1080)
    assert video["avg_frame_rate"] == "25/1"
    assert audio["codec_name"] == "aac" and audio["sample_rate"] == "48000"
    assert abs(duration - 58.0) < 0.01
    print(f"Built {destination} ({duration:.3f}s, 1920x1080, 25fps, H.264 + AAC)")


if __name__ == "__main__":
    main()
