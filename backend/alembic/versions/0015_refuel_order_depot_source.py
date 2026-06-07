"""refuel_orders: depot-as-source (depot_id + nullable truck_id)

Revision ID: 0015_refuel_order_depot_source
Revises: 0014_add_depot_site_type
Create Date: 2026-06-07
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0015_refuel_order_depot_source"
down_revision: str | None = "0014_add_depot_site_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refuel_orders", sa.Column("depot_id", sa.String(), nullable=True))
    op.alter_column("refuel_orders", "truck_id", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.alter_column("refuel_orders", "truck_id", existing_type=sa.String(), nullable=False)
    op.drop_column("refuel_orders", "depot_id")
