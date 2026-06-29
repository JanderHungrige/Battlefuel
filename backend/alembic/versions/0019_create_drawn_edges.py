"""drawn_edges: operator-drawn roads/paths injected into the routing graph (v2 Wave 20 F4)

Revision ID: 0019_create_drawn_edges
Revises: 0018_road_blocked_to_obstructed
Create Date: 2026-06-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0019_create_drawn_edges"
down_revision: str | None = "0018_road_blocked_to_obstructed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "drawn_edges",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False, server_default="road"),
        sa.Column("coordinates", JSONB(), nullable=False),
        sa.Column("connect_start", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("connect_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("drawn_edges")
    # Drop the injected-edge marker columns + any injected rows so the graph returns to base OSM.
    op.execute(sa.text("DELETE FROM ways WHERE drawn_id IS NOT NULL"))
    op.execute(sa.text("DELETE FROM ways_vertices_pgr WHERE drawn_id IS NOT NULL"))
    op.execute(sa.text("ALTER TABLE ways DROP COLUMN IF EXISTS drawn_id"))
    op.execute(sa.text("ALTER TABLE ways_vertices_pgr DROP COLUMN IF EXISTS drawn_id"))
