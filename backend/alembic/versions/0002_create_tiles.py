"""create tiles table

Revision ID: 0002_create_tiles
Revises: 0001_enable_postgis
Create Date: 2026-06-01

H3 hex tiles with their game attributes. No geometry column — H3 provides cell identity
and boundary; geometry can be added later if the routing graph needs it.
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0002_create_tiles"
down_revision: str | None = "0001_enable_postgis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tiles",
        sa.Column("h3_index", sa.String(), primary_key=True),
        sa.Column("resolution", sa.Integer(), nullable=False),
        sa.Column("center_lat", sa.Float(), nullable=False),
        sa.Column("center_lon", sa.Float(), nullable=False),
        sa.Column("terrain", sa.String(), nullable=False),
        sa.Column("threat_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("intel_level", sa.String(), nullable=False, server_default="none"),
        sa.Column("weather", sa.String(), nullable=False, server_default="clear"),
        sa.Column("road_condition", sa.String(), nullable=False, server_default="clear"),
        sa.Column("cover", sa.String(), nullable=False, server_default="none"),
    )


def downgrade() -> None:
    op.drop_table("tiles")
