import { useEffect, useMemo, useState } from "react";
import QuestionStrip from "./components/QuestionStrip";
import AnswerBox from "./components/AnswerBox";
import DebugPanel from "./components/DebugPanel";
import ArcherStage from "./components/ArcherStage";
import SettingsModal from "./components/SettingsModal";
import { getNextTurn, importQuestions } from "./lib/flowApi";
import bg from "./assets/bg1.png";
import "./index.css";

function normalizeLinesToQuestions(lines) {
  return lines
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q, i) => ({ id: `q${i + 1}`, text: q }));
}

export default function App() {
  const [sessionId] = useState(() => crypto.randomUUID());

  const [maxSteps, setMaxSteps] = useState(100);
  const [step, setStep] = useState(1);

  const [questionBank, setQuestionBank] = useState([]);
  const [question, setQuestion] = useState({ id: "q1", text: "Loading questions…" });

  const [answer, setAnswer] = useState("");
  const [turns, setTurns] = useState([]);

  const [loading, setLoading] = useState(false);

  // Arrow + finish flow
  const [done, setDone] = useState(false);
  const [arrowShot, setArrowShot] = useState(false);

  // ✅ NEW: only finish when backend says done
  const [backendDone, setBackendDone] = useState(false);

  // AI state
  const [certainty, setCertainty] = useState(0.18);
  const [valueScore, setValueScore] = useState(18);
  const [tags, setTags] = useState([]);

  const [dominantCategory, setDominantCategory] = useState(3);
  const [sentimentProbs, setSentimentProbs] = useState([0.1, 0.1, 0.6, 0.1, 0.1]);
  const [sentimentLabels, setSentimentLabels] = useState([
    "Extremely satisfied",
    "Very satisfied",
    "Satisfied",
    "Dissatisfied",
    "Extremely Dissatisfied",
  ]);

  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // When do we shoot?
  const SHOOT_THRESHOLD = 0.9; // match backend stop threshold (or slightly lower)
  const MIN_ANSWERED_BEFORE_SHOOT = 8; // ✅ require at least 5–10 answered questions

  const finalLabel = useMemo(() => {
    const idx = Math.min(5, Math.max(1, dominantCategory)) - 1;
    return sentimentLabels[idx] || sentimentLabels[2];
  }, [dominantCategory, sentimentLabels]);

  // Default bootstrap from public/questions.txt
  useEffect(() => {
    async function bootstrapSurvey() {
      try {
        const res = await fetch("/questions.txt");
        const text = await res.text();
        const questions = normalizeLinesToQuestions(text.split(/\r?\n/));

        setQuestionBank(questions);
        setQuestion(questions[0] ?? { id: "q1", text: "No questions found." });

        // ✅ reset run state
        setDone(false);
        setArrowShot(false);
        setBackendDone(false);
        setTurns([]);
        setAnswer("");
        setStep(1);

        const info = await importQuestions(sessionId, questions);
        if (info?.sentimentLabels?.length === 5) setSentimentLabels(info.sentimentLabels);

        // Ask backend for the initial broad question
        const initTurn = {
          questionId: "init",
          questionText: "",
          answer: null,
          skipped: true,
          createdAt: Date.now(),
        };
        const first = await getNextTurn({ sessionId, turn: initTurn, turns: [] });

        setCertainty(first.certainty);
        setValueScore(first.valueScore ?? Math.round(first.certainty * 100));
        setTags(first.tags ?? []);
        setDominantCategory(first.dominantCategory ?? 3);
        setSentimentProbs(first.sentimentProbs ?? [0.1, 0.1, 0.6, 0.1, 0.1]);
        if (first.sentimentLabels?.length === 5) setSentimentLabels(first.sentimentLabels);

        setQuestion(first.nextQuestion ?? questions[0] ?? { id: "q1", text: "No questions found." });
      } catch {
        setQuestion({ id: "q1", text: "Failed to load questions." });
      }
    }

    bootstrapSurvey();
  }, [sessionId]);

  // Debug payload
  const payload = useMemo(() => {
    return {
      session_id: sessionId,
      current_question: question,
      step,
      turns,
      certainty,
      dominantCategory,
      sentimentProbs,
      sentimentLabels,
      arrowShot,
      backendDone, // ✅ NEW
      done,
    };
  }, [
    sessionId,
    question,
    step,
    turns,
    certainty,
    dominantCategory,
    sentimentProbs,
    sentimentLabels,
    arrowShot,
    backendDone,
    done,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "d" || e.key === "D") setDebugOpen((v) => !v);
      if (e.key === "-") setSettingsOpen((v) => !v);
      if (e.key === "Escape") setSettingsOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Called by SettingsModal (upload/paste Questions.txt)
  async function handleSaveSettings(lines, newLimit) {
    const questions = normalizeLinesToQuestions(lines);

    setLoading(true);
    setDone(false);
    setArrowShot(false);
    setBackendDone(false); // ✅ NEW
    setTurns([]);
    setAnswer("");
    setStep(1);

    setMaxSteps(Math.min(newLimit ?? 100, questions.length || 1));
    setQuestionBank(questions);
    setQuestion(questions[0] ?? { id: "q1", text: "No questions found." });

    const info = await importQuestions(sessionId, questions);
    if (info?.sentimentLabels?.length === 5) setSentimentLabels(info.sentimentLabels);

    // Ask backend for the initial broad question
    const initTurn = {
      questionId: "init",
      questionText: "",
      answer: null,
      skipped: true,
      createdAt: Date.now(),
    };
    const first = await getNextTurn({ sessionId, turn: initTurn, turns: [] });

    setCertainty(first.certainty);
    setValueScore(first.valueScore ?? Math.round(first.certainty * 100));
    setTags(first.tags ?? []);
    setDominantCategory(first.dominantCategory ?? 3);
    setSentimentProbs(first.sentimentProbs ?? [0.1, 0.1, 0.6, 0.1, 0.1]);
    if (first.sentimentLabels?.length === 5) setSentimentLabels(first.sentimentLabels);

    setQuestion(first.nextQuestion ?? questions[0] ?? { id: "q1", text: "No questions found." });
    setLoading(false);
  }

  async function advance({ answerText, skipped }) {
    if (loading || done) return;

    const turn = {
      questionId: question.id,
      questionText: question.text,
      answer: skipped ? null : (answerText || "").trim(),
      skipped,
      createdAt: Date.now(),
    };

    // IMPORTANT: send full history including latest
    const nextTurns = [...turns, turn];
    setLoading(true);
    setTurns(nextTurns);

    const res = await getNextTurn({ sessionId, turn, turns: nextTurns });

    setCertainty(res.certainty);
    setValueScore(res.valueScore ?? Math.round(res.certainty * 100));
    setTags(res.tags ?? []);

    setDominantCategory(res.dominantCategory ?? 3);
    setSentimentProbs(res.sentimentProbs ?? [0.1, 0.1, 0.6, 0.1, 0.1]);
    if (res.sentimentLabels?.length === 5) setSentimentLabels(res.sentimentLabels);

    // Count answered (non-skipped, non-empty)
    const answeredCount = nextTurns.filter((t) => !t.skipped && t.answer && t.answer.trim()).length;

    // ✅ Only allow arrow shooting after minimum answered questions
    if (!arrowShot && answeredCount >= MIN_ANSWERED_BEFORE_SHOOT && res.certainty >= SHOOT_THRESHOLD) {
      setArrowShot(true);
    }

    // ✅ Backend controls completion; do NOT setDone() here
    if (res.isDone) {
      setBackendDone(true);

      // Optional: ensure we shoot on completion even if threshold not hit
      if (!arrowShot) setArrowShot(true);

      setAnswer("");
      setLoading(false);
      return;
    }

    // Otherwise continue asking questions
    setQuestion(res.nextQuestion ?? question);
    setStep((s) => Math.min(maxSteps, s + 1));
    setAnswer("");
    setLoading(false);
  }

  // When the arrow animation completes, ArcherStage will call this
  function handleArrowComplete() {
    // ✅ Only finish after backend says done
    if (backendDone) setDone(true);
  }

  return (
    <div style={styles.root}>
      <ArcherStage
        certainty={certainty}
        valueScore={valueScore}
        tags={tags}
        shouldShoot={arrowShot}
        onShootComplete={handleArrowComplete}
      />

      <QuestionStrip
        questionText={done ? "Survey result" : question.text}
        step={step}
        maxSteps={maxSteps}
        isLoading={loading}
        onSkip={() => advance({ answerText: "", skipped: true })}
      />

      {!done && (
        <AnswerBox
          value={answer}
          onChange={setAnswer}
          isLoading={loading}
          onSubmit={() => advance({ answerText: answer, skipped: false })}
        />
      )}

      {done && (
        <div style={styles.result}>
          <div style={styles.resultTitle}>Result</div>
          <div style={styles.resultLabel}>{finalLabel}</div>
          <div style={styles.resultMeta}>
            Certainty: <b>{Math.round(certainty * 100)}%</b> · Category <b>{dominantCategory}/5</b>
          </div>

          <div style={styles.dist}>
            {sentimentLabels.map((label, i) => {
              const p = sentimentProbs[i] ?? 0;
              const isDom = i + 1 === dominantCategory;
              return (
                <div key={label} style={styles.distRow}>
                  <div style={{ ...styles.distLabel, fontWeight: isDom ? 800 : 600 }}>
                    {label}
                  </div>
                  <div style={styles.barWrap}>
                    <div
                      style={{
                        ...styles.bar,
                        width: `${Math.round(p * 100)}%`,
                        opacity: isDom ? 1 : 0.7,
                      }}
                    />
                  </div>
                  <div style={styles.pct}>{Math.round(p * 100)}%</div>
                </div>
              );
            })}
          </div>

          <div style={{ opacity: 0.7, fontSize: 13, marginTop: 10 }}>
            Press <b>D</b> for debug · <b>-</b> for settings
          </div>
        </div>
      )}

      <DebugPanel open={debugOpen} payload={payload} certainty={certainty} tags={tags} valueScore={valueScore} />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSaveSettings={handleSaveSettings} />
    </div>
  );
}

const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundImage: `url(${bg})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },
  result: {
    padding: 18,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    backdropFilter: "blur(6px)",
    textAlign: "center",
  },
  resultTitle: { fontWeight: 900, fontSize: 18, marginBottom: 8 },
  resultLabel: { fontWeight: 950, fontSize: 20, marginBottom: 6 },
  resultMeta: { opacity: 0.85, fontSize: 13, marginBottom: 12 },

  dist: {
    maxWidth: 720,
    margin: "0 auto",
    display: "grid",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
  },
  distRow: {
    display: "grid",
    gridTemplateColumns: "1fr 220px 50px",
    gap: 10,
    alignItems: "center",
  },
  distLabel: { textAlign: "left", fontSize: 13 },
  barWrap: { height: 10, borderRadius: 999, background: "rgba(255,255,255,0.15)", overflow: "hidden" },
  bar: { height: "100%", borderRadius: 999, background: "rgba(255,255,255,0.85)" },
  pct: { textAlign: "right", fontSize: 12, opacity: 0.85 },
};
