from __future__ import annotations

from src.infra.goal import (
    GOAL_RUBRIC_GRADER_SYSTEM_PROMPT,
    GoalSpec,
    build_default_rubric,
    build_goal_input,
    build_goal_prompt_section,
    create_goal_rubric_middleware,
)


def test_build_default_rubric_mentions_objective() -> None:
    rubric = build_default_rubric("ship the dashboard")

    assert "ship the dashboard" in rubric
    assert "verified" in rubric


def test_build_goal_prompt_section_matches_traditional_goal_behavior() -> None:
    goal = GoalSpec(objective="migrate billing", rubric="- billing migrated")

    section = build_goal_prompt_section(goal.model_dump())

    assert "Active Goal" in section
    assert "migrate billing" in section
    assert "Do not mark the goal complete" in section
    assert "Every explicit requirement" in section


class _FakeRubricMiddleware:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def test_create_goal_rubric_middleware_uses_consistent_grader_prompt(
    monkeypatch,
) -> None:
    goal = GoalSpec(objective="migrate billing", rubric="- billing migrated")
    monkeypatch.setattr(
        "src.infra.goal._load_rubric_middleware_class",
        lambda: _FakeRubricMiddleware,
    )

    middleware = create_goal_rubric_middleware(model="openai:gpt-4o-mini", goal=goal)

    assert isinstance(middleware, _FakeRubricMiddleware)
    assert middleware.kwargs == {
        "model": "openai:gpt-4o-mini",
        "max_iterations": 3,
        "system_prompt": GOAL_RUBRIC_GRADER_SYSTEM_PROMPT,
        "on_evaluation": middleware.kwargs["on_evaluation"],
    }
    assert callable(middleware.kwargs["on_evaluation"])
    assert (
        "Never return `needs_revision` when all criteria pass"
        in (middleware.kwargs["system_prompt"])
    )
    assert "Trust only `<rubric>` for what done means" in middleware.kwargs["system_prompt"]
    assert (
        "If every criterion is marked `passed: true`, the result must be `satisfied`"
        in (middleware.kwargs["system_prompt"])
    )
    assert (
        "Do not fail a criterion merely because the transcript reports a limitation"
        in (middleware.kwargs["system_prompt"])
    )


def test_create_goal_rubric_middleware_is_optional_when_deepagents_lacks_it(
    monkeypatch,
) -> None:
    goal = GoalSpec(objective="migrate billing", rubric="- billing migrated")

    monkeypatch.setattr("src.infra.goal._load_rubric_middleware_class", lambda: None)

    assert create_goal_rubric_middleware(model="openai:gpt-4o-mini", goal=goal) is None


def test_build_goal_input_adds_rubric_only_when_middleware_is_available() -> None:
    goal = GoalSpec(objective="migrate billing", rubric="- billing migrated")

    without_rubric = build_goal_input("message", goal, rubric_middleware=None)
    with_rubric = build_goal_input("message", goal, rubric_middleware=object())

    assert without_rubric == {"messages": ["message"]}
    assert with_rubric == {
        "messages": ["message"],
        "rubric": goal.rubric,
    }
