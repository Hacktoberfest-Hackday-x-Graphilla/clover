from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class KeysIn(BaseModel):
    gemini_key: str = ""
    github_token: str = ""


class RepoIn(KeysIn):
    repo_url: str = Field(description="Full GitHub URL or owner/repo")


class QuizIn(BaseModel):
    g1: int = 0
    g2: int = 0
    c1: int = 0
    c2_picks: list[str] = []
    l1: int = 0
    l2_picks: list[str] = []
    l3_score: int = 1
    hours: Literal["<2", "2-5", "5+"] = "2-5"
    interests: list[str] = []
    languages: list[str] = ["python"]


class AssessIn(KeysIn):
    quiz: QuizIn
    github_username: str = ""
    max_repos: int = 5
    commits_per_repo: int = 20


class DigestItem(BaseModel):
    number: int
    kind: str = "issue"
    title: str = ""
    labels: list[str] = []
    age_days: int = 0
    status: str = "free"
    stale: str = "fresh"
    difficulty: int = 3
    difficulty_why: str = ""
    strengths_fit: list[str] = []
    weaknesses_risk: list[str] = []
    languages_guess: list[str] = []
    files_hint: list[str] = []
    relevance: str = ""


class PlanIn(KeysIn):
    repo_url: str
    profile: dict[str, Any] = {}
    digest: list[dict[str, Any]] = []
    trust: dict[str, Any] = {}
    tree: list[str] = []
    include_comments_summary: str = ""


class GradeL3In(KeysIn):
    answer: str = ""


class TextIn(KeysIn):
    text: str = ""
    context: dict[str, Any] = {}
    level: int = 3
