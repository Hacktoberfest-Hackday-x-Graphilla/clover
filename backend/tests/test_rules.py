from app.rules import (
    band_0_6, community_verdict, effective_level, grounding_errors,
    has_beginner_label, heuristic_difficulty, merge_levels,
    parse_repo_url, repo_health, responsiveness, stale_of, validate_l3_output,
)


def test_parse():
    assert parse_repo_url("https://github.com/pallets/flask") == ("pallets", "flask")
    assert parse_repo_url("pallets/flask") == ("pallets", "flask")
    assert parse_repo_url("git@github.com:pallets/flask.git") == ("pallets", "flask")


def test_bands():
    assert band_0_6(0) == 1 and band_0_6(6) == 5
    assert effective_level(3, 1) == 2  # git+1 cap


def test_merge_clamp():
    assert merge_levels(2, 2, 5, 5) == (3, 4)  # moves at most 1


def test_stale():
    assert stale_of("2020-01-01T00:00:00Z") == "dead_180"
    assert stale_of(None) == "fresh"


def test_labels():
    assert has_beginner_label(["good first issue"])
    assert heuristic_difficulty(["documentation"], "x", "y") == 1


def test_health():
    assert repo_health(None, None, True) == "Archived"


def test_responsive():
    s, t = responsiveness(10, 80, 5)
    assert s >= 80 and t == "Highly responsive"


def test_community():
    assert community_verdict({"readme": 1, "contributing": 1, "license": 1,
                              "code_of_conduct": 1, "templates": 1, "newcomer_labels": 1}, 2) == "Welcoming"


def test_grounding():
    assert grounding_errors(["a.py", "ghost.py"], ["a.py"]) == ["ghost.py"]
    assert grounding_errors(["src/app.py", "src/ghost.py"], ["src/app.py"]) == ["src/ghost.py"]
    assert grounding_errors(["src/utils/helpers.py"], ["src"]) == []


def test_l3():
    assert validate_l3_output({"score": 2, "reason": "ok"})[0]
    assert not validate_l3_output({"score": 9, "reason": "x"})[0]
