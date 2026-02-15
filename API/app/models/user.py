from sqlalchemy import Column, Integer, String, Boolean
from app.db.base_class import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")  # 'admin' or 'user'
    is_active = Column(Boolean, default=True)
    display_name = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
