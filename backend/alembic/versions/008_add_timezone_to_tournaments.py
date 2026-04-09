"""add timezone to tournaments

Revision ID: 008
Revises: 007
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa


revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/Rome"),
    )


def downgrade() -> None:
    op.drop_column("tournaments", "timezone")
