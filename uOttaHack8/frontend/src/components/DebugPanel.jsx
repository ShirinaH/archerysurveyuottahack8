export default function DebugPanel({ open, payload, certainty, tags, valueScore }) {
    if (!open) return null;
  
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>Debug</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>press D to toggle</div>
        </div>
  
        <div style={styles.kv}>
          <div>certainty</div>
          <div>{(certainty * 100).toFixed(0)}%</div>
        </div>
        <div style={styles.kv}>
          <div>valueScore</div>
          <div>{valueScore}</div>
        </div>
        <div style={styles.kv}>
          <div>tags</div>
          <div style={{ textAlign: "right" }}>{tags.join(", ") || "-"}</div>
        </div>
  
        <pre style={styles.pre}>{JSON.stringify(payload, null, 2)}</pre>
      </div>
    );
  }
  
  const styles = {
    wrap: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 420,
      maxWidth: "90vw",
      maxHeight: "85vh",
      overflow: "auto",
      background: "rgba(0,0,0,0.72)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      padding: 12,
      color: "white",
      backdropFilter: "blur(10px)",
    },
    header: { display: "flex", justifyContent: "space-between", marginBottom: 10 },
    kv: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 12,
      opacity: 0.85,
      marginBottom: 6,
    },
    pre: {
      marginTop: 10,
      fontSize: 11,
      lineHeight: 1.35,
      opacity: 0.9,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
  };
  