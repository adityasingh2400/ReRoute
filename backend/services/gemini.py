from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
from pathlib import Path

from google import genai
from google.genai import types

from backend.config import settings
from backend.models.item_card import ItemCard, DefectSignal, ItemCategory
from backend.models.route_bid import ComparableListing

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3.1-pro-preview"

MIME_MAP = {
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
}

_upload_cache: dict[str, object] = {}
_upload_lock = asyncio.Lock()


def _get_mime_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in MIME_MAP:
        return MIME_MAP[ext]
    guess, _ = mimetypes.guess_type(path)
    return guess or "video/mp4"


def _frame_path_to_url(path: str) -> str:
    """Convert a filesystem frame path to a URL served by the static mount."""
    return f"/frames/{Path(path).name}"


async def _upload_video_and_wait(client: genai.Client, video_path: str):
    """Upload video to Gemini and wait until active. Caches to avoid re-uploading."""
    if video_path in _upload_cache:
        cached = _upload_cache[video_path]
        print(f"[GEMINI] Reusing cached upload: {cached.name}")
        return cached

    async with _upload_lock:
        if video_path in _upload_cache:
            return _upload_cache[video_path]

        mime = _get_mime_type(video_path)
        print(f"[GEMINI] Uploading video: {video_path} (mime: {mime})")

        with open(video_path, "rb") as f:
            video_file = await asyncio.to_thread(
                client.files.upload, file=f, config={"mime_type": mime}
            )
        print(f"[GEMINI] Upload complete: {video_file.name} (state: {video_file.state})")

        wait_count = 0
        while video_file.state == "PROCESSING":
            wait_count += 1
            print(f"[GEMINI] File still processing... waiting ({wait_count * 3}s)")
            await asyncio.sleep(3)
            video_file = await asyncio.to_thread(client.files.get, name=video_file.name)

        if video_file.state != "ACTIVE":
            raise RuntimeError(f"File {video_file.name} failed processing: state={video_file.state}")

        print(f"[GEMINI] File ready: {video_file.name} (state: ACTIVE)")
        _upload_cache[video_path] = video_file
        return video_file


class GeminiService:
    """Gemini AI service with multi-key round-robin for concurrent requests.

    When multiple API keys are configured (GEMINI_API_KEY, GEMINI_API_KEY_2,
    GEMINI_API_KEY_3), each concurrent call gets a different key to avoid
    rate limits. Keys are distributed round-robin via an atomic counter.
    """

    _clients: list[genai.Client] = []
    _counter: int = 0
    _initialized: bool = False

    def __init__(self) -> None:
        if not GeminiService._initialized:
            GeminiService._init_clients()

    @classmethod
    def _init_clients(cls) -> None:
        keys = [k for k in [
            settings.gemini_api_key,
            settings.gemini_api_key_2,
            settings.gemini_api_key_3,
        ] if k]
        if not keys:
            cls._initialized = True
            return
        cls._clients = [genai.Client(api_key=k) for k in keys]
        cls._initialized = True
        logger.info("Gemini initialized with %d API key(s) for round-robin", len(cls._clients))

    def _get_primary_client(self) -> genai.Client:
        """Primary client (Key 1) — used for video uploads and analysis that
        reference uploaded files. Files are scoped to the uploading key's project."""
        if not self._clients:
            if not settings.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY not configured")
            self._clients = [genai.Client(api_key=settings.gemini_api_key)]
        return self._clients[0]

    def _get_client(self) -> genai.Client:
        """Round-robin client — used for search_live_comps and other calls
        that don't reference uploaded files."""
        if not self._clients:
            if not settings.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY not configured")
            self._clients = [genai.Client(api_key=settings.gemini_api_key)]
        idx = GeminiService._counter % len(self._clients)
        GeminiService._counter += 1
        return self._clients[idx]

    async def analyze_video(
        self,
        video_path: str,
        transcript: str,
        frame_paths: list[str],
    ) -> list[ItemCard]:
        if settings.demo_mode and not settings.gemini_api_key:
            return self._mock_analyze(frame_paths)

        try:
            client = self._get_primary_client()  # Must match the key that uploaded the video file

            prompt = (
                "You are an expert product analyst for a resale marketplace.\n\n"
                "Analyze this video showing one or more items. The user is speaking about each item, "
                "describing what it is, its condition, and any defects.\n\n"
                "For each distinct item you see AND/OR hear described, return a JSON array of objects. "
                "Each object must have:\n"
                "  name_guess (string): best guess at product name/model\n"
                "  category (string): one of electronics, clothing, accessories, home, sports, toys, books, tools, automotive, other\n"
                "  likely_specs (object): spec names mapped to values like brand, model, color, storage\n"
                "  visible_defects (array): each element is an object with keys 'description' (string) and 'severity' (string: minor/moderate/major)\n"
                "  spoken_defects (array): same format as visible_defects, for defects the user mentions verbally\n"
                "  accessories_included (array of strings)\n"
                "  accessories_missing (array of strings)\n"
                "  confidence (float 0-1)\n"
                f"  hero_frame_indices (array of integers): 0-based indices into the {len(frame_paths)} extracted frames (valid range: 0 to {len(frame_paths) - 1}). Pick 2-3 frames that BEST show THIS specific item.\n"
                "  segment_start_sec (float): when this item first appears in the video\n"
                "  segment_end_sec (float): when the camera moves away from this item\n\n"
                "Transcript of user speech:\n"
                + (transcript or "(no transcript available)")
                + "\n\nReturn ONLY a valid JSON array. No markdown fences. No extra text."
            )

            video_file = await _upload_video_and_wait(client, video_path)

            print(f"[GEMINI] Analyzing video with {GEMINI_MODEL}...")
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=[video_file, prompt],
            )

            raw = response.text.strip()
            print(f"[GEMINI] Raw response ({len(raw)} chars): {raw[:500]}{'...' if len(raw) > 500 else ''}")
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            items_data = json.loads(raw)

            print(f"[GEMINI] Parsed {len(items_data)} items from response")

            cards: list[ItemCard] = []
            total_frames = len(frame_paths)
            for item_idx, item in enumerate(items_data):
                hero_indices = item.get("hero_frame_indices", [])
                hero_frames_fs = [frame_paths[i] for i in hero_indices if 0 <= i < total_frames]

                # Fallback: use segment timestamps to pick frames from the right part of the video
                if not hero_frames_fs and frame_paths:
                    seg_start = float(item.get("segment_start_sec", 0))
                    seg_end = float(item.get("segment_end_sec", 0))
                    if seg_end > seg_start and total_frames > 1:
                        # Estimate which frames correspond to this item's video segment
                        # Assume frames are uniformly distributed across a ~30s video
                        video_duration = max(seg_end * 1.2, 30.0)  # rough estimate
                        start_idx = max(0, int(seg_start / video_duration * total_frames))
                        end_idx = min(total_frames, int(seg_end / video_duration * total_frames) + 1)
                        segment_frames = frame_paths[start_idx:end_idx]
                        if segment_frames:
                            # Pick up to 3 evenly spaced frames from the segment
                            step = max(1, len(segment_frames) // 3)
                            hero_frames_fs = segment_frames[::step][:3]
                    if not hero_frames_fs:
                        # Last resort: divide frames evenly among items
                        chunk = max(1, total_frames // len(items_data))
                        start = item_idx * chunk
                        hero_frames_fs = frame_paths[start:start + min(3, chunk)]

                hero_frame_urls = [_frame_path_to_url(p) for p in hero_frames_fs]

                visible = []
                for d in item.get("visible_defects", []):
                    if isinstance(d, dict):
                        visible.append(DefectSignal(description=d.get("description", ""), source="visual", severity=d.get("severity", "moderate")))
                    elif isinstance(d, str):
                        visible.append(DefectSignal(description=d, source="visual", severity="moderate"))

                spoken = []
                for d in item.get("spoken_defects", []):
                    if isinstance(d, dict):
                        spoken.append(DefectSignal(description=d.get("description", ""), source="spoken", severity=d.get("severity", "moderate")))
                    elif isinstance(d, str):
                        spoken.append(DefectSignal(description=d, source="spoken", severity="moderate"))

                cat_val = item.get("category", "other")
                try:
                    cat = ItemCategory(cat_val)
                except ValueError:
                    cat = ItemCategory.OTHER

                card = ItemCard(
                    name_guess=item.get("name_guess", "Unknown Item"),
                    category=cat,
                    likely_specs=item.get("likely_specs", {}),
                    visible_defects=visible,
                    spoken_defects=spoken,
                    accessories_included=item.get("accessories_included", []),
                    accessories_missing=item.get("accessories_missing", []),
                    confidence=float(item.get("confidence", 0.5)),
                    hero_frame_paths=hero_frame_urls,
                    all_frame_paths=frame_paths,
                    segment_start_sec=float(item.get("segment_start_sec", 0.0)),
                    segment_end_sec=float(item.get("segment_end_sec", 0.0)),
                )
                cards.append(card)
                print(f"[GEMINI]   → {card.name_guess} ({card.category.value}, confidence: {card.confidence:.0%}, defects: {len(card.all_defects)})")
            return cards

        except Exception as exc:
            print(f"[GEMINI] ✗ Video analysis FAILED: {exc}")
            import traceback
            traceback.print_exc()
            if settings.demo_mode:
                print(f"[GEMINI] Falling back to mock data (demo_mode=True)")
                return self._mock_analyze(frame_paths)
            raise

    async def generate_listing(self, item_card: ItemCard) -> dict:
        if settings.demo_mode and not settings.gemini_api_key:
            return self._mock_listing(item_card)

        try:
            client = self._get_client()
            defects_str = "; ".join(d.description for d in item_card.all_defects) or "None"
            prompt = (
                "Generate a marketplace listing for this item.\n\n"
                "Item: " + item_card.name_guess + "\n"
                "Category: " + item_card.category.value + "\n"
                "Specs: " + json.dumps(item_card.likely_specs) + "\n"
                "Condition: " + item_card.condition_label + "\n"
                "Defects: " + defects_str + "\n\n"
                "Return JSON with: title (string max 80 chars), description (string), "
                "price_strategy (float), price_min (float), price_max (float), "
                "condition_summary (string), defects_disclosure (string), "
                "shipping_policy (string: standard or expedited).\n\n"
                "Return ONLY valid JSON, no markdown fences."
            )

            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=[prompt],
            )

            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(raw)

        except Exception:
            logger.exception("Gemini listing generation failed")
            if settings.demo_mode:
                return self._mock_listing(item_card)
            raise

    async def reason_about_route(self, item_card: ItemCard, bids: list) -> str:
        if settings.demo_mode and not settings.gemini_api_key:
            return f"Based on market analysis, selling {item_card.name_guess} as-is offers the best value recovery with minimal effort."

        try:
            client = self._get_client()
            bids_summary = "\n".join(
                f"- {b.route_type.value}: est. ${b.estimated_value:.2f}, effort={b.effort.value}, speed={b.speed.value}, confidence={b.confidence:.0%}"
                for b in bids
            )
            defects_str = "; ".join(d.description for d in item_card.all_defects) or "None"
            prompt = (
                "You are a concierge explaining why a particular route was chosen.\n\n"
                "Item: " + item_card.name_guess + " (" + item_card.category.value + ")\n"
                "Condition: " + item_card.condition_label + "\n"
                "Defects: " + defects_str + "\n\n"
                "Route bids:\n" + bids_summary + "\n\n"
                "Explain in 2-3 sentences why the winning route is best for recovering max value with min effort."
            )

            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=[prompt],
            )
            return response.text.strip()

        except Exception:
            logger.exception("Gemini route reasoning failed")
            return f"Recommended route selected for {item_card.name_guess} based on value and effort analysis."

    async def transcribe_from_video(self, video_path: str) -> str:
        if settings.demo_mode and not settings.gemini_api_key:
            return "This is a demo item. It's in good condition overall with some minor scratches on the back."

        try:
            client = self._get_primary_client()  # Must match the key that uploaded the video file
            video_file = await _upload_video_and_wait(client, video_path)

            print(f"[GEMINI] Transcribing speech from video...")
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=[
                    video_file,
                    "Transcribe all spoken words in this video exactly as said. Return the raw transcript text. If there is no speech at all, return the single word EMPTY.",
                ],
            )
            text = response.text.strip()
            result = "" if text == "EMPTY" else text
            print(f"[GEMINI] Transcript ({len(result)} chars): {result[:300]}{'...' if len(result) > 300 else ''}")
            return result

        except Exception as exc:
            print(f"[GEMINI] ✗ Transcription FAILED: {exc}")
            import traceback
            traceback.print_exc()
            return ""

    async def search_live_comps(
        self,
        item_name: str,
        category: str = "",
        condition: str = "",
    ) -> list[ComparableListing]:
        if not settings.gemini_api_key:
            return self._mock_comps(item_name)

        try:
            client = self._get_client()
            condition_hint = f" in {condition} condition" if condition else ""
            prompt = (
                'Search for "' + item_name + '"' + condition_hint + " currently listed for sale online. "
                "Find 6-10 real active listings from marketplaces like eBay, Mercari, Swappa, "
                "Amazon, Facebook Marketplace, OfferUp, Poshmark, Craigslist, or any platform.\n\n"
                "For each listing, return a JSON array of objects with these exact fields:\n"
                "- platform: marketplace name lowercase (ebay, mercari, swappa, amazon, facebook, offerup, poshmark, craigslist, other)\n"
                "- title: the exact listing title as shown\n"
                "- price: the listed price as a float in USD (0 if not shown)\n"
                "- condition: condition as listed (e.g. Used - Good, Like New, For Parts, etc.)\n"
                "- url: the direct URL to the listing page\n"
                "- image_url: the URL of the listing main thumbnail if visible, otherwise empty string\n"
                '- shipping: shipping cost info (e.g. "FREE", "$5.99", "Local pickup")\n'
                '- match_score: similarity to "' + item_name + '" as integer 0-100\n\n'
                "Important: include REAL currently active listings with actual prices. "
                "Prefer listings with images. Return ONLY valid JSON array, no markdown."
            )

            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                ),
            )

            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

            listings_data = json.loads(raw)
            results: list[ComparableListing] = []
            for item in listings_data:
                results.append(ComparableListing(
                    platform=item.get("platform", "unknown"),
                    title=item.get("title", ""),
                    price=float(item.get("price", 0)),
                    shipping=str(item.get("shipping", "")),
                    condition=item.get("condition", ""),
                    url=item.get("url", ""),
                    image_url=item.get("image_url", ""),
                    match_score=float(item.get("match_score", 70)),
                ))
            logger.info("Live search found %d comps for '%s'", len(results), item_name)
            return results

        except Exception:
            logger.exception("Gemini live comp search failed for '%s'", item_name)
            return self._mock_comps(item_name)

    @staticmethod
    def _mock_comps(query: str) -> list[ComparableListing]:
        return [
            ComparableListing(platform="ebay", title=f"{query} - Excellent Condition", price=89.99, shipping="FREE", condition="Like New", url="", match_score=94),
            ComparableListing(platform="mercari", title=f"{query} - Gently Used", price=75.00, shipping="$5.99", condition="Good", url="", match_score=90),
            ComparableListing(platform="swappa", title=f"{query} - Good Condition", price=82.50, shipping="FREE", condition="Good", url="", match_score=87),
            ComparableListing(platform="facebook", title=f"{query} - Used", price=65.00, shipping="Local pickup", condition="Good", url="", match_score=82),
            ComparableListing(platform="offerup", title=f"{query} - Great Deal", price=70.00, shipping="$7.99", condition="Good", url="", match_score=78),
            ComparableListing(platform="ebay", title=f"{query} - For Parts/Repair", price=35.00, shipping="$8.99", condition="Fair", url="", match_score=65),
        ]

    def _mock_analyze(self, frame_paths: list[str] | None = None) -> list[ItemCard]:
        frames = frame_paths or []
        hero_urls = [_frame_path_to_url(p) for p in frames[:2]] if frames else []
        return [
            ItemCard(
                name_guess="Apple AirPods Pro (2nd Gen)",
                category=ItemCategory.ELECTRONICS,
                likely_specs={"brand": "Apple", "model": "AirPods Pro 2", "color": "White", "connectivity": "Bluetooth 5.3"},
                visible_defects=[DefectSignal(description="Minor scratches on charging case", source="visual", severity="minor")],
                spoken_defects=[],
                accessories_included=["Charging case", "USB-C cable"],
                accessories_missing=["Extra ear tips"],
                confidence=0.92,
                hero_frame_paths=hero_urls,
                all_frame_paths=frames,
                segment_start_sec=0.0,
                segment_end_sec=30.0,
            ),
        ]

    def _mock_listing(self, item_card: ItemCard) -> dict:
        return {
            "title": f"{item_card.name_guess} - {item_card.condition_label} Condition",
            "description": f"Selling my {item_card.name_guess}. {item_card.condition_label} condition. All original accessories included.",
            "price_strategy": 85.0,
            "price_min": 70.0,
            "price_max": 100.0,
            "condition_summary": item_card.condition_label,
            "defects_disclosure": "; ".join(d.description for d in item_card.all_defects) or "No notable defects.",
            "shipping_policy": "standard",
        }
