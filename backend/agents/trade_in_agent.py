from __future__ import annotations

import hashlib

from uagents import Agent, Context, Protocol

from backend.config import settings
from backend.models.item_card import ItemCard, ItemCategory
from backend.models.route_bid import (
    EffortLevel,
    RouteBid,
    RouteType,
    SpeedEstimate,
    TradeInQuote,
)
from backend.protocols.messages import (
    DelegationRequest,
    DelegationResponse,
    RouteBidRequest,
    RouteBidResponse,
)

trade_in_proto = Protocol(name="trade_in_evaluator", version="0.1.0")

_PROVIDERS: dict[str, dict] = {
    "Apple Trade In": {
        "brands": ["apple", "iphone", "ipad", "macbook", "airpods", "apple watch"],
        "multiplier": 0.40,
        "speed": "days",
        "effort": "low",
    },
    "Samsung Trade-In": {
        "brands": ["samsung", "galaxy"],
        "multiplier": 0.35,
        "speed": "days",
        "effort": "low",
    },
    "Best Buy Trade-In": {
        "brands": [],
        "multiplier": 0.30,
        "speed": "instant",
        "effort": "minimal",
    },
    "Decluttr": {
        "brands": [],
        "multiplier": 0.25,
        "speed": "week",
        "effort": "low",
    },
    "Gazelle": {
        "brands": [],
        "multiplier": 0.28,
        "speed": "week",
        "effort": "low",
    },
}


def _estimate_retail_price(item: ItemCard) -> float:
    """Deterministic rough retail estimate derived from item identity."""
    seed_val = int(hashlib.md5(item.name_guess.encode()).hexdigest()[:8], 16)
    base = 50 + (seed_val % 950)

    name_lower = item.name_guess.lower()
    if any(kw in name_lower for kw in ("pro", "max", "ultra")):
        base *= 1.5
    if any(kw in name_lower for kw in ("phone", "iphone", "galaxy", "pixel")):
        base = max(base, 200)
    if any(kw in name_lower for kw in ("laptop", "macbook", "notebook")):
        base = max(base, 400)
    if any(kw in name_lower for kw in ("watch", "buds", "earbuds", "airpods")):
        base = max(base, 80)

    return round(base, 2)


def _condition_multiplier(item: ItemCard) -> float:
    if not item.has_defects:
        return 1.0
    major = sum(1 for d in item.all_defects if d.severity == "major")
    return 0.5 if major else 0.75


@trade_in_proto.on_message(model=RouteBidRequest, replies={RouteBidResponse})
async def handle_route_bid(ctx: Context, sender: str, msg: RouteBidRequest):
    ctx.logger.info(f"Evaluating trade-in for job {msg.job_id}")
    item = ItemCard.model_validate_json(msg.item_card_json)

    if not item.is_electronics:
        bid = RouteBid(
            item_id=item.item_id,
            route_type=RouteType.TRADE_IN,
            viable=False,
            confidence=0.95,
            explanation=f"Trade-in not applicable for {item.category.value} items",
        )
        await ctx.send(
            sender,
            RouteBidResponse(
                job_id=msg.job_id,
                item_id=item.item_id,
                route_type=RouteType.TRADE_IN.value,
                bid_json=bid.model_dump_json(),
            ),
        )
        return

    retail = _estimate_retail_price(item)
    cond_mult = _condition_multiplier(item)
    name_lower = item.name_guess.lower()

    quotes: list[TradeInQuote] = []
    for provider_name, cfg in _PROVIDERS.items():
        brand_match = not cfg["brands"] or any(b in name_lower for b in cfg["brands"])
        if not brand_match:
            continue
        payout = round(retail * cfg["multiplier"] * cond_mult, 2)
        quotes.append(
            TradeInQuote(
                provider=provider_name,
                payout=payout,
                speed=cfg["speed"],
                effort=cfg["effort"],
                confidence=0.7 if brand_match else 0.4,
            )
        )

    if not quotes:
        quotes.append(
            TradeInQuote(
                provider="Decluttr",
                payout=round(retail * 0.20 * cond_mult, 2),
                speed="week",
                effort="low",
                confidence=0.5,
            )
        )

    best_quote = max(quotes, key=lambda q: q.payout)

    bid = RouteBid(
        item_id=item.item_id,
        route_type=RouteType.TRADE_IN,
        viable=True,
        estimated_value=best_quote.payout,
        effort=EffortLevel.LOW,
        speed=SpeedEstimate.DAYS,
        confidence=best_quote.confidence,
        explanation=f"Best trade-in: {best_quote.provider} @ ${best_quote.payout:.2f}",
        trade_in_quotes=quotes,
    )

    await ctx.send(
        sender,
        RouteBidResponse(
            job_id=msg.job_id,
            item_id=item.item_id,
            route_type=RouteType.TRADE_IN.value,
            bid_json=bid.model_dump_json(),
        ),
    )


@trade_in_proto.on_message(model=DelegationRequest, replies={DelegationResponse})
async def handle_delegation(ctx: Context, sender: str, msg: DelegationRequest):
    ctx.logger.info(f"Delegation from {msg.from_agent} for item {msg.item_id}: {msg.reason}")
    item = ItemCard.model_validate_json(msg.payload_json)

    if not item.is_electronics:
        bid = RouteBid(
            item_id=item.item_id,
            route_type=RouteType.TRADE_IN,
            viable=False,
            confidence=0.95,
            explanation=f"Trade-in not applicable for {item.category.value} items",
        )
        await ctx.send(sender, DelegationResponse(
            from_agent="trade_in_agent",
            job_id=msg.job_id,
            item_id=msg.item_id,
            result_json=bid.model_dump_json(),
            confidence=bid.confidence,
        ))
        return

    retail = _estimate_retail_price(item)
    cond_mult = _condition_multiplier(item)
    name_lower = item.name_guess.lower()

    quotes: list[TradeInQuote] = []
    for provider_name, cfg in _PROVIDERS.items():
        brand_match = not cfg["brands"] or any(b in name_lower for b in cfg["brands"])
        if not brand_match:
            continue
        payout = round(retail * cfg["multiplier"] * cond_mult, 2)
        quotes.append(
            TradeInQuote(
                provider=provider_name,
                payout=payout,
                speed=cfg["speed"],
                effort=cfg["effort"],
                confidence=0.7 if brand_match else 0.4,
            )
        )

    if not quotes:
        quotes.append(
            TradeInQuote(
                provider="Decluttr",
                payout=round(retail * 0.20 * cond_mult, 2),
                speed="week",
                effort="low",
                confidence=0.5,
            )
        )

    best_quote = max(quotes, key=lambda q: q.payout)

    bid = RouteBid(
        item_id=item.item_id,
        route_type=RouteType.TRADE_IN,
        viable=True,
        estimated_value=best_quote.payout,
        effort=EffortLevel.LOW,
        speed=SpeedEstimate.DAYS,
        confidence=best_quote.confidence,
        explanation=f"Best trade-in: {best_quote.provider} @ ${best_quote.payout:.2f}",
        trade_in_quotes=quotes,
    )

    await ctx.send(sender, DelegationResponse(
        from_agent="trade_in_agent",
        job_id=msg.job_id,
        item_id=msg.item_id,
        result_json=bid.model_dump_json(),
        confidence=bid.confidence,
    ))


def create_trade_in_agent() -> Agent:
    agent = Agent(
        name="trade_in_agent",
        seed=settings.trade_in_agent_seed,
        port=8103,
    )
    agent.include(trade_in_proto)
    return agent
