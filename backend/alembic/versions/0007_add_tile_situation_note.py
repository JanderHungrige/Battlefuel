"""add situation + note to tiles

Revision ID: 0007_add_tile_situation_note
Revises: 0006_create_obstacles
Create Date: 2026-06-01
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0007_add_tile_situation_note"
down_revision: str | None = "0006_create_obstacles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tiles", sa.Column("situation", sa.String(), nullable=True))
    op.add_column("tiles", sa.Column("note", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("tiles", "note")
    op.drop_column("tiles", "situation")
