"""add field map url to age groups

Revision ID: 007
Revises: 006
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournament_age_groups",
        sa.Column("field_map_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tournament_age_groups", "field_map_url")
