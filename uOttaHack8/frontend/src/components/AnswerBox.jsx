export default function AnswerBox({
  value,
  onChange,
  onSubmit,
  isLoading,
  maxChars = 420,
}) {
  const remaining = maxChars - value.length;

  const canSubmit = !isLoading && !!value.trim();

  function handleKeyDown(e) {
    // Enter submits; Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <div style={styles.wrap}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={maxChars}
        placeholder="Type your answer… (specific + actionable = higher accuracy)"
        style={styles.textarea}
      />

      <div style={styles.row}>
        <div style={styles.hint}>Tip: Be specific.</div>
        <div style={styles.remaining}>{remaining}</div>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          ...styles.btn,
          opacity: !canSubmit ? 0.45 : 1,
          cursor: !canSubmit ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "…" : "Lock & Fire"}
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    width: "100%",
    boxSizing: "border-box",
    padding: 16,
    background: "rgba(255,255,255,0.00)",
    borderTop: "1px solid rgba(255,255,255,0.0)",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 92,
    borderRadius: 7,
    padding: 12,
    background: "rgba(53, 17, 2, 0.23)",
    color: "white",
    border: "0px solid rgba(74, 51, 6, 0.68)",
    outline: "none",
    resize: "none",
    fontSize: 14,
    lineHeight: 1.4,
  },
  row: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hint: { fontSize: 12, opacity: 0.65 },
  remaining: { fontSize: 12, opacity: 0.65 },
  btn: {
    marginTop: 10,
    width: "100%",
    borderRadius: 7,
    padding: "12px 14px",
    fontWeight: 700,
    border: "none",
    background: "#effe8d",
    color: "#697126",
  },
};
