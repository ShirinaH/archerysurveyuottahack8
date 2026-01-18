export default function ArcherStage({ certainty, valueScore, tags }) {
    const pct = Math.round(certainty * 100);
    const spread = Math.round((1 - certainty) * 100); // high certainty = low spread
    const fire = certainty >= 0.8;
  
    return (
      <div style={styles.stage}>
        {/* Background vibe */}
        <div style={styles.bg} />
  
        {/* Content */}
        <div style={styles.card}>
          <div style={styles.title}>Archer / Bullseye Stage</div>
          <div style={styles.sub}>
            Draw strength + spread react to certainty (placeholder visuals for now)
          </div>
  
          <div style={styles.row}>
            <div style={styles.label}>Certainty</div>
            <div style={styles.value}>{pct}%</div>
          </div>
  
          <div style={styles.meter}>
            <div style={{ ...styles.meterFill, width: `${pct}%` }} />
          </div>
  
          <div style={{ ...styles.fire, opacity: fire ? 1 : 0 }}>
            🔥 Fire Arrow (high confidence)
          </div>
  
          <div style={{ ...styles.row, marginTop: 10 }}>
            <div style={styles.label}>Spread</div>
            <div style={styles.value}>{spread}%</div>
          </div>
  
          <div style={styles.spreadBar}>
            <div style={{ ...styles.spreadFill, width: `${spread}%` }} />
          </div>
  
          <div style={styles.tags}>
            <span style={styles.badge}>value {valueScore}</span>
            {(tags || []).slice(0, 4).map((t) => (
              <span key={t} style={styles.badgeMuted}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  const styles = {
    stage: {
      flex: 1, // IMPORTANT: this is what keeps question/answer from floating to the top
      width: "100%",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    bg: {
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(900px 500px at 50% 30%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.0))",
    },
    card: {
      position: "relative",
      width: "min(900px, 92vw)",
      borderRadius: 22,
      padding: 22,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(8px)",
    },
    title: { fontSize: 18, fontWeight: 800 },
    sub: { marginTop: 6, fontSize: 12, opacity: 0.7 },
    row: { marginTop: 14, display: "flex", justifyContent: "space-between" },
    label: { fontSize: 12, opacity: 0.7 },
    value: { fontSize: 12, opacity: 0.9, fontWeight: 700 },
    meter: {
      marginTop: 8,
      height: 10,
      borderRadius: 999,
      background: "rgba(255,255,255,0.08)",
      overflow: "hidden",
    },
    meterFill: {
      height: "100%",
      borderRadius: 999,
      background: "rgba(255,255,255,0.92)",
      transition: "width 240ms ease",
    },
    fire: {
      marginTop: 12,
      fontSize: 12,
      fontWeight: 800,
      transition: "opacity 240ms ease",
    },
    spreadBar: {
      marginTop: 8,
      height: 10,
      borderRadius: 999,
      background: "rgba(255,255,255,0.08)",
      overflow: "hidden",
    },
    spreadFill: {
      height: "100%",
      borderRadius: 999,
      background: "rgba(255,255,255,0.35)",
      transition: "width 240ms ease",
    },
    tags: { marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 },
    badge: {
      fontSize: 12,
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.10)",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    badgeMuted: {
      fontSize: 12,
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(0,0,0,0.35)",
      border: "1px solid rgba(255,255,255,0.10)",
      opacity: 0.9,
    },
  };
  