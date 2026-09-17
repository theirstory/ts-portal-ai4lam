"""Named Entity Recognition using Claude.

Replaces GLiNER, which ran per paragraph with no view of the interview and so
tagged pronouns and generic nouns ("you", "it", "dad") as people.

Split of responsibilities:
  - Claude does the judgement: read a wide window of the transcript and return a
    deduplicated list of real named entities, each with a label and the surface
    forms the transcript actually uses for it.
  - This module does the locating: scan the word stream for those surface forms
    to produce every occurrence with exact start/end times.

That keeps highlight timings exact (they come from word timestamps, not from the
model guessing character offsets) and keeps the model's output small and cheap.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Sequence, Set, Tuple

import anthropic

from config import Config

logger = logging.getLogger(__name__)


class WindowRefused(Exception):
    """The model declined a window. Distinct from a window with no entities."""


@dataclass
class CanonicalEntity:
    """One distinct entity, with every surface form the transcript uses for it."""

    name: str
    label: str
    aliases: List[str] = field(default_factory=list)


@dataclass
class Occurrence:
    """A single located mention, timed from the word stream."""

    text: str
    label: str
    start_time: float
    end_time: float
    start_word: int
    end_word: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "label": self.label,
            "start_time": float(self.start_time),
            "end_time": float(self.end_time),
            "start_word": self.start_word,
            "end_word": self.end_word,
        }


# ----------------------------------------------------------------- tokens

def normalize_token(value: str) -> str:
    """Casefold, strip accents, and drop punctuation so surface forms compare."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    stripped = re.sub(r"[^a-z0-9'’-]", "", stripped)
    return re.sub(r"^['’-]+|['’-]+$", "", stripped)


def tokenize(value: str) -> List[str]:
    return [token for token in (normalize_token(part) for part in value.split()) if token]


def normalize_token_cased(value: str) -> str:
    """Same as normalize_token but keeps case, so "US" can be told from "us"."""
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    stripped = re.sub(r"[^A-Za-z0-9'’-]", "", stripped)
    return re.sub(r"^['’-]+|['’-]+$", "", stripped)


def tokenize_cased(value: str) -> List[str]:
    return [token for token in (normalize_token_cased(part) for part in value.split()) if token]


# Never treat these as entity surface forms. Short acronyms collide with common
# words once case is discarded - "US" (the country) vs. the pronoun "us" - so
# such forms are matched case-sensitively instead (see is_acronym_form).
PRONOUNS: Set[str] = {
    "i", "me", "my", "mine", "myself",
    "you", "your", "yours", "yourself",
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "it", "its", "itself",
    "we", "us", "our", "ours", "ourselves",
    "they", "them", "their", "theirs", "themselves",
    "this", "that", "these", "those", "there", "here",
}


# A leading article belongs to the sentence, not the entity name. The prompt asks
# for bare names, but the model still returns "The Fiji" often enough to enforce it.
ARTICLES: Set[str] = {"the", "a", "an"}

# Question and relative words, which behave like pronouns for matching purposes.
# Kept separate from PRONOUNS so "The Who" is not reduced to a bare "who" that
# would then match every question in the transcript.
QUESTION_WORDS: Set[str] = {"who", "what", "which", "when", "where", "why", "how"}


def strip_leading_articles(tokens: List[str]) -> List[str]:
    """Drop a leading "the"/"a"/"an", unless doing so leaves a word too common to match on."""
    index = 0
    while index < len(tokens) - 1 and tokens[index].lower() in ARTICLES:
        index += 1

    remainder = tokens[index:]
    if len(remainder) == 1 and remainder[0].lower() in (PRONOUNS | QUESTION_WORDS):
        return tokens
    return remainder


def is_acronym_form(surface: str) -> bool:
    """A short all-caps form such as "US", "MIT", "NASA", "U.S."."""
    letters = re.sub(r"[^A-Za-z]", "", surface)
    return 0 < len(letters) <= 4 and letters == letters.upper()


# ----------------------------------------------------------------- claude

SYSTEM_PROMPT = """You extract named entities from oral history interview transcripts for a research archive.

Return ONLY real, specific named entities - things a researcher would want to search or browse by.

Include:
- Named people (full names where given), organizations, institutions, companies
- Named places (cities, states, countries, neighbourhoods, campuses, buildings)
- Specific dates and named time periods ("April 30th, 1960", "the Great Depression")
- Named events, named awards, named publications/books, named technologies, named social movements, named languages

Exclude, without exception:
- Pronouns and possessives ("I", "you", "he", "we", "my", "your")
- Generic role or kinship nouns with no name ("dad", "mother", "the professor", "people", "the company")
- Generic nouns, filler words, verbs, adjectives
- Generic technology and media nouns ("the web", "websites", "email", "video", "software", "metadata") - a technology counts only if it has a proper name, like "WebVTT", "HTML", "MARC", "FFmpeg"
- Vague time references ("later", "back then", "a few years ago")
- Anything you are not confident is a specific named entity

For each entity give:
- "name": the canonical form (e.g. "Maynard Ansley Holliday", "Carnegie Mellon University")
- "label": exactly one of the allowed labels
- "aliases": every other surface form used in THIS excerpt for the same entity, exactly as transcribed (e.g. ["Holliday", "Maynard", "Carnegie Mellon"]). Omit or use [] if none.

Deduplicate: one object per distinct entity, not one per mention.
Do not include a leading article ("the", "a", "an") in a name or an alias.

Respond with a JSON array only - no prose, no markdown fence."""


def build_user_prompt(window: Sequence[Dict[str, Any]], labels: Sequence[str]) -> str:
    transcript = "\n\n".join(
        f"[{para.get('speaker') or 'Unknown'}] {para['text']}" for para in window
    )
    return (
        f"Allowed labels (use these exact strings): {', '.join(labels)}\n\n"
        "Transcript excerpt:\n"
        f'"""\n{transcript}\n"""\n\n'
        "Return the JSON array of entities found in this excerpt."
    )


@lru_cache(maxsize=1)
def get_client() -> anthropic.Anthropic:
    if not Config.NER_PROVIDER_API_KEY:
        raise RuntimeError(
            "NER_PROVIDER_API_KEY (or ANTHROPIC_API_KEY) is required to run NER. "
            "Set one, or import with run_ner=false."
        )
    logger.info("[NER] Using Claude entity extractor (model=%s)", Config.NER_MODEL)
    return anthropic.Anthropic(
        api_key=Config.NER_PROVIDER_API_KEY,
        timeout=Config.NER_TIMEOUT_SECONDS,
        max_retries=Config.NER_MAX_RETRIES,
    )


def parse_entity_json(raw: str, allowed_labels: Set[str]) -> List[CanonicalEntity]:
    """Pull the JSON array out of the response, dropping anything malformed."""
    start = raw.find("[")
    end = raw.rfind("]")
    if start < 0 or end <= start:
        return []

    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("[NER] Could not parse JSON from model response")
        return []

    if not isinstance(parsed, list):
        return []

    entities: List[CanonicalEntity] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        label = str(item.get("label") or "").strip().lower()
        if not name or label not in allowed_labels:
            continue

        raw_aliases = item.get("aliases")
        aliases = (
            [str(alias).strip() for alias in raw_aliases if str(alias).strip()]
            if isinstance(raw_aliases, list)
            else []
        )
        entities.append(CanonicalEntity(name=name, label=label, aliases=aliases))

    return entities


def extract_window_entities(
    window: Sequence[Dict[str, Any]],
    labels: Sequence[str],
    allowed_labels: Set[str],
) -> Tuple[List[CanonicalEntity], int, int]:
    """Ask Claude for the entities in one window. Returns (entities, in, out) tokens."""
    request: Dict[str, Any] = {
        "model": Config.NER_MODEL,
        "max_tokens": Config.NER_MAX_OUTPUT_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": build_user_prompt(window, labels)}],
    }
    # Omitted by default, which leaves the API's own effort default in place.
    if Config.NER_EFFORT:
        request["output_config"] = {"effort": Config.NER_EFFORT}

    response = get_client().messages.create(**request)

    # A refused window would otherwise just look like a window with no entities.
    if response.stop_reason == "refusal":
        category = getattr(response.stop_details, "category", None)
        raise WindowRefused(f"model declined this window (category={category})")

    text = "".join(block.text for block in response.content if block.type == "text")
    usage = response.usage
    return (
        parse_entity_json(text, allowed_labels),
        getattr(usage, "input_tokens", 0) or 0,
        getattr(usage, "output_tokens", 0) or 0,
    )


# ---------------------------------------------------------------- windows

def collect_paragraphs(sections: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flatten sections into paragraphs carrying their slice of the word stream."""
    paragraphs: List[Dict[str, Any]] = []
    cursor = 0

    for section in sections:
        for para in section.get("paragraphs", []):
            words = [
                word
                for word in para.get("words", [])
                if isinstance(word, dict) and (word.get("text") or "").strip()
            ]
            if not words:
                continue

            paragraphs.append(
                {
                    "speaker": para.get("speaker") or "Unknown",
                    "words": words,
                    "text": " ".join(word["text"] for word in words),
                    "first_word": cursor,
                    "last_word": cursor + len(words) - 1,
                }
            )
            cursor += len(words)

    return paragraphs


def build_windows(paragraphs: Sequence[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Group paragraphs into windows of roughly NER_WORDS_PER_WINDOW words."""
    windows: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    current_words = 0

    for para in paragraphs:
        size = para["last_word"] - para["first_word"] + 1
        if current and current_words + size > Config.NER_WORDS_PER_WINDOW:
            windows.append(current)
            current = []
            current_words = 0
        current.append(para)
        current_words += size

    if current:
        windows.append(current)
    return windows


# --------------------------------------------------------------- matching

def merge_entities(
    batches: Sequence[Sequence[CanonicalEntity]],
    allowed_labels: Set[str],
) -> List[CanonicalEntity]:
    """Fold per-window entity lists into one deduplicated list."""
    merged: Dict[str, Dict[str, Any]] = {}

    for batch in batches:
        for entity in batch:
            if entity.label not in allowed_labels:
                continue
            key_tokens = strip_leading_articles(tokenize(entity.name))
            if not key_tokens:
                continue

            key = " ".join(key_tokens)
            existing = merged.setdefault(
                key, {"name": entity.name, "label_votes": {}, "aliases": set()}
            )
            votes = existing["label_votes"]
            votes[entity.label] = votes.get(entity.label, 0) + 1
            for alias in entity.aliases:
                if tokenize(alias):
                    existing["aliases"].add(alias)

    return [
        CanonicalEntity(
            name=entry["name"],
            # Windows can disagree on a label; take the most frequent reading.
            label=max(entry["label_votes"].items(), key=lambda pair: pair[1])[0],
            aliases=sorted(entry["aliases"]),
        )
        for entry in merged.values()
    ]


def locate_occurrences(
    entities: Sequence[CanonicalEntity],
    words: Sequence[Dict[str, Any]],
) -> List[Occurrence]:
    """Find every occurrence of each entity's surface forms in the word stream.

    Longer forms win, so "Carnegie Mellon University" is not also counted as a
    separate "Carnegie Mellon" occurrence at the same position.
    """
    tokens = [normalize_token(word["text"]) for word in words]
    tokens_cased = [normalize_token_cased(word["text"]) for word in words]

    forms: List[Dict[str, Any]] = []
    for entity in entities:
        for surface in [entity.name, *entity.aliases]:
            form_tokens = strip_leading_articles(tokenize(surface))
            # Single-character forms match far too much to be useful.
            if not form_tokens or len("".join(form_tokens)) < 2:
                continue

            # Generic single words the archive has chosen not to index.
            if len(form_tokens) == 1 and form_tokens[0] in Config.NER_STOPLIST:
                continue

            # Never index a form containing a blocked term, at any position.
            # Speech-to-text mangles proper nouns into slurs ("FADGI guidelines"
            # came through as "<slur> guidelines"), and entity browsing puts
            # those in the sidebar as prominent, clickable terms.
            if any(token in Config.NER_BLOCKLIST for token in form_tokens):
                logger.info("[NER] Dropped blocked surface form for label=%s", entity.label)
                continue

            case_sensitive = len(form_tokens) == 1 and is_acronym_form(surface)

            # A lowercase pronoun is never an entity mention. Acronyms that merely
            # collide with one ("US") are kept, but matched with case respected.
            if not case_sensitive and any(token in PRONOUNS for token in form_tokens):
                continue

            forms.append(
                {
                    "tokens": (
                        strip_leading_articles(tokenize_cased(surface))
                        if case_sensitive
                        else form_tokens
                    ),
                    "label": entity.label,
                    "case_sensitive": case_sensitive,
                }
            )

    forms.sort(key=lambda form: len(form["tokens"]), reverse=True)

    claimed = [False] * len(words)
    occurrences: List[Occurrence] = []

    for form in forms:
        form_tokens = form["tokens"]
        width = len(form_tokens)
        haystack = tokens_cased if form["case_sensitive"] else tokens

        for i in range(len(haystack) - width + 1):
            if haystack[i : i + width] != form_tokens:
                continue
            if any(claimed[i : i + width]):
                continue

            for j in range(i, i + width):
                claimed[j] = True

            text = " ".join(word["text"] for word in words[i : i + width])
            occurrences.append(
                Occurrence(
                    text=re.sub(r"[,.;:!?]+$", "", text),
                    label=form["label"],
                    start_time=float(words[i]["start"]),
                    end_time=float(words[i + width - 1]["end"]),
                    start_word=i,
                    end_word=i + width - 1,
                )
            )

    # Word index breaks ties, so ordering stays document order even if two
    # paragraphs report overlapping timestamps.
    return sorted(occurrences, key=lambda occ: (occ.start_time, occ.start_word))


# ------------------------------------------------------------------ entry

def add_curated_labels(occurrences: List[Occurrence]) -> List[Occurrence]:
    """Also file curated entities under their additional label(s).

    Applied after locating rather than before, because locating claims each
    word once to stop nested names double-counting — a second copy of the same
    entity would find every span already taken and produce nothing.
    """
    if not Config.NER_ADDITIONAL_LABELS:
        return occurrences

    extras: List[Occurrence] = []
    for text, extra_label in Config.NER_ADDITIONAL_LABELS:
        wanted = text.strip().lower()
        if not wanted or not extra_label:
            continue
        for occurrence in occurrences:
            if occurrence.text.strip().lower() != wanted:
                continue
            if occurrence.label == extra_label:
                continue
            extras.append(
                Occurrence(
                    text=occurrence.text,
                    label=extra_label,
                    start_time=occurrence.start_time,
                    end_time=occurrence.end_time,
                    start_word=occurrence.start_word,
                    end_word=occurrence.end_word,
                )
            )

    if extras:
        logger.info("[NER] Added %s curated dual-label occurrence(s)", len(extras))

    return sorted(occurrences + extras, key=lambda occ: (occ.start_time, occ.start_word))


def empty_ner_stats() -> Dict[str, int]:
    return {
        "windows_processed": 0,
        "paragraphs_processed": 0,
        "canonical_entities": 0,
        "entities_found": 0,
        "empty_results": 0,
        "refusals": 0,
        "errors": 0,
        "input_tokens": 0,
        "output_tokens": 0,
    }


def extract_entities(
    sections: Sequence[Dict[str, Any]],
    labels: Sequence[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Run Claude NER over a transcript and return located occurrences + stats."""
    stats = empty_ner_stats()

    resolved_labels = [str(label).strip() for label in labels if str(label).strip()]
    if not resolved_labels:
        logger.info("[NER] No labels configured; skipping extraction")
        return [], stats

    paragraphs = collect_paragraphs(sections)
    if not paragraphs:
        return [], stats

    words = [word for para in paragraphs for word in para["words"]]
    transcript_length = sum(len(para["text"]) for para in paragraphs)
    if transcript_length < Config.MIN_TEXT_LENGTH_FOR_NER:
        logger.info("[NER] Transcript below MIN_TEXT_LENGTH_FOR_NER; skipping")
        return [], stats

    windows = build_windows(paragraphs)
    allowed_labels = {label.lower() for label in resolved_labels}
    print(
        f"   📏 {len(words)} words -> {len(windows)} windows "
        f"(~{Config.NER_WORDS_PER_WINDOW} words each)"
    )

    def run_window(index_window: Tuple[int, List[Dict[str, Any]]]) -> List[CanonicalEntity]:
        index, window = index_window
        try:
            entities, input_tokens, output_tokens = extract_window_entities(
                window, resolved_labels, allowed_labels
            )
            stats["windows_processed"] += 1
            stats["paragraphs_processed"] += len(window)
            stats["input_tokens"] += input_tokens
            stats["output_tokens"] += output_tokens
            if not entities:
                stats["empty_results"] += 1
            print(f"   🔄 Window {index + 1}/{len(windows)}: {len(entities)} entities")
            return entities
        except WindowRefused as exc:
            print(f"      ⚠️  NER window {index + 1} refused: {exc}")
            stats["refusals"] += 1
            return []
        except Exception as exc:
            print(f"      ⚠️  NER error in window {index + 1}: {exc}")
            stats["errors"] += 1
            return []

    with ThreadPoolExecutor(max_workers=Config.NER_WINDOW_CONCURRENCY) as executor:
        batches = list(executor.map(run_window, enumerate(windows)))

    merged = merge_entities(batches, allowed_labels)
    stats["canonical_entities"] = len(merged)

    occurrences = add_curated_labels(locate_occurrences(merged, words))
    stats["entities_found"] = len(occurrences)

    return [occ.to_dict() for occ in occurrences], stats
