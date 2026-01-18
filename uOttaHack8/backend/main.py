from dotenv import load_dotenv
import os
import json
import time
import math
from typing import List, Optional

from openai import OpenAI
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# -----------------------------
# Env / AI Client
# -----------------------------

load_dotenv()

SURVEYMONKEY_OPENAI_API_KEY = os.getenv("SURVEYMONKEY_OPENAI_API_KEY")

if not SURVEYMONKEY_OPENAI_API_KEY:
    raise RuntimeError("Missing SURVEYMONKEY_OPENAI_API_KEY")

client = OpenAI(api_key=SURVEYMONKEY_OPENAI_API_KEY)


# -----------------------------
# App
# -----------------------------

app = FastAPI(title="Adaptive Survey Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Models (FINAL CONTRACT)
# -----------------------------

class Question(BaseModel):
    id: str
    text: str


class Turn(BaseModel):
    questionId: str
    questionText: str
    answer: Optional[str]
    skipped: bool
    createdAt: int

    # ✅ AI sentiment fields (added)
    sentimentCategory: Optional[int] = None
    sentimentConfidence: Optional[float] = None


class ImportQuestionsRequest(BaseModel):
    session_id: str
    questions: List[Question]


class NextQuestionRequest(BaseModel):
    session_id: str
    turn: Turn
    turns: List[Turn]


class NextQuestionResponse(BaseModel):
    certainty: float
    valueScore: int
    tags: List[str]
    nextQuestion: Optional[Question] = None
    isDone: bool


# -----------------------------
# Session Store
# -----------------------------

sessions = {}

# -----------------------------
# AI SENTIMENT INTELLIGENCE
# -----------------------------

SENTIMENT_LABELS = {
    1: "terrible experience at the hackathon",
    2: "bad experience at the hackathon",
    3: "neutral experience at the hackathon",
    4: "good experience at the hackathon",
    5: "excellent experience at the hackathon",
}


def ai_infer_sentiment(answer: str) -> tuple[int, float]:
    """
    Uses AI to classify sentiment into 1–5 categories.
    NO hardcoding.
    """
    if not answer:
        return 3, 0.2

    prompt = f"""
You are an AI survey analyst.

Classify the user's sentiment into ONE category:

1 = terrible experience at the hackathon
2 = bad experience at the hackathon
3 = neutral experience at the hackathon
4 = good experience at the hackathon
5 = excellent experience at the hackathon

Return ONLY valid JSON in this format:
{{ "category": number, "confidence": number }}

User response:
"{answer}"
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )

    data = json.loads(response.choices[0].message.content)
    return int(data["category"]), float(data["confidence"])


def sentiment_distribution(turns: List[Turn]) -> dict:
    dist = {i: 0 for i in range(1, 6)}
    for t in turns:
        if t.sentimentCategory:
            dist[t.sentimentCategory] += 1
    return dist


def compute_certainty(turns: List[Turn]) -> float:
    valid = [
        t for t in turns
        if t.sentimentCategory is not None and not t.skipped
    ]

    if len(valid) < 2:
        return 0.2

    # Distribution
    dist = sentiment_distribution(valid)
    total = sum(dist.values())
    dominant_count = max(dist.values())

    # Agreement score (0–1)
    agreement = dominant_count / total

    # Confidence bonus from AI
    avg_conf = sum(
        t.sentimentConfidence or 0.5 for t in valid
    ) / len(valid)

    # Volume bonus caps at ~20 questions
    volume_bonus = min(1.0, len(valid) / 20)

    certainty = agreement * avg_conf * volume_bonus
    return round(min(certainty, 1.0), 3)




def should_stop(turns: List[Turn], certainty: float) -> bool:
    valid = [t for t in turns if t.sentimentCategory and not t.skipped]
    if len(valid) < 5:
        return False

    if certainty >= 0.8:
        return True

    if len(valid) >= 20:
        return True

    return False


# -----------------------------
# QUESTION SELECTION (UNCHANGED)
# -----------------------------

GENERALITY_KEYWORDS = [
    "overall",
    "experience",
    "feel",
    "general",
    "in general",
    "how was",
    "how did you feel",
]


def is_general_question(q: Question) -> bool:
    text = q.text.lower()
    return any(k in text for k in GENERALITY_KEYWORDS)


def information_gain(q: Question, turns: List[Turn]) -> float:
    asked_ids = {t.questionId for t in turns}
    if q.id in asked_ids:
        return -1
    return 1.0


def choose_initial_question(questions: List[Question]) -> Question:
    general = [q for q in questions if is_general_question(q)]
    return general[0] if general else questions[0]


def choose_next_question(
    questions: List[Question],
    turns: List[Turn]
) -> Optional[Question]:
    for q in questions:
        if q.id not in {t.questionId for t in turns}:
            return q
    return None


# -----------------------------
# Endpoints
# -----------------------------

@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/import-questions")
def import_questions(req: ImportQuestionsRequest):
    sessions[req.session_id] = {
        "questions": req.questions,
        "createdAt": time.time(),
    }
    return {"ok": True, "count": len(req.questions)}


@app.post("/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    session = sessions.get(req.session_id)

    # 🔥 AI sentiment classification for latest answer
    latest = req.turn
    if latest.answer and not latest.skipped:
        cat, conf = ai_infer_sentiment(latest.answer)
        latest.sentimentCategory = cat
        latest.sentimentConfidence = conf

    certainty = compute_certainty(req.turns)
    value_score = int(certainty * 100)

    # ✅ Stop condition based on sentiment convergence
    if should_stop(req.turns, certainty):
        dist = sentiment_distribution(req.turns)
        dominant = max(dist, key=dist.get)

        return NextQuestionResponse(
            certainty=certainty,
            valueScore=value_score,
            tags=[SENTIMENT_LABELS[dominant]],
            isDone=True,
        )

    if session:
        questions = session["questions"]

        if not req.turns:
            q = choose_initial_question(questions)
            return NextQuestionResponse(
                certainty=certainty,
                valueScore=value_score,
                tags=["initial"],
                nextQuestion=q,
                isDone=False,
            )

        q = choose_next_question(questions, req.turns)
        if q:
            return NextQuestionResponse(
                certainty=certainty,
                valueScore=value_score,
                tags=["adaptive"],
                nextQuestion=q,
                isDone=False,
            )

    return NextQuestionResponse(
        certainty=certainty,
        valueScore=value_score,
        tags=["fallback"],
        nextQuestion=Question(
            id="ai-clarify",
            text="Can you clarify what stood out most to you?",
        ),
        isDone=False,
    )
