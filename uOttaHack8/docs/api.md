POST /next-question

Request:
{
  session_id: string,
  turn: {
    questionId: string,
    questionText: string,
    answer: string | null,
    skipped: boolean,
    createdAt: number
  },
  turns: Turn[]
}

Response:
{
  certainty: number (0–1),
  valueScore: number (0–100),
  tags: string[],
  nextQuestion?: {
    id: string,
    text: string
  },
  isDone: boolean
}

BACKEND: certainty should be computed from turns[]
BACKEND: nextQuestion.id must be stable
