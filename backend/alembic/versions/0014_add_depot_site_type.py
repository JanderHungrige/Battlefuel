"""add site_type to fuel_depots

Revision ID: 0014_add_depot_site_type
Revises: 0013_add_buy_order_nato_stage
Create Date: 2026-06-05
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0014_add_depot_site_type"
down_revision: str | None = "0013_add_buy_order_nato_stage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fuel_depots", sa.Column("site_type", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("fuel_depots", "site_type")
