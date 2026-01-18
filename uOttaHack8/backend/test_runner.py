from main import choose_question

sample_answers = [
    "I hated how long the wait was",
    "The queue was really slow",
    "It made me leave early",
]

turns = []

sentiment = -0.7
uncertainty = 0.9

for i, a in enumerate(sample_answers):
    q = choose_question(sentiment, uncertainty, turns)
    print(f"Q{i+1}:", q)
    turns.append(type("T", (), {"answer": q}))
    uncertainty -= 0.3
