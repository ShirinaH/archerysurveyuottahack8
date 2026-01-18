import { useEffect, useMemo, useState } from "react";
import QuestionStrip from "./components/QuestionStrip";
import AnswerBox from "./components/AnswerBox";
import DebugPanel from "./components/DebugPanel";
import ArcherStage from "./components/ArcherStage";
import SettingsModal from "./components/SettingsModal";
import { getNextTurn, importQuestions } from "./lib/flowApi";

export default function App() {
  // Stable per tab/session
  const [sessionId] = useState(() => crypto.randomUUID());

  // Flow state
  const maxSteps = 3;
  const [step, setStep] = useState(1);
  const [question, setQuestion] = useState({
    id: "q1",
    text: "Loading questions…",
  });

  // User input
  const [answer, setAnswer] = useState("");

  // Stored history
  const [turns, setTurns] = useState([]);

  // UI and scoring
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [certainty, setCertainty] = useState(0.18);
  const [valueScore, setValueScore] = useState(18);
  const [tags, setTags] = useState([]);

  // Panels
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // -----------------------------
  // ✅ BOOTSTRAP QUESTIONS (NEW)
  // -----------------------------
  useEffect(() => {
    async function bootstrapSurvey() {
      const res = await fetch("/questions.txt");
      const text = await res.text();

      const questions = text
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean)
        .map((q, i) => ({
          id: `q${i + 1}`,
          text: q,
        }));

      await importQuestions(sessionId, questions);

      // Set first question locally
      setQuestion(questions[0]);
    }

    bootstrapSurvey();
  }, [sessionId]);

  // -----------------------------
  // Payload builder (unchanged)
  // -----------------------------
  const payload = useMemo(() => {
    return {
      session_id: sessionId,
      current_question: question,
      step,
      turns,
    };
  }, [sessionId, question, step, turns]);

  // -----------------------------
  // Keyboard shortcuts
  // -----------------------------
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "d" || e.key === "D") {
        setDebugOpen((v) => !v);
      }

      if (e.key === "-") {
        setSettingsOpen((v) => !v);
      }

      if (e.key === "Escape") {
        setSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // -----------------------------
  // Advance survey
  // -----------------------------
  async function advance({ answerText, skipped }) {
    if (loading || done) return;

    const turn = {
      questionId: question.id,
      questionText: question.text,
      answer: skipped ? null : (answerText || "").trim(),
      skipped,
      createdAt: Date.now(),
    };

    setLoading(true);
    setTurns((prev) => [...prev, turn]);

    const res = await getNextTurn({
      sessionId,
      turn,
      turns: [...turns, turn],
    });

    setCertainty(res.certainty);
    setValueScore(res.valueScore ?? Math.round(res.certainty * 100));
    setTags(res.tags ?? []);

    if (res.isDone) {
      setDone(true);
      setStep(maxSteps);
      setAnswer("");
    } else {
      setQuestion(res.nextQuestion);
      setStep((s) => Math.min(maxSteps, s + 1));
      setAnswer("");
    }

    setLoading(false);
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div style={styles.root}>
      <ArcherStage certainty={certainty} valueScore={valueScore} tags={tags} />

      <QuestionStrip
        questionText={done ? "Thanks — you’re done." : question.text}
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
        <div style={styles.done}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Done.</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Press <b>D</b> for debug · <b>-</b> for settings
          </div>
        </div>
      )}

      <DebugPanel
        open={debugOpen}
        payload={payload}
        certainty={certainty}
        tags={tags}
        valueScore={valueScore}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "#0a0a0a",
    color: "white",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  done: {
    padding: 16,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    textAlign: "center",
  },
};
