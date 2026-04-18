"""add match duration override to matches

Revision ID: 012_add_match_duration_override
Revises: 011_fix_user_assignment_unique_constraint
Create Date: 2026-04-18 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "012_add_match_duration_override"
down_revision = "011_fix_user_assignment_unique_constraint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("match_duration_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("matches", "match_duration_minutes")
