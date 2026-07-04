"""LYRO payment QR feature tests (Settings + Monthly Report footer)."""
import base64
import io
import os
import time
import uuid
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lyro-progress.preview.emergentagent.com").rstrip("/")

DEMO_EMAIL = "owner@lyro.demo"
DEMO_PASS = "demo1234"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _register(email, password, center_name="TEST_QA_Center"):
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": password, "center_name": center_name}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _make_png_100(color=(255, 0, 0, 255)) -> str:
    """Return 'data:image/png;base64,....' for a 100x100 PNG."""
    try:
        from PIL import Image
        img = Image.new("RGBA", (100, 100), color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/png;base64,{b}"
    except Exception:
        # Fallback: hand-rolled minimal png (1x1) — still valid PNG for endpoint
        raw = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        return "data:image/png;base64," + base64.b64encode(raw).decode()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def demo_ctx():
    data = _login(DEMO_EMAIL, DEMO_PASS)
    return {
        "token": data["token"],
        "center_id": data["center"]["id"],
        "hdr": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def fresh_owner():
    email = f"qa{int(time.time())}_{uuid.uuid4().hex[:6]}@lyroqa.io"
    data = _register(email, "password123", center_name=f"TEST_QA_{uuid.uuid4().hex[:4]}")
    return {
        "email": email,
        "token": data["token"],
        "center_id": data["center"]["id"],
        "hdr": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module", autouse=True)
def _cleanup_demo_payment(demo_ctx):
    """Ensure demo owner starts clean; restore-clean at teardown."""
    # Snapshot initial state (leave alone if already configured by prior run)
    r = requests.get(f"{BASE_URL}/api/settings/payment", headers=demo_ctx["hdr"], timeout=30)
    yield
    # Reset demo owner to unconfigured after all tests run (idempotent)
    requests.post(
        f"{BASE_URL}/api/settings/payment",
        json={"upi_id": "", "payee_name": "", "qr_image_base64": ""},
        headers=demo_ctx["hdr"], timeout=30,
    )


# ---------- 1. Fresh state / GET /api/settings/payment ----------
class TestPaymentFreshState:
    def test_fresh_owner_unconfigured(self, fresh_owner):
        r = requests.get(f"{BASE_URL}/api/settings/payment", headers=fresh_owner["hdr"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is False
        assert d["qr_url"] is None
        assert d["has_qr_image"] is False
        assert d["upi_id"] is None

    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/settings/payment", timeout=30)
        assert r.status_code == 401


# ---------- 2. Save UPI ID ----------
class TestPaymentUPI:
    def test_save_valid_upi(self, demo_ctx):
        # Start clean
        requests.post(f"{BASE_URL}/api/settings/payment",
                      json={"upi_id": "", "qr_image_base64": ""},
                      headers=demo_ctx["hdr"], timeout=30)

        payload = {"upi_id": "lyrocenter@ybl", "payee_name": "LYRO Demo Coaching"}
        r = requests.post(f"{BASE_URL}/api/settings/payment", json=payload, headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        assert d["has_qr_image"] is False
        assert d["upi_id"] == "lyrocenter@ybl"
        assert d["payee_name"] == "LYRO Demo Coaching"
        assert isinstance(d["qr_url"], str)
        assert d["qr_url"].endswith(f"/api/centers/{demo_ctx['center_id']}/payment-qr.png") or \
               f"/api/centers/{demo_ctx['center_id']}/payment-qr.png?" in d["qr_url"]

    def test_qr_url_uses_https_in_public(self, demo_ctx):
        r = requests.get(f"{BASE_URL}/api/settings/payment", headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200
        # When testing via public URL, qr_url should be https
        if BASE_URL.startswith("https://"):
            assert r.json()["qr_url"].startswith("https://"), r.json()["qr_url"]

    def test_invalid_upi_400(self, demo_ctx):
        r = requests.post(f"{BASE_URL}/api/settings/payment",
                          json={"upi_id": "not-a-upi"}, headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 400
        assert "UPI" in r.text or "upi" in r.text.lower()


# ---------- 3. QR image upload + priority ----------
class TestPaymentQRImage:
    def test_upload_qr_image(self, demo_ctx):
        # Ensure UPI already set from prior test - now upload image
        img_data_url = _make_png_100()
        r = requests.post(f"{BASE_URL}/api/settings/payment",
                          json={"qr_image_base64": img_data_url},
                          headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["has_qr_image"] is True
        assert d["configured"] is True

    def test_image_takes_priority(self, demo_ctx):
        # Make sure UPI + image both set -> image is served
        # First set upi
        requests.post(f"{BASE_URL}/api/settings/payment",
                      json={"upi_id": "lyrocenter@ybl", "payee_name": "LYRO Demo Coaching"},
                      headers=demo_ctx["hdr"], timeout=30)
        # Then set image (should take priority when serving PNG)
        img_data_url = _make_png_100(color=(0, 255, 0, 255))
        r = requests.post(f"{BASE_URL}/api/settings/payment",
                          json={"qr_image_base64": img_data_url},
                          headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["has_qr_image"] is True
        assert d["upi_id"] == "lyrocenter@ybl"  # still set

        # Fetch PNG and compare size/prefix to know it's the uploaded 100x100 (not qrcode-gen output)
        png_r = requests.get(f"{BASE_URL}/api/centers/{demo_ctx['center_id']}/payment-qr.png", timeout=30)
        assert png_r.status_code == 200
        assert png_r.headers.get("content-type", "").startswith("image/png")
        # A 100x100 solid-color PNG is much smaller than a UPI qrcode output; assert bytes match what we uploaded
        expected = base64.b64decode(img_data_url.split(",", 1)[1])
        assert png_r.content == expected, "PNG served should be the uploaded image (image priority)"

    def test_clear_image(self, demo_ctx):
        r = requests.post(f"{BASE_URL}/api/settings/payment",
                          json={"qr_image_base64": ""}, headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["has_qr_image"] is False
        # still configured because upi still set
        assert d["configured"] is True


# ---------- 4. Public PNG endpoint ----------
class TestPaymentPNGEndpoint:
    def test_png_no_auth(self, demo_ctx):
        # demo owner has UPI set at this point
        r = requests.get(f"{BASE_URL}/api/centers/{demo_ctx['center_id']}/payment-qr.png", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_png_unconfigured_404(self, fresh_owner):
        r = requests.get(f"{BASE_URL}/api/centers/{fresh_owner['center_id']}/payment-qr.png", timeout=30)
        assert r.status_code == 404

    def test_png_bogus_center_404(self):
        r = requests.get(f"{BASE_URL}/api/centers/bogus-nonexistent-id-xyz/payment-qr.png", timeout=30)
        assert r.status_code == 404


# ---------- 5. Data isolation ----------
class TestPaymentIsolation:
    @pytest.fixture(autouse=True)
    def _ensure_demo_configured(self, demo_ctx):
        # Make each isolation test self-sufficient — set demo owner UPI up front
        requests.post(f"{BASE_URL}/api/settings/payment",
                      json={"upi_id": "lyrocenter@ybl", "payee_name": "LYRO Demo Coaching",
                            "qr_image_base64": ""},
                      headers=demo_ctx["hdr"], timeout=30)

    def test_fresh_owner_does_not_see_demo(self, demo_ctx, fresh_owner):
        # Confirm demo owner has payment configured
        r = requests.get(f"{BASE_URL}/api/settings/payment", headers=demo_ctx["hdr"], timeout=30)
        assert r.status_code == 200
        assert r.json()["configured"] is True

        # Fresh owner should still be unconfigured
        r2 = requests.get(f"{BASE_URL}/api/settings/payment", headers=fresh_owner["hdr"], timeout=30)
        assert r2.status_code == 200
        d = r2.json()
        assert d["configured"] is False
        assert d["qr_url"] is None
        assert d["upi_id"] is None
        assert d["has_qr_image"] is False

    def test_fresh_owner_save_isolated(self, demo_ctx, fresh_owner):
        # Fresh owner sets own upi -> only affects their center
        r = requests.post(f"{BASE_URL}/api/settings/payment",
                          json={"upi_id": "qafresh@okhdfc", "payee_name": "QA Fresh Center"},
                          headers=fresh_owner["hdr"], timeout=30)
        assert r.status_code == 200
        assert r.json()["upi_id"] == "qafresh@okhdfc"

        # Demo owner still has their original setting
        r2 = requests.get(f"{BASE_URL}/api/settings/payment", headers=demo_ctx["hdr"], timeout=30)
        assert r2.status_code == 200
        assert r2.json()["upi_id"] == "lyrocenter@ybl"

        # And demo's center PNG is served (still configured)
        p = requests.get(f"{BASE_URL}/api/centers/{demo_ctx['center_id']}/payment-qr.png", timeout=30)
        assert p.status_code == 200

        # Fresh owner's own PNG works too
        p2 = requests.get(f"{BASE_URL}/api/centers/{fresh_owner['center_id']}/payment-qr.png", timeout=30)
        assert p2.status_code == 200


# ---------- 6. Monthly report footer ----------
class TestMonthlyReportFooter:
    @pytest.fixture(scope="class")
    def student_setup(self, demo_ctx):
        """Fresh batch + student + current-month test/mark so monthly-report has data."""
        hdr = demo_ctx["hdr"]
        b = requests.post(f"{BASE_URL}/api/batches",
                          json={"name": f"TEST_Pay_{uuid.uuid4().hex[:6]}", "course": "JEE"},
                          headers=hdr, timeout=30).json()
        s = requests.post(f"{BASE_URL}/api/batches/{b['id']}/students",
                          json={"name": "TEST_QA_Student", "parent_whatsapp": "+911234567890"},
                          headers=hdr, timeout=30).json()
        today = date.today().isoformat()
        t = requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests",
                          json={"name": "TEST_M", "subject": "Physics", "chapter": "Kinematics",
                                "max_marks": 100, "date": today},
                          headers=hdr, timeout=30).json()
        requests.post(f"{BASE_URL}/api/tests/{t['id']}/marks",
                      json={"marks": [{"student_id": s["id"], "score": 75}]},
                      headers=hdr, timeout=30)
        yield {"batch": b, "student": s}
        requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)

    def test_monthly_report_with_payment(self, demo_ctx, student_setup):
        # Ensure demo owner has payment configured (UPI + image priority may still hold)
        requests.post(f"{BASE_URL}/api/settings/payment",
                      json={"upi_id": "lyrocenter@ybl", "payee_name": "LYRO Demo Coaching",
                            "qr_image_base64": ""},  # clear image so UPI is used
                      headers=demo_ctx["hdr"], timeout=30)

        r = requests.post(f"{BASE_URL}/api/students/{student_setup['student']['id']}/monthly-report",
                          headers=demo_ctx["hdr"], timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()

        # 'payment' object shape
        assert "payment" in d
        p = d["payment"]
        assert p["configured"] is True
        assert p["upi_id"] == "lyrocenter@ybl"
        assert isinstance(p["qr_url"], str)
        assert "/api/centers/" in p["qr_url"] and "/payment-qr.png" in p["qr_url"]

        # Report text includes footer lines
        report = d["report"]
        assert "UPI ID:" in report, f"Expected 'UPI ID:' in report:\n{report}"
        assert "Scan QR:" in report, f"Expected 'Scan QR:' in report:\n{report}"
        assert "lyrocenter@ybl" in report

    def test_monthly_report_without_payment(self, fresh_owner):
        # Fresh owner has payment configured from earlier isolation test - reset it here
        requests.post(f"{BASE_URL}/api/settings/payment",
                      json={"upi_id": "", "qr_image_base64": ""},
                      headers=fresh_owner["hdr"], timeout=30)

        # Fresh owner needs a batch+student+test+mark
        hdr = fresh_owner["hdr"]
        b = requests.post(f"{BASE_URL}/api/batches",
                          json={"name": f"TEST_PayFresh_{uuid.uuid4().hex[:4]}", "course": "JEE"},
                          headers=hdr, timeout=30).json()
        s = requests.post(f"{BASE_URL}/api/batches/{b['id']}/students",
                          json={"name": "TEST_Fresh_Student", "parent_whatsapp": "+91"},
                          headers=hdr, timeout=30).json()
        today = date.today().isoformat()
        t = requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests",
                          json={"name": "TEST_M", "subject": "Physics", "chapter": "Kinematics",
                                "max_marks": 100, "date": today},
                          headers=hdr, timeout=30).json()
        requests.post(f"{BASE_URL}/api/tests/{t['id']}/marks",
                      json={"marks": [{"student_id": s["id"], "score": 60}]},
                      headers=hdr, timeout=30)

        try:
            r = requests.post(f"{BASE_URL}/api/students/{s['id']}/monthly-report",
                              headers=hdr, timeout=60)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["payment"]["configured"] is False
            assert d["payment"]["qr_url"] is None
            # No footer lines in report text
            report = d["report"]
            assert "UPI ID:" not in report, f"Unexpected UPI footer in report:\n{report}"
            assert "Scan QR:" not in report, f"Unexpected QR footer in report:\n{report}"
        finally:
            requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)
