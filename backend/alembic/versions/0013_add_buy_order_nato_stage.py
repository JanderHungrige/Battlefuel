"""add NATO fulfilment stage tracking to buy_orders

Revision ID: 0013_add_buy_order_nato_stage
Revises: 0012_add_buy_order_mask_fields
Create Date: 2026-06-05
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0013_add_buy_order_nato_stage"
down_revision: str | None = "0012_add_buy_order_mask_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "buy_orders",
        sa.Column("nato_stage", sa.String(), nullable=False, server_default="placed"),
    )
    op.add_column(
        "buy_orders",
        sa.Column(
            "stage_remaining_game_s", sa.Float(), nullable=False, server_default="30.0"
        ),
    )


def downgrade() -> None:
    op.drop_column("buy_orders", "stage_remaining_game_s")
    op.drop_column("buy_orders", "nato_stage")
