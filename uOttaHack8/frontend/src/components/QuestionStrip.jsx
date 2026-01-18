export default function QuestionStrip({
    brand = "uOttaHack8",
    questionText,
    step,
    maxSteps,
    isLoading,
    onSkip,
  }) {
    return (
      <div style={styles.wrap}>
        <div style={styles.brand}>{brand}</div>
  
        <div style={styles.center}>
          <span key={questionText} style={styles.questionAnimated}>
            {questionText}
          </span>
        </div>
  
        <div style={styles.right}>
          <div style={styles.step}>{step}/{maxSteps}</div>
          <button
            onClick={onSkip}
            disabled={isLoading}
            style={{ ...styles.skip, opacity: isLoading ? 0.4 : 0.85 }}
          >
            Skip
          </button>
        </div>
  
        <style>
          {`
            @keyframes fadeUp {
              from { opacity: 0; transform: translateY(7px); filter: blur(2px); }
              to   { opacity: 1; transform: translateY(0); filter: blur(0); }
            }
          `}
        </style>
      </div>
    );
  }
  
  const styles = {
    wrap: {
      width: "100%",
      boxSizing: "border-box",
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid rgba(255,255,255,0.10)",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
    },
    brand: { fontSize: 12, letterSpacing: 0.4, opacity: 0.75 },
    center: { flex: 1, padding: "0 12px", textAlign: "center" },
    questionAnimated: {
      display: "inline-block",
      animation: "fadeUp 240ms ease-out",
      fontWeight: 600,
      fontSize: 14,
    },
    right: { display: "flex", alignItems: "center", gap: 12 },
    step: { fontSize: 12, opacity: 0.65 },
    skip: {
      border: "none",
      background: "transparent",
      color: "white",
      cursor: "pointer",
      fontSize: 13,
    },
  };
  