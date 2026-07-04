"""Payment helpers — QR generation from a UPI ID or fallback to an uploaded QR image."""
import base64
import io
import re
from typing import Optional

import qrcode

UPI_ID_REGEX = re.compile(r"^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9.\-_]{1,}$")


def is_valid_upi_id(upi_id: str) -> bool:
    return bool(UPI_ID_REGEX.match((upi_id or "").strip()))


def upi_payment_uri(upi_id: str, payee_name: Optional[str] = None) -> str:
    parts = [f"upi://pay?pa={upi_id.strip()}"]
    if payee_name:
        parts.append(f"pn={payee_name.strip().replace(' ', '%20')}")
    parts.append("cu=INR")
    return "&".join(parts)


def qr_png_from_upi(upi_id: str, payee_name: Optional[str] = None) -> bytes:
    """Return PNG bytes for a UPI QR."""
    uri = upi_payment_uri(upi_id, payee_name)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0A2540", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def decode_uploaded_qr(data_url_or_b64: str) -> bytes:
    """Accept 'data:image/png;base64,...' or raw base64; return decoded bytes."""
    if not data_url_or_b64:
        raise ValueError("Empty QR payload")
    payload = data_url_or_b64.split(",", 1)[1] if data_url_or_b64.startswith("data:") else data_url_or_b64
    return base64.b64decode(payload)
