"""create obstacles table

Revision ID: 0006_create_obstacles
Revises: 0005_create_move_orders
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0006_create_obstacles"
down_revision: str | None = "0005_create_move_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "obstacles",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("h3_index", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_obstacles_h3_index", "obstacles", ["h3_index"])


def downgrade() -> None:
    op.drop_index("ix_obstacles_h3_index", table_name="obstacles")
    op.drop_table("obstacles")
