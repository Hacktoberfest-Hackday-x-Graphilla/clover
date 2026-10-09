#Kodiset

    Paste a GitHub repo link. Kodiset tells you what the project already solved, which issues are still free, whether the project is alive, and plans your first contribution at your level, so you understand what you ship.

Kodiset helps Beginner, Intermediate and Advanced developers go from reading a repository to contributing to it: understanding the README, exploring the file tree, checking whether an issue is taken, reading the project's rules, and opening a correct pull request.

Built by Team Clover during Hacktoberfest Hack Day Bhairahawa 2026. The core intelligence is Gemma (open-source AI), accessed via the Gemini API.
Why Kodiset exists

The problem: a first open-source contribution is hard to start.

    You paste a repo link and don't know where to begin.
    You don't know which issues are already taken, so you waste hours on work someone else is doing.
    You don't know if the project is still maintained, so your pull request may never be reviewed.
    You don't know the project's rules, so your work gets rejected for small reasons.

The deeper problem: many new developers now build mainly by asking AI to write code ("vibe coding"). It is fast, but they often skip the theory and the problem-solving practice that comes from doing it yourself. In open source this shows quickly. Maintainers can tell when a contributor doesn't understand their own pull request.

Our idea: break one big, scary project (the parent) into one small, doable task (the child), and explain the why this task at your level. Kodiset is built to help you contribute as a developer who understands the work, not as someone who pastes AI output.

    Honest scope: today Kodiset plans and explains. It does not teach full lessons yet. See the roadmap.

What it does
1. Repository reader

Paste any public repo URL like https://github.com/owner/repo. Kodiset live-reads:

    README (read the full Readme file)
    File tree (real paths on the default branch)
    Branches
    Open issues (prefers the good first issue label, falls back to any open issue)
    Open pull requests (used to check if an issue is taken)
    CONTRIBUTING rules (if the project has them)

2. README & project understanding

Gemma gets the README + file tree + issues together, so the plan is grounded in the real project, not generic advice. No copy-paste into a chatbot needed.
3. Commits, people & history

    Read the issue
    Commits related to the issue duration
    Link to the GitHub commit graph: github.com/owner/repo/network
    Solved problems: merged PRs (latest 50 closed scanned, 20 merged kept) linked to issues via fixes #12 / closes #7 / resolved #3. Gemma explains each fix in 1–2 sentences at your level.

4. Your first contribution (level-aware)

Answer 3 Yes/No questions and pick the languages you know. Gemma picks ONE suitable open issue that is not already taken, and gives you:

    Why this issue fits you
    A simple explanation of the problem
    Exact files to read or change (only from the real file tree, in backticks)
    Step by step: fork → branch → change → test → pull request

Grounding check: every path Gemma mentions is verified against the real tree. Invented paths show a warning, verified paths show.
5. Is it taken?

Plain code (not AI) checks each open issue and marks it:

    Free
    Assigned to someone
    An open pull request already targets it

This saves you from working on an issue that someone else already claimed.
6. Repo check

A project health verdict from real dates and facts: Active (activity within 30 days), Slow (within 180 days), Looks inactive, Archived, or Unknown. It also lists the facts behind the verdict (last push, recent commits, merged PRs, CONTRIBUTING file present).
7. Contributing checklist

The project's CONTRIBUTING rules, rewritten by Gemma as a short checklist at your level.
8. Draft my comment

Pick an issue and Gemma drafts a polite comment to ask the maintainers if you can work on it. You edit it and post it yourself.
Who is it for? Levels
Level 	How you get it 	How Kodiset talks to you
Beginner 	0–1 Yes answers 	Simple words, short sentences, defines terms in (brackets), tells you where to click
Intermediate 	2 Yes answers 	What changed and why, names files, assumes basic Git
Experienced 	3 Yes answers 	Concise, technical, architectural impact only

Questions asked :

    Have you used Git before (commit and push)?
    Have you opened a pull request?
    Have you had a pull request merged in someone else's project?

The AI never asks these questions. They are plain radio buttons, and plain code turns your answers into a level. The level then changes how Gemma writes.

Your answers and languages are saved locally to profile.json. API keys are never saved.

Languages supported in the UI: Python, C, C++, Java, JavaScript, HTML/CSS, PHP, SQL.
How it works

Code decides the facts. Gemma writes the words.
Plain code decides 	Gemma writes
Is the issue taken? 	Your plan, at your level
Is the project alive? 	How each past fix was made
Does the file path exist? 	The rules as a checklist
What is your level? 	A comment to ask for the issue

Sidebar (keys + level + langs)
   ↓
Paste repo URL → parse_repo_url()
   ↓
get_repo_data() 
  info / readme / issues / tree / merged PRs / open PRs
  contributors / branches / commits / CONTRIBUTING
   ↓
link_issues_to_prs()   → linked (PR fixes issue) + unlinked
annotate_issue_status() → free / assigned / open PR targets it
health_snapshot()      → Active / Slow / Looks inactive / Archived
   ↓
run_ai() — 4 Gemma calls in parallel (ThreadPoolExecutor)
  1. plan_first_contribution()   2. explain_solved_problems()
  3. suggest_help_areas()        4. contributing_checklist()
   ↓
5 tabs:  First contribution | Solved | People & Branches
         Need help | Repo check
  + find_unverified_paths() check
  + draft_issue_comment()

Caching: each owner/repo gets its own cache entry. The token is excluded from the cache key on purpose.
Project structure

app.py             → Streamlit UI, caching, parallel AI runner, 5-tab results
brain.py           → All Gemma prompts + file-path verifier
github_client.py   → All GitHub REST calls + issue↔PR linker + health check
levels.py          → Level quiz + local profile.json load/save
requirements.txt   → streamlit, google-genai, request

Task of each file

app.py: UI + orchestration

    get_secret(name): env var first, then st.secrets, else empty. Survives a missing secrets.toml.
    get_repo_data(owner, repo, _token): cached fetch of all GitHub resources in one dict, including issue status and the health verdict.
    run_ai(api_key, profile, level, data, linked, unlinked): runs plan + solved + help-areas + checklist concurrently, isolates failures so one error doesn't kill the others.
    render_results(result, api_key): renders 5 tabs, warnings, tables, commit list, issue list, and the Draft my comment section.
    Sidebar: Gemini key + GitHub token inputs, 3 level radios, language multiselect, Save button.
    Main: repo URL input → Analyze button → spinner → results saved in st.session_state so Save doesn't wipe them.

brain.py: AI brain

    SYSTEM_PROMPT: kind mentor, never invent files, use only the provided tree.
    level_style(level): returns the writing style for Beginner / Intermediate / Experienced.
    call_gemma(api_key, prompt, system_instruction): calls gemma-4-31b-it by default. Raises a clear error on an empty or blocked response. If the model refuses a system instruction, it retries with the instruction placed in the prompt.
    plan_first_contribution(...): picks one issue matching languages and level, skipping issues that are assigned or already targeted by a pull request. Falls back to a docs task if none fit.
    explain_solved_problems(...): one call for all linked items, returns a JSON list, skips the call if nothing is linked.
    _parse_explanations(raw): robust JSON parse. Strips ``` fences, extracts [...], unwraps `{"items": [...]}`, falls back to a General note.
    suggest_help_areas(...): groups open issues into the top 3 help areas.
    contributing_checklist(...): turns CONTRIBUTING rules into a checklist.
    draft_issue_comment(...): drafts the comment to ask for an issue.
    find_unverified_paths(answer, tree): finds `paths` not in the tree. Allows folders and bare filenames, ignores commands like pip install, os.path.join, versions and URLs.

github_client.py: GitHub side

    parse_repo_url(url): handles https://github.com/o/r, github.com/o/r, .git, trailing /, /issues/5, and dots like next.js.
    _get_headers / _get / _handle_response: central auth, 10s timeout, rate-limit (403/429), 404, and empty-repo (204) handling.
    fetch_readme(): base64 decode, "" if missing.
    fetch_open_issues(): tries good first issue first, else any. Filters out PRs. Keeps number, title, url, labels, assignees, body[:800].
    fetch_repo_info(): default branch, last push, archived flag, stars, license, open issue count.
    fetch_file_tree(): resolves the default branch (not always main), recursive tree, files.
    fetch_merged_prs(): closed PRs sorted by update, keeps only merged_at != None, handles user=None.
    link_issues_to_prs(prs): regex over fixes / closes / resolves followed by #N. One PR fixing two issues appears twice.
    fetch_open_prs() + annotate_issue_status(): marks each issue free, assigned to X, or "open pull request #N already targets it".
    fetch_contributing(): reads CONTRIBUTING.md if it exists.
    health_snapshot(): builds the Active / Slow / Looks inactive / Archived verdict with its facts.
    fetch_contributors() / fetch_branches() / `fetch_recent_commits().

levels.py: leveling + persistence

    QUESTIONS: the 3 quiz questions.
    level_from_answers(answers): count the Yes answers. ≤1 Beginner, 2 Intermediate, 3 Experienced.
    load_profile() / save_profile(profile): profile.json read/write with safe defaults, never stores keys.

Tests

    test_kodiset.py: python -m unittest test_kodiset -v. 31 offline tests covering URL parsing, label filter and fallback, default-branch tree, merged filter, multi-link regex, issue status, health verdict, rate-limit and 404 errors, README decode, path-check false positives, explanation parsing, empty Gemma response, model override, levels.
    test_app.py: python test_app.py. Mocks GitHub and call_gemma, then verifies: startup without secrets, missing-key error, full analyze flow, grounding warning for a fake src/ghost.py, results survive Save, Repo check tab, Draft my comment, and a second repo doesn't show stale data.

⚙️ Tech stack

    Frontend: Streamlit (sidebar + 5 tabs + caching)
    AI: Gemma via the google-genai SDK (gemma-4-31b-it default)
    GitHub: REST API via requests (no SDK)
    Concurrency: concurrent.futures.ThreadPoolExecutor
    Storage: local profile.json only

🚀 Run it

python -m venv venv
source venv/bin/activate        # Linux / Fedora
# venv\Scripts\activate         # Windows

pip install -r requirements.txt

export GEMINI_API_KEY="your-key"   # or paste in sidebar
export GITHUB_TOKEN="your-token"   # optional, raises limit 60 → 5000 req/hr

streamlit run app.py

Another model (faster):

export GEMMA_MODEL=gemma-4-26b-a4b-it

    Never commit keys. .gitignore already ignores .env and profile.json.

How to use

    Add your Gemini key in the sidebar (GitHub token optional but recommended: one analysis uses about 12–14 requests, and the free limit is about 60 per hour).
    Answer the 3 level questions, pick languages, click Save my settings.
    Paste a repo link → Analyze repo.
    Read the 5 tabs:
        Your first contribution: do this one. Use Draft my comment to ask for the issue.
        Solved problems: how past issues were fixed
        People & Branches: who to follow, where work happens
        Areas that need help + open issues with their status
        Repo check: is the project alive, and what are its rules
    Follow the fork → branch → change → test → PR plan. Read the real files yourself.

Tests

python -m unittest test_kodiset -v   # logic, no internet needed
python test_app.py                   # headless UI, GitHub + Gemma mocked

Known limits

    The issue↔PR link only works if the PR says fixes #N / closes #N / resolves #N.
    Reads only the latest ~50 closed PRs, 8 issues, 300 file paths and 30 commits.
    Without a token: about 60 GitHub requests per hour.
    Gemma can be wrong. The grounding check catches fake paths, not wrong advice.
    The 31B model can take 1-2 minutes for a full analysis.
    Public repos only.
    Tested with mocked GitHub and Gemma. Results on very large repos may vary.

👥 Team Clover

Name 	Role

Sakshyam parajuli 	main-developer Leadet
Sachin aryal 	sub-developer
Niroj Gyawali 	researcher
Sambhav Bashyal 	sub-devloper reasearcher

KODISET - Contribute with understanding, not just generated code.
