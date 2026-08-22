"""Optional Stripe Checkout + webhook helpers (no network in unit tests)."""

from __future__ import annotations

from typing import Any, Optional

from .config import BillingConfig


class StripeNotConfigured(RuntimeError):
    pass


def _import_stripe():
    try:
        import stripe  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise StripeNotConfigured(
            "stripe package not installed; pip install stripe"
        ) from e
    return stripe


def create_checkout_session(
    cfg: BillingConfig,
    *,
    pending_credit_id: str,
    idempotency_key: str,
) -> dict[str, Any]:
    """
    Create Stripe Checkout Session (mode=payment) for one HoloMath Spatial Credit.
    Requires STRIPE_* env vars. Raises StripeNotConfigured in stub mode.
    """
    if not cfg.stripe_configured:
        raise StripeNotConfigured("Stripe credentials missing — stub mode")

    stripe = _import_stripe()
    stripe.api_key = cfg.stripe_secret_key

    success_url = (
        f"{cfg.public_base_url}/v1/billing/success"
        "?session_id={CHECKOUT_SESSION_ID}"
    )
    cancel_url = f"{cfg.public_base_url}/v1/billing/cancel"

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": cfg.stripe_holomath_price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "product": "holomath_spatial_read",
            "credits": "1",
            "pending_credit_id": pending_credit_id,
        },
        idempotency_key=idempotency_key,
    )
    return {
        "id": session["id"],
        "url": session["url"],
        "payment_status": session.get("payment_status"),
    }


def construct_webhook_event(
    cfg: BillingConfig,
    payload: bytes,
    sig_header: str,
) -> Any:
    """Verify Stripe-Signature over raw body. Raises ValueError/SignatureVerificationError."""
    if not cfg.stripe_webhook_secret:
        raise StripeNotConfigured("STRIPE_WEBHOOK_SECRET not set")

    stripe = _import_stripe()
    return stripe.Webhook.construct_event(
        payload, sig_header, cfg.stripe_webhook_secret
    )


def session_metadata(session: Any) -> dict[str, str]:
    meta = getattr(session, "metadata", None) or {}
    if hasattr(meta, "to_dict"):
        meta = meta.to_dict()
    return {str(k): str(v) for k, v in dict(meta).items()}


def session_is_paid(session: Any) -> bool:
    status = getattr(session, "payment_status", None) or (
        session.get("payment_status") if isinstance(session, dict) else None
    )
    return status == "paid"


def extract_session_fields(session: Any) -> dict[str, Optional[str]]:
    if isinstance(session, dict):
        sid = session.get("id")
        amount = session.get("amount_total")
        currency = session.get("currency")
        meta = session.get("metadata") or {}
    else:
        sid = getattr(session, "id", None)
        amount = getattr(session, "amount_total", None)
        currency = getattr(session, "currency", None)
        meta = session_metadata(session)
    return {
        "session_id": sid,
        "amount_total": amount,
        "currency": currency,
        "pending_credit_id": (meta or {}).get("pending_credit_id"),
        "product": (meta or {}).get("product"),
        "credits": (meta or {}).get("credits"),
    }
