"""create refuel_orders table

Revision ID: 0009_create_refuel_orders
Revises: 0008_create_fuel_supply
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0009_create_refuel_orders"
down_revision: str | None = "0008_create_fuel_supply"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refuel_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("truck_id", sa.String(), nullable=False),
        sa.Column("fuel_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("rendezvous_lat", sa.Float(), nullable=False),
        sa.Column("rendezvous_lon", sa.Float(), nullable=False),
        sa.Column("rendezvous_h3", sa.String(), nullable=False),
        sa.Column("requested_liters", sa.Float(), nullable=True),
        sa.Column("transferred_liters", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_refuel_orders_status", "refuel_orders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_refuel_orders_status", table_name="refuel_orders")
    op.drop_table("refuel_orders")
