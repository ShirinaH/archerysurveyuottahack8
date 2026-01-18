from __future__ import annotations

from dotenv import load_dotenv
import os
import json
import time
import re
from typing import List, Optional, Tuple, Dict, Any

from openai import OpenAI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# -----------------------------
# Env / AI Client
# -----------------------------
load_dotenv()

# IMPORTANT:
# Do NOT paste real API keys into chat. If you pasted one earlier, rotate/revoke it.
OPENAI_KEY = os.getenv("SURVEYMONKEY_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("Missing SURVEYMONKEY_OPENAI_API_KEY (or OPENAI_API_KEY)")

OPENAI_TIMEOUT = float(os.getenv("OPENAI_TIMEOUT", "15"))
OPENAI_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "0"))
DEBUG_LATENCY = os.getenv("DEBUG_LATENCY", "0") == "1"

client = OpenAI(
    api_key=OPENAI_KEY,
    timeout=OPENAI_TIMEOUT,
    max_retries=OPENAI_MAX_RETRIES,
)

MODEL_SENTIMENT = os.getenv("MODEL_SENTIMENT", "gpt-4.1-mini")

# ✅ changed default from 5 -> 8 so you get 5–10 questions minimum even if certainty is high
MIN_QUESTIONS_BEFORE_STOP = int(os.getenv("MIN_QUESTIONS_BEFORE_STOP", "8"))
CERTAINTY_STOP_THRESHOLD = float(os.getenv("CERTAINTY_STOP_THRESHOLD", "0.90"))
MAX_QUESTIONS = int(os.getenv("MAX_QUESTIONS", "25"))

# Posterior tuning
CERTAINTY_PRIOR = float(os.getenv("CERTAINTY_PRIOR", "0.6"))
CERTAINTY_EVIDENCE_WEIGHT = float(os.getenv("CERTAINTY_EVIDENCE_WEIGHT", "3.0"))
CERTAINTY_RECENCY_DECAY = float(os.getenv("CERTAINTY_RECENCY_DECAY", "0.85"))  # slightly less decay by default
CERTAINTY_CONTRADICT_PEN = float(os.getenv("CERTAINTY_CONTRADICT_PEN", "0.10"))  # less punishing by default
CERTAINTY_SWITCH_WINDOW = int(os.getenv("CERTAINTY_SWITCH_WINDOW", "3"))

# These were in your .env but not used before. They now matter.
CERTAINTY_CONF_FLOOR = float(os.getenv("CERTAINTY_CONF_FLOOR", "0.35"))
CERTAINTY_SPILL_RATIO = float(os.getenv("CERTAINTY_SPILL_RATIO", "0.10"))

# ✅ NEW: dampen certainty early so it can't jump to ~95% after 1–2 answers
CERTAINTY_RAMP_QUESTIONS = int(os.getenv("CERTAINTY_RAMP_QUESTIONS", "8"))  # how many answers until full certainty behavior
CERTAINTY_RAMP_MIN_MULT = float(os.getenv("CERTAINTY_RAMP_MIN_MULT", "0.25"))  # how weak the first answer is allowed to be

# -----------------------------
# Lexicon-based certainty "hardcode"
# -----------------------------
# signed = positive boosts, negative dampens (your stated intent)
# abs    = strong language of either polarity boosts (often more "survey-correct")
LEX_MODE = os.getenv("LEX_MODE", "signed").strip().lower()
LEX_CERTAINTY_BOOST = float(os.getenv("LEX_CERTAINTY_BOOST", "0.55"))
LEX_CONF_SHARPEN = float(os.getenv("LEX_CONF_SHARPEN", "0.12"))

# ✅ NEW: make keyword polarity visibly affect certainty by modifying spill
LEX_SPILL_STRENGTH = float(os.getenv("LEX_SPILL_STRENGTH", "0.9"))

POS_WORDS = {
    "amazing", "awesome", "great", "excellent", "fantastic", "incredible",
    "love", "loved", "enjoyed", "fun", "helpful", "supportive", "friendly",
    "welcoming", "organized", "smooth", "clear", "valuable", "worth",
    "productive", "good", "positive", "motivating", "inspiring", "best",
    "wellrun", "well-run"
}

NEG_WORDS = {
    "terrible", "awful", "bad", "horrible", "worst", "hate", "hated",
    "boring", "confusing", "unclear", "disorganized", "stressful",
    "frustrating", "annoying", "slow", "laggy", "buggy", "broken",
    "overwhelming", "unhelpful", "rude", "unsafe", "crowded", "noisy", "waste"
}

NEGATORS = {
    "not", "no", "never", "hardly", "barely", "without",
    "isn't", "wasn't", "aren't", "weren't", "don't", "didn't", "can't", "won't"
}

app = FastAPI(title="Adaptive Survey Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev-friendly; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Models
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

    dominantCategory: int
    sentimentProbs: List[float]  # length 5
    sentimentLabels: List[str]   # length 5


# -----------------------------
# Session Store
# -----------------------------
sessions: Dict[str, Dict[str, Any]] = {}

FALLBACK_LABELS = [
    "Extremely satisfied",
    "Very satisfied",
    "Satisfied",
    "Dissatisfied",
    "Extremely Dissatisfied",
]

# -----------------------------
# Helpers
# -----------------------------
def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _cache_key(t: Turn) -> str:
    return f"{t.createdAt}:{t.questionId}"


def merge_latest_turn(turns: List[Turn], latest: Turn) -> List[Turn]:
    merged = list(turns or [])
    if not latest or not latest.questionId:
        return merged
    if merged and merged[-1].questionId == latest.questionId and merged[-1].createdAt == latest.createdAt:
        merged[-1] = latest
    else:
        merged.append(latest)
    return merged


def split_questions_and_labels_by_dash(raw_questions: List[Question]) -> Tuple[List[Question], List[str]]:
    """
    Uses a literal "-" line as separator.
    Everything AFTER "-" becomes the 5 sentiment labels (in that exact order).
    """
    lines = [(q.id, (q.text or "").strip()) for q in raw_questions if (q.text or "").strip()]
    dash_idx = None
    for i, (_, txt) in enumerate(lines):
        if txt == "-":
            dash_idx = i
            break

    if dash_idx is None:
        questions = [Question(id=qid, text=txt) for (qid, txt) in lines]
        return questions, []

    before = lines[:dash_idx]
    after = lines[dash_idx + 1 :]

    questions = [Question(id=qid, text=txt) for (qid, txt) in before]

    labels: List[str] = []
    for _, txt in after:
        t = txt.strip()
        if t.startswith("- "):
            t = t[2:].strip()
        if t:
            labels.append(t)

    return questions, labels


def get_labels(session: Dict[str, Any]) -> List[str]:
    labels = session.get("sentiment_labels")
    if isinstance(labels, list) and len(labels) == 5 and all(isinstance(x, str) and x.strip() for x in labels):
        return [x.strip() for x in labels]
    return FALLBACK_LABELS


def lex_polarity_strength(text: str) -> Tuple[float, float]:
    """
    Returns (polarity, strength)
      polarity: -1..+1 (negative..positive)
      strength: 0..1   (how strong / opinionated)
    Simple negation handling within a 3-token window.
    Caps repeats so users can’t spam “amazing amazing amazing” to game it.
    """
    if not text:
        return 0.0, 0.0

    tokens = re.findall(r"[a-z']+", text.lower())
    if not tokens:
        return 0.0, 0.0

    pos = 0
    neg = 0
    hits: Dict[str, int] = {}  # per-word cap

    for i, w in enumerate(tokens):
        window = tokens[max(0, i - 3):i]
        negated = any(x in NEGATORS for x in window)

        if w in POS_WORDS:
            if hits.get(w, 0) >= 2:
                continue
            hits[w] = hits.get(w, 0) + 1
            if negated:
                neg += 1
            else:
                pos += 1

        elif w in NEG_WORDS:
            if hits.get(w, 0) >= 2:
                continue
            hits[w] = hits.get(w, 0) + 1
            if negated:
                pos += 1
            else:
                neg += 1

    total = pos + neg
    if total == 0:
        return 0.0, 0.0

    polarity = (pos - neg) / total  # -1..+1
    strength = min(1.0, total / 6.0)  # saturates quickly

    return float(_clamp(polarity, -1.0, 1.0)), float(_clamp(strength, 0.0, 1.0))


# -----------------------------
# AI Sentiment
# -----------------------------
SUPPORTS_JSON_MODE = True


def ai_infer_sentiment(answer: str, labels: List[str]) -> Tuple[int, float]:
    global SUPPORTS_JSON_MODE

    if not answer or not answer.strip():
        return 3, 0.35

    min_chars = int(os.getenv("MIN_ANSWER_CHARS_FOR_AI", "0"))
    if min_chars > 0 and len(answer.strip()) < min_chars:
        return 3, 0.40

    label_lines = "\n".join([f"{i}. {labels[i-1]}" for i in range(1, 6)])

    system = (
        "You are an AI survey analyst. "
        "Choose exactly one category (1-5). "
        "Return ONLY JSON: {\"category\": <1-5>, \"confidence\": <0-1>}."
    )
    user = (
        "Classify the user's overall sentiment based on their answer.\n"
        "Use ONLY these categories:\n"
        f"{label_lines}\n\n"
        "Guidance:\n"
        "- Choose the category that best matches the user's overall stance.\n"
        "- Use confidence >= 0.75 when it is obvious.\n\n"
        f'Answer: """{answer}"""'
    )
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def _parse(raw: str) -> Tuple[int, float]:
        try:
            data = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if not m:
                raise ValueError("No JSON found")
            data = json.loads(m.group(0))

        cat = int(data.get("category", 3))
        conf = float(data.get("confidence", 0.55))
        if cat < 1 or cat > 5:
            cat = 3
        conf = _clamp(conf, 0.0, 1.0)
        return cat, conf

    t0 = time.perf_counter()

    if SUPPORTS_JSON_MODE:
        try:
            resp = client.chat.completions.create(
                model=MODEL_SENTIMENT,
                messages=messages,
                temperature=0,
                response_format={"type": "json_object"},
                max_tokens=120,
            )
        except Exception as e:
            SUPPORTS_JSON_MODE = False
            if DEBUG_LATENCY:
                print(f"[sentiment] json_mode API failed; disabling. err={repr(e)}")
        else:
            raw = resp.choices[0].message.content or "{}"
            try:
                cat, conf = _parse(raw)
            except Exception as e:
                if DEBUG_LATENCY:
                    dt = time.perf_counter() - t0
                    print(f"[sentiment] json_mode parse failed latency={dt:.3f}s err={repr(e)} raw={raw!r}")
                return 3, 0.35

            if DEBUG_LATENCY:
                dt = time.perf_counter() - t0
                print(f"[sentiment] json_mode latency={dt:.3f}s cat={cat} conf={conf:.2f}")
            return cat, conf

    try:
        resp = client.chat.completions.create(
            model=MODEL_SENTIMENT,
            messages=messages,
            temperature=0,
            max_tokens=120,
        )
        raw = resp.choices[0].message.content or "{}"
        cat, conf = _parse(raw)
        if DEBUG_LATENCY:
            dt = time.perf_counter() - t0
            print(f"[sentiment] fallback latency={dt:.3f}s cat={cat} conf={conf:.2f}")
        return cat, conf
    except Exception as e:
        if DEBUG_LATENCY:
            dt = time.perf_counter() - t0
            print(f"[sentiment] failed latency={dt:.3f}s err={repr(e)}")
        return 3, 0.35


def ensure_turn_sentiment(session: Dict[str, Any], t: Turn) -> Turn:
    if t.sentimentCategory is not None and t.sentimentConfidence is not None:
        return t

    if t.skipped or not (t.answer and t.answer.strip()):
        return t

    cache: Dict[str, Any] = session.setdefault("sentiment_cache", {})
    key = _cache_key(t)
    if key in cache:
        t.sentimentCategory = int(cache[key]["category"])
        t.sentimentConfidence = float(cache[key]["confidence"])
        return t

    labels = get_labels(session)
    cat, conf = ai_infer_sentiment(t.answer, labels)
    t.sentimentCategory = cat
    t.sentimentConfidence = conf
    cache[key] = {"category": cat, "confidence": conf}
    return t


# -----------------------------
# Certainty
# -----------------------------
def compute_posterior_dynamic(turns: List[Turn]) -> Tuple[List[float], int, float]:
    valid = [
        t for t in turns
        if (not t.skipped)
        and (t.answer and t.answer.strip())
        and (t.sentimentCategory is not None)
        and (t.sentimentConfidence is not None)
    ]
    K = 5
    if not valid:
        probs = [0.1, 0.1, 0.6, 0.1, 0.1]
        return probs, 3, max(probs)

    prior = float(CERTAINTY_PRIOR)
    base_w = float(CERTAINTY_EVIDENCE_WEIGHT)
    recency_decay = float(CERTAINTY_RECENCY_DECAY)
    contradict_penalty = float(CERTAINTY_CONTRADICT_PEN)
    switch_window = int(CERTAINTY_SWITCH_WINDOW)

    conf_floor = _clamp(float(CERTAINTY_CONF_FLOOR), 0.0, 0.95)
    spill_ratio = _clamp(float(CERTAINTY_SPILL_RATIO), 0.0, 1.0)

    alpha = [prior] * K

    n = len(valid)
    for idx, t in enumerate(valid):
        age = (n - 1) - idx
        w = base_w * (recency_decay ** age)

        cat = int(t.sentimentCategory or 3)
        conf = float(t.sentimentConfidence or 0.55)
        if cat < 1 or cat > 5:
            cat = 3
        conf = _clamp(conf, 0.0, 1.0)

        # ✅ NEW: ramp evidence so early turns can't spike certainty
        if CERTAINTY_RAMP_QUESTIONS > 0:
            ramp = (idx + 1) / float(max(1, CERTAINTY_RAMP_QUESTIONS))
            ramp = _clamp(ramp, CERTAINTY_RAMP_MIN_MULT, 1.0)
            w *= ramp

        # Lex modifier: make positive language ramp certainty faster
        pol, strength = lex_polarity_strength(t.answer or "")
        if LEX_MODE == "abs":
            factor = 1.0 + (LEX_CERTAINTY_BOOST * abs(pol) * strength)
        else:
            factor = 1.0 + (LEX_CERTAINTY_BOOST * pol * strength)

        w *= _clamp(factor, 0.65, 1.45)

        if LEX_CONF_SHARPEN > 0:
            conf = _clamp(conf + (LEX_CONF_SHARPEN * strength), 0.0, 1.0)

        # Confidence floor: prevents low model confidence from stalling certainty
        eff_conf = conf_floor + (1.0 - conf_floor) * conf
        eff_conf = _clamp(eff_conf, 0.0, 1.0)

        # ✅ NEW: make keywords actually change certainty by modulating spill per-turn
        spill_k = spill_ratio
        if strength > 0 and LEX_SPILL_STRENGTH != 0:
            if LEX_MODE == "abs":
                mult = 1.0 - (LEX_SPILL_STRENGTH * abs(pol) * strength)
            else:
                mult = 1.0 - (LEX_SPILL_STRENGTH * pol * strength)
            spill_k = spill_ratio * _clamp(mult, 0.05, 2.50)
            spill_k = _clamp(spill_k, 0.0, 1.0)

        # Spill ratio: only spill a portion of uncertainty into other categories
        spill_mass = w * (1.0 - eff_conf) * spill_k
        main_mass = w - spill_mass  # the rest goes to chosen category

        alpha[cat - 1] += main_mass

        if spill_mass > 0:
            spill_each = spill_mass / (K - 1)
            for j in range(K):
                if j != (cat - 1):
                    alpha[j] += spill_each

    total = sum(alpha) if sum(alpha) > 0 else 1.0
    probs = [a / total for a in alpha]

    dom_idx = max(range(K), key=lambda i: probs[i])
    dominant = dom_idx + 1

    recent = valid[-max(3, switch_window):]
    recent_cats = [int(t.sentimentCategory or 3) for t in recent]
    contradictions = sum(1 for c in recent_cats if c != dominant)

    if contradictions > 0:
        flatten = 1.0 - (contradict_penalty * contradictions)
        flatten = _clamp(flatten, 0.70, 0.98)  # do not flatten too aggressively
        uniform = 1.0 / K
        probs = [flatten * p + (1.0 - flatten) * uniform for p in probs]

    if len(recent_cats) >= switch_window:
        lastN = recent_cats[-switch_window:]
        if all(c == lastN[0] for c in lastN) and lastN[0] != dominant:
            new_cat = lastN[0]
            boost = 0.10 + 0.05 * switch_window
            probs[new_cat - 1] += boost
            s = sum(probs)
            probs = [p / s for p in probs]

    # ✅ NEW: global certainty dampening for early answers (prevents 95% after 1–2 turns)
    m = len(valid)
    if CERTAINTY_RAMP_QUESTIONS > 0 and m < CERTAINTY_RAMP_QUESTIONS:
        tmix = m / float(CERTAINTY_RAMP_QUESTIONS)
        uniform = 1.0 / K
        probs = [tmix * p + (1.0 - tmix) * uniform for p in probs]

    dom_idx = max(range(K), key=lambda i: probs[i])
    dominant = dom_idx + 1
    certainty = probs[dom_idx]

    s = sum(probs)
    probs = [p / s for p in probs] if s > 0 else probs
    probs = [round(_clamp(p, 0.0, 1.0), 4) for p in probs]
    certainty = round(_clamp(certainty, 0.0, 1.0), 3)

    return probs, dominant, certainty


def should_stop(turns: List[Turn], certainty: float) -> bool:
    answered = [t for t in turns if (not t.skipped) and (t.answer and t.answer.strip())]
    if len(answered) < MIN_QUESTIONS_BEFORE_STOP:
        return False
    if certainty >= CERTAINTY_STOP_THRESHOLD:
        return True
    if len(answered) >= MAX_QUESTIONS:
        return True
    return False


# -----------------------------
# NEXT QUESTION (FAST): sequential
# -----------------------------
def choose_next_question_sequential(session: Dict[str, Any], turns: List[Turn]) -> Optional[Question]:
    questions: List[Question] = session["questions"]
    asked_ids = {t.questionId for t in turns}
    for q in questions:
        if q.id not in asked_ids:
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
    if not req.questions:
        raise HTTPException(status_code=400, detail="questions list is empty")

    questions_only, labels = split_questions_and_labels_by_dash(req.questions)

    if labels and len(labels) != 5:
        raise HTTPException(
            status_code=400,
            detail=f"Found '-' delimiter but got {len(labels)} labels after it. Expected exactly 5.",
        )

    if not labels:
        labels = FALLBACK_LABELS

    if not questions_only:
        raise HTTPException(status_code=400, detail="No questions found before '-' delimiter.")

    sessions[req.session_id] = {
        "questions": questions_only,
        "createdAt": time.time(),
        "sentiment_cache": {},
        "sentiment_labels": labels,
    }

    return {"ok": True, "count": len(questions_only), "sentimentLabels": labels}


@app.post("/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id. Call /import-questions first.")

    labels = get_labels(session)
    questions: List[Question] = session["questions"]

    latest = req.turn
    turns_all = merge_latest_turn(req.turns, latest)

    # Fill history from cache only; only score latest with OpenAI
    cache: Dict[str, Any] = session.setdefault("sentiment_cache", {})
    filled: List[Turn] = []
    for t in turns_all[:-1]:
        if t.sentimentCategory is None or t.sentimentConfidence is None:
            key = _cache_key(t)
            if key in cache:
                t.sentimentCategory = int(cache[key]["category"])
                t.sentimentConfidence = float(cache[key]["confidence"])
        filled.append(t)

    turns_scored: List[Turn] = filled + ([ensure_turn_sentiment(session, turns_all[-1])] if turns_all else [])

    probs, dominant, certainty = compute_posterior_dynamic(turns_scored)
    value_score = int(round(certainty * 100))

    meaningful = [t for t in turns_scored if (not t.skipped) and (t.answer and t.answer.strip())]

    if len(meaningful) == 0:
        first_q = questions[0] if questions else None
        if not first_q:
            raise HTTPException(status_code=400, detail="No questions available.")
        return NextQuestionResponse(
            certainty=certainty,
            valueScore=value_score,
            tags=["start"],
            nextQuestion=first_q,
            isDone=False,
            dominantCategory=dominant,
            sentimentProbs=probs,
            sentimentLabels=labels,
        )

    if should_stop(turns_scored, certainty):
        return NextQuestionResponse(
            certainty=certainty,
            valueScore=value_score,
            tags=[labels[dominant - 1], "done"],
            nextQuestion=None,
            isDone=True,
            dominantCategory=dominant,
            sentimentProbs=probs,
            sentimentLabels=labels,
        )

    q = choose_next_question_sequential(session, turns_scored)
    if q is None:
        return NextQuestionResponse(
            certainty=certainty,
            valueScore=value_score,
            tags=[labels[dominant - 1], "exhausted", "done"],
            nextQuestion=None,
            isDone=True,
            dominantCategory=dominant,
            sentimentProbs=probs,
            sentimentLabels=labels,
        )

    return NextQuestionResponse(
        certainty=certainty,
        valueScore=value_score,
        tags=[labels[dominant - 1], "sequential"],
        nextQuestion=q,
        isDone=False,
        dominantCategory=dominant,
        sentimentProbs=probs,
        sentimentLabels=labels,
    )
