from dotenv import load_dotenv
import os

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time
import math

app = FastAPI(title="Adaptive Survey Backend")

# -----------------------------
# CORS
# -----------------------------
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
# AI LOGIC (HEURISTIC, MODEL-AGNOSTIC)
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

NEGATIVE_CUES = ["bad", "confusing", "frustrating", "slow", "unclear", "broken"]
POSITIVE_CUES = ["good", "great", "smooth", "clear", "helpful", "enjoyed"]


def sentiment_strength(text: str) -> float:
    """
    Estimate how strong / opinionated an answer is.
    """
    if not text:
        return 0.0

    text = text.lower()
    score = 0

    for w in NEGATIVE_CUES:
        if w in text:
            score += 1

    for w in POSITIVE_CUES:
        if w in text:
            score += 1

    length_bonus = min(len(text) / 120, 1.0)
    return min(1.0, 0.4 * score + 0.6 * length_bonus)


def compute_certainty(turns: List[Turn]) -> float:
    """
    Certainty increases when:
    - answers are strong (opinionated)
    - answers are consistent (low spread)
    """
    if not turns:
        return 0.05

    strengths = [
        sentiment_strength(t.answer)
        for t in turns
        if t.answer and not t.skipped
    ]

    if not strengths:
        return 0.1

    avg_strength = sum(strengths) / len(strengths)

    # Penalize inconsistency (spread)
    variance = sum((s - avg_strength) ** 2 for s in strengths) / len(strengths)
    spread_penalty = math.exp(-variance * 6)

    certainty = avg_strength * spread_penalty
    return round(min(1.0, certainty), 3)


def is_general_question(q: Question) -> bool:
    text = q.text.lower()
    return any(k in text for k in GENERALITY_KEYWORDS)


def information_gain(q: Question, turns: List[Turn]) -> float:
    """
    Heuristic expected information gain:
    - prefer unasked
    - prefer questions different from previous ones
    """
    asked_ids = {t.questionId for t in turns}
    if q.id in asked_ids:
        return -1

    diversity_bonus = 1.0
    for t in turns:
        if q.text[:25].lower() in t.questionText.lower():
            diversity_bonus -= 0.5

    return diversity_bonus


def choose_initial_question(questions: List[Question]) -> Question:
    """
    AI chooses the most general starting question.
    """
    general = [q for q in questions if is_general_question(q)]
    return general[0] if general else questions[0]


def choose_next_question(questions: List[Question], turns: List[Turn]) -> Optional[Question]:
    """
    AI chooses the question that reduces uncertainty the most.
    """
    scored = [
        (information_gain(q, turns), q)
        for q in questions
    ]

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_q = scored[0]

    return best_q if best_score > 0 else None


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
    certainty = compute_certainty(req.turns)
    value_score = int(certainty * 100)

    # Stop if confident
    if certainty >= 0.9:
        return NextQuestionResponse(
            certainty=certainty,
            valueScore=value_score,
            tags=["bullseye"],
            isDone=True,
        )

    if session:
        questions = session["questions"]

        # First question (AI-chosen)
        if not req.turns:
            q = choose_initial_question(questions)
            return NextQuestionResponse(
                certainty=certainty,
                valueScore=value_score,
                tags=["initial"],
                nextQuestion=q,
                isDone=False,
            )

        # Adaptive next question
        q = choose_next_question(questions, req.turns)
        if q:
            return NextQuestionResponse(
                certainty=certainty,
                valueScore=value_score,
                tags=["adaptive"],
                nextQuestion=q,
                isDone=False,
            )

    # Fallback
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
