"""add structure templates and age group config

Revision ID: 004
Revises: 003
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournament_age_groups",
        sa.Column("structure_template_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "tournament_age_groups",
        sa.Column("structure_config", sa.JSON(), nullable=True),
    )

    op.create_table(
        "structure_templates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("organization_id", sa.String(length=36), nullable=True),
        sa.Column("age_group", sa.String(length=20), nullable=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("structure_templates")
    op.drop_column("tournament_age_groups", "structure_config")
    op.drop_column("tournament_age_groups", "structure_template_name")
