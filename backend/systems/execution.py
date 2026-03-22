from __future__ import annotations

import logging

from backend.adapters.base import PlatformAdapter
from backend.models.listing_package import ListingPackage, PlatformListing, PlatformStatus
from backend.storage.store import store

logger = logging.getLogger(__name__)


class ExecutionSystem:
    def __init__(self, adapters: dict[str, PlatformAdapter] | None = None) -> None:
        self._adapters: dict[str, PlatformAdapter] = adapters or {}

    def register_adapter(self, name: str, adapter: PlatformAdapter) -> None:
        self._adapters[name] = adapter

    async def execute(
        self,
        package: ListingPackage,
        platforms: list[str],
    ) -> ListingPackage:
        for platform in platforms:
            try:
                if platform == "ebay":
                    pl = await self._execute_ebay(package)
                elif platform == "mercari":
                    pl = await self._execute_mercari(package)
                else:
                    adapter = self._adapters.get(platform)
                    if adapter is None:
                        logger.warning("No adapter registered for platform=%s", platform)
                        pl = PlatformListing(
                            platform=platform,
                            status=PlatformStatus.SKIPPED,
                            error=f"No adapter for {platform}",
                        )
                    else:
                        pl = await adapter.create_draft(package)
                        pl = await adapter.publish(pl)

                package.platform_listings.append(pl)
                await store.set_listing(package)

            except Exception:
                logger.exception("Execution failed for platform=%s", platform)
                package.platform_listings.append(PlatformListing(
                    platform=platform,
                    status=PlatformStatus.FAILED,
                    error=f"Execution error on {platform}",
                ))

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
