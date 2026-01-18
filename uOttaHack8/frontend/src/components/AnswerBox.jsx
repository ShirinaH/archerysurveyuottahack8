export default function AnswerBox({
    value,
    onChange,
    onSubmit,
    isLoading,
    maxChars = 420,
  }) {
    const remaining = maxChars - value.length;
  
    return (
      <div style={styles.wrap}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxChars}
          placeholder="Type your answer… (specific + actionable = higher accuracy)"
          style={styles.textarea}
        />
  
        <div style={styles.row}>
          <div style={styles.hint}>
            Tip: mention the step + what you expected.
          </div>
          <div style={styles.remaining}>{remaining}</div>
        </div>
  
        <button
          onClick={onSubmit}
          disabled={isLoading || !value.trim()}
          style={{
            ...styles.btn,
            opacity: isLoading || !value.trim() ? 0.45 : 1,
            cursor: isLoading || !value.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "…" : "Lock In"}
        </button>
      </div>
    );
  }
  
  const styles = {
    wrap: {
      width: "100%",
      boxSizing: "border-box",
      padding: 16,
      background: "rgba(255,255,255,0.03)",
      borderTop: "1px solid rgba(255,255,255,0.10)",
    },
    textarea: {
        width: "100%",
        boxSizing: "border-box",
        minHeight: 92,
        borderRadius: 14,
        padding: 12,
        background: "rgba(0,0,0,0.35)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.18)",
        outline: "none",
        resize: "vertical",
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
      borderRadius: 14,
      padding: "12px 14px",
      fontWeight: 700,
      border: "none",
      background: "white",
      color: "black",
    },
  };
  