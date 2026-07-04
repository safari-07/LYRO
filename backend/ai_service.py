"""LLM helpers powered by Claude Sonnet 4.5 via emergentintegrations."""
import os
import uuid
from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-5-20250929"


def _new_chat(system_message: str) -> LlmChat:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    return chat


async def generate_progress_summary(payload: dict) -> str:
    """Warm, parent-friendly summary based on marks history."""
    system = (
        "You are a warm, encouraging coaching-center mentor writing to a parent. "
        "Use plain English, short sentences, no jargon. Mention specific numbers, "
        "improvement or drop, and one clear next step. 3-5 sentences max. "
        "Do not use markdown, headings, or lists — just flowing text a parent can read on WhatsApp."
    )
    chat = _new_chat(system)
    user_text = _format_student_payload(payload)
    resp = await chat.send_message(UserMessage(text=user_text))
    return resp.strip()


async def generate_parent_message(payload: dict) -> str:
    """Short WhatsApp-friendly message to share with parent."""
    system = (
        "You are drafting a short WhatsApp message from a coaching-center teacher to a parent. "
        "Warm, respectful, concise (4-6 short lines). Include the student's name, the latest test, "
        "score, trend vs previous, rank if given, and one actionable suggestion. "
        "Sign off simply. Use line breaks between thoughts. No markdown, no emojis."
    )
    chat = _new_chat(system)
    resp = await chat.send_message(UserMessage(text=_format_student_payload(payload)))
    return resp.strip()


async def generate_monthly_report(payload: dict) -> str:
    """Monthly progress report — slightly longer, structured but readable."""
    system = (
        "You are writing a monthly progress report for a parent from a coaching center. "
        "Use warm, plain language. Structure it as 3 short paragraphs: "
        "1) Overall snapshot with numbers, 2) Subject-wise strengths and weak spots with chapter names, "
        "3) Suggested focus for next month. Keep it under 180 words. No markdown headings, no bullet lists."
    )
    chat = _new_chat(system)
    resp = await chat.send_message(UserMessage(text=_format_student_payload(payload)))
    return resp.strip()


def _format_student_payload(payload: dict) -> str:
    lines = [
        f"Student: {payload.get('student_name')}",
        f"Course: {payload.get('course')}",
        f"Batch: {payload.get('batch_name')}",
        f"Rank in batch: {payload.get('rank')} of {payload.get('batch_size')}",
        "",
        "Recent tests (most recent first):",
    ]
    for t in payload.get("tests", []):
        lines.append(
            f"- {t['date']} | {t['name']} | {t['subject']} > {t['chapter']} "
            f"| Score: {t['score']}/{t['max_marks']} ({t['percent']}%)"
        )
    if payload.get("trend_note"):
        lines.append("")
        lines.append(f"Trend note: {payload['trend_note']}")
    if payload.get("period"):
        lines.append(f"Report period: {payload['period']}")
    return "\n".join(lines)
