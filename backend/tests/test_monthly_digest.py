"""LYRO backend tests for POST /api/batches/{batch_id}/monthly-digest and PWA static files."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://lyro-progress.preview.emergentagent.com"

DEMO_EMAIL = "owner@lyro.demo"
DEMO_PASS = "demo1234"

SEED_BATCH_ID = "b1ace071-094f-4f09-a1c5-b64d7ba271f8"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=30)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def ensure_payment_configured(hdr):
    """Ensure demo owner UPI is set. Restore after tests."""
    r = requests.get(f"{BASE_URL}/api/settings/payment", headers=hdr, timeout=30)
    before = r.json() if r.status_code == 200 else {}
    # Set to ankit@lyro.in
    requests.post(
        f"{BASE_URL}/api/settings/payment",
        json={"upi_id": "ankit@lyro.in", "payee_name": "LYRO Demo Coaching"},
        headers=hdr,
        timeout=30,
    )
    yield
    # Restore
    if before.get("upi_id"):
        requests.post(
            f"{BASE_URL}/api/settings/payment",
            json={
                "upi_id": before.get("upi_id"),
                "payee_name": before.get("payee_name") or "",
            },
            headers=hdr,
            timeout=30,
        )


# -------- Monthly digest --------
class TestMonthlyDigest:
    def test_digest_without_month_defaults_current(self, hdr):
        r = requests.post(
            f"{BASE_URL}/api/batches/{SEED_BATCH_ID}/monthly-digest",
            headers=hdr,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Should default to current month
        assert "period" in data
        assert len(data["period"]) == 7  # YYYY-MM
        assert data["count"] == 2
        assert isinstance(data["items"], list)
        assert len(data["items"]) == 2

    def test_digest_december_2025_happy_path(self, hdr):
        r = requests.post(
            f"{BASE_URL}/api/batches/{SEED_BATCH_ID}/monthly-digest?month=2025-12",
            headers=hdr,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["period"] == "2025-12"
        assert data["count"] == 2
        assert data["with_marks"] == 2
        assert len(data["items"]) == 2
        assert "batch" in data
        assert "payment" in data
        # payment configured
        assert data["payment"]["configured"] is True
        assert data["payment"]["upi_id"] == "ankit@lyro.in"
        # each item structure
        for item in data["items"]:
            assert "student_id" in item
            assert "name" in item
            assert "parent_whatsapp" in item
            assert item["has_marks"] is True
            assert isinstance(item["message"], str)
            assert len(item["message"]) > 20
            # payment footer must be in each message
            assert "UPI ID: ankit@lyro.in" in item["message"]
            assert "Scan QR:" in item["message"]
            # Scan QR URL must be https
            for line in item["message"].splitlines():
                if line.startswith("Scan QR:"):
                    url = line.replace("Scan QR:", "").strip()
                    assert url.startswith("https://"), f"QR URL not https: {url}"

    def test_digest_empty_month_fallback(self, hdr):
        r = requests.post(
            f"{BASE_URL}/api/batches/{SEED_BATCH_ID}/monthly-digest?month=2026-07",
            headers=hdr,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["period"] == "2026-07"
        assert data["with_marks"] == 0
        assert data["count"] == 2
        for item in data["items"]:
            assert item["has_marks"] is False
            # fallback text
            assert f"No test scores recorded for {item['name']} in 2026-07." in item["message"]
            # payment footer still included
            assert "UPI ID: ankit@lyro.in" in item["message"]

    def test_digest_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/batches/{SEED_BATCH_ID}/monthly-digest?month=2025-12",
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_digest_batch_not_found(self, hdr):
        r = requests.post(
            f"{BASE_URL}/api/batches/nonexistent-batch-id-xyz/monthly-digest",
            headers=hdr,
            timeout=30,
        )
        assert r.status_code == 404

    def test_digest_empty_batch_no_crash(self, hdr):
        # Create fresh empty batch
        b = requests.post(
            f"{BASE_URL}/api/batches",
            json={"name": f"TEST_EmptyDigest_{uuid.uuid4().hex[:4]}", "course": "JEE"},
            headers=hdr,
            timeout=30,
        ).json()
        try:
            r = requests.post(
                f"{BASE_URL}/api/batches/{b['id']}/monthly-digest?month=2025-12",
                headers=hdr,
                timeout=30,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["count"] == 0
            assert data["with_marks"] == 0
            assert data["items"] == []
        finally:
            requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)

    def test_digest_parallelism_4_students(self, hdr):
        """Create batch with 4 students, all having marks in same month, ensure < 60s."""
        b = requests.post(
            f"{BASE_URL}/api/batches",
            json={"name": f"TEST_Parallel_{uuid.uuid4().hex[:4]}", "course": "JEE"},
            headers=hdr,
            timeout=30,
        ).json()
        try:
            student_ids = []
            for i in range(4):
                s = requests.post(
                    f"{BASE_URL}/api/batches/{b['id']}/students",
                    json={"name": f"TEST_Stu_{i}", "parent_whatsapp": f"+9199999{i:05d}"},
                    headers=hdr,
                    timeout=30,
                ).json()
                student_ids.append(s["id"])
            # Create test in 2025-12
            t = requests.post(
                f"{BASE_URL}/api/batches/{b['id']}/tests",
                json={
                    "name": "TEST_TP1",
                    "subject": "Physics",
                    "chapter": "Kinematics",
                    "max_marks": 100,
                    "date": "2025-12-05",
                },
                headers=hdr,
                timeout=30,
            ).json()
            marks_payload = {
                "marks": [{"student_id": sid, "score": 55 + i * 5} for i, sid in enumerate(student_ids)]
            }
            r = requests.post(
                f"{BASE_URL}/api/tests/{t['id']}/marks",
                json=marks_payload,
                headers=hdr,
                timeout=30,
            )
            assert r.status_code == 200

            t0 = time.time()
            r = requests.post(
                f"{BASE_URL}/api/batches/{b['id']}/monthly-digest?month=2025-12",
                headers=hdr,
                timeout=90,
            )
            elapsed = time.time() - t0
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["count"] == 4
            assert data["with_marks"] == 4
            print(f"\n[PARALLEL] 4-student digest took {elapsed:.2f}s")
            # Semaphore=4 means all 4 run concurrently, should be under 40s ideally,
            # but network/LLM variance permitted up to 60s.
            assert elapsed < 60, f"Digest too slow: {elapsed:.2f}s (expected < 60)"
        finally:
            requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)


# -------- PWA static files --------
class TestPWA:
    def test_manifest_json(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
        assert r.status_code == 200
        m = r.json()
        assert m["name"] == "LYRO — Marks, Progress & Parent Updates"
        assert m["short_name"] == "LYRO"
        assert m["display"] == "standalone"
        assert m["theme_color"] == "#0A2540"
        icons = m.get("icons", [])
        assert any(i.get("sizes") == "192x192" for i in icons)
        assert any(i.get("purpose") == "maskable" for i in icons)

    def test_logo192(self):
        r = requests.get(f"{BASE_URL}/logo192.png", timeout=15)
        assert r.status_code == 200
        assert "image/png" in r.headers.get("Content-Type", "")
        assert len(r.content) > 0

    def test_logo512(self):
        r = requests.get(f"{BASE_URL}/logo512.png", timeout=15)
        assert r.status_code == 200
        assert "image/png" in r.headers.get("Content-Type", "")
        assert len(r.content) > 0

    def test_service_worker(self):
        r = requests.get(f"{BASE_URL}/service-worker.js", timeout=15)
        assert r.status_code == 200
        assert "CACHE_NAME" in r.text or "cache" in r.text.lower()

    def test_index_head_tags(self):
        r = requests.get(f"{BASE_URL}/", timeout=15)
        assert r.status_code == 200
        html = r.text
        assert 'rel="manifest"' in html
        assert 'manifest.json' in html
        assert 'name="theme-color"' in html
        assert '#0A2540' in html
        assert 'rel="apple-touch-icon"' in html
        assert 'logo192.png' in html
        assert "<title>LYRO — Marks · Progress · Parents</title>" in html
        assert 'viewport-fit=cover' in html
