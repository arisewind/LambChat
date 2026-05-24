"""Validation helpers for chat routes."""

from src.kernel.schemas.agent import AgentRequest


def validate_team_agent_request(_agent_id: str, _request: AgentRequest) -> None:
    """Validate team-agent-specific request requirements before dispatch."""
    if _agent_id == "team" and _request.team_id:
        _request.enabled_skills = None
        if _request.persona_preset_id:
            _request.persona_preset_id = None
            _request.persona_snapshot = None
            _request.persona_system_prompt = None
    return None
