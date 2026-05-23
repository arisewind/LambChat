"""Team schemas."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from src.infra.utils.datetime import utc_now


class TeamVisibility(str, Enum):
    PRIVATE = "private"


class TeamMemberCreate(BaseModel):
    """Request body for adding a member to a team."""

    persona_preset_id: str = Field(..., min_length=1)
    role_instructions: str = Field(default="", max_length=2000)
    position: int = Field(default=0, ge=0)
    enabled: bool = True


class TeamMemberUpdate(BaseModel):
    """Request body for updating a team member."""

    persona_preset_id: Optional[str] = Field(None, min_length=1)
    role_instructions: Optional[str] = Field(None, max_length=2000)
    position: Optional[int] = Field(None, ge=0)
    enabled: Optional[bool] = None


class TeamMemberResponse(BaseModel):
    """Single team member in API responses."""

    member_id: str
    persona_preset_id: str
    role_name: str = ""
    role_avatar: Optional[str] = None
    role_tags: list[str] = Field(default_factory=list)
    role_instructions: str = ""
    position: int = 0
    enabled: bool = True


class TeamCreate(BaseModel):
    """Create team request."""

    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    members: list[TeamMemberCreate] = Field(default_factory=list)
    default_member_id: Optional[str] = None
    team_instructions: str = Field(default="", max_length=4000)


class TeamUpdate(BaseModel):
    """Update team request."""

    name: Optional[str] = Field(None, min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=500)
    members: Optional[list[TeamMemberCreate]] = None
    default_member_id: Optional[str] = None
    team_instructions: Optional[str] = Field(None, max_length=4000)


class TeamResponse(BaseModel):
    """Team response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_user_id: str
    name: str
    description: str = ""
    members: list[TeamMemberResponse] = Field(default_factory=list)
    default_member_id: Optional[str] = None
    team_instructions: str = ""
    visibility: TeamVisibility = TeamVisibility.PRIVATE
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @property
    def active_members(self) -> list[TeamMemberResponse]:
        return [m for m in self.members if m.enabled]


class TeamListResponse(BaseModel):
    """Paginated team list."""

    teams: list[TeamResponse]
    total: int
    skip: int = 0
    limit: int = 100
