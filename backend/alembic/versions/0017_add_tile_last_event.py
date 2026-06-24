"""add last_event JSONB to tiles (v2 unify-threat-chatter)

Revision ID: 0017_add_tile_last_event
Revises: 0016_rendezvous_orders
Create Date: 2026-06-24
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0017_add_tile_last_event"
down_revision: str | None = "0016_rendezvous_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tiles",
        sa.Column("last_event", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tiles", "last_event")
