"""File record schema for content-hash based deduplication."""

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.utils.datetime import utc_now


class FileRecordSchema(BaseModel):
    """Represents a file record in MongoDB, keyed by content hash."""

    id: str = Field(alias="_id")
    hash: str  # SHA-256 hex digest
    key: str  # Storage object key, e.g. "user_id/abc123hash"
    name: str  # Original filename
    mime_type: str
    size: int
    category: str  # "image", "video", "audio", "document"
    uploaded_by: str  # User ID of first uploader
    created_at: datetime = Field(default_factory=utc_now)

    model_config = {"populate_by_name": True}
