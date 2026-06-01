"""create fuel_depots and fuel_stocks tables

Revision ID: 0008_create_fuel_supply
Revises: 0007_add_tile_situation_note
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0008_create_fuel_supply"
down_revision: str | None = "0007_add_tile_situation_note"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fuel_depots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("h3_index", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
    )
    op.create_table(
        "fuel_stocks",
        sa.Column("depot_id", sa.String(), primary_key=True),
        sa.Column("fuel_type", sa.String(), primary_key=True),
        sa.Column("quantity_liters", sa.Float(), nullable=False),
        sa.Column("capacity_liters", sa.Float(), nullable=False),
    )
    op.create_index("ix_fuel_stocks_depot_id", "fuel_stocks", ["depot_id"])


def downgrade() -> None:
    op.drop_index("ix_fuel_stocks_depot_id", table_name="fuel_stocks")
    op.drop_table("fuel_stocks")
    op.drop_table("fuel_depots")
