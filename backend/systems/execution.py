from __future__ import annotations

import asyncio
import logging

from backend.adapters.base import PlatformAdapter
from backend.models.listing_package import ListingPackage, PlatformListing, PlatformStatus
from backend.storage.store import store

logger = logging.getLogger(__name__)


class ExecutionSystem:
    """Publishes listings to multiple platforms concurrently.

    Execution flow (concurrent):
      asyncio.gather(*[_execute_single(p) for p in platforms])
          ↓
      Collect PlatformListing results (or exceptions)
          ↓
      Append all results to package.platform_listings sequentially
          ↓
      Single store.set_listing() call at the end
    """

    def __init__(self, adapters: dict[str, PlatformAdapter] | None = None) -> None:
        self._adapters: dict[str, PlatformAdapter] = adapters or {}

    def register_adapter(self, name: str, adapter: PlatformAdapter) -> None:
        self._adapters[name] = adapter

    async def execute(
        self,
        package: ListingPackage,
        platforms: list[str],
    ) -> ListingPackage:
        async def _execute_single(platform: str) -> PlatformListing:
            if platform == "ebay":
                return await self._execute_ebay(package)
            elif platform == "mercari":
                return await self._execute_mercari(package)
            else:
                adapter = self._adapters.get(platform)
                if adapter is None:
                    logger.warning("No adapter registered for platform=%s", platform)
                    return PlatformListing(
                        platform=platform,
                        status=PlatformStatus.SKIPPED,
                        error=f"No adapter for {platform}",
                    )
                draft = await adapter.create_draft(package)
                return await adapter.publish(draft)

        # Run all platforms concurrently, catch per-platform exceptions
        results = await asyncio.gather(
            *[_execute_single(p) for p in platforms],
            return_exceptions=True,
        )

        # Append results sequentially to avoid race conditions on the list
        for platform, result in zip(platforms, results):
            if isinstance(result, Exception):
                logger.error("Execution failed for platform=%s: %s", platform, result, exc_info=result)
                package.platform_listings.append(PlatformListing(
                    platform=platform,
                    status=PlatformStatus.FAILED,
                    error=f"Execution error on {platform}",
                ))
            else:
                package.platform_listings.append(result)

        await store.set_listing(package)
        return package

    async def _execute_ebay(self, package: ListingPackage) -> PlatformListing:
        adapter = self._adapters.get("ebay")
        if adapter is None:
            from backend.adapters.ebay import EbayAdapter
            adapter = EbayAdapter()
            self._adapters["ebay"] = adapter

        try:
            draft = await adapter.create_draft(package)
            published = await adapter.publish(draft)
            logger.info(
                "eBay listing live: listing_id=%s for item=%s",
                published.platform_listing_id,
                package.item_id,
            )
            return published
        except Exception:
            logger.exception("eBay execution failed for item=%s", package.item_id)
            return PlatformListing(
                platform="ebay",
                status=PlatformStatus.FAILED,
                error="eBay listing creation failed",
            )

    async def _execute_mercari(self, package: ListingPackage) -> PlatformListing:
        adapter = self._adapters.get("mercari")
        if adapter is None:
            from backend.adapters.mercari import MercariImportAdapter
            adapter = MercariImportAdapter()
            self._adapters["mercari"] = adapter

        try:
            draft = await adapter.create_draft(package)
            logger.info(
                "Mercari import CSV prepared for item=%s",
                package.item_id,
            )
            return draft
        except Exception:
            logger.exception("Mercari execution failed for item=%s", package.item_id)
            return PlatformListing(
                platform="mercari",
                status=PlatformStatus.FAILED,
                error="Mercari CSV generation failed",
            )
