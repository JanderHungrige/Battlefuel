"""create buy_orders table

Revision ID: 0010_create_buy_orders
Revises: 0009_create_refuel_orders
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0010_create_buy_orders"
down_revision: str | None = "0009_create_refuel_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "buy_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("depot_id", sa.String(), nullable=False),
        sa.Column("fuel_type", sa.String(), nullable=False),
        sa.Column("quantity_liters", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("lead_time_game_s", sa.Float(), nullable=False),
        sa.Column("remaining_game_s", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_buy_orders_status", "buy_orders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_buy_orders_status", table_name="buy_orders")
    op.drop_table("buy_orders")
