"""Pure, testable rules — no network, no AI. All thresholds from prompts.md."""

from __future__ import annotations

import re
from datetime import datetime, timezone

BEGINNER_LABELS = {
    "good first issue",
    "good-first-issue",
    "help wanted",
    "help-wanted",
    "documentation",
    "docs",
    "hacktoberfest",
    "beginner",
    "easy",
    "starter",
    "up-for-grabs",
}

FIX_RE = re.compile(r"\b(fix(?:es|ed)?|clos(?:es|ed)?|resolv(?:es|ed)?)\s+#(\d+)", re.I)
PATH_RE = re.compile(r"`([^`\n]{1,200})`")


def parse_repo_url(url: str) -> tuple[str, str]:
    """Accept full URL, SSH clone URL, or owner/repo. Returns (owner, repo)."""
    s = (url or "").strip().removesuffix("/").replace("\\", "/")
    s = re.sub(r"\.git$", "", s)

    for prefix in ("https://github.com/", "http://github.com/", "git@github.com:", "ssh://git@github.com/"):
        if s.startswith(prefix):
            s = s.replace(prefix, "https://github.com/")
            break

    m = re.search(r"github\.com[:/]+([^/]+)/([^/?#]+)", s)
    if m:
        return m.group(1), m.group(2)

    parts = [p for p in s.split("/") if p]
    if len(parts) == 2 and all(parts):
        return parts[0], parts[1]
    raise ValueError("Expected GitHub URL or owner/repo")


def band_0_6(total: int) -> int:
    if total <= 0:
        return 1
    if total <= 2:
        return 2
    if total <= 4:
        return 3
    if total == 5:
        return 4
    return 5


def lang_band(total_0_10: int) -> int:
    if total_0_10 <= 1:
        return 1
    if total_0_10 <= 4:
        return 2
    if total_0_10 <= 6:
        return 3
    if total_0_10 <= 8:
        return 4
    return 5


def score_quiz(payload: dict) -> dict:
    """Payload: {g1,g2,c1,c2_picks[],l1, l2_picks[], l3_score, hours, interests, languages[]}.
    Returns git/collab/lang levels + bands. L3 score must already be validated 0-3."""
    g = int(payload.get("g1", 0)) + int(payload.get("g2", 0))
    c = int(payload.get("c1", 0)) + min(3, len(payload.get("c2_picks", [])))
    git, collab = band_0_6(g), band_0_6(c)
    l3 = max(0, min(3, int(payload.get("l3_score", 1))))
    lang_total = int(payload.get("l1", 0)) + min(4, len(payload.get("l2_picks", []))) + l3
    return {
        "git": git,
        "collab": collab,
        "lang_total": lang_total,
        "lang_level": lang_band(lang_total),
    }


def merge_levels(quiz_git: int, quiz_lang: int, gh_experience_1_5: int | None,
                 gh_technical_1_5: int | None) -> tuple[int, int]:
    """50/50 merge with ±1 clamp. No GitHub data -> quiz alone."""
    if gh_experience_1_5 is None or gh_technical_1_5 is None:
        return quiz_git, quiz_lang
    delta = max(-1, min(1, int(gh_experience_1_5) - 3 if gh_experience_1_5 else 0))
    # Simpler stable rule: move quiz 1 step toward github signal
    if gh_experience_1_5 > quiz_git:
        delta = 1
    elif gh_experience_1_5 < quiz_git:
        delta = -1
    else:
        delta = 0
    final_git = max(1, min(5, quiz_git + delta))
    final_lang = max(1, min(5, round((quiz_lang + int(gh_technical_1_5)) / 2)))
    return final_git, final_lang


def effective_level(lang_level: int, git_level: int) -> int:
    return min(int(lang_level), int(git_level) + 1)


def stale_of(updated_at_iso: str | None, now: datetime | None = None) -> str:
    if not updated_at_iso:
        return "fresh"
    now = now or datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(updated_at_iso.replace("Z", "+00:00"))
    except ValueError:
        return "fresh"
    days = (now - dt).days
    if days > 180:
        return "dead_180"
    if days > 90:
        return "stale_90"
    return "fresh"


def taken_status(assignees: list, open_pr_refs: list, branch_hit: bool = False) -> str:
    if assignees:
        return "assigned"
    if open_pr_refs or branch_hit:
        return "pr_targeted"
    return "free"


def normalize_label(lbl: str) -> str:
    if not lbl:
        return ""
    return re.sub(r"[\s_-]+", " ", lbl.strip().lower()).strip()


def has_beginner_label(labels: list[str]) -> bool:
    norm = {re.sub(r"[-_\s]+", " ", l.strip().lower()) for l in labels}
    canon = {re.sub(r"[-_\s]+", " ", b) for b in BEGINNER_LABELS}
    return bool(norm & canon)


def heuristic_difficulty(labels: list[str], title: str = "", body: str = "") -> int:
    text = f"{title} {body}".lower()
    labs = {l.lower() for l in labels}
    if labs & {"good first issue", "good-first-issue", "beginner", "easy", "starter", "docs", "documentation"}:
        return 1
    if labs & {"help-wanted", "help wanted", "up-for-grabs", "hacktoberfest"}:
        return 2
    if any(k in text for k in ("perf", "race", "security", "core refactor", "architecture")):
        return 5
    if "bug" in labs or "bug" in text:
        return 3
    if labs & {"enhancement", "feature"}:
        return 3
    return 3


def repo_health(last_commit_iso: str | None, last_merge_iso: str | None,
                archived: bool, now: datetime | None = None) -> str:
    if archived:
        return "Archived"
    def days(iso):
        if not iso:
            return 10**9
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except ValueError:
            return 10**9
        return ((now or datetime.now(timezone.utc)) - dt).days
    if min(days(last_commit_iso), days(last_merge_iso)) <= 30:
        return "Active"
    if min(days(last_commit_iso), days(last_merge_iso)) <= 90:
        return "Slow"
    if days(last_merge_iso) > 90 or days(last_commit_iso) > 180:
        return "Looks inactive"
    return "Slow"


def responsiveness(median_first_response_h: float | None, merged_pct: float, untouched_pct: float) -> tuple[int, str]:
    if median_first_response_h is None:
        return 0, "Unknown"
    score = 100
    score -= min(60, max(0, (median_first_response_h - 12)) * 0.8)
    score -= max(0, (70 - merged_pct)) * 0.5
    score -= untouched_pct * 0.4
    score = max(0, min(100, round(score)))
    tier = "Highly responsive" if score >= 80 else ("Mixed" if score >= 50 else "Slow/Unresponsive")
    return score, tier


def community_verdict(found: dict, newcomer_merged_6mo: int) -> str:
    keys = ["readme", "contributing", "license", "code_of_conduct", "templates", "newcomer_labels"]
    have = sum(1 for k in keys if found.get(k))
    if have >= 5 and newcomer_merged_6mo >= 1:
        return "Welcoming"
    if have >= 3:
        return "Partially welcoming"
    return "Not newcomer-friendly"


def extract_paths(text: str) -> list[str]:
    return sorted(set(PATH_RE.findall(text or "")))


def grounding_errors(mentioned: list[str], tree: list[str]) -> list[str]:
    tree_set = {str(t).strip().lstrip("./") for t in (tree or [])}
    bad: list[str] = []
    for p in mentioned:
        path = str(p).strip().lstrip("./")
        if not path:
            continue
        if path in tree_set:
            continue
        valid = False
        for root in tree_set:
            if path == root:
                valid = True
                break
            root_prefix = root.rstrip("/") + "/"
            path_prefix = path.rstrip("/") + "/"
            if path.startswith(root_prefix) or root.startswith(path_prefix):
                valid = True
                break
        if not valid:
            bad.append(p)
    return bad


def validate_l3_output(data: dict) -> tuple[bool, str]:
    if not isinstance(data, dict):
        return False, "not an object"
    s = data.get("score")
    if not isinstance(s, int) or isinstance(s, bool) or not (0 <= s <= 3):
        return False, "score must be int 0-3"
    if not isinstance(data.get("reason", ""), str):
        return False, "reason must be string"
    return True, ""
