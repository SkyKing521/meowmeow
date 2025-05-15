from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import ChannelType, RoleType, MediaType, GameType

class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=32)

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    bio: Optional[str] = None
    status: Optional[str] = None
    two_factor_enabled: Optional[bool] = None

class User(UserBase):
    id: int
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    bio: Optional[str] = None
    status: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class LoginHistory(BaseModel):
    id: int
    user_id: int
    ip_address: str
    user_agent: str
    login_time: datetime
    success: bool

    class Config:
        from_attributes = True

class ServerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

class ServerCreate(ServerBase):
    pass

class ServerUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None

class Server(ServerBase):
    id: int
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    owner_id: int
    created_at: datetime
    settings: Dict[str, Any]

    class Config:
        from_attributes = True

class RoleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    color: str
    permissions: Dict[str, Any]

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None

class Role(RoleBase):
    id: int
    server_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ChannelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    type: ChannelType
    category_id: Optional[int] = None
    position: Optional[int] = 0
    is_private: Optional[bool] = False
    settings: Optional[Dict[str, Any]] = None

class ChannelCreate(ChannelBase):
    pass

class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    position: Optional[int] = None
    is_private: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None

class Channel(ChannelBase):
    id: int
    server_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class MessageBase(BaseModel):
    content: str
    attachments: Optional[List[Dict[str, Any]]] = []
    mentions: Optional[List[int]] = []
    parent_id: Optional[int] = None

class MessageCreate(MessageBase):
    pass

class MessageUpdate(BaseModel):
    content: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    mentions: Optional[List[int]] = None

class Message(MessageBase):
    id: int
    author_id: int
    channel_id: int
    created_at: datetime
    edited_at: Optional[datetime] = None
    is_edited: bool

    class Config:
        from_attributes = True

class MessageReaction(BaseModel):
    message_id: int
    user_id: int
    emoji: str

    class Config:
        from_attributes = True

class AuditLogBase(BaseModel):
    action: str
    target_type: str
    target_id: int
    changes: Dict[str, Any]

class AuditLogCreate(AuditLogBase):
    pass

class AuditLog(AuditLogBase):
    id: int
    server_id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class MediaBase(BaseModel):
    url: str
    type: MediaType
    name: str
    size: int
    duration: Optional[int] = None
    thumbnail_url: Optional[str] = None

class MediaCreate(MediaBase):
    pass

class Media(MediaBase):
    id: int
    uploaded_by_id: int
    channel_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class GameSessionBase(BaseModel):
    game_type: GameType
    settings: Dict[str, Any] = {}

class GameSessionCreate(GameSessionBase):
    pass

class GameSession(GameSessionBase):
    id: int
    channel_id: int
    created_by_id: int
    status: str
    created_at: datetime
    ended_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class GamePlayerBase(BaseModel):
    score: int = 0
    status: str

class GamePlayerCreate(GamePlayerBase):
    pass

class GamePlayer(GamePlayerBase):
    game_id: int
    user_id: int
    joined_at: datetime

    class Config:
        from_attributes = True

class MusicQueueBase(BaseModel):
    title: str
    artist: Optional[str] = None
    url: str
    duration: int
    position: int
    status: str

class MusicQueueCreate(MusicQueueBase):
    pass

class MusicQueue(MusicQueueBase):
    id: int
    channel_id: int
    added_by_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class InviteCodeBase(BaseModel):
    code: str
    server_id: int
    created_by: int
    expires_at: Optional[datetime] = None

class InviteCodeCreate(InviteCodeBase):
    pass

class InviteCode(InviteCodeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class UserCredentialsUpdate(BaseModel):
    username: str
    password: str 