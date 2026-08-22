"""Billing configuration — feature-detect Stripe; stay declared/stub otherwise."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class BillingConfig:
    require_credit: bool
    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_holomath_price_id: str
    public_base_url: str
    credits_db_path: str
    holor4d_api_key: str
    allow_stub_pay: bool
    # Billing Meter (usage after successful read) — complementary to prepaid credits
    meter_enabled: bool
    stripe_meter_event: str
    stripe_default_customer_id: str
    meter_sync_flush: bool
    meter_fail_closed: bool

    @property
    def stripe_configured(self) -> bool:
        return bool(
            self.stripe_secret_key
            and self.stripe_webhook_secret
            and self.stripe_holomath_price_id
        )

    @property
    def meter_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.meter_enabled)

    @property
    def billing_status(self) -> str:
        """Honest status tag — never claim live without real Stripe credentials."""
        if self.stripe_configured:
            return (
                "stripe_test_ready"
                if self.stripe_secret_key.startswith("sk_test_")
                else "stripe_live_ready"
            )
        if self.meter_enabled and not self.stripe_secret_key:
            return "declared"
        return "declared"


@lru_cache(maxsize=1)
def get_billing_config() -> BillingConfig:
    return BillingConfig(
        require_credit=os.environ.get("REQUIRE_CREDIT", "0").strip().lower()
        in ("1", "true", "yes"),
        stripe_secret_key=(os.environ.get("STRIPE_SECRET_KEY") or "").strip(),
        stripe_webhook_secret=(os.environ.get("STRIPE_WEBHOOK_SECRET") or "").strip(),
        stripe_holomath_price_id=(os.environ.get("STRIPE_HOLOMATH_PRICE_ID") or "").strip(),
        public_base_url=(
            os.environ.get("PUBLIC_BASE_URL") or "http://localhost:8792"
        ).rstrip("/"),
        credits_db_path=(
            os.environ.get("SPATIAL_CREDITS_DB")
            or os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "data",
                "spatial_credits.sqlite3",
            )
        ),
        holor4d_api_key=(os.environ.get("HOLOR4D_API_KEY") or "").strip(),
        allow_stub_pay=os.environ.get("ALLOW_STUB_PAY", "0").strip().lower()
        in ("1", "true", "yes"),
        meter_enabled=os.environ.get("STRIPE_METER_ENABLED", "0").strip().lower()
        in ("1", "true", "yes"),
        stripe_meter_event=(
            os.environ.get("STRIPE_METER_EVENT") or "successful_read"
        ).strip(),
        stripe_default_customer_id=(
            os.environ.get("STRIPE_DEFAULT_CUSTOMER_ID") or ""
        ).strip(),
        meter_sync_flush=os.environ.get("METER_SYNC_FLUSH", "0").strip().lower()
        in ("1", "true", "yes"),
        meter_fail_closed=os.environ.get("METER_FAIL_CLOSED", "0").strip().lower()
        in ("1", "true", "yes"),
    )


def reset_billing_config_cache() -> None:
    get_billing_config.cache_clear()
