"""rendezvous_orders: scheduled rendezvous fuel runs (v2 Wave 13 F2)

Revision ID: 0016_rendezvous_orders
Revises: 0015_refuel_order_depot_source
Create Date: 2026-06-09
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0016_rendezvous_orders"
down_revision: str | None = "0015_refuel_order_depot_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rendezvous_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("truck_id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("sector_lat", sa.Float(), nullable=False),
        sa.Column("sector_lon", sa.Float(), nullable=False),
        sa.Column("sector_h3", sa.String(), nullable=False),
        sa.Column("metric", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("scheduled_game_s", sa.Float(), nullable=False),
        sa.Column("remaining_game_s", sa.Float(), nullable=False),
        sa.Column("truck_geometry", JSONB(), nullable=False),
        sa.Column("unit_geometry", JSONB(), nullable=False),
        sa.Column("truck_fuel_to_meet", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit_fuel_to_meet", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rendezvous_orders")
