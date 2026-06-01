"""enable pgrouting extension

Revision ID: 0004_enable_pgrouting
Revises: 0003_create_unit_instances
Create Date: 2026-06-01

Requires the pgRouting-enabled DB image (db/Dockerfile). Routing tables (ways/vertices)
are populated out-of-band by osm2pgrouting; see backend/scripts/build_routing_graph.sh.
"""

from alembic import op

revision: str = "0004_enable_pgrouting"
down_revision: str | None = "0003_create_unit_instances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgrouting")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pgrouting")
