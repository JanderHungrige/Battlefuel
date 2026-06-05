"""create fuel_platforms table

Revision ID: 0011_create_fuel_platforms
Revises: 0010_create_buy_orders
Create Date: 2026-06-05
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0011_create_fuel_platforms"
down_revision: str | None = "0010_create_buy_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fuel_platforms",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("logo_key", sa.String(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("fuel_platforms")
