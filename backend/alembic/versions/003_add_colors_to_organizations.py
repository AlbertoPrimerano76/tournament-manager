"""add colors to organizations

Revision ID: 003
Revises: 002
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('primary_color', sa.String(20), nullable=False, server_default='#1a1a2e'))
    op.add_column('organizations', sa.Column('accent_color', sa.String(20), nullable=False, server_default='#c0392b'))


def downgrade():
    op.drop_column('organizations', 'primary_color')
    op.drop_column('organizations', 'accent_color')
