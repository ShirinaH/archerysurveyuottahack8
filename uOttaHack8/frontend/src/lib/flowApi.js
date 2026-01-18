const API_BASE = "http://localhost:8000";

/**
 * Import questions into backend session
 */
export async function importQuestions(sessionId, questions) {
  const res = await fetch(`${API_BASE}/import-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      questions,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to import questions");
  }

  return res.json();
}

/**
 * Ask backend for next adaptive question
 */
export async function getNextTurn({ sessionId, turn, turns }) {
  const res = await fetch(`${API_BASE}/next-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      turn,
      turns,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch next question");
  }

  return res.json();
}
