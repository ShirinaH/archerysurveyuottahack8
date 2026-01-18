const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function importQuestions(sessionId, questions) {
  const res = await fetch(`${API_BASE}/import-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, questions }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "import-questions failed");
  }

  return res.json();
}

export async function getNextTurn({ sessionId, turn, turns }) {
  const res = await fetch(`${API_BASE}/next-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      turn,
      turns, // IMPORTANT: full history
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "next-question failed");
  }

  return res.json();
}
