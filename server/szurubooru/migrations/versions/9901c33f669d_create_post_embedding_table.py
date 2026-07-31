"""
Create post embedding table

Revision ID: 9901c33f669d
Created at: 2026-07-31 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "9901c33f669d"
down_revision = "5b5c940b4e78"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_embedding",
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("model", sa.Unicode(64), nullable=False),
        sa.Column("created_time", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["post.id"]),
        sa.PrimaryKeyConstraint("post_id"),
    )


def downgrade():
    op.drop_table("post_embedding")
