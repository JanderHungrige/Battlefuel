"""rename road_condition 'blocked' -> 'obstructed' (doc 101)

Revision ID: 0018_road_blocked_to_obstructed
Revises: 0017_add_tile_last_event
Create Date: 2026-06-24
"""

from alembic import op
from sqlalchemy import text

revision: str = "0018_road_blocked_to_obstructed"
down_revision: str | None = "0017_add_tile_last_event"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("UPDATE tiles SET road_condition = 'obstructed' WHERE road_condition = 'blocked'"))


def downgrade() -> None:
    op.execute(text("UPDATE tiles SET road_condition = 'blocked' WHERE road_condition = 'obstructed'"))
