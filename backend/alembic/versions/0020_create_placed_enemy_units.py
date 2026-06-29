"""placed_enemy_units: operator-placed red forces (v2 Wave 22 F1, scenario-force-placement)

Persists scenario-placed hostiles so they survive reload, feed SAFE routing + the danger
circles (Wave 21), and can be snapshotted by save/load (Wave 22 F5) — complementing the
in-memory seed/chatter enemy sources.

Revision ID: 0020_create_placed_enemy_units
Revises: 0019_create_drawn_edges
Create Date: 2026-06-30
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0020_create_placed_enemy_units"
down_revision: str | None = "0019_create_drawn_edges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "placed_enemy_units",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("sidc", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("echelon", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("placed_enemy_units")
