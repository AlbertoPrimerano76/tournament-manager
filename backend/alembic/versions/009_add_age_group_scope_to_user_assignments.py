"""add age group scope to user assignments

Revision ID: 009
Revises: 008
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_tournament_assignments",
        sa.Column("age_group_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_user_tournament_assignments_age_group",
        "user_tournament_assignments",
        "tournament_age_groups",
        ["age_group_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_tournament_assignments_age_group", "user_tournament_assignments", type_="foreignkey")
    op.drop_column("user_tournament_assignments", "age_group_id")
