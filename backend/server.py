"""LYRO backend — FastAPI + MongoDB."""
import base64
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth_utils import (  # noqa: E402
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ai_service import (  # noqa: E402
    generate_monthly_report,
    generate_parent_message,
    generate_progress_summary,
)
from payment_utils import (  # noqa: E402
    decode_uploaded_qr,
    is_valid_upi_id,
    qr_png_from_upi,
)
from syllabus_data import COURSE_SYLLABI, COURSES  # noqa: E402

# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="LYRO")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lyro")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def strip_id(doc):
    if doc:
        doc.pop("_id", None)
    return doc


async def _require_owner(user, center_id: str):
    center = await db.centers.find_one({"id": center_id, "owner_id": user["id"]})
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    return center


async def _get_or_create_center(user) -> dict:
    center = await db.centers.find_one({"owner_id": user["id"]}, {"_id": 0})
    if center:
        return center
    center = {
        "id": new_id(),
        "owner_id": user["id"],
        "owner_email": user["email"],
        "name": f"{user['email'].split('@')[0]}'s Center",
        "created_at": now_iso(),
    }
    await db.centers.insert_one(center)
    return strip_id(center)


async def _batch_for_user(batch_id: str, user):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    await _require_owner(user, batch["center_id"])
    return batch


async def _student_for_user(student_id: str, user):
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    await _batch_for_user(s["batch_id"], user)
    return s


async def _test_for_user(test_id: str, user):
    t = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    await _batch_for_user(t["batch_id"], user)
    return t


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    center_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BatchIn(BaseModel):
    name: str
    course: str


class StudentIn(BaseModel):
    name: str
    parent_whatsapp: str
    course_override: Optional[str] = None


class TestIn(BaseModel):
    name: str
    subject: str
    chapter: str
    max_marks: float
    date: str


class MarkIn(BaseModel):
    student_id: str
    score: Optional[float] = None


class MarksBulkIn(BaseModel):
    marks: List[MarkIn]


class PaymentSettingsIn(BaseModel):
    upi_id: Optional[str] = None
    payee_name: Optional[str] = None
    qr_image_base64: Optional[str] = None  # data URL or raw b64; None = leave unchanged; "" = clear


@api.post("/auth/register")
async def register(data: RegisterIn):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": new_id(),
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    center_name = data.center_name or f"{user['email'].split('@')[0]}'s Center"
    center = {
        "id": new_id(),
        "owner_id": user["id"],
        "owner_email": user["email"],
        "name": center_name,
        "created_at": now_iso(),
    }
    await db.centers.insert_one(center)
    token = create_access_token(user["id"], user["email"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"]},
        "center": strip_id(center),
    }


@api.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    center = await _get_or_create_center({"id": user["id"], "email": user["email"]})
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"]},
        "center": center,
    }


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    center = await _get_or_create_center(user)
    return {"user": user, "center": center}


@api.get("/syllabus/courses")
async def list_courses():
    return {"courses": COURSES}


# ---------- payment settings ----------
def _payment_public(center: dict) -> dict:
    settings = center.get("payment_settings") or {}
    upi = settings.get("upi_id")
    payee = settings.get("payee_name") or center.get("name")
    has_image = bool(settings.get("qr_image_b64"))
    configured = bool(upi or has_image)
    return {
        "upi_id": upi,
        "payee_name": payee,
        "has_qr_image": has_image,
        "configured": configured,
    }


def _payment_qr_url(request: Request, center: dict) -> Optional[str]:
    settings = center.get("payment_settings") or {}
    if not (settings.get("upi_id") or settings.get("qr_image_b64")):
        return None
    version = settings.get("updated_at") or center.get("id")
    version_hash = str(hash(version))[-6:]
    # Respect reverse-proxy headers so the URL parents receive is public/https
    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if forwarded_host:
        scheme = forwarded_proto or ("https" if request.url.scheme == "https" else "http")
        base = f"{scheme}://{forwarded_host}"
    else:
        base = str(request.base_url).rstrip("/")
    return f"{base}/api/centers/{center['id']}/payment-qr.png?v={version_hash}"


@api.get("/settings/payment")
async def get_payment_settings(request: Request, user=Depends(get_current_user)):
    center = await _get_or_create_center(user)
    info = _payment_public(center)
    info["qr_url"] = _payment_qr_url(request, center)
    return info


@api.post("/settings/payment")
async def save_payment_settings(
    request: Request,
    data: PaymentSettingsIn,
    user=Depends(get_current_user),
):
    center = await _get_or_create_center(user)
    current = dict(center.get("payment_settings") or {})

    if data.upi_id is not None:
        cleaned = data.upi_id.strip()
        if cleaned and not is_valid_upi_id(cleaned):
            raise HTTPException(
                status_code=400,
                detail="Invalid UPI ID. Expected format: name@bank",
            )
        current["upi_id"] = cleaned or None

    if data.payee_name is not None:
        current["payee_name"] = data.payee_name.strip() or None

    if data.qr_image_base64 is not None:
        if data.qr_image_base64 == "":
            current["qr_image_b64"] = None
        else:
            try:
                raw = decode_uploaded_qr(data.qr_image_base64)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid QR image data")
            if len(raw) > 1_500_000:
                raise HTTPException(
                    status_code=400,
                    detail="QR image too large (max ~1.5 MB)",
                )
            current["qr_image_b64"] = base64.b64encode(raw).decode()

    current["updated_at"] = now_iso()
    await db.centers.update_one(
        {"id": center["id"]}, {"$set": {"payment_settings": current}}
    )
    center["payment_settings"] = current
    info = _payment_public(center)
    info["qr_url"] = _payment_qr_url(request, center)
    return info


@api.get("/centers/{center_id}/payment-qr.png")
async def payment_qr_png(center_id: str):
    """Public: anyone with the link can view the QR (it's just a UPI QR)."""
    center = await db.centers.find_one({"id": center_id}, {"_id": 0})
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    settings = center.get("payment_settings") or {}
    if settings.get("qr_image_b64"):
        try:
            png = base64.b64decode(settings["qr_image_b64"])
        except Exception:
            raise HTTPException(status_code=500, detail="Bad QR image data")
    elif settings.get("upi_id"):
        png = qr_png_from_upi(
            settings["upi_id"], settings.get("payee_name") or center.get("name")
        )
    else:
        raise HTTPException(status_code=404, detail="No payment QR configured")
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@api.get("/syllabus/{course}")
async def get_syllabus(course: str):
    if course not in COURSE_SYLLABI:
        raise HTTPException(status_code=404, detail="Unknown course")
    syllabus = COURSE_SYLLABI[course]
    return {
        "course": course,
        "subjects": [
            {"name": subj, "chapters": chapters}
            for subj, chapters in syllabus.items()
        ],
    }


@api.get("/batches")
async def list_batches(user=Depends(get_current_user)):
    center = await _get_or_create_center(user)
    batches = await db.batches.find(
        {"center_id": center["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    for b in batches:
        b["student_count"] = await db.students.count_documents({"batch_id": b["id"]})
        b["test_count"] = await db.tests.count_documents({"batch_id": b["id"]})
    return batches


@api.post("/batches")
async def create_batch(data: BatchIn, user=Depends(get_current_user)):
    if data.course not in COURSES:
        raise HTTPException(status_code=400, detail="Invalid course")
    center = await _get_or_create_center(user)
    batch = {
        "id": new_id(),
        "center_id": center["id"],
        "name": data.name.strip(),
        "course": data.course,
        "created_at": now_iso(),
    }
    await db.batches.insert_one(batch)
    return strip_id(batch)


@api.get("/batches/{batch_id}")
async def get_batch(batch_id: str, user=Depends(get_current_user)):
    return await _batch_for_user(batch_id, user)


@api.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, user=Depends(get_current_user)):
    await _batch_for_user(batch_id, user)
    tests = await db.tests.find({"batch_id": batch_id}, {"id": 1}).to_list(1000)
    test_ids = [t["id"] for t in tests]
    if test_ids:
        await db.marks.delete_many({"test_id": {"$in": test_ids}})
    await db.tests.delete_many({"batch_id": batch_id})
    await db.students.delete_many({"batch_id": batch_id})
    await db.batches.delete_one({"id": batch_id})
    return {"ok": True}


@api.get("/batches/{batch_id}/students")
async def list_students(batch_id: str, user=Depends(get_current_user)):
    await _batch_for_user(batch_id, user)
    students = await db.students.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).sort("name", 1).to_list(1000)
    return students


@api.post("/batches/{batch_id}/students")
async def add_student(batch_id: str, data: StudentIn, user=Depends(get_current_user)):
    await _batch_for_user(batch_id, user)
    if data.course_override and data.course_override not in COURSES:
        raise HTTPException(status_code=400, detail="Invalid course override")
    student = {
        "id": new_id(),
        "batch_id": batch_id,
        "name": data.name.strip(),
        "parent_whatsapp": data.parent_whatsapp.strip(),
        "course_override": data.course_override,
        "created_at": now_iso(),
    }
    await db.students.insert_one(student)
    return strip_id(student)


@api.delete("/students/{student_id}")
async def delete_student(student_id: str, user=Depends(get_current_user)):
    await _student_for_user(student_id, user)
    await db.marks.delete_many({"student_id": student_id})
    await db.students.delete_one({"id": student_id})
    return {"ok": True}


@api.get("/batches/{batch_id}/tests")
async def list_tests(batch_id: str, user=Depends(get_current_user)):
    await _batch_for_user(batch_id, user)
    tests = await db.tests.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    return tests


@api.post("/batches/{batch_id}/tests")
async def create_test(batch_id: str, data: TestIn, user=Depends(get_current_user)):
    await _batch_for_user(batch_id, user)
    test = {
        "id": new_id(),
        "batch_id": batch_id,
        "name": data.name.strip(),
        "subject": data.subject.strip(),
        "chapter": data.chapter.strip(),
        "max_marks": float(data.max_marks),
        "date": data.date,
        "created_at": now_iso(),
    }
    await db.tests.insert_one(test)
    return strip_id(test)


@api.get("/tests/{test_id}")
async def get_test(test_id: str, user=Depends(get_current_user)):
    return await _test_for_user(test_id, user)


@api.delete("/tests/{test_id}")
async def delete_test(test_id: str, user=Depends(get_current_user)):
    await _test_for_user(test_id, user)
    await db.marks.delete_many({"test_id": test_id})
    await db.tests.delete_one({"id": test_id})
    return {"ok": True}


@api.get("/tests/{test_id}/marks")
async def list_test_marks(test_id: str, user=Depends(get_current_user)):
    t = await _test_for_user(test_id, user)
    students = await db.students.find(
        {"batch_id": t["batch_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(1000)
    marks_docs = await db.marks.find({"test_id": test_id}, {"_id": 0}).to_list(1000)
    by_student = {m["student_id"]: m for m in marks_docs}
    rows = []
    for s in students:
        m = by_student.get(s["id"])
        rows.append(
            {
                "student_id": s["id"],
                "student_name": s["name"],
                "score": m["score"] if m else None,
            }
        )
    return {"test": t, "rows": rows}


@api.post("/tests/{test_id}/marks")
async def save_test_marks(
    test_id: str, data: MarksBulkIn, user=Depends(get_current_user)
):
    t = await _test_for_user(test_id, user)
    max_marks = float(t["max_marks"])
    ops_saved = 0
    for m in data.marks:
        if m.score is None:
            await db.marks.delete_one(
                {"test_id": test_id, "student_id": m.student_id}
            )
            continue
        score = float(m.score)
        if score < 0 or score > max_marks:
            raise HTTPException(
                status_code=400,
                detail=f"Score {score} out of range (0-{max_marks})",
            )
        doc = {
            "id": new_id(),
            "test_id": test_id,
            "student_id": m.student_id,
            "score": score,
            "updated_at": now_iso(),
        }
        await db.marks.update_one(
            {"test_id": test_id, "student_id": m.student_id},
            {"$set": doc},
            upsert=True,
        )
        ops_saved += 1
    return {"ok": True, "saved": ops_saved}


async def _student_history(student_id: str, batch_id: str):
    tests = await db.tests.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).sort("date", 1).to_list(1000)
    test_ids = [t["id"] for t in tests]
    marks = await db.marks.find(
        {"test_id": {"$in": test_ids}, "student_id": student_id}, {"_id": 0}
    ).to_list(1000)
    marks_by_test = {m["test_id"]: m["score"] for m in marks}
    history = []
    for t in tests:
        if t["id"] in marks_by_test:
            score = marks_by_test[t["id"]]
            history.append(
                {
                    "test_id": t["id"],
                    "name": t["name"],
                    "subject": t["subject"],
                    "chapter": t["chapter"],
                    "date": t["date"],
                    "max_marks": t["max_marks"],
                    "score": score,
                    "percent": round((score / t["max_marks"]) * 100, 1)
                    if t["max_marks"]
                    else 0,
                }
            )
    return history


async def _batch_rank(batch_id: str, student_id: str):
    students = await db.students.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).to_list(1000)
    tests = await db.tests.find(
        {"batch_id": batch_id}, {"id": 1, "max_marks": 1}
    ).to_list(1000)
    test_max = {t["id"]: t["max_marks"] for t in tests}
    all_marks = await db.marks.find(
        {"test_id": {"$in": list(test_max.keys())}}, {"_id": 0}
    ).to_list(10000)
    agg = {}
    for m in all_marks:
        mx = test_max.get(m["test_id"], 0) or 0
        if mx == 0:
            continue
        pct = (m["score"] / mx) * 100
        agg.setdefault(m["student_id"], []).append(pct)
    ranking = []
    for s in students:
        pcts = agg.get(s["id"], [])
        avg = round(sum(pcts) / len(pcts), 1) if pcts else 0
        ranking.append({"student_id": s["id"], "name": s["name"], "avg_percent": avg})
    ranking.sort(key=lambda x: x["avg_percent"], reverse=True)
    rank = next(
        (i + 1 for i, r in enumerate(ranking) if r["student_id"] == student_id),
        None,
    )
    return rank, len(students), ranking


@api.get("/students/{student_id}/profile")
async def student_profile(student_id: str, user=Depends(get_current_user)):
    s = await _student_for_user(student_id, user)
    batch = await db.batches.find_one({"id": s["batch_id"]}, {"_id": 0})
    history = await _student_history(student_id, s["batch_id"])
    rank, batch_size, _ = await _batch_rank(s["batch_id"], student_id)
    return {
        "student": s,
        "batch": batch,
        "history": history,
        "rank": rank,
        "batch_size": batch_size,
    }


def _trend_note(history):
    if len(history) < 2:
        return None
    latest, prev = history[-1], history[-2]
    diff = latest["percent"] - prev["percent"]
    if diff > 5:
        return f"Improved by {round(diff, 1)}% vs previous test"
    if diff < -5:
        return f"Dropped by {round(abs(diff), 1)}% vs previous test"
    return "Roughly stable performance"


@api.post("/students/{student_id}/progress-summary")
async def progress_summary(student_id: str, user=Depends(get_current_user)):
    s = await _student_for_user(student_id, user)
    batch = await db.batches.find_one({"id": s["batch_id"]}, {"_id": 0})
    history = await _student_history(student_id, s["batch_id"])
    if not history:
        return {"summary": "No test scores recorded yet for this student."}
    rank, batch_size, _ = await _batch_rank(s["batch_id"], student_id)
    payload = {
        "student_name": s["name"],
        "course": s.get("course_override") or batch["course"],
        "batch_name": batch["name"],
        "rank": rank,
        "batch_size": batch_size,
        "tests": list(reversed(history))[:6],
        "trend_note": _trend_note(history),
    }
    summary = await generate_progress_summary(payload)
    return {"summary": summary}


@api.post("/students/{student_id}/parent-message")
async def parent_message(student_id: str, user=Depends(get_current_user)):
    s = await _student_for_user(student_id, user)
    batch = await db.batches.find_one({"id": s["batch_id"]}, {"_id": 0})
    history = await _student_history(student_id, s["batch_id"])
    if not history:
        return {
            "message": f"No test scores recorded yet for {s['name']}.",
            "parent_whatsapp": s["parent_whatsapp"],
        }
    rank, batch_size, _ = await _batch_rank(s["batch_id"], student_id)
    payload = {
        "student_name": s["name"],
        "course": s.get("course_override") or batch["course"],
        "batch_name": batch["name"],
        "rank": rank,
        "batch_size": batch_size,
        "tests": list(reversed(history))[:3],
        "trend_note": _trend_note(history),
    }
    msg = await generate_parent_message(payload)
    return {"message": msg, "parent_whatsapp": s["parent_whatsapp"]}


@api.post("/students/{student_id}/monthly-report")
async def monthly_report(
    request: Request,
    student_id: str,
    month: Optional[str] = None,
    user=Depends(get_current_user),
):
    s = await _student_for_user(student_id, user)
    batch = await db.batches.find_one({"id": s["batch_id"]}, {"_id": 0})
    center = await db.centers.find_one({"id": batch["center_id"]}, {"_id": 0})
    history = await _student_history(student_id, s["batch_id"])
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    payment_info = _payment_public(center)
    payment_info["qr_url"] = _payment_qr_url(request, center)
    filtered = [h for h in history if h["date"].startswith(month)]
    if not filtered:
        base_report = f"No test scores recorded for {s['name']} in {month}."
        return {
            "report": _append_payment_footer(base_report, payment_info),
            "period": month,
            "parent_whatsapp": s["parent_whatsapp"],
            "payment": payment_info,
        }
    rank, batch_size, _ = await _batch_rank(s["batch_id"], student_id)
    payload = {
        "student_name": s["name"],
        "course": s.get("course_override") or batch["course"],
        "batch_name": batch["name"],
        "rank": rank,
        "batch_size": batch_size,
        "tests": list(reversed(filtered)),
        "period": month,
        "trend_note": _trend_note(history),
    }
    report = await generate_monthly_report(payload)
    return {
        "report": _append_payment_footer(report, payment_info),
        "period": month,
        "parent_whatsapp": s["parent_whatsapp"],
        "payment": payment_info,
    }


def _append_payment_footer(report_text: str, payment_info: dict) -> str:
    if not payment_info.get("configured"):
        return report_text
    lines = ["", "— — —", "To pay this month's fees:"]
    if payment_info.get("upi_id"):
        lines.append(f"UPI ID: {payment_info['upi_id']}")
    if payment_info.get("payee_name"):
        lines.append(f"Payee: {payment_info['payee_name']}")
    if payment_info.get("qr_url"):
        lines.append(f"Scan QR: {payment_info['qr_url']}")
    return report_text.rstrip() + "\n" + "\n".join(lines)


@api.get("/batches/{batch_id}/dashboard")
async def batch_dashboard(batch_id: str, user=Depends(get_current_user)):
    batch = await _batch_for_user(batch_id, user)
    students = await db.students.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).to_list(1000)
    tests = await db.tests.find(
        {"batch_id": batch_id}, {"_id": 0}
    ).sort("date", 1).to_list(1000)

    if not students:
        return {
            "batch": batch,
            "class_average": None,
            "top_performers": [],
            "at_risk": [],
            "student_count": 0,
            "test_count": len(tests),
            "ranking": [],
        }

    test_max = {t["id"]: t["max_marks"] for t in tests}
    test_dates = {t["id"]: t["date"] for t in tests}
    all_marks = await db.marks.find(
        {"test_id": {"$in": list(test_max.keys())}}, {"_id": 0}
    ).to_list(20000)

    per_student = {}
    for m in all_marks:
        mx = test_max.get(m["test_id"]) or 0
        if not mx:
            continue
        pct = (m["score"] / mx) * 100
        per_student.setdefault(m["student_id"], []).append(
            {"pct": pct, "date": test_dates[m["test_id"]]}
        )

    ranking = []
    for s in students:
        entries = sorted(per_student.get(s["id"], []), key=lambda e: e["date"])
        pcts = [e["pct"] for e in entries]
        avg = round(sum(pcts) / len(pcts), 1) if pcts else None
        latest = pcts[-1] if pcts else None
        prev = pcts[-2] if len(pcts) >= 2 else None
        drop = (
            round(prev - latest, 1)
            if (prev is not None and latest is not None)
            else None
        )
        ranking.append(
            {
                "student_id": s["id"],
                "name": s["name"],
                "avg_percent": avg,
                "latest_percent": round(latest, 1) if latest is not None else None,
                "previous_percent": round(prev, 1) if prev is not None else None,
                "drop_percent": drop,
                "test_count": len(pcts),
            }
        )

    scored = [r for r in ranking if r["avg_percent"] is not None]
    class_avg = (
        round(sum(r["avg_percent"] for r in scored) / len(scored), 1)
        if scored
        else None
    )
    top = sorted(scored, key=lambda r: r["avg_percent"], reverse=True)[:3]
    at_risk = [
        r for r in ranking
        if r["drop_percent"] is not None and r["drop_percent"] > 15
    ]
    at_risk.sort(key=lambda r: r["drop_percent"], reverse=True)

    return {
        "batch": batch,
        "class_average": class_avg,
        "top_performers": top,
        "at_risk": at_risk,
        "student_count": len(students),
        "test_count": len(tests),
        "ranking": sorted(
            ranking,
            key=lambda r: (r["avg_percent"] is None, -(r["avg_percent"] or 0)),
        ),
    }


@api.get("/")
async def root():
    return {"app": "LYRO", "ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed_demo():
    demo_email = "owner@lyro.demo"
    demo_pass = "demo1234"
    existing = await db.users.find_one({"email": demo_email})
    if not existing:
        user = {
            "id": new_id(),
            "email": demo_email,
            "password_hash": hash_password(demo_pass),
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
        center = {
            "id": new_id(),
            "owner_id": user["id"],
            "owner_email": user["email"],
            "name": "LYRO Demo Coaching",
            "created_at": now_iso(),
        }
        await db.centers.insert_one(center)
        logger.info("Seeded demo owner %s", demo_email)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
