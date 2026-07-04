"""LYRO backend end-to-end API tests (pytest)."""
import os
import time
import uuid
from datetime import date

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://lyro-progress.preview.emergentagent.com"

DEMO_EMAIL = "owner@lyro.demo"
DEMO_PASS = "demo1234"


# --------- fixtures ---------
@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=30)
    assert r.status_code == 200, f"Demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_user_center(demo_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def hdr(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def batch(hdr):
    # Fresh TEST_ batch used by lifecycle & analytics tests.
    payload = {"name": f"TEST_Batch_{uuid.uuid4().hex[:6]}", "course": "JEE"}
    r = requests.post(f"{BASE_URL}/api/batches", json=payload, headers=hdr, timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    yield b
    requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)


# --------- auth ---------
class TestAuth:
    def test_login_demo(self, demo_token):
        assert isinstance(demo_token, str) and len(demo_token) > 20

    def test_login_bad_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, demo_user_center):
        assert demo_user_center["user"]["email"] == DEMO_EMAIL
        assert demo_user_center["center"]["owner_email"] == DEMO_EMAIL
        assert "id" in demo_user_center["center"]

    def test_protected_without_token(self):
        r = requests.get(f"{BASE_URL}/api/batches", timeout=30)
        assert r.status_code == 401

    def test_register_duplicate(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": DEMO_EMAIL, "password": "demo1234"}, timeout=30)
        assert r.status_code == 400

    def test_register_new(self):
        new_email = f"test_{uuid.uuid4().hex[:8]}@lyro.demo"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": new_email, "password": "abcdef", "center_name": "TEST_Center"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == new_email
        assert data["center"]["name"] == "TEST_Center"
        # verify data isolation — new owner should have 0 batches
        r2 = requests.get(f"{BASE_URL}/api/batches", headers={"Authorization": f"Bearer {data['token']}"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json() == []


# --------- syllabus ---------
class TestSyllabus:
    def test_courses(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/courses", timeout=30)
        assert r.status_code == 200
        assert r.json()["courses"] == ["JEE", "NEET", "NDA", "Boards"]

    def test_jee_populated(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/JEE", timeout=30)
        assert r.status_code == 200
        data = r.json()
        subj = {s["name"]: s["chapters"] for s in data["subjects"]}
        assert set(subj) == {"Physics", "Chemistry", "Mathematics"}
        assert len(subj["Physics"]) > 0
        assert "name" in subj["Physics"][0]
        total_chapters = sum(len(v) for v in subj.values())
        assert total_chapters >= 60, f"JEE expected 60+ chapters, got {total_chapters}"

    def test_neet_populated(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/NEET", timeout=30)
        assert r.status_code == 200
        subj = {s["name"]: s["chapters"] for s in r.json()["subjects"]}
        assert set(subj) == {"Physics", "Chemistry", "Botany", "Zoology"}
        for name, chapters in subj.items():
            assert len(chapters) >= 10, f"NEET {name} has only {len(chapters)} chapters"
            assert "name" in chapters[0] and "priority_weight" in chapters[0]
        total = sum(len(v) for v in subj.values())
        assert total > 60, f"NEET expected >60 chapters, got {total}"

    def test_nda_populated(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/NDA", timeout=30)
        assert r.status_code == 200
        subj = {s["name"]: s["chapters"] for s in r.json()["subjects"]}
        # Must have Mathematics + some English/GAT + some GK/GAT
        assert "Mathematics" in subj
        assert any("English" in k for k in subj.keys()), f"Missing English/GAT: {list(subj.keys())}"
        assert any("General Knowledge" in k or "GK" in k for k in subj.keys()), f"Missing GK: {list(subj.keys())}"
        for k, v in subj.items():
            assert len(v) > 0, f"NDA {k} empty"

    def test_boards_populated(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/Boards", timeout=30)
        assert r.status_code == 200
        subj = {s["name"]: s["chapters"] for s in r.json()["subjects"]}
        required = {"Physics", "Chemistry", "Mathematics", "Biology", "English"}
        assert required.issubset(set(subj.keys())), f"Boards missing subjects. Got {set(subj.keys())}"
        for k in required:
            assert len(subj[k]) > 0, f"Boards {k} has no chapters"

    def test_unknown_course(self):
        r = requests.get(f"{BASE_URL}/api/syllabus/FOO", timeout=30)
        assert r.status_code == 404


# --------- batches ---------
class TestBatches:
    def test_create_and_list(self, hdr, batch):
        r = requests.get(f"{BASE_URL}/api/batches", headers=hdr, timeout=30)
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert batch["id"] in ids
        this = next(b for b in r.json() if b["id"] == batch["id"])
        assert this["student_count"] == 0
        assert this["test_count"] == 0

    def test_get_batch(self, hdr, batch):
        r = requests.get(f"{BASE_URL}/api/batches/{batch['id']}", headers=hdr, timeout=30)
        assert r.status_code == 200
        assert r.json()["course"] == "JEE"

    def test_invalid_course(self, hdr):
        r = requests.post(f"{BASE_URL}/api/batches", json={"name": "TEST_bad", "course": "FOO"}, headers=hdr, timeout=30)
        assert r.status_code == 400


# --------- students ---------
class TestStudents:
    def test_add_students_sorted(self, hdr, batch):
        for name in ["Zara", "Anil", "Meena"]:
            r = requests.post(
                f"{BASE_URL}/api/batches/{batch['id']}/students",
                json={"name": name, "parent_whatsapp": "+911234567890"},
                headers=hdr, timeout=30,
            )
            assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/batches/{batch['id']}/students", headers=hdr, timeout=30)
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        assert names == sorted(names)
        assert set(["Zara", "Anil", "Meena"]).issubset(names)

    def test_invalid_course_override(self, hdr, batch):
        r = requests.post(
            f"{BASE_URL}/api/batches/{batch['id']}/students",
            json={"name": "Bad", "parent_whatsapp": "+91", "course_override": "FOO"},
            headers=hdr, timeout=30,
        )
        assert r.status_code == 400


# --------- tests + marks + dashboard ---------
class TestMarksAndAnalytics:
    @pytest.fixture(scope="class")
    def setup(self, hdr):
        # dedicated batch to isolate analytics
        r = requests.post(f"{BASE_URL}/api/batches", json={"name": f"TEST_Analytics_{uuid.uuid4().hex[:6]}", "course": "JEE"}, headers=hdr, timeout=30)
        assert r.status_code == 200
        b = r.json()

        # 2 students
        student_ids = []
        for name in ["Alice", "Bob"]:
            r = requests.post(f"{BASE_URL}/api/batches/{b['id']}/students",
                              json={"name": name, "parent_whatsapp": "+911234567890"}, headers=hdr, timeout=30)
            assert r.status_code == 200
            student_ids.append(r.json()["id"])

        today = date.today().isoformat()
        # 2 tests
        t1 = requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests",
                           json={"name": "Weekly 1", "subject": "Physics", "chapter": "Kinematics",
                                 "max_marks": 100, "date": "2025-11-01"}, headers=hdr, timeout=30).json()
        t2 = requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests",
                           json={"name": "Weekly 2", "subject": "Physics", "chapter": "Kinematics",
                                 "max_marks": 100, "date": today}, headers=hdr, timeout=30).json()

        yield {"batch": b, "students": student_ids, "t1": t1, "t2": t2}

        requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)

    def test_test_list_desc(self, hdr, setup):
        r = requests.get(f"{BASE_URL}/api/batches/{setup['batch']['id']}/tests", headers=hdr, timeout=30)
        assert r.status_code == 200
        dates = [t["date"] for t in r.json()]
        assert dates == sorted(dates, reverse=True)

    def test_marks_empty_rows(self, hdr, setup):
        r = requests.get(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks", headers=hdr, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["rows"]) == 2
        for row in data["rows"]:
            assert row["score"] is None

    def test_save_and_read_marks(self, hdr, setup):
        alice, bob = setup["students"]
        # Alice: 80 (test1), 40 (test2) => 50% drop
        # Bob: 70, 68  (small drop)
        payload_t1 = {"marks": [{"student_id": alice, "score": 80}, {"student_id": bob, "score": 70}]}
        payload_t2 = {"marks": [{"student_id": alice, "score": 40}, {"student_id": bob, "score": 68}]}
        r = requests.post(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks", json=payload_t1, headers=hdr, timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/api/tests/{setup['t2']['id']}/marks", json=payload_t2, headers=hdr, timeout=30)
        assert r.status_code == 200
        # Reread
        r = requests.get(f"{BASE_URL}/api/tests/{setup['t2']['id']}/marks", headers=hdr, timeout=30)
        assert r.status_code == 200
        by_id = {row["student_id"]: row["score"] for row in r.json()["rows"]}
        assert by_id[alice] == 40
        assert by_id[bob] == 68

    def test_score_out_of_range(self, hdr, setup):
        r = requests.post(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks",
                          json={"marks": [{"student_id": setup["students"][0], "score": 150}]}, headers=hdr, timeout=30)
        assert r.status_code == 400

    def test_null_score_deletes(self, hdr, setup):
        alice = setup["students"][0]
        # Save then null-out
        requests.post(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks",
                      json={"marks": [{"student_id": alice, "score": 80}]}, headers=hdr, timeout=30)
        r = requests.post(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks",
                         json={"marks": [{"student_id": alice, "score": None}]}, headers=hdr, timeout=30)
        assert r.status_code == 200
        # verify
        r = requests.get(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks", headers=hdr, timeout=30)
        by_id = {row["student_id"]: row["score"] for row in r.json()["rows"]}
        assert by_id[alice] is None
        # restore alice's mark for downstream analytics
        requests.post(f"{BASE_URL}/api/tests/{setup['t1']['id']}/marks",
                      json={"marks": [{"student_id": alice, "score": 80}]}, headers=hdr, timeout=30)

    def test_dashboard_at_risk(self, hdr, setup):
        r = requests.get(f"{BASE_URL}/api/batches/{setup['batch']['id']}/dashboard", headers=hdr, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["student_count"] == 2
        assert d["test_count"] == 2
        assert d["class_average"] is not None
        alice = setup["students"][0]
        at_risk_ids = [r["student_id"] for r in d["at_risk"]]
        assert alice in at_risk_ids, f"Expected Alice in at_risk, got {d['at_risk']}"
        alice_risk = next(r for r in d["at_risk"] if r["student_id"] == alice)
        assert alice_risk["drop_percent"] == 40.0

    def test_student_profile(self, hdr, setup):
        alice = setup["students"][0]
        r = requests.get(f"{BASE_URL}/api/students/{alice}/profile", headers=hdr, timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p["student"]["id"] == alice
        assert p["batch_size"] == 2
        assert p["rank"] in [1, 2]
        dates = [h["date"] for h in p["history"]]
        assert dates == sorted(dates)

    def test_ai_progress_summary(self, hdr, setup):
        alice = setup["students"][0]
        r = requests.post(f"{BASE_URL}/api/students/{alice}/progress-summary", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("summary"), str)
        assert len(r.json()["summary"]) > 10

    def test_ai_parent_message(self, hdr, setup):
        alice = setup["students"][0]
        r = requests.post(f"{BASE_URL}/api/students/{alice}/parent-message", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("message"), str)
        assert len(r.json()["message"]) > 5

    def test_ai_monthly_report(self, hdr, setup):
        alice = setup["students"][0]
        r = requests.post(f"{BASE_URL}/api/students/{alice}/monthly-report", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("report"), str)

    def test_ai_empty_history_no_crash(self, hdr):
        # Fresh batch with a student but no marks
        b = requests.post(f"{BASE_URL}/api/batches", json={"name": f"TEST_Empty_{uuid.uuid4().hex[:4]}", "course": "JEE"}, headers=hdr, timeout=30).json()
        st = requests.post(f"{BASE_URL}/api/batches/{b['id']}/students",
                           json={"name": "NoMarks", "parent_whatsapp": "+91"}, headers=hdr, timeout=30).json()
        r = requests.post(f"{BASE_URL}/api/students/{st['id']}/progress-summary", headers=hdr, timeout=60)
        assert r.status_code == 200
        assert "summary" in r.json()
        requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)


# --------- cascading delete ---------
class TestCascade:
    def test_delete_test_removes_marks(self, hdr):
        b = requests.post(f"{BASE_URL}/api/batches", json={"name": f"TEST_Cascade_{uuid.uuid4().hex[:4]}", "course": "JEE"}, headers=hdr, timeout=30).json()
        s = requests.post(f"{BASE_URL}/api/batches/{b['id']}/students", json={"name": "X", "parent_whatsapp": "+91"}, headers=hdr, timeout=30).json()
        t = requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests", json={"name": "T", "subject": "Physics", "chapter": "Kinematics", "max_marks": 100, "date": "2025-11-01"}, headers=hdr, timeout=30).json()
        requests.post(f"{BASE_URL}/api/tests/{t['id']}/marks", json={"marks": [{"student_id": s["id"], "score": 90}]}, headers=hdr, timeout=30)
        r = requests.delete(f"{BASE_URL}/api/tests/{t['id']}", headers=hdr, timeout=30)
        assert r.status_code == 200
        # Cannot fetch marks anymore (test gone -> 404)
        r = requests.get(f"{BASE_URL}/api/tests/{t['id']}/marks", headers=hdr, timeout=30)
        assert r.status_code == 404
        requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)

    def test_delete_batch_removes_everything(self, hdr):
        b = requests.post(f"{BASE_URL}/api/batches", json={"name": f"TEST_CascB_{uuid.uuid4().hex[:4]}", "course": "JEE"}, headers=hdr, timeout=30).json()
        requests.post(f"{BASE_URL}/api/batches/{b['id']}/students", json={"name": "X", "parent_whatsapp": "+91"}, headers=hdr, timeout=30)
        requests.post(f"{BASE_URL}/api/batches/{b['id']}/tests", json={"name": "T", "subject": "Physics", "chapter": "Kinematics", "max_marks": 100, "date": "2025-11-01"}, headers=hdr, timeout=30)
        r = requests.delete(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/batches/{b['id']}", headers=hdr, timeout=30)
        assert r.status_code == 404
