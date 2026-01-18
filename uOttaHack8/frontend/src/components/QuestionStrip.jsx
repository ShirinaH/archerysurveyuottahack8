import { useEffect, useMemo, useState } from "react";

export default function QuestionStrip({
  questionText,
  step,
  maxSteps,
  isLoading,
  onSkip,
  // optional: tune typing speed
  typeSpeedMs = 30,
}) {
  const fullText = useMemo(
  () => (`Question: ${questionText || ""}`).toUpperCase(),
  [questionText]
);


  const [typed, setTyped] = useState("");

  useEffect(() => {
    // If loading, show a subtle placeholder without typing
    if (isLoading) {
      setTyped("Question: …");
      return;
    }

    // Typewriter animation for each new question
    let i = 0;
    setTyped(""); // reset
    const id = window.setInterval(() => {
      i += 1;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) window.clearInterval(id);
    }, typeSpeedMs);

    return () => window.clearInterval(id);
  }, [fullText, isLoading, typeSpeedMs]);

  return (
    <div style={styles.wrap}>

      {/* Main question line */}
      <div style={styles.questionLine} aria-live="polite">
        <span style={styles.questionText}>{typed}</span>
        {/* Caret while typing */}
        {!isLoading && typed.length < fullText.length && (
          <span style={styles.caret} aria-hidden="true">
            █
          </span>
        )}
      </div>

      {/* Right side controls */}
      <div style={styles.right}>
        <div style={styles.step}>
          {step}/{maxSteps}
        </div>
        <button
          onClick={onSkip}
          disabled={isLoading}
          style={{ ...styles.skip, opacity: isLoading ? 0.4 : 0.9 }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 16px",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 12,

    // No "strip" look:
    background: "transparent",
    borderTop: "none",
    borderBottom: "none",
  },

  questionLine: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 28,
    textAlign: "center",
    overflow: "hidden",
  },

  questionText: {
    fontFamily: `"Pixelify Sans", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.3,
    lineHeight: 1.2,
    color: "white",
    textShadow: "2px 1px 3px rgb(96, 80, 30)",
    
  },

  caret: {
    marginLeft: 6,
    fontSize: 14,
    opacity: 0.9,
    animation: "blink 900ms steps(1, end) infinite",
  },

  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    whiteSpace: "nowrap",
  },

  step: {
    fontSize: 12,
    opacity: 0.65,
    fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  },

  skip: {
    border: "none",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
  },
};

// Add keyframes once (works because it's a module file in React)
const styleElId = "__questionstrip_keyframes__";
if (typeof document !== "undefined" && !document.getElementById(styleElId)) {
  const el = document.createElement("style");
  el.id = styleElId;
  el.innerHTML = `
    @keyframes blink {
      0%, 49% { opacity: 0; }
      50%, 100% { opacity: 1; }
    }
  `;
  document.head.appendChild(el);
}
