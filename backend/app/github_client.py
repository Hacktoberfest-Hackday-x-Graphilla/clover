"""Minimal async GitHub REST client. Stateless: token passed per-request."""

from __future__ import annotations

import httpx

API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def _h(token: str) -> dict:
    h = dict(HEADERS)
    if token:
        h["Authorization"] = "Bearer " + token
    return h


async def gh_get(client: httpx.AsyncClient, path: str, token: str, params: dict | None = None):
    r = await client.get(f"{API}{path}", headers=_h(token), params=params or {})
    if r.status_code == 403 and "rate limit" in r.text.lower():
        raise RateLimitError(r.text[:300])
    r.raise_for_status()
    return r.json()


class RateLimitError(RuntimeError):
    pass


async def fetch_repo_bundle(owner: str, repo: str, token: str,
                            max_issues: int = 100, max_prs: int = 50,
                            max_commits: int = 50) -> dict:
    """Capped bundle per Q14. Raises RateLimitError when limits hit (caller maps to 402-need-token)."""
    async with httpx.AsyncClient(timeout=20) as c:
        meta = await gh_get(c, f"/repos/{owner}/{repo}", token)
        issues = await gh_get(c, f"/repos/{owner}/{repo}/issues", token,
                              {"state": "open", "per_page": min(100, max_issues)})
        issues = [i for i in issues if "pull_request" not in i][:max_issues]
        pulls_closed = await gh_get(c, f"/repos/{owner}/{repo}/pulls", token,
                                    {"state": "closed", "per_page": 20})
        merged = [p for p in pulls_closed if p.get("merged_at")][:20]
        # open PRs for taken-check (cap 30, search references in code via body/title)
        pulls_open = await gh_get(c, f"/repos/{owner}/{repo}/pulls", token,
                                  {"state": "open", "per_page": 30})
        commits = await gh_get(c, f"/repos/{owner}/{repo}/commits", token, {"per_page": min(100, max_commits)})
        tree = await gh_get(c, f"/repos/{owner}/{repo}/git/trees/HEAD", token, {"recursive": "1"})
        paths = [t["path"] for t in (tree.get("tree") or []) if t.get("type") == "blob"][:2000]
        langs = await gh_get(c, f"/repos/{owner}/{repo}/languages", token)
        try:
            contrib = await gh_get(c, f"/repos/{owner}/{repo}/contributing", token)
        except httpx.HTTPStatusError as e:
            contrib = None if e.response.status_code == 404 else (_ for _ in ()).throw(e)
        branches = await gh_get(c, f"/repos/{owner}/{repo}/branches", token, {"per_page": 20})
        return {
            "meta": {k: meta.get(k) for k in (
                "full_name", "description", "archived", "disabled", "default_branch",
                "pushed_at", "updated_at", "stargazers_count", "forks_count", "open_issues_count")},
            "issues": issues,
            "merged_prs": merged,
            "open_prs": pulls_open,
            "commits": commits[:max_commits],
            "tree": paths,
            "languages": langs,
            "contributing_found": contrib is not None,
            "branches": [b.get("name") for b in branches],
        }


async def fetch_user_repos(username: str, token: str, max_repos: int = 5) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as c:
        repos = await gh_get(c, f"/users/{username}/repos", token,
                             {"per_page": 100, "sort": "pushed", "direction": "desc"})
        owned = [r for r in repos if not r.get("fork")][:max_repos]
        out = []
        for r in owned:
            full = r["full_name"]
            commits = await gh_get(c, f"/repos/{full}/commits", token, {"per_page": 20})
            readme = ""
            try:
                rd = await gh_get(c, f"/repos/{full}/readme", token)
                readme = (rd.get("content") or "")[:4000]
            except httpx.HTTPStatusError:
                pass
            out.append({"repo": full, "pushed_at": r.get("pushed_at"),
                        "commits": [{"sha": x.get("sha"),
                                     "message": (x.get("commit") or {}).get("message", "")[:500],
                                     "date": ((x.get("commit") or {}).get("author") or {}).get("date"),
                                     "stats": {}} for x in commits],
                        "readme_b64_head": readme})
        return out
