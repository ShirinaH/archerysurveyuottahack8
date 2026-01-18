import { useState } from "react";
import { createPortal } from "react-dom";

export default function SettingsModal({ isOpen, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  function handleFile(file) {
    if (!file) return;

    if (!file.name.endsWith(".txt")) {
      setError("Only .txt files are supported");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = e.target.result
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      setQuestions(parsed);
      setError(null);
    };

    reader.readAsText(file);
  }

  return createPortal(
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.wrap} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>Settings</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            press <b>-</b> or <b>Esc</b>
          </div>
        </div>

        {/* Import Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Import survey questions (.txt)
          </div>

          <label style={styles.uploadBox}>
            <input
              type="file"
              accept=".txt"
              hidden
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div style={{ opacity: 0.85 }}>
              Click to upload or drop a file
            </div>
            <div style={styles.muted}>One question per line</div>
          </label>

          {error && (
            <div style={{ color: "#ff6b6b", fontSize: 12 }}>{error}</div>
          )}
        </div>

        {/* Preview */}
        {questions.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Imported ({questions.length})
            </div>

            <div style={styles.preview}>
              {questions.slice(0, 6).map((q, i) => (
                <div key={i} style={styles.previewLine}>
                  {i + 1}. {q}
                </div>
              ))}
              {questions.length > 6 && (
                <div style={styles.muted}>
                  …and {questions.length - 6} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toggles */}
        <div style={styles.section}>
          <div style={styles.row}>
            <span>Enable adaptive questions</span>
            <input type="checkbox" />
          </div>

          <div style={styles.row}>
            <span>Question Limit</span>
            <input
                type="number"
                min={1}
                max={100}
                style={styles.smallInput}
            />
          </div>
        </div>

        {/* Action */}
        <button
          style={styles.save}
          onClick={() => {
            console.log("Imported questions:", questions);
            onClose();
          }}
        >
          Save settings
        </button>
      </div>
    </div>,
    document.getElementById("modal-root")
  );
}

/* =======================
   Styles (Debug-style)
======================= */

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  wrap: {
    width: 440,
    maxWidth: "92vw",
    maxHeight: "85vh",
    overflow: "auto",
    background: "rgba(0,0,0,0.72)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 14,
    color: "white",
    backdropFilter: "blur(12px)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  section: {
    marginBottom: 14,
    fontSize: 13,
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: 6,
    opacity: 0.9,
  },
  uploadBox: {
    border: "1px dashed rgba(255,255,255,0.25)",
    borderRadius: 10,
    padding: 10,
    cursor: "pointer",
  },
  preview: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 8,
    fontSize: 12,
    maxHeight: 140,
    overflow: "auto",
  },
  previewLine: {
    opacity: 0.85,
    marginBottom: 4,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    opacity: 0.85,
  },
  muted: {
    fontSize: 11,
    opacity: 0.55,
    marginTop: 4,
  },
  save: {
    width: "100%",
    padding: "8px 0",
    borderRadius: 10,
    background: "white",
    color: "black",
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  },
};