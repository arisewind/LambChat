from __future__ import annotations

import uuid

from src.infra.utils.datetime import utc_now


def generate_run_id() -> str:
    """Generate a unique task run identifier."""
    return f"run_{utc_now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
