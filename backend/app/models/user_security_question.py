import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserSecurityQuestion(Base):
    __tablename__ = "user_security_questions"
    __table_args__ = (
        UniqueConstraint("user_id", "position", name="uq_user_security_question_position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    question_key: Mapped[str] = mapped_column(String(64), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="security_questions")  # type: ignore
