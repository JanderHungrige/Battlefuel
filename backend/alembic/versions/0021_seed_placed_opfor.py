"""Seed the initial OPFOR into placed_enemy_units so they are deletable (v2 Wave 22 F3)

The demo OPFOR used to live only in the in-memory ``SeededEnemyUnitProvider`` (not removable). Move
them into the ``placed_enemy_units`` table (one-time, here) and switch the default enemy-unit
provider to ``none`` (in config) so they are served from the DB and can be removed like any
operator-placed red force. Same three units, same ids/SIDCs as the old in-memory seed.

Revision ID: 0021_seed_placed_opfor
Revises: 0020_create_placed_enemy_units
Create Date: 2026-06-30
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0021_seed_placed_opfor"
down_revision: str | None = "0020_create_placed_enemy_units"
branch_labels = None
depends_on = None

_OPFOR = (
    ("enemy-mech-1", "OPFOR MECH 1", "10061000151211020000", 49.238, 11.865, "company"),
    ("enemy-armor-1", "OPFOR ARMOR 1", "10061000141205000000", 49.250, 11.8588, "platoon"),
    ("enemy-recon-1", "OPFOR RECON 1", "10061000131606000000", 49.222, 11.8676, "section"),
)


def upgrade() -> None:
    table = sa.table(
        "placed_enemy_units",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("sidc", sa.String),
        sa.column("lat", sa.Float),
        sa.column("lon", sa.Float),
        sa.column("echelon", sa.String),
    )
    op.bulk_insert(
        table,
        [
            {"id": i, "name": n, "sidc": s, "lat": la, "lon": lo, "echelon": e}
            for (i, n, s, la, lo, e) in _OPFOR
        ],
    )


def downgrade() -> None:
    ids = ", ".join(f"'{u[0]}'" for u in _OPFOR)
    op.execute(sa.text(f"DELETE FROM placed_enemy_units WHERE id IN ({ids})"))
