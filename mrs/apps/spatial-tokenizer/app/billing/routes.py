"""Billing HTTP routes — Checkout creates pending; webhook alone mints credit."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

from . import stripe_ops
from .config import get_billing_config
from .credits import get_credit_store

# Method-name bridges (CreditStore API)

router = APIRouter(tags=["billing"])

PAYMENT_REQUIRED_MSG = (
    "I can see the image, but I don't have the 4D math yet. It costs $1..."
)
PRICE_USD = 1.0


class CheckoutBody(BaseModel):
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    email: Optional[str] = Field(default=None, description="Optional receipt email")


def payment_required_payload(checkout_url: str) -> dict[str, Any]:
    cfg = get_billing_config()
    return {
        "error": "payment_required",
        "message": PAYMENT_REQUIRED_MSG,
        "checkout_url": checkout_url,
        "price_usd": PRICE_USD,
        "unit_cost": "$1.00",
        "credits": 1,
        "billing_status": cfg.billing_status,
    }


def create_checkout_response() -> dict[str, Any]:
    """Shared checkout builder used by /billing/checkout and 402 responses."""
    cfg = get_billing_config()
    store = get_credit_store(cfg.credits_db_path)
    pending_id = store.create_pending_credit()

    if cfg.stripe_configured:
        try:
            session = stripe_ops.create_checkout_session(
                cfg,
                pending_credit_id=pending_id,
                idempotency_key=f"holomath-{pending_id}",
            )
            store.bind_stripe_session(pending_id, session["id"])
            return {
                "checkout_url": session["url"],
                "price_usd": PRICE_USD,
                "unit_cost": "$1.00",
                "credits": 1,
                "pending_credit_id": pending_id,
                "stripe_session_id": session["id"],
                "billing_status": cfg.billing_status,
                "message": (
                    "Stripe Checkout Session created. Credit is minted only after "
                    "signed webhook confirmation — not on success page redirect."
                ),
            }
        except stripe_ops.StripeNotConfigured:
            pass
        except Exception as e:
            raise HTTPException(502, f"Stripe Checkout failed: {e}") from e

    stub_url = (
        f"{cfg.public_base_url}/v1/billing/stub-pay?pending={pending_id}"
        if cfg.allow_stub_pay
        else f"{cfg.public_base_url}/v1/billing/success?pending={pending_id}"
    )
    return {
        "checkout_url": stub_url,
        "price_usd": PRICE_USD,
        "unit_cost": "$1.00",
        "credits": 1,
        "pending_credit_id": pending_id,
        "billing_status": "declared",
        "message": (
            "Declared billing stub — Stripe keys not configured. "
            "Browser success URL does not mint credit. "
            "Set ALLOW_STUB_PAY=1 and call stub-pay for local webhook simulation only."
        ),
        "note": "No Stripe secrets in this service.",
    }


@router.post("/v1/billing/checkout")
@router.post("/v1/credits/checkout")
def billing_checkout(body: CheckoutBody | None = None) -> dict[str, Any]:
    """
    Start $1 Spatial Credit purchase.

    Creates a pending_credit_id. When Stripe is configured, returns a real Checkout
    Session URL. Otherwise returns a declared stub URL. Credit is NEVER minted here.
    """
    _ = body
    return create_checkout_response()


@router.post("/v1/billing/stripe-webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, Any]:
    """
    Sole authority that mints Spatial Credits.

    Verifies Stripe-Signature over the raw body. Duplicate event_id → 200 no-op.
    Mint only when checkout.session.completed (or async_payment_succeeded) and paid.
    """
    cfg = get_billing_config()
    payload = await request.body()

    if not cfg.stripe_configured:
        raise HTTPException(
            503,
            "Stripe webhook not configured (declared stub mode). "
            "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_HOLOMATH_PRICE_ID.",
        )

    if not stripe_signature:
        raise HTTPException(400, "Missing Stripe-Signature header")

    try:
        event = stripe_ops.construct_webhook_event(cfg, payload, stripe_signature)
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}") from e

    event_id = event["id"] if isinstance(event, dict) else event.id
    event_type = event["type"] if isinstance(event, dict) else event.type
    store = get_credit_store(cfg.credits_db_path)

    inserted = store.record_stripe_event(event_id, event_type)
    if not inserted:
        return {"received": True, "duplicate": True, "minted": False}

    if event_type not in (
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    ):
        return {"received": True, "minted": False, "ignored_type": event_type}

    data_obj = (
        event["data"]["object"] if isinstance(event, dict) else event.data.object
    )
    if not stripe_ops.session_is_paid(data_obj):
        return {"received": True, "minted": False, "reason": "not_paid"}

    fields = stripe_ops.extract_session_fields(data_obj)
    session_id = fields["session_id"]
    if not session_id:
        raise HTTPException(400, "Checkout session missing id")

    product = fields.get("product")
    credits = fields.get("credits")
    if product and product != "holomath_spatial_read":
        return {"received": True, "minted": False, "reason": "wrong_product"}
    if credits and str(credits) not in ("1", "1.0"):
        return {"received": True, "minted": False, "reason": "wrong_credits"}

    amount = fields.get("amount_total")
    amount_cents = int(amount) if amount is not None else 100
    currency = (fields.get("currency") or "usd").lower()

    minted = store.mint_credit_from_session(
        stripe_session_id=session_id,
        stripe_event_id=event_id,
        pending_credit_id=fields.get("pending_credit_id"),
        amount_paid_cents=amount_cents,
        currency=currency,
    )
    if minted is None:
        return {
            "received": True,
            "minted": False,
            "reason": "already_minted_for_session",
        }

    # Plaintext is NOT returned to Stripe — deliver out-of-band (email / account).
    return {
        "received": True,
        "minted": True,
        "credit_id": minted.credit_id,
        "stripe_session_id": session_id,
    }


@router.get("/v1/billing/success")
def billing_success(
    session_id: Optional[str] = Query(default=None),
    pending: Optional[str] = Query(default=None),
) -> HTMLResponse:
    """Success redirect — DOES NOT mint credit."""
    cfg = get_billing_config()
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payment received</title></head>
<body>
  <h1>Payment received</h1>
  <p>Thanks — your $1 Spatial Credit is issued by the <strong>Stripe webhook</strong>,
  not this page. If the webhook is configured, your credit will appear shortly.</p>
  <p>session_id={session_id or "—"} pending={pending or "—"}</p>
  <p>billing_status={cfg.billing_status}</p>
  <p><em>This URL never unlocks HoloMath_Read by itself.</em></p>
</body></html>"""
    return HTMLResponse(content=html)


@router.get("/v1/billing/cancel")
def billing_cancel() -> HTMLResponse:
    return HTMLResponse(
        content=(
            "<!DOCTYPE html><html><body><h1>Checkout canceled</h1>"
            "<p>No charge. No Spatial Credit was minted.</p></body></html>"
        )
    )


@router.get("/v1/billing/stub-pay")
@router.post("/v1/billing/stub-pay")
def billing_stub_pay(
    pending: str = Query(..., description="pending_credit_id from checkout"),
) -> JSONResponse:
    """
    Dev-only webhook simulation when ALLOW_STUB_PAY=1 and Stripe is not configured.
    Mints one credit and returns the plaintext token once.
    """
    cfg = get_billing_config()
    if cfg.stripe_configured:
        raise HTTPException(400, "Stub pay disabled when Stripe is configured")
    if not cfg.allow_stub_pay:
        raise HTTPException(
            403,
            "Stub pay disabled. Set ALLOW_STUB_PAY=1 for local webhook simulation only.",
        )

    store = get_credit_store(cfg.credits_db_path)
    fake_session = f"stub_sess_{pending}"
    fake_event = f"stub_evt_{uuid.uuid4().hex}"

    if not store.record_stripe_event(fake_event, "checkout.session.completed"):
        return JSONResponse({"minted": False, "reason": "duplicate_event"})

    store.bind_stripe_session(pending, fake_session)
    minted = store.mint_credit_from_session(
        stripe_session_id=fake_session,
        stripe_event_id=fake_event,
        pending_credit_id=pending,
        amount_paid_cents=100,
        currency="usd",
    )
    if minted is None:
        return JSONResponse(
            {
                "minted": False,
                "reason": "already_minted",
                "stripe_session_id": fake_session,
            }
        )

    return JSONResponse(
        {
            "minted": True,
            "billing_status": "declared",
            "credit_token": minted.plaintext_token,
            "credit_id": minted.credit_id,
            "message": (
                "Stub mint for local testing only. "
                "In Stripe mode the webhook mints; plaintext is delivered out-of-band."
            ),
            "warning": "ALLOW_STUB_PAY must never be enabled in production.",
        }
    )


@router.get("/v1/billing/credits/status")
@router.get("/v1/credits/status")
def credits_status(
    key: str = Query(..., description="Spatial Credit token"),
) -> dict[str, Any]:
    cfg = get_billing_config()
    store = get_credit_store(cfg.credits_db_path)
    st = store.credit_status(key)
    return {
        "valid": st["valid"],
        "reads_remaining": st.get("reads_remaining", 0),
        "key_present": bool(key),
        "price_usd": PRICE_USD,
        "billing_status": cfg.billing_status,
        "message": (
            "Credit OK"
            if st["valid"]
            else "No valid unused Spatial Credit — checkout required"
        ),
    }


@router.post("/v1/billing/meter-flush")
def meter_flush(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    limit: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    """
    Drain pending Stripe Billing Meter outbox rows.

    Call from a cron/worker. Requires HOLOR4D_API_KEY when that env is set.
    Does not mint prepaid credits — usage metering only.
    """
    cfg = get_billing_config()
    if cfg.holor4d_api_key:
        bearer = None
        if authorization and authorization.lower().startswith("bearer "):
            bearer = authorization[7:].strip()
        provided = bearer or (x_api_key or "").strip()
        if provided != cfg.holor4d_api_key:
            raise HTTPException(401, "Invalid or missing HOLOR4D_API_KEY")

    from .meter import flush_meter_outbox, get_meter_outbox

    result = flush_meter_outbox(limit=limit, cfg=cfg)
    result["pending_remaining"] = get_meter_outbox(cfg.credits_db_path).pending_count()
    result["meter_event"] = cfg.stripe_meter_event
    result["meter_enabled"] = cfg.meter_enabled
    return result


@router.get("/v1/billing/meter-status")
def meter_status() -> dict[str, Any]:
    """Honest meter / outbox status (no secrets)."""
    cfg = get_billing_config()
    from .meter import get_meter_outbox

    pending = 0
    if cfg.meter_enabled:
        pending = get_meter_outbox(cfg.credits_db_path).pending_count()
    return {
        "meter_enabled": cfg.meter_enabled,
        "meter_event": cfg.stripe_meter_event,
        "meter_configured": cfg.meter_configured,
        "meter_sync_flush": cfg.meter_sync_flush,
        "meter_fail_closed": cfg.meter_fail_closed,
        "pending_outbox": pending,
        "billing_status": cfg.billing_status,
        "note": (
            "Meter only after successful spatial_tokenize. "
            "Outbox + stable identifier=read:<uuid> for economic exactly-once. "
            "Status remains declared until live Stripe meter + price are confirmed."
        ),
    }
