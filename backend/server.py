from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles

from backend.config import settings
from backend.models import (
    BestRouteDecision,
    ChatMessage,
    ItemCard,
    Job,
    JobStatus,
    ListingPackage,
    RouteBid,
    RouteType,
)
from backend.storage.store import store
from backend.systems.unified_inbox import UnifiedInboxSystem
from backend.systems.route_closer import RouteCloserSystem

logger = logging.getLogger("reroute.server")


# ── WebSocket Connection Manager ─────────────────────────────────────────────


class ConnectionManager:
    def __init__(self) -> None:
        self._active: dict[str, set[WebSocket]] = {}

    async def connect(self, job_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.setdefault(job_id, set()).add(websocket)

    def disconnect(self, job_id: str, websocket: WebSocket) -> None:
        if job_id in self._active:
            self._active[job_id].discard(websocket)
            if not self._active[job_id]:
                del self._active[job_id]

    async def broadcast(self, job_id: str, event_type: str, data: dict) -> None:
        connections = self._active.get(job_id)
        if not connections:
            return
        payload = {"type": event_type, "data": data}
        stale: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            connections.discard(ws)


manager = ConnectionManager()


async def _store_event_handler(event_type: str, data: dict) -> None:
    job_id = data.get("job_id")
    if not job_id:
        item_id = data.get("item_id")
        if item_id:
            item = store.get_item(item_id)
            if item:
                job_id = item.job_id
    if job_id:
        await manager.broadcast(job_id, event_type, data)


# ── App Lifecycle ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.ensure_dirs()
    store.on_event(_store_event_handler)
    yield


app = FastAPI(title="ReRoute", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Schemas ────────────────────────────────────────────────


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "reroute"}


@app.get("/api/local-ip")
async def get_local_ip() -> dict[str, str]:
    import socket
    ip = "localhost"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    return {"ip": ip}


class UploadResponse(BaseModel):
    job_id: str
    status: str


class ExecuteRequest(BaseModel):
    platforms: list[str]


class ReplyRequest(BaseModel):
    text: str


class CloseRouteRequest(BaseModel):
    winning_platform: str
    recovered_value: float


# ── Upload ────────────────────────────────────────────────────────────────────


@app.post("/api/upload", response_model=UploadResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix or ".mp4"
    dest = Path(settings.upload_dir) / f"{uuid.uuid4().hex[:12]}{ext}"
    dest.parent.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            await out.write(chunk)

    job = await store.create_job(video_path=str(dest))
    background_tasks.add_task(run_pipeline, job.job_id)
    return UploadResponse(job_id=job.job_id, status=job.status.value)


# ── Jobs ──────────────────────────────────────────────────────────────────────


@app.get("/api/jobs")
async def list_jobs() -> list[dict[str, Any]]:
    return [j.model_dump(mode="json") for j in store.list_jobs()]


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> dict[str, Any]:
    state = store.get_full_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    return state


@app.get("/api/jobs/{job_id}/items")
async def get_items(job_id: str) -> list[dict[str, Any]]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return [i.model_dump(mode="json") for i in store.get_items_for_job(job_id)]


@app.get("/api/jobs/{job_id}/items/{item_id}/bids")
async def get_bids(job_id: str, item_id: str) -> list[dict[str, Any]]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return [b.model_dump(mode="json") for b in store.get_bids(item_id)]


@app.get("/api/jobs/{job_id}/items/{item_id}/decision")
async def get_decision(job_id: str, item_id: str) -> dict[str, Any]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    decision = store.get_decision(item_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    return decision.model_dump(mode="json")


# ── Execution ─────────────────────────────────────────────────────────────────


@app.post("/api/jobs/{job_id}/items/{item_id}/execute")
async def execute_item(
    job_id: str,
    item_id: str,
    body: ExecuteRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    if not store.get_item(item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    background_tasks.add_task(run_execution, job_id, item_id, body.platforms)
    return {"status": "executing", "item_id": item_id, "platforms": body.platforms}


@app.post("/api/jobs/{job_id}/items/{item_id}/close")
async def close_route(
    job_id: str, item_id: str, body: CloseRouteRequest
) -> dict[str, Any]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    if not store.get_item(item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    closer = RouteCloserSystem()
    await closer.close_losing_routes(item_id, body.winning_platform)
    await closer.mark_resolved(item_id, body.recovered_value)
    return {
        "status": "closed",
        "item_id": item_id,
        "winning_platform": body.winning_platform,
        "recovered_value": body.recovered_value,
    }


# ── Inbox ─────────────────────────────────────────────────────────────────────


@app.get("/api/jobs/{job_id}/inbox")
async def get_inbox(job_id: str) -> list[dict[str, Any]]:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    inbox = UnifiedInboxSystem()
    # Parallelize ranking across items — rank_buyers is async
    results = await asyncio.gather(
        *[inbox.rank_buyers(item_id) for item_id in job.item_ids],
        return_exceptions=True,
    )
    results = [r for r in results if not isinstance(r, Exception)]
    threads: list[dict[str, Any]] = [
        t.model_dump(mode="json") for result in results for t in result
    ]
    return threads


@app.post("/api/jobs/{job_id}/inbox/{thread_id}/reply")
async def reply_to_thread(
    job_id: str, thread_id: str, body: ReplyRequest
) -> dict[str, Any]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    inbox = UnifiedInboxSystem()
    updated = await inbox.add_message(thread_id, sender="seller", text=body.text)
    return updated.model_dump(mode="json")


@app.get("/api/jobs/{job_id}/inbox/{thread_id}/suggest")
async def suggest_reply(job_id: str, thread_id: str) -> dict[str, Any]:
    if not store.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    inbox = UnifiedInboxSystem()
    suggestion = await inbox.suggest_reply(thread)
    return {"thread_id": thread_id, "suggested_reply": suggestion}


# ── WebSocket ─────────────────────────────────────────────────────────────────


@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str) -> None:
    await manager.connect(job_id, websocket)
    try:
        state = store.get_full_state(job_id)
        if state:
            await websocket.send_json({"type": "initial_state", "data": state})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(job_id, websocket)


# ── Agent Lifecycle Events ────────────────────────────────────────────────────


async def emit_agent_event(job_id: str, event_type: str, data: dict) -> None:
    """Broadcast agent lifecycle event AND persist state for reconnection.

    Agent event data flow:
      emit_agent_event() → store.set_agent_state() → manager.broadcast()
                                                        ↓
                                           useJob hook receives event
                                                        ↓
                                        AgentStatusBar + MissionControl re-render
    """
    try:
        store.set_agent_state(job_id, data.get("agent", ""), {"status": event_type, **data})
        await manager.broadcast(job_id, event_type, data)
    except Exception:
        logger.warning("emit_agent_event failed for job=%s agent=%s", job_id, data.get("agent"), exc_info=True)


# ── Pipeline Orchestration ────────────────────────────────────────────────────


async def run_pipeline(job_id: str) -> None:
    import time as _time
    try:
        job = store.get_job(job_id)
        if not job or not job.video_path:
            print(f"[PIPELINE] ERROR: Job {job_id} not found or no video_path")
            return

        print(f"\n[PIPELINE] ═══ Starting pipeline for job {job_id} ═══")
        print(f"[PIPELINE] Video: {job.video_path}")

        # ── Stage 1: Extract frames + transcript ──
        print(f"[PIPELINE] Stage 1: Extracting frames and transcript...")
        t0 = _time.time()
        await store.update_job_status(job_id, JobStatus.EXTRACTING)
        await emit_agent_event(job_id, "agent_started", {"agent": "intake", "message": "Extracting video frames and transcript..."})

        from backend.systems.transcript_extraction import (
            TranscriptAndFrameExtractionSystem,
        )

        extractor = TranscriptAndFrameExtractionSystem()
        transcript, frame_paths = await extractor.process(job_id, job.video_path)
        elapsed_1 = round((_time.time() - t0) * 1000)
        await emit_agent_event(job_id, "agent_completed", {
            "agent": "intake",
            "message": f"Extracted {len(frame_paths)} frames, {len(transcript)} chars",
            "elapsed_ms": elapsed_1,
        })
        print(f"[PIPELINE] ✓ Extraction done in {_time.time()-t0:.1f}s — {len(frame_paths)} frames, {len(transcript)} chars transcript")

        job = await store.update_job_status(
            job_id,
            JobStatus.ANALYZING,
            transcript_text=transcript,
            frame_paths=frame_paths,
        )

        # ── Stage 2: Gemini video analysis ──
        print(f"[PIPELINE] Stage 2: Sending to Gemini 3.1 Pro for item analysis...")
        t1 = _time.time()
        await emit_agent_event(job_id, "agent_started", {"agent": "condition_fusion", "message": "Analyzing video with Gemini..."})

        from backend.services.gemini import GeminiService

        gemini = GeminiService()
        items: list[ItemCard] = await gemini.analyze_video(
            video_path=job.video_path,
            transcript=job.transcript_text or "",
            frame_paths=job.frame_paths,
        )
        await emit_agent_event(job_id, "agent_progress", {
            "agent": "condition_fusion",
            "message": f"Found {len(items)} items",
            "progress": 0.7,
        })

        for item in items:
            item.job_id = job_id
            await store.add_item(item)
            print(f"[PIPELINE]   • {item.name_guess} (confidence: {item.confidence:.0%}, defects: {len(item.all_defects)})")

        await emit_agent_event(job_id, "agent_completed", {
            "agent": "condition_fusion",
            "message": f"Graded {len(items)} items",
            "elapsed_ms": round((_time.time() - t1) * 1000),
        })
        print(f"[PIPELINE] ✓ Gemini analysis done in {_time.time()-t1:.1f}s — {len(items)} items detected")

        if not items:
            print(f"[PIPELINE] No items detected, completing job")
            await store.update_job_status(job_id, JobStatus.COMPLETED)
            return

        # ── Stage 3: Route bidding ──
        print(f"[PIPELINE] Stage 3: Collecting route bids for {len(items)} items...")
        await store.update_job_status(job_id, JobStatus.ROUTING)

        # ── Stage 3: Route bidding — ALL items in parallel ──
        print(f"[PIPELINE] Stage 3: Collecting route bids for ALL {len(items)} items CONCURRENTLY...")
        t2 = _time.time()

        # Map route_type values to agent names for lifecycle events
        ROUTE_TO_AGENT = {
            "sell_as_is": "marketplace_resale",
            "trade_in": "trade_in",
            "repair_then_sell": "repair_roi",
            "return": "return",
            "bundle_then_sell": "bundle_opportunity",
        }

        async def _process_item(i: int, item: ItemCard) -> None:
            print(f"[PIPELINE]   [{i+1}/{len(items)}] Bidding on: {item.name_guess}")
            item_t = _time.time()

            # Emit agent_started for all route agents that will bid on this item
            bid_agents = ["marketplace_resale", "return"]
            if item.is_electronics:
                bid_agents.append("trade_in")
            if item.has_defects:
                bid_agents.append("repair_roi")
            if len(items) > 1:
                bid_agents.append("bundle_opportunity")

            for agent in bid_agents:
                await emit_agent_event(job_id, "agent_started", {
                    "agent": agent, "item_id": item.item_id,
                    "message": f"Evaluating {item.name_guess}...",
                })

            bids = await _collect_route_bids(item)
            print(f"[PIPELINE]   [{i+1}] ✓ Got {len(bids)} bids in {_time.time()-item_t:.1f}s")

            completed_agents = set()
            for bid in bids:
                await store.add_bid(bid)
                agent_name = ROUTE_TO_AGENT.get(bid.route_type.value)
                if agent_name and agent_name in bid_agents:
                    completed_agents.add(agent_name)
                    await emit_agent_event(job_id, "agent_completed", {
                        "agent": agent_name, "item_id": item.item_id,
                        "message": f"${bid.estimated_value:.0f} — {bid.explanation}",
                        "confidence": bid.confidence,
                        "elapsed_ms": round((_time.time() - item_t) * 1000),
                    })
                print(f"[PIPELINE]     → {bid.route_type.value}: ${bid.estimated_value:.2f} (conf: {bid.confidence:.0%}, viable: {bid.viable})")

            # Mark any agents that didn't produce a bid as completed (non-viable)
            for agent in bid_agents:
                if agent not in completed_agents and agent != "bundle_opportunity":
                    await emit_agent_event(job_id, "agent_completed", {
                        "agent": agent, "item_id": item.item_id,
                        "message": "Not viable for this item",
                        "elapsed_ms": round((_time.time() - item_t) * 1000),
                    })

            # Bundle agent completes after all bids collected
            if "bundle_opportunity" in bid_agents:
                await emit_agent_event(job_id, "agent_completed", {
                    "agent": "bundle_opportunity", "item_id": item.item_id,
                    "message": f"Evaluated bundle potential for {len(items)} items",
                    "elapsed_ms": round((_time.time() - item_t) * 1000),
                })

            # Stage 4: Route decision
            await emit_agent_event(job_id, "agent_started", {
                "agent": "route_decider", "item_id": item.item_id,
                "message": f"Scoring {len(bids)} bids...",
            })
            decision = _decide_best_route(item.item_id, bids)
            await store.set_decision(decision)
            await emit_agent_event(job_id, "agent_completed", {
                "agent": "route_decider", "item_id": item.item_id,
                "message": f"Best: {decision.best_route.value} → ${decision.estimated_best_value:.2f}",
                "elapsed_ms": round((_time.time() - item_t) * 1000),
            })
            print(f"[PIPELINE]   [{i+1}] ★ Best route: {decision.best_route.value} → ${decision.estimated_best_value:.2f}")

            try:
                from backend.systems.listing_asset_optimization import (
                    ListingAssetOptimizationSystem,
                )
                from backend.models.listing_package import ListingPackage, ListingImage

                optimizer = ListingAssetOptimizationSystem()
                optimized_images = await optimizer.optimize(item)
                print(f"[PIPELINE]   [{i+1}] {len(optimized_images)} images optimized")

                if optimized_images:
                    listing_data = await gemini.generate_listing(item)
                    listing = ListingPackage(
                        item_id=item.item_id,
                        job_id=job_id,
                        title=listing_data.get("title", item.name_guess),
                        description=listing_data.get("description", ""),
                        specs=item.likely_specs,
                        condition_summary=listing_data.get("condition_summary", item.condition_label),
                        defects_disclosure=listing_data.get("defects_disclosure", ""),
                        price_strategy=listing_data.get("price_strategy", 0.0),
                        price_min=listing_data.get("price_min", 0.0),
                        price_max=listing_data.get("price_max", 0.0),
                        images=optimized_images,
                    )
                    await store.set_listing(listing)
                    print(f"[PIPELINE]   [{i+1}] ✓ Listing: {listing.title}")
            except Exception as exc:
                print(f"[PIPELINE]   [{i+1}] ⚠ Asset optimization skipped: {exc}")

        results = await asyncio.gather(
            *[_process_item(i, item) for i, item in enumerate(items)],
            return_exceptions=True,
        )
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Processing failed for item %d: %s", i, result, exc_info=result)
        print(f"[PIPELINE] ✓ All {len(items)} items processed in {_time.time()-t2:.1f}s (concurrent)")

        await store.update_job_status(job_id, JobStatus.COMPLETED)
        print(f"[PIPELINE] ═══ Pipeline COMPLETE for job {job_id} ═══\n")

    except Exception as exc:
        print(f"[PIPELINE] ✗✗✗ Pipeline FAILED for job {job_id}: {exc}")
        import traceback
        traceback.print_exc()
        try:
            await store.update_job_status(job_id, JobStatus.FAILED, error=str(exc))
        except Exception:
            pass


async def _collect_route_bids(item: ItemCard) -> list[RouteBid]:
    from backend.models.route_bid import (
        EffortLevel,
        SpeedEstimate,
        TradeInQuote,
    )

    bids: list[RouteBid] = []

    import time as _time

    async def _safe(name: str, coro: Any) -> RouteBid | None:
        try:
            print(f"[BIDS]     ↳ Running {name}...")
            t = _time.time()
            result = await coro
            print(f"[BIDS]     ✓ {name} done in {_time.time()-t:.1f}s")
            return result
        except Exception as exc:
            print(f"[BIDS]     ✗ {name} FAILED: {exc}")
            import traceback
            traceback.print_exc()
            return None

    tasks: list[tuple[str, Any]] = [("marketplace", _bid_marketplace(item))]

    if item.is_electronics:
        tasks.append(("trade_in", _bid_trade_in(item)))

    if item.has_defects:
        tasks.append(("repair", _bid_repair(item)))

    tasks.append(("return", _bid_return(item)))

    print(f"[BIDS]     Launching {len(tasks)} bid tasks in parallel: {[t[0] for t in tasks]}")
    results = await asyncio.gather(*[_safe(name, coro) for name, coro in tasks])
    for result in results:
        if isinstance(result, RouteBid) and result.viable:
            bids.append(result)

    return bids


async def _bid_marketplace(item: ItemCard) -> RouteBid:
    from backend.services.gemini import GeminiService
    from backend.models.route_bid import EffortLevel, SpeedEstimate

    gemini = GeminiService()
    comparables = await gemini.search_live_comps(
        item_name=item.name_guess,
        category=item.category.value,
        condition=item.condition_label,
    )

    if not comparables:
        return RouteBid(
            item_id=item.item_id,
            route_type=RouteType.SELL_AS_IS,
            viable=False,
            explanation="No marketplace comparables found",
        )

    prices = [c.price for c in comparables if c.price > 0]
    avg = sum(prices) / len(prices) if prices else 0
    net = round(avg * 0.87, 2)
    platforms_found = list({c.platform for c in comparables})

    return RouteBid(
        item_id=item.item_id,
        route_type=RouteType.SELL_AS_IS,
        estimated_value=net,
        effort=EffortLevel.MODERATE,
        speed=SpeedEstimate.WEEK,
        confidence=min(len(comparables) / 5, 1.0),
        comparable_listings=comparables,
        explanation=f"Live search across {', '.join(platforms_found)}: {len(comparables)} comps, ~${net:.0f} net after fees",
    )


async def _bid_trade_in(item: ItemCard) -> RouteBid:
    from backend.models.route_bid import TradeInQuote, EffortLevel, SpeedEstimate

    providers = [
        TradeInQuote(provider="Apple Trade In", payout=round(65 + item.confidence * 30, 2), speed="3-5 days", effort="low", confidence=0.8),
        TradeInQuote(provider="Best Buy", payout=round(50 + item.confidence * 25, 2), speed="instant", effort="minimal", confidence=0.85),
        TradeInQuote(provider="Decluttr", payout=round(40 + item.confidence * 20, 2), speed="2-3 days", effort="low", confidence=0.9),
        TradeInQuote(provider="Gazelle", payout=round(45 + item.confidence * 22, 2), speed="5-7 days", effort="low", confidence=0.75),
    ]
    best = max(providers, key=lambda q: q.payout)
    return RouteBid(
        item_id=item.item_id,
        route_type=RouteType.TRADE_IN,
        estimated_value=best.payout,
        effort=EffortLevel.LOW,
        speed=SpeedEstimate.DAYS,
        confidence=best.confidence,
        trade_in_quotes=providers,
        explanation=f"Best trade-in: {best.provider} at ${best.payout:.2f}",
    )


async def _bid_repair(item: ItemCard) -> RouteBid:
    from backend.services.amazon_api import AmazonService
    from backend.models.route_bid import EffortLevel, SpeedEstimate

    amazon = AmazonService()
    defect_query = f"{item.name_guess} replacement {item.all_defects[0].description}"
    parts = await amazon.search_parts(defect_query)
    if not parts:
        return RouteBid(
            item_id=item.item_id,
            route_type=RouteType.REPAIR_THEN_SELL,
            viable=False,
            explanation="No repair parts found",
        )
    repair_cost = sum(p.part_price for p in parts[:2])
    as_is_estimate = 50.0
    post_repair_estimate = as_is_estimate + repair_cost + 25.0
    net_gain = post_repair_estimate - as_is_estimate - repair_cost
    return RouteBid(
        item_id=item.item_id,
        route_type=RouteType.REPAIR_THEN_SELL,
        estimated_value=round(post_repair_estimate * 0.87, 2),
        effort=EffortLevel.HIGH,
        speed=SpeedEstimate.WEEKS,
        confidence=0.6,
        repair_candidates=parts,
        repair_cost=round(repair_cost, 2),
        as_is_value=as_is_estimate,
        post_repair_value=round(post_repair_estimate, 2),
        net_gain_unlocked=round(net_gain, 2),
        explanation=f"${repair_cost:.0f} repair unlocks ${net_gain:.0f} more value",
    )


async def _bid_return(item: ItemCard) -> RouteBid:
    from backend.models.route_bid import EffortLevel, SpeedEstimate

    is_returnable = (
        item.condition_label == "Like New"
        and item.confidence > 0.7
        and not item.has_defects
    )
    return RouteBid(
        item_id=item.item_id,
        route_type=RouteType.RETURN,
        viable=is_returnable,
        estimated_value=round(item.confidence * 100, 2) if is_returnable else 0.0,
        effort=EffortLevel.MINIMAL,
        speed=SpeedEstimate.DAYS,
        confidence=0.7 if is_returnable else 0.1,
        return_window_open=is_returnable,
        explanation="Item appears new/unused — return likely viable" if is_returnable else "Item shows wear, return unlikely",
    )


def _decide_best_route(
    item_id: str, bids: list[RouteBid]
) -> BestRouteDecision:
    viable = [b for b in bids if b.viable]
    if not viable:
        return BestRouteDecision(
            item_id=item_id,
            best_route=RouteType.NO_ACTION,
            route_reason="No viable routes found",
            alternatives=bids,
        )

    def _score(bid: RouteBid) -> float:
        effort_map = {"minimal": 1.0, "low": 0.8, "moderate": 0.5, "high": 0.2}
        speed_map = {"instant": 1.0, "days": 0.8, "week": 0.5, "weeks": 0.3, "month_plus": 0.1}
        value_norm = bid.estimated_value / max(b.estimated_value for b in viable) if viable else 0
        return (
            0.45 * value_norm
            + 0.25 * bid.confidence
            + 0.15 * effort_map.get(bid.effort.value, 0.5)
            + 0.15 * speed_map.get(bid.speed.value, 0.5)
        )

    scored = sorted(viable, key=_score, reverse=True)
    winner = scored[0]

    return BestRouteDecision(
        item_id=item_id,
        best_route=winner.route_type,
        estimated_best_value=winner.estimated_value,
        effort=winner.effort,
        speed=winner.speed,
        winning_bid=winner,
        route_reason=winner.explanation,
        route_explanation_short=f"{winner.route_type.value.replace('_', ' ').title()} wins — ${winner.estimated_value:.0f}",
        route_explanation_detailed=f"Chose {winner.route_type.value} with estimated ${winner.estimated_value:.2f} "
            f"(confidence {winner.confidence:.0%}, effort {winner.effort.value}, speed {winner.speed.value}). "
            f"{winner.explanation}",
        alternatives=bids,
    )


async def run_execution(job_id: str, item_id: str, platforms: list[str]) -> None:
    try:
        await store.update_job_status(job_id, JobStatus.EXECUTING)

        listing = store.get_listing(item_id)
        if not listing:
            logger.error("No listing package for item %s", item_id)
            return

        from backend.systems.execution import ExecutionSystem

        executor = ExecutionSystem()
        await executor.execute(listing, platforms)
        await store.update_job_status(job_id, JobStatus.COMPLETED)
    except Exception as exc:
        logger.exception("Execution failed for item %s: %s", item_id, exc)
        try:
            await store.update_job_status(job_id, JobStatus.FAILED, error=str(exc))
        except Exception:
            pass


# ── Static File Mounts ───────────────────────────────────────────────────────

settings.ensure_dirs()

for _mount, _directory in [
    ("/frames", settings.frames_dir),
    ("/optimized", settings.optimized_dir),
    ("/uploads", settings.upload_dir),
]:
    Path(_directory).mkdir(parents=True, exist_ok=True)
    app.mount(_mount, StaticFiles(directory=_directory), name=_mount.lstrip("/"))

_phone_dir = Path("frontend/phone")
if _phone_dir.is_dir():
    app.mount("/phone", StaticFiles(directory=str(_phone_dir), html=True), name="phone")

_mac_dist = Path("frontend/mac/dist")
if _mac_dist.is_dir():
    app.mount(
        "/", StaticFiles(directory=str(_mac_dist), html=True), name="mac-dashboard"
    )
