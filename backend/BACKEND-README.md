# Kodiset backend (FastAPI, stateless proxy)

## Run
```
cd backend
pip install -r requirements.txt
copy .env.example .env   # set model IDs if needed
uvicorn app.main:app --reload --port 8000
```
Docs: http://localhost:8000/docs

## Frontend contract (GitHub Copilot)

- Base: `http://localhost:8000`
- Every POST body may include `gemini_key` + `github_token`. Or send headers
  `x-gemini-key` / `x-github-token`. Server never stores them.
- Flow:
  1. `POST /api/repo/parse {repo_url}` → `{owner, repo}`
  2. `POST /api/repo/fetch {repo_url, github_token?}` → issues_lite (status/stale/difficulty),
     health, tree, languages, branches. 402 + `{need_token:true}` → prompt for token.
  3. `POST /api/assess/full {quiz, github_username?, gemini_key?, github_token?}` → final levels + effective.
     Quiz fields: g1,g2,c1,c2_picks[],l1,l2_picks[],l3_score,hours,interests,languages[].
     Get `l3_score` via `POST /api/ai/grade-l3 {answer}` first.
  4. `POST /api/ai/digest {digest: issues_lite, tree}` → strict JSON digest (SHORT→FAST fallback).
     Skip if repo ≥50 issues and you prefer counts-only.
  5. `POST /api/ai/plan {repo_url, profile, digest, trust, tree}` → top-3 plan.
     Returns `grounding_bad[] + blocked + attempts` (max 3 retries inside).
  6. Aids: `/api/aids/checklist|draft-comment|draft-pr|glossary|solved|areas`.
     Comments summarization is opt-in: only call digest/plan with `include_comments_summary` when user toggles.
  7. `POST /api/plan/download {plan, tree, checklist?, drafts?, badges?, override_grounding?}` →
     `{markdown, json}`. 409 while `grounding_bad` non-empty unless override with warning UI.
  8. `POST /api/trust/score {last_commit, last_merge, archived, median_h, merged_pct, untouched_pct, found{}, newcomer_merged_6mo}`.

## Models
Via user Gemini key. Env defaults: `LONG_MODEL=gemma-3-27b-it`, `SHORT_MODEL=gemma-3-12b-it`,
`FAST_MODEL=gemma-3n-e4b-it`. Change IDs in `.env` without code edits.
E4B: L3 grading always + SHORT fallback (>25s/429/5xx, badged `fast-fallback`).
