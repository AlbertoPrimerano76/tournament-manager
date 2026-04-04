"""add logo_url to tournaments

Revision ID: 002
Revises: 001
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tournaments', sa.Column('logo_url', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('tournaments', 'logo_url')
