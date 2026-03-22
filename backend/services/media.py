from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from backend.config import settings

logger = logging.getLogger(__name__)


class MediaService:
    async def extract_frames(
        self,
        video_path: str,
        output_dir: str | None = None,
        interval_sec: float = 2.0,
    ) -> list[str]:
        out = Path(output_dir or settings.frames_dir)
        out.mkdir(parents=True, exist_ok=True)
        prefix = uuid.uuid4().hex[:8]
        pattern = str(out / f"{prefix}_%04d.jpg")

        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps=1/{interval_sec}",
            "-q:v", "2",
            pattern,
            "-y", "-loglevel", "error",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.error("ffmpeg frame extraction failed: %s", stderr.decode())
                if settings.demo_mode:
                    return self._generate_placeholder_frames(out, prefix)
                return []

            frames = sorted(out.glob(f"{prefix}_*.jpg"))
            return [str(f) for f in frames]

        except FileNotFoundError:
            logger.error("ffmpeg not found on PATH")
            if settings.demo_mode:
                return self._generate_placeholder_frames(out, prefix)
            return []

    async def extract_audio(self, video_path: str) -> str:
        out_dir = Path(settings.frames_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        audio_path = str(out_dir / f"{uuid.uuid4().hex[:8]}_audio.wav")

        cmd = [
            "ffmpeg", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            audio_path,
            "-y", "-loglevel", "error",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.error("ffmpeg audio extraction failed: %s", stderr.decode())
                return ""
            return audio_path

        except FileNotFoundError:
            logger.error("ffmpeg not found on PATH")
            return ""

    async def extract_transcript(self, video_path: str) -> str:
        if settings.demo_mode:
            return (
                "So I've got a few things to sell today. First up, these AirPods Pro — "
                "barely used, just some minor scratches on the case. Next, my Sony "
                "WH-1000XM4 headphones — the headband has a crack and the battery "
                "drains pretty fast now. And finally this mechanical keyboard with "
                "its original cable, basically brand new condition."
            )
        audio_path = await self.extract_audio(video_path)
        if not audio_path:
            return ""
        return audio_path

    async def get_video_metadata(self, video_path: str) -> dict:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path,
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.error("ffprobe failed: %s", stderr.decode())
                if settings.demo_mode:
                    return self._mock_metadata()
                return {}

            data = json.loads(stdout.decode())
            fmt = data.get("format", {})
            duration = float(fmt.get("duration", 0))

            video_stream = next(
                (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
                {},
            )

            fps_str = video_stream.get("r_frame_rate", "0/1")
            parts = fps_str.split("/")
            fps = float(parts[0]) / float(parts[1]) if len(parts) == 2 and float(parts[1]) else 0.0

            return {
                "duration": duration,
                "width": video_stream.get("width", 0),
                "height": video_stream.get("height", 0),
                "fps": round(fps, 2),
                "codec": video_stream.get("codec_name", ""),
                "size_bytes": int(fmt.get("size", 0)),
            }

        except FileNotFoundError:
            logger.error("ffprobe not found on PATH")
            if settings.demo_mode:
                return self._mock_metadata()
            return {}

    def _generate_placeholder_frames(self, output_dir: Path, prefix: str) -> list[str]:
        frames: list[str] = []
        colors = [(52, 152, 219), (46, 204, 113), (231, 76, 60)]
        labels = ["Item Overview", "Close-up Detail", "Condition Check"]

        try:
            from PIL import Image, ImageDraw

            for i, (color, label) in enumerate(zip(colors, labels), 1):
                img = Image.new("RGB", (640, 480), color)
                draw = ImageDraw.Draw(img)
                bbox = draw.textbbox((0, 0), label)
                text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
                draw.text(
                    ((640 - text_w) / 2, (480 - text_h) / 2),
                    label,
                    fill=(255, 255, 255),
                )
                path = output_dir / f"{prefix}_{i:04d}.jpg"
                img.save(str(path), "JPEG")
                frames.append(str(path))
        except ImportError:
            logger.warning("Pillow not installed; creating minimal placeholder files")
            for i in range(1, 4):
                path = output_dir / f"{prefix}_{i:04d}.jpg"
                path.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100 + b"\xff\xd9")
                frames.append(str(path))

        logger.info("Generated %d placeholder frames (demo mode)", len(frames))
        return frames

    @staticmethod
    def _mock_metadata() -> dict:
        return {
            "duration": 45.0,
            "width": 1920,
            "height": 1080,
            "fps": 30.0,
            "codec": "h264",
            "size_bytes": 15_000_000,
        }
