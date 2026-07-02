"""scenarios: named snapshots of the hand-built scenario state (v2 Wave 22 F5, scenario-save-load)

A scenario is a JSONB snapshot of the operator-authored state — blue + red forces, depots (with
stock), tile threats, and obstacles — saved under a unique name and reloadable later.

Revision ID: 0022_create_scenarios
Revises: 0021_seed_placed_opfor
Create Date: 2026-07-02
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0022_create_scenarios"
down_revision: str | None = "0021_seed_placed_opfor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("snapshot", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scenarios")
