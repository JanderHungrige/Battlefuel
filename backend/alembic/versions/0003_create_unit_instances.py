"""create unit_instances table

Revision ID: 0003_create_unit_instances
Revises: 0002_create_tiles
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0003_create_unit_instances"
down_revision: str | None = "0002_create_tiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "unit_instances",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("unit_type_id", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("h3_index", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="operational"),
        sa.Column("current_fuel_liters", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("unit_instances")
