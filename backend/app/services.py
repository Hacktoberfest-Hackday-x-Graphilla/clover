"""Download bundle builder + grounding gate helpers."""

from __future__ import annotations


def build_markdown(plan: dict, checklist: dict | None, drafts: dict | None,
                   grounding_bad: list[str], fallback_badges: list[str]) -> str:
    prof = (plan or {}).get("profile", {})
    lines = ["# Kodiset — My First-Contribution Plan", ""]
    lines.append(f"Level: git L{prof.get('git','?')} / languages {prof.get('languages',{})}")
    if prof.get("first_pr_guide_needed"):
        lines += ["", "> First-PR guide: fork → branch from default → small change → run tests/lint → open PR → respond to review."]
    for i, r in enumerate((plan or {}).get("ranked", []), 1):
        lines += ["", f"## {i}. Issue #{r.get('number')} (difficulty {r.get('difficulty')}, {r.get('time_estimate','')})"]
        lines.append(f"Why fits you: {r.get('why_fits_you','')}")
        lines.append("Steps:")
        for s in r.get("steps", []):
            lines.append(f"- [ ] {s}")
        if r.get("files"):
            lines.append("Files: " + ", ".join(f"`{f}`" for f in r["files"]))
        if r.get("risks"):
            lines.append("Risks: " + ", ".join(r["risks"]))
        if r.get("style_lesson_from_solved"):
            lines.append(f"Style lesson: {r['style_lesson_from_solved']}")
    if checklist and checklist.get("checklist"):
        lines += ["", "## Contributing checklist"]
        for c in checklist["checklist"]:
            lines.append(f"- [ ] {c.get('item','')} ({c.get('source_file','generic')})")
    if drafts:
        if drafts.get("comment"):
            lines += ["", "## Draft issue comment (edit before posting)", "", drafts["comment"]]
        if drafts.get("pr"):
            lines += ["", "## Draft PR description (AI assistant — review before posting)", "", drafts["pr"]]
    if grounding_bad:
        lines += ["", f"## Grounding warnings\nInvalid paths (verify before coding): {', '.join(grounding_bad)}"]
    if fallback_badges:
        lines += ["", "Badges: " + ", ".join(fallback_badges)]
    for w in (plan or {}).get("warnings", []):
        lines.append(f"\n> Warning: {w}")
    return "\n".join(lines)
