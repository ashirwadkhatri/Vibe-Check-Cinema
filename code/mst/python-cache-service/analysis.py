import re

POSITIVE_WORDS = set(
    "amazing awesome beautiful brilliant compelling excellent fantastic fascinating fun funny "
    "good great incredible love loved masterpiece perfect powerful remarkable solid stunning "
    "superb entertaining enjoyable emotional favorite well-written worth watch recommend".split()
)
NEGATIVE_WORDS = set(
    "awful bad boring confusing disappointing dislike disliked dull fails failure flat "
    "forgettable horrible hate hated lazy mediocre messy predictable poor terrible tedious "
    "weak worst waste wasted".split()
)
ASPECTS = {
    "Acting": ["acting", "actor", "actress", "cast", "performance"],
    "Story": ["story", "plot", "writing", "script", "narrative", "character"],
    "Visuals": ["visual", "cinematography", "effects", "animation", "scene"],
    "Music": ["music", "soundtrack", "score", "song", "sound"],
    "Pacing": ["pace", "pacing", "slow", "fast", "length"],
}

_SENTENCE_SPLIT = re.compile(r"[.!?]+")
_WORD_CLEAN = re.compile(r"[^a-z0-9\s']")


def analyze(reviews: list[dict], title: str) -> dict:
    pros: list[dict] = []
    cons: list[dict] = []
    positive_reviews: list[dict] = []
    negative_reviews: list[dict] = []
    stats: dict[str, dict] = {}
    positive = 0
    negative = 0

    for review in reviews:
        text = str(review.get("text", ""))
        for raw_sentence in _SENTENCE_SPLIT.split(text):
            sentence = raw_sentence.strip()
            if not sentence:
                continue

            lowered = sentence.lower()
            words = [w for w in _WORD_CLEAN.sub(" ", lowered).split() if w]
            score = sum(1 if w in POSITIVE_WORDS else (-1 if w in NEGATIVE_WORDS else 0) for w in words)
            if score == 0:
                continue

            found_aspects = [
                name for name, keywords in ASPECTS.items() if any(kw in lowered for kw in keywords)
            ]

            if score > 0:
                positive += 1
                if len(positive_reviews) < 40:
                    positive_reviews.append(
                        {"text": sentence, "sentiment": "positive", "aspects": found_aspects, **review}
                    )
            else:
                negative += 1
                if len(negative_reviews) < 40:
                    negative_reviews.append(
                        {"text": sentence, "sentiment": "negative", "aspects": found_aspects, **review}
                    )

            for aspect in found_aspects:
                bucket = stats.setdefault(aspect, {"pro": 0, "con": 0, "examples": []})
                if score > 0:
                    bucket["pro"] += 1
                else:
                    bucket["con"] += 1
                if len(bucket["examples"]) < 3:
                    bucket["examples"].append(sentence)

    for aspect, bucket in stats.items():
        entry = {
            "aspect": aspect,
            "pro_mentions": bucket["pro"],
            "con_mentions": bucket["con"],
            "examples": bucket["examples"],
        }
        if bucket["pro"] > bucket["con"]:
            pros.append(entry)
        if bucket["con"] > bucket["pro"]:
            cons.append(entry)

    total = positive + negative
    pct = round((positive / total) * 1000) / 10 if total else None
    if pct is None:
        verdict = "Not enough data"
    elif pct >= 65:
        verdict = "Mostly Positive"
    elif pct <= 35:
        verdict = "Mostly Negative"
    else:
        verdict = "Mixed"

    summary = (
        f"Based on {len(reviews)} audience reviews, {title} has a {verdict.lower()} "
        f"reception ({pct}% positive sentiment)."
        if total
        else f"We couldn't find enough audience reviews for {title} yet to generate a pros/cons summary."
    )

    return {
        "movie_title": title,
        "reviews_analyzed": len(reviews),
        "sentences_scored": total,
        "overall_verdict": verdict,
        "overall_positive_pct": pct,
        "positive": pros[:8],
        "negative": cons[:8],
        "pros": pros[:8],
        "cons": cons[:8],
        "positive_reviews": positive_reviews,
        "negative_reviews": negative_reviews,
        "summary": summary,
    }
