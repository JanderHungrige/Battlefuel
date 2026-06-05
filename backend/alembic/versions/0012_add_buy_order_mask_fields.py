"""add order-mask metadata fields to buy_orders

Revision ID: 0012_add_buy_order_mask_fields
Revises: 0011_create_fuel_platforms
Create Date: 2026-06-05
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0012_add_buy_order_mask_fields"
down_revision: str | None = "0011_create_fuel_platforms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("buy_orders", sa.Column("platform_id", sa.String(), nullable=True))
    op.add_column(
        "buy_orders",
        sa.Column("inform_jlsg", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "buy_orders",
        sa.Column("inform_jtf", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("buy_orders", sa.Column("destination_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("buy_orders", "destination_name")
    op.drop_column("buy_orders", "inform_jtf")
    op.drop_column("buy_orders", "inform_jlsg")
    op.drop_column("buy_orders", "platform_id")
