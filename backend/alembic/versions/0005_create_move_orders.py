"""create move_orders table

Revision ID: 0005_create_move_orders
Revises: 0004_enable_pgrouting
Create Date: 2026-06-01
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0005_create_move_orders"
down_revision: str | None = "0004_enable_pgrouting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "move_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("instance_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("metric", sa.String(), nullable=False),
        sa.Column("distance_m", sa.Float(), nullable=False),
        sa.Column("duration_s", sa.Float(), nullable=False),
        sa.Column("fuel_consumed_l", sa.Float(), nullable=False),
        sa.Column("progress_m", sa.Float(), nullable=False, server_default="0"),
        sa.Column("geometry", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_move_orders_status", "move_orders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_move_orders_status", table_name="move_orders")
    op.drop_table("move_orders")
