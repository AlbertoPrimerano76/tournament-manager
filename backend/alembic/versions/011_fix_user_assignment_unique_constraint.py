"""fix user assignment unique constraint

Revision ID: 011
Revises: 010
Create Date: 2026-04-14
"""

from alembic import op


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_tournament_assignments DROP CONSTRAINT IF EXISTS uq_user_tournament_assignment")
    op.execute(
        """
        ALTER TABLE user_tournament_assignments
        ADD CONSTRAINT uq_user_tournament_assignment
        UNIQUE (user_id, tournament_id, age_group_id)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE user_tournament_assignments DROP CONSTRAINT IF EXISTS uq_user_tournament_assignment")
    op.execute(
        """
        ALTER TABLE user_tournament_assignments
        ADD CONSTRAINT uq_user_tournament_assignment
        UNIQUE (user_id, tournament_id)
        """
    )
