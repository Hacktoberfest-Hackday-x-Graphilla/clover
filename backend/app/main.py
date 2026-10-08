"""Kodiset backend — FastAPI. Stateless: user keys per-request, never stored.

Run:  pip install -r requirements.txt
      uvicorn app.main:app --reload --port 8000   (from backend/)
Frontend contract (for Copilot): every POST accepts {gemini_key, github_token}.
If GitHub 403 rate-limit and no token was sent -> 402 {need_token:true}.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import gemini_client as G
from . import github_client as GH
from . import prompts as P
from . import rules as R
from .config import get_settings
from .schemas import AssessIn, DigestItem, GradeL3In, PlanIn, RepoIn, TextIn
from .services import build_markdown

app = FastAPI(title="Kodiset backend", version="0.1.0")
s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=s.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "models": {"long": s.long_model, "short": s.short_model, "fast": s.fast_model}}


def _token(body_token: str, header: str | None) -> str:
    return body_token or (header or "") or s.github_token


def _key(body_key: str, header: str | None) -> str:
    return body_key or (header or "") or s.gemini_api_key


@app.post("/api/repo/parse")
def repo_parse(body: RepoIn):
    owner, repo = R.parse_repo_url(body.repo_url)
    return {"owner": owner, "repo": repo}


@app.post("/api/repo/fetch")
async def repo_fetch(body: RepoIn, x_github_token: str | None = Header(default=None)):
    token = _token(body.github_token, x_github_token)
    try:
        owner, repo = R.parse_repo_url(body.repo_url)
        bundle = await GH.fetch_repo_bundle(owner, repo, token)
    except GH.RateLimitError as e:
        raise HTTPException(402, {"need_token": True, "detail": f"GitHub rate limit hit: {e}"})
    issues_lite = []
    for i in bundle["issues"]:
        upd = i.get("updated_at")
        issues_lite.append({
            "number": i.get("number"), "title": i.get("title", "")[:200],
            "labels": [l.get("name", "") for l in i.get("labels", [])],
            "assignees": [a.get("login", "") for a in i.get("assignees", [])],
            "stale": R.stale_of(upd), "updated_at": upd,
            "beginner_label": R.has_beginner_label([l.get("name", "") for l in i.get("labels", [])]),
            "heuristic_difficulty": R.heuristic_difficulty(
                [l.get("name", "") for l in i.get("labels", [])], i.get("title", ""), (i.get("body") or "")[:500]),
        })
    open_pr_text = " ".join(f"{p.get('title','')} {p.get('body') or ''}" for p in bundle["open_prs"])
    for it in issues_lite:
        refs = R.FIX_RE.findall(open_pr_text)
        linked = [int(n) for _, n in refs if int(n) == it["number"]]
        it["status"] = R.taken_status(["x"] if any(
            a for a in bundle["issues"] if a.get("number") == it["number"] and a.get("assignees")) else [],
            linked)
    now = datetime.now(timezone.utc)
    def days(iso):
        try:
            return (now - datetime.fromisoformat((iso or "").replace("Z", "+00:00"))).days
        except Exception:
            return 10**9
    commits = bundle["commits"]
    last_commit = (commits[0].get("commit", {}).get("author", {}).get("date") if commits else None)
    merges = [p.get("merged_at") for p in bundle["merged_prs"] if p.get("merged_at")]
    health_v = R.repo_health(last_commit, max(merges) if merges else None, bool(bundle["meta"].get("archived")))
    return {
        "meta": bundle["meta"], "health": health_v,
        "issues_lite": issues_lite,
        "merged_prs_count": len(bundle["merged_prs"]),
        "open_prs_count": len(bundle["open_prs"]),
        "tree_sample": bundle["tree"][:50], "tree_total": len(bundle["tree"]),
        "full_tree": bundle["tree"],
        "languages": bundle["languages"],
        "contributing_found": bundle["contributing_found"],
        "branches": bundle["branches"],
        "labels_beginner_set": sorted(R.BEGINNER_LABELS),
    }


@app.post("/api/assess/quiz")
def assess_quiz(body: AssessIn):
    q = body.quiz.model_dump()
    q["l3_score"] = max(0, min(3, int(q.get("l3_score", 1))))
    scored = R.score_quiz(q)
    return {"quiz_levels": scored, "hours": q["hours"], "interests": q["interests"]}


@app.post("/api/ai/grade-l3")
async def grade_l3(body: GradeL3In, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    st = get_settings()
    last: dict = {"score": 1, "reason": "fallback"}
    for _ in range(2):  # try + one retry, then fallback 1 (Q39)
        try:
            txt = await G.generate(st.fast_model, P.L3_GRADE,
                                   f"<untrusted>{body.answer}</untrusted>", key, temperature=0.0)
            txt = txt.strip().removeprefix("```json").removesuffix("```").strip()
            data = json.loads(txt[txt.find("{"):txt.rfind("}") + 1])
            ok, err = R.validate_l3_output(data)
            if ok:
                return {**data, "model": st.fast_model}
            last = {"score": 1, "reason": f"validation failed ({err}), fallback"}
        except Exception as e:
            last = {"score": 1, "reason": f"error, fallback: {str(e)[:120]}"}
    return {**last, "model": st.fast_model + " (fallback-1)"}


@app.post("/api/assess/full")
async def assess_full(body: AssessIn, x_gemini_key: str | None = Header(default=None),
                      x_github_token: str | None = Header(default=None)):
    key, token = _key(body.gemini_key, x_gemini_key), _token(body.github_token, x_github_token)
    q = body.quiz.model_dump()
    scored = R.score_quiz({**q, "l3_score": max(0, min(3, int(q.get("l3_score", 1))))})
    lang = (body.quiz.languages or ["python"])[0]
    gh_digest = None
    if body.github_username:
        try:
            repos = await GH.fetch_user_repos(body.github_username, token, body.max_repos)
            ctx = json.dumps(repos)[:12000]
            txt, used = await G.generate_short(
                P.USER_GH_DIGEST, f"<context>{ctx}</context>", key, temperature=0.1)
            j = txt[txt.find("{"):txt.rfind("}") + 1]
            gh_digest = json.loads(j)
            gh_digest["_model"] = used
        except Exception as e:
            gh_digest = {"error": str(e)[:200], "signals_1_5": None}
    sig = (gh_digest or {}).get("signals_1_5") if isinstance(gh_digest, dict) else None
    fg, fl = R.merge_levels(scored["git"], scored["lang_level"],
                            (sig or {}).get("experience") if sig else None,
                            (sig or {}).get("technical") if sig else None)
    return {"quiz_levels": scored, "github_digest": gh_digest,
            "final": {"git": fg, lang: fl, "hours": q["hours"], "interests": q["interests"]},
            "effective": R.effective_level(fl, fg),
            "first_pr_guide_needed": fg <= 2}


@app.post("/api/ai/digest")
async def ai_digest(body: PlanIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    ctx = json.dumps({"digest_in": body.digest, "tree_n": len(body.tree)})[:14000]
    txt, used = await G.generate_short(
        P.SHORT_DIGEST, f"<context>{ctx}</context>\n<tree>{json.dumps(body.tree[:300])}</tree>",
        key, temperature=0.1)
    try:
        arr = json.loads(txt[txt.find("["):txt.rfind("]") + 1])
        return {"digest": arr, "model": used}
    except Exception:
        return {"digest": [], "model": used, "raw": txt[:1000], "digest_error": True}


@app.post("/api/ai/plan")
async def ai_plan(body: PlanIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    st = get_settings()
    user_payload = json.dumps({"profile": body.profile, "trust": body.trust,
                               "digest": body.digest[:30],
                               "comments": body.include_comments_summary[:2000]})[:15000]
    for attempt in range(4):  # initial + max 3 grounding retries (Q20)
        txt = await G.generate(st.long_model, P.LONG_PLAN if attempt == 0 else P.GROUNDING_REPAIR,
                               f"<context>{user_payload}</context>\n<tree>{json.dumps(body.tree[:500])}</tree>",
                               key, temperature=0.5 if attempt == 0 else 0.1)
        try:
            plan = json.loads(txt[txt.find("{"):txt.rfind("}") + 1])
        except Exception:
            if attempt == 3:
                raise HTTPException(500, "Planner returned invalid JSON 4x")
            continue
        mentioned = R.extract_paths(json.dumps(plan))
        bad = R.grounding_errors(mentioned, body.tree)
        if not bad or attempt == 3:
            return {"plan": plan, "grounding_bad": bad, "attempts": attempt + 1,
                    "blocked": bool(bad), "model": st.long_model}
        user_payload += f"\nInvalid paths to fix: {bad}"
    raise HTTPException(500, "unreachable")


@app.post("/api/aids/checklist")
async def aid_checklist(body: TextIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(P.CHECKLIST, f"<context>{body.text[:8000]}</context>", key, temperature=0.2)
    try:
        return {**json.loads(txt[txt.find("{"):txt.rfind("}") + 1]), "model": used}
    except Exception:
        return {"checklist": [{"item": m, "source_file": "generic"} for m in
                ("Fork + branch from default", "Reproduce issue first", "Add/fix tests",
                 "Run lint", "Follow PR template", "Respond to review")],
                "missing_file_warning": "parse failed — generic fallback", "model": used}


@app.post("/api/aids/draft-comment")
async def aid_comment(body: TextIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(P.DRAFT_COMMENT,
                                       f"<context>{json.dumps(body.context)[:3000]}</context>", key, temperature=0.5)
    return {"comment": txt.strip(), "model": used}


@app.post("/api/aids/draft-pr")
async def aid_pr(body: TextIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(P.DRAFT_PR,
                                       f"<context>{json.dumps(body.context)[:4000]}</context>", key, temperature=0.5)
    return {"pr": txt.strip(), "model": used,
            "notice": "AI assistant draft — review before posting."}


@app.post("/api/aids/glossary")
async def aid_glossary(body: TextIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(
        P.GLOSSARY, f"<level>{body.level}</level><context>{body.text[:6000]}</context>", key, temperature=0.3)
    try:
        return {"glossary": json.loads(txt[txt.find("["):txt.rfind("]") + 1]), "model": used}
    except Exception:
        return {"glossary": [], "raw": txt[:500], "model": used}


@app.post("/api/aids/solved")
async def aid_solved(body: TextIn, x_gemini_key: str | None = Header(default=None)):
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(P.SOLVED, f"<context>{body.text[:10000]}</context>", key, temperature=0.3)
    try:
        return {"solved": json.loads(txt[txt.find("["):txt.rfind("]") + 1]), "model": used}
    except Exception:
        return {"solved": [], "raw": txt[:500], "model": used}


@app.post("/api/aids/areas")
async def aid_areas(body: PlanIn, x_gemini_key: str | None = Header(default=None)):
    if len(body.digest) >= 50:  # Q28: big repos -> counts only, no AI
        from collections import Counter
        c = Counter(l for d in body.digest for l in (d.get("labels") or ["unlabeled"]))
        return {"areas": [{"area": k, "why": f"{v} open issues", "example_issues": []}
                           for k, v in c.most_common(5)], "mode": "counts-only"}
    key = _key(body.gemini_key, x_gemini_key)
    txt, used = await G.generate_short(P.AREAS, f"<digest>{json.dumps(body.digest[:50])}</digest>",
                                       key, temperature=0.5)
    try:
        return {"areas": json.loads(txt[txt.find("["):txt.rfind("]") + 1]), "model": used, "mode": "ai"}
    except Exception:
        return {"areas": [], "raw": txt[:500], "model": used, "mode": "ai-failed"}


@app.post("/api/plan/download")
def plan_download(body: dict):
    plan, tree = body.get("plan", {}), body.get("tree", [])
    bad = R.grounding_errors(R.extract_paths(json.dumps(plan)), tree)
    override = bool(body.get("override_grounding"))
    if bad and not override:
        raise HTTPException(409, {"grounding_bad": bad,
                                  "detail": "Blocked: invalid paths. Fix or re-run (3 retries), or override with warning."})
    md = build_markdown(plan, body.get("checklist"), body.get("drafts"), bad if override else [],
                        body.get("badges", []))
    return {"markdown": md, "json": plan, "grounding_bad": bad, "overridden": override}


@app.post("/api/trust/score")
def trust_score(body: dict):
    return {
        "health": R.repo_health(body.get("last_commit"), body.get("last_merge"), bool(body.get("archived"))),
        "responsiveness": R.responsiveness(body.get("median_h"), body.get("merged_pct", 0) or 0,
                                          body.get("untouched_pct", 0) or 0),
        "community": R.community_verdict(body.get("found", {}), body.get("newcomer_merged_6mo", 0) or 0),
    }
