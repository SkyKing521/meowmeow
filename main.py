from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import uvicorn
from datetime import datetime, timedelta
import json
from jose import JWTError, jwt
import socket
import base64
import websockets

from database import *
import models as models
import schemas as schemas
import auth as auth
import crud as crud
import config
from audio_handler import audio_handler

# Import User model explicitly
from models import User, Channel, ServerMember

# Create database tables
try:
    # Only create tables if they don't exist
    models.Base.metadata.create_all(bind=engine)
    print("Database tables created successfully")
except Exception as e:
    print(f"Error creating database tables: {e}")

app = FastAPI(title="Dump API")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React development server
        "http://localhost:3001",  # React development server (alternative port)
        "http://localhost:3002",  # React development server (alternative port)
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        f"http://{config.SERVER_IP}:3000",
        f"http://{config.SERVER_IP}:3001",
        f"http://{config.SERVER_IP}:3002",
        f"http://{config.SERVER_IP}:8000",
        f"ws://{config.SERVER_IP}:8000",
        f"wss://{config.SERVER_IP}:8000"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Voice channel WebSocket connection manager
class VoiceChannelManager:
    def __init__(self):
        self.voice_channels = {}
        self.user_channels = {}
        self.audio_streams = {}
        self.user_websockets = {}  # Add this to track user websockets

    async def connect_user(self, websocket, channel_id, user_id):
        if channel_id not in self.voice_channels:
            self.voice_channels[channel_id] = set()
        self.voice_channels[channel_id].add(user_id)
        self.user_channels[user_id] = channel_id
        self.user_websockets[user_id] = websocket  # Store the websocket
        
        # Create audio streams for the user
        input_stream = audio_handler.create_input_stream(user_id)
        output_stream = audio_handler.create_output_stream(user_id)
        if input_stream and output_stream:
            self.audio_streams[user_id] = {
                'input': input_stream,
                'output': output_stream
            }
        
        # Broadcast user joined
        await self.broadcast_user_joined(channel_id, user_id)
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if data['type'] == 'audio':
                        await self.handle_audio_data(channel_id, user_id, data['data'])
                    elif data['type'] == 'video':
                        await self.broadcast_video(channel_id, user_id, data['data'])
                    elif data['type'] == 'screen':
                        await self.broadcast_screen(channel_id, user_id, data['data'])
                except json.JSONDecodeError:
                    print(f"Invalid JSON message from user {user_id}")
                except Exception as e:
                    print(f"Error processing message from user {user_id}: {e}")
        except websockets.exceptions.ConnectionClosed:
            print(f"Connection closed for user {user_id}")
        finally:
            await self.disconnect_user(user_id)

    async def broadcast_user_joined(self, channel_id, user_id):
        if channel_id in self.voice_channels:
            message = {
                'type': 'participant_joined',
                'participant': {
                    'id': user_id,
                    'isMuted': False,
                    'isDeafened': False,
                    'isVideoEnabled': False,
                    'isScreenSharing': False
                },
                'isEchoMode': len(self.voice_channels[channel_id]) == 1
            }
            await self.broadcast_to_channel(channel_id, message)

    async def broadcast_user_left(self, channel_id, user_id):
        if channel_id in self.voice_channels:
            message = {
                'type': 'participant_left',
                'userId': user_id,
                'isEchoMode': len(self.voice_channels[channel_id]) <= 1
            }
            await self.broadcast_to_channel(channel_id, message)

    async def broadcast_to_channel(self, channel_id, message):
        if channel_id in self.voice_channels:
            for user_id in self.voice_channels[channel_id]:
                try:
                    websocket = self.user_websockets.get(user_id)
                    if websocket:
                        await websocket.send_json(message)
                except Exception as e:
                    print(f"Error broadcasting to user {user_id}: {e}")

    async def broadcast_audio(self, channel_id, sender_id, audio_data):
        if channel_id in self.voice_channels:
            message = {
                'type': 'audio',
                'sender_id': sender_id,
                'data': audio_data
            }
            await self.broadcast_to_channel(channel_id, message)

    async def broadcast_video(self, channel_id, sender_id, video_data):
        if channel_id in self.voice_channels:
            message = {
                'type': 'video',
                'sender_id': sender_id,
                'data': video_data
            }
            await self.broadcast_to_channel(channel_id, message)

    async def broadcast_screen(self, channel_id, sender_id, screen_data):
        if channel_id in self.voice_channels:
            message = {
                'type': 'screen',
                'sender_id': sender_id,
                'data': screen_data
            }
            await self.broadcast_to_channel(channel_id, message)

    async def disconnect_user(self, user_id):
        if user_id in self.user_channels:
            channel_id = self.user_channels[user_id]
            self.voice_channels[channel_id].remove(user_id)
            del self.user_channels[user_id]
            
            # Clean up audio streams
            if user_id in self.audio_streams:
                audio_handler.close_stream(user_id)
                del self.audio_streams[user_id]
            
            # Remove websocket reference
            if user_id in self.user_websockets:
                del self.user_websockets[user_id]
            
            # Broadcast user left
            await self.broadcast_user_left(channel_id, user_id)
            
            # Clean up empty channels
            if not self.voice_channels[channel_id]:
                del self.voice_channels[channel_id]

    def cleanup(self):
        audio_handler.cleanup()

voice_manager = VoiceChannelManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages here
            await manager.broadcast(f"Message: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast("Client disconnected")

@app.websocket("/ws/voice/{channel_id}")
async def voice_channel_endpoint(websocket: WebSocket, channel_id: int, token: str):
    user = None
    db = None
    try:
        print(f"[{datetime.now()}] WebSocket connection attempt for channel {channel_id}")
        
        # Decode token and get user
        try:
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
            user_email = payload.get("sub")
            if not user_email:
                print(f"[{datetime.now()}] Invalid token - no user email")
                await websocket.close(code=4000, reason="Invalid token")
                return
        except jwt.ExpiredSignatureError:
            print(f"[{datetime.now()}] Token expired, attempting to refresh")
            # Try to refresh the token
            try:
                db = SessionLocal()
                user = db.query(User).filter(User.email == payload.get("sub")).first()
                if user:
                    # Create new token
                    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
                    new_token = auth.create_access_token(
                        data={"sub": user.email}, expires_delta=access_token_expires
                    )
                    # Update last login
                    user.last_login = datetime.now()
                    db.commit()
                    # Send new token to client
                    await websocket.accept()
                    await websocket.send_json({
                        "type": "token_refresh",
                        "token": new_token
                    })
                    token = new_token
                else:
                    await websocket.close(code=4000, reason="User not found")
                    return
            except Exception as e:
                print(f"[{datetime.now()}] Error refreshing token: {str(e)}")
                await websocket.close(code=4000, reason="Token refresh failed")
                return
        except jwt.JWTError as e:
            print(f"[{datetime.now()}] JWT decode error: {str(e)}")
            await websocket.close(code=4000, reason="Invalid token")
            return

        # Get user from database
        if not db:
            db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                print(f"[{datetime.now()}] User not found for email: {user_email}")
                await websocket.close(code=4000, reason="User not found")
                return

            # Get channel and verify user is a member
            channel = db.query(Channel).filter(Channel.id == channel_id).first()
            if not channel:
                print(f"[{datetime.now()}] Channel not found: {channel_id}")
                await websocket.close(code=4000, reason="Channel not found")
                return

            # Check if user is a member of the server
            membership = db.query(ServerMember).filter(
                ServerMember.server_id == channel.server_id,
                ServerMember.user_id == user.id
            ).first()
            
            if not membership:
                print(f"[{datetime.now()}] User {user.id} is not a member of server {channel.server_id}")
                await websocket.close(code=4000, reason="Not a member of this server")
                return

            # Accept the WebSocket connection
            await websocket.accept()
            print(f"[{datetime.now()}] User {user.username} connected to voice channel {channel_id}")

            # Send initial connection success message
            try:
                await websocket.send_json({
                    "type": "connection_status",
                    "status": "connected",
                    "message": "Successfully connected to voice channel"
                })
                print(f"[{datetime.now()}] Sent initial connection status to user {user.username}")
            except Exception as e:
                print(f"[{datetime.now()}] Error sending initial status: {str(e)}")
                return

            # Main message handling loop
            while True:
                try:
                    data = await websocket.receive()
                    print(f"[{datetime.now()}] Received data from user {user.username}: {data['type']}")
                    
                    if data["type"] == "websocket.disconnect":
                        print(f"[{datetime.now()}] WebSocket disconnected for user {user.username}")
                        break
                        
                    if data["type"] == "websocket.receive":
                        if "text" in data:
                            message = json.loads(data["text"])
                            print(f"[{datetime.now()}] Received message from user {user.username}: {message}")
                            
                            # Handle different message types
                            if message.get("type") == "join":
                                print(f"[{datetime.now()}] User {user.username} joining voice channel")
                                # Add user to voice channel participants
                                await voice_manager.connect_user(websocket, channel_id, user.id)
                            elif message.get("type") == "leave":
                                print(f"[{datetime.now()}] User {user.username} leaving voice channel")
                                # Remove user from voice channel participants
                                await voice_manager.disconnect_user(user.id)
                                break
                            elif message.get("type") == "ping":
                                # Respond to ping with pong
                                try:
                                    await websocket.send_json({"type": "pong"})
                                    print(f"[{datetime.now()}] Sent pong response to user {user.username}")
                                except Exception as e:
                                    print(f"[{datetime.now()}] Error sending pong: {str(e)}")
                                    break
                            else:
                                # Echo the message back to the sender
                                try:
                                    await websocket.send_json({
                                        "type": "echo",
                                        "original_message": message
                                    })
                                except Exception as e:
                                    print(f"[{datetime.now()}] Error echoing message: {str(e)}")
                                    break
                                
                        elif "bytes" in data:
                            # Handle binary audio data
                            audio_data = data["bytes"]
                            print(f"[{datetime.now()}] Received audio data from user {user.username}: {len(audio_data)} bytes")
                            
                            # Echo audio data back to sender
                            try:
                                # Send the raw audio data back without modification
                                await websocket.send_bytes(audio_data)
                                print(f"[{datetime.now()}] Echoed audio data back to user {user.username}")
                            except Exception as e:
                                print(f"[{datetime.now()}] Error echoing audio: {str(e)}")
                                # Don't break the connection on audio echo error
                                continue

                except WebSocketDisconnect:
                    print(f"[{datetime.now()}] WebSocket disconnected for user {user.username}")
                    break
                except Exception as e:
                    print(f"[{datetime.now()}] Error processing message: {str(e)}")
                    # Don't break the connection on general errors
                    continue

        except Exception as e:
            print(f"[{datetime.now()}] Database error: {str(e)}")
            try:
                await websocket.close(code=4000, reason="Database error")
            except Exception:
                pass
            return

    except Exception as e:
        print(f"[{datetime.now()}] Error in voice channel: {str(e)}")
        try:
            await websocket.close(code=4000, reason="Internal server error")
        except Exception:
            pass
    finally:
        # Clean up resources
        if user and channel_id:
            print(f"[{datetime.now()}] Cleaning up resources for user {user.username}")
            await voice_manager.disconnect_user(user.id)
        if db:
            db.close()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.post("/token")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    try:
        # Get client IP
        client_ip = request.client.host
        print(f"Login attempt from IP: {client_ip}")

        # Debug logging
        print(f"Login attempt for email: {form_data.username}")
        print(f"Password received: {form_data.password}")
        print(f"Password length: {len(form_data.password)}")
        print(f"Password bytes: {[ord(c) for c in form_data.password]}")

        # Get user and verify password
        user = crud.get_user_by_email(db, form_data.username)
        if not user:
            print(f"User not found: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )

        if not auth.verify_password(form_data.password, user.hashed_password):
            print(f"Invalid password for user: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )

        # Create access token
        access_token = auth.create_access_token(data={"sub": user.email})
        print(f"Login successful for user: {form_data.username}")

        # Log successful attempt
        crud.log_login_attempt(db, client_ip, True)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "is_active": user.is_active
            }
        }
    except HTTPException as he:
        # Log failed attempt
        crud.log_login_attempt(db, request.client.host, False)
        raise he
    except Exception as e:
        print(f"Login error: {str(e)}")
        crud.log_login_attempt(db, request.client.host, False)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        )

@app.post("/token/refresh")
async def refresh_token(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Create new access token
        access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = auth.create_access_token(
            data={"sub": current_user.email}, expires_delta=access_token_expires
        )
        
        # Update last login time
        current_user.last_login = datetime.now()
        db.commit()
        
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    print(f"Registration attempt for email: {user.email}")
    print(f"Username: {user.username}")
    print(f"Password length: {len(user.password)}")
    
    # Check if email is already registered
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        print(f"Email already registered: {user.email}")
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username is already taken
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        print(f"Username already taken: {user.username}")
        raise HTTPException(status_code=400, detail="Username already taken")
    
    print("Creating new user...")
    new_user = crud.create_user(db=db, user=user)
    print(f"User created successfully: id={new_user.id}, email={new_user.email}, username={new_user.username}")
    return new_user

@app.get("/users/me/", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.put("/users/me/", response_model=schemas.User)
def update_user_me(
    user: schemas.UserUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.update_user(db=db, user_id=current_user.id, user=user)

@app.get("/users/me/login-history/", response_model=List[schemas.LoginHistory])
def read_login_history(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    return crud.get_login_history(db=db, user_id=current_user.id, skip=skip, limit=limit)

@app.post("/servers/", response_model=schemas.Server)
def create_server(
    server: schemas.ServerCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.create_server(db=db, server=server, owner_id=current_user.id)

@app.get("/servers/", response_model=List[schemas.Server])
def read_servers(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    return crud.get_user_servers(db=db, user_id=current_user.id)

@app.get("/servers/{server_id}", response_model=schemas.Server)
def read_server(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server

@app.put("/servers/{server_id}", response_model=schemas.Server)
def update_server(
    server_id: int,
    server: schemas.ServerUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    updated_server = crud.update_server(db=db, server_id=server_id, server=server)
    crud.create_audit_log(
        db=db,
        server_id=server_id,
        user_id=current_user.id,
        action="update_server",
        target_type="server",
        target_id=server_id,
        changes=server.dict(exclude_unset=True)
    )
    return updated_server

@app.delete("/servers/{server_id}")
def delete_server(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    crud.create_audit_log(
        db=db,
        server_id=server_id,
        user_id=current_user.id,
        action="delete_server",
        target_type="server",
        target_id=server_id,
        changes={}
    )
    return crud.delete_server(db=db, server_id=server_id)

@app.post("/servers/{server_id}/roles/", response_model=schemas.Role)
def create_role(
    server_id: int,
    role: schemas.RoleCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    created_role = crud.create_role(db=db, role=role, server_id=server_id)
    crud.create_audit_log(
        db=db,
        server_id=server_id,
        user_id=current_user.id,
        action="create_role",
        target_type="role",
        target_id=created_role.id,
        changes=role.dict()
    )
    return created_role

@app.get("/servers/{server_id}/roles/", response_model=List[schemas.Role])
def read_roles(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return crud.get_server_roles(db=db, server_id=server_id)

@app.put("/roles/{role_id}", response_model=schemas.Role)
def update_role(
    role_id: int,
    role: schemas.RoleUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_role = crud.get_role(db=db, role_id=role_id)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    
    db_server = crud.get_server(db=db, server_id=db_role.server_id)
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    updated_role = crud.update_role(db=db, role_id=role_id, role=role)
    crud.create_audit_log(
        db=db,
        server_id=db_role.server_id,
        user_id=current_user.id,
        action="update_role",
        target_type="role",
        target_id=role_id,
        changes=role.dict(exclude_unset=True)
    )
    return updated_role

@app.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_role = crud.get_role(db=db, role_id=role_id)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    
    db_server = crud.get_server(db=db, server_id=db_role.server_id)
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    crud.create_audit_log(
        db=db,
        server_id=db_role.server_id,
        user_id=current_user.id,
        action="delete_role",
        target_type="role",
        target_id=role_id,
        changes={}
    )
    return crud.delete_role(db=db, role_id=role_id)

@app.post("/servers/{server_id}/channels/", response_model=schemas.Channel)
def create_channel(
    server_id: int,
    channel: schemas.ChannelCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    created_channel = crud.create_channel(db=db, channel=channel, server_id=server_id)
    crud.create_audit_log(
        db=db,
        server_id=server_id,
        user_id=current_user.id,
        action="create_channel",
        target_type="channel",
        target_id=created_channel.id,
        changes=channel.dict()
    )
    return created_channel

@app.get("/servers/{server_id}/channels/", response_model=List[schemas.Channel])
def read_channels(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return crud.get_server_channels(db=db, server_id=server_id)

@app.put("/channels/{channel_id}", response_model=schemas.Channel)
def update_channel(
    channel_id: int,
    channel: schemas.ChannelUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_channel = crud.get_channel(db=db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    db_server = crud.get_server(db=db, server_id=db_channel.server_id)
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    updated_channel = crud.update_channel(db=db, channel_id=channel_id, channel=channel)
    crud.create_audit_log(
        db=db,
        server_id=db_channel.server_id,
        user_id=current_user.id,
        action="update_channel",
        target_type="channel",
        target_id=channel_id,
        changes=channel.dict(exclude_unset=True)
    )
    return updated_channel

@app.delete("/channels/{channel_id}")
def delete_channel(
    channel_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_channel = crud.get_channel(db=db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    db_server = crud.get_server(db=db, server_id=db_channel.server_id)
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    crud.create_audit_log(
        db=db,
        server_id=db_channel.server_id,
        user_id=current_user.id,
        action="delete_channel",
        target_type="channel",
        target_id=channel_id,
        changes={}
    )
    return crud.delete_channel(db=db, channel_id=channel_id)

@app.post("/channels/{channel_id}/messages/", response_model=schemas.Message)
def create_message(
    channel_id: int,
    message: schemas.MessageCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_channel = crud.get_channel(db=db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return crud.create_message(
        db=db,
        message=message,
        author_id=current_user.id,
        channel_id=channel_id
    )

@app.get("/channels/{channel_id}/messages/", response_model=List[schemas.Message])
def read_messages(
    channel_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    db_channel = crud.get_channel(db=db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return crud.get_channel_messages(db=db, channel_id=channel_id, skip=skip, limit=limit)

@app.put("/messages/{message_id}", response_model=schemas.Message)
def update_message(
    message_id: int,
    message: schemas.MessageUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_message = crud.get_message(db=db, message_id=message_id)
    if db_message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if db_message.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.update_message(db=db, message_id=message_id, message=message)

@app.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_message = crud.get_message(db=db, message_id=message_id)
    if db_message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if db_message.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.delete_message(db=db, message_id=message_id)

@app.post("/messages/{message_id}/reactions/{emoji}")
def add_reaction(
    message_id: int,
    emoji: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_message = crud.get_message(db=db, message_id=message_id)
    if db_message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return crud.add_message_reaction(db=db, message_id=message_id, user_id=current_user.id, emoji=emoji)

@app.delete("/messages/{message_id}/reactions/{emoji}")
def remove_reaction(
    message_id: int,
    emoji: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_message = crud.get_message(db=db, message_id=message_id)
    if db_message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return crud.remove_message_reaction(db=db, message_id=message_id, user_id=current_user.id, emoji=emoji)

@app.get("/servers/{server_id}/audit-logs/", response_model=List[schemas.AuditLog])
def read_audit_logs(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    db_server = crud.get_server(db=db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if db_server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.get_server_audit_logs(db=db, server_id=server_id, skip=skip, limit=limit)

# Media endpoints
@app.post("/channels/{channel_id}/media/", response_model=schemas.Media)
def upload_media(
    channel_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Проверяем права доступа к каналу
    channel = crud.get_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    # Определяем тип медиа
    content_type = file.content_type
    if content_type.startswith('image/'):
        media_type = models.MediaType.IMAGE
    elif content_type.startswith('video/'):
        media_type = models.MediaType.VIDEO
    elif content_type.startswith('audio/'):
        media_type = models.MediaType.AUDIO
    else:
        media_type = models.MediaType.FILE
    
    # Загружаем файл
    file_location = f"uploads/{file.filename}"
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())
    
    # Создаем запись в базе данных
    media = schemas.MediaCreate(
        url=f"/uploads/{file.filename}",
        type=media_type,
        name=file.filename,
        size=file.size
    )
    
    return crud.create_media(db, media, current_user.id, channel_id)

@app.get("/channels/{channel_id}/media/", response_model=List[schemas.Media])
def get_channel_media(
    channel_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.get_channel_media(db, channel_id, skip, limit)

@app.delete("/media/{media_id}")
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.delete_media(db, media_id)

# Game endpoints
@app.post("/channels/{channel_id}/games/", response_model=schemas.GameSession)
def create_game(
    channel_id: int,
    game: schemas.GameSessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.create_game_session(db, game, current_user.id, channel_id)

@app.get("/channels/{channel_id}/games/", response_model=List[schemas.GameSession])
def get_channel_games(
    channel_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.get_channel_games(db, channel_id, skip, limit)

@app.post("/games/{game_id}/players/", response_model=schemas.GamePlayer)
def join_game(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.add_game_player(db, game_id, current_user.id)

@app.put("/games/{game_id}/players/{user_id}", response_model=schemas.GamePlayer)
def update_player_status(
    game_id: int,
    user_id: int,
    player_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.update_game_player(db, game_id, user_id, player_data)

# Music endpoints
@app.get("/channels/{channel_id}/music/", response_model=List[schemas.MusicQueue])
def get_music_queue(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.get_music_queue(db, channel_id)

@app.post("/channels/{channel_id}/music/", response_model=schemas.MusicQueue)
def add_to_queue(
    channel_id: int,
    music: schemas.MusicQueueCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.add_to_music_queue(db, music, current_user.id, channel_id)

@app.put("/music/{music_id}/status", response_model=schemas.MusicQueue)
def update_music_status(
    music_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.update_music_status(db, music_id, status)

@app.delete("/music/{music_id}")
def remove_from_queue(
    music_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.remove_from_music_queue(db, music_id)

@app.post("/servers/{server_id}/invite", response_model=schemas.InviteCode)
def create_server_invite(
    server_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user is a member of the server
    if not crud.is_user_server_member(db=db, user_id=current_user.id, server_id=server_id):
        raise HTTPException(status_code=403, detail="Not a member of this server")
    
    # Create invite code
    invite = crud.create_invite_code(db=db, server_id=server_id, user_id=current_user.id)
    
    # Log the action
    crud.create_audit_log(
        db=db,
        server_id=server_id,
        user_id=current_user.id,
        action="create_invite",
        target_type="invite",
        target_id=invite.id,
        changes={"code": invite.code}
    )
    
    return invite

@app.post("/servers/join/{invite_code}")
async def join_server(
    invite_code: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Get server by invite code
    server = crud.get_server_by_invite_code(db, invite_code)
    if not server:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    
    # Check if user is already a member
    if crud.is_user_server_member(db, current_user.id, server.id):
        raise HTTPException(status_code=400, detail="Already a member of this server")
    
    # Add user to server
    member = crud.add_user_to_server(db, current_user.id, server.id)
    
    # Log the action
    crud.create_audit_log(
        db=db,
        server_id=server.id,
        user_id=current_user.id,
        action="join_server",
        target_type="server",
        target_id=server.id,
        changes={}
    )
    
    return {"message": "Successfully joined server", "server": server}

@app.put("/users/{user_id}/credentials")
def update_credentials(
    user_id: int,
    credentials: schemas.UserCredentialsUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Only allow users to update their own credentials
    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    return crud.update_user_credentials(
        db=db,
        user_id=user_id,
        new_username=credentials.username,
        new_password=credentials.password
    )

@app.put("/fix-credentials/{user_id}")
def fix_swapped_credentials(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Fix swapped username and password for a user.
    This is a temporary endpoint to fix the issue.
    """
    db_user = crud.get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # The current username is actually the password
    current_password = db_user.username
    # The current password hash is for the username
    current_username = db_user.hashed_password
    
    # Update with correct values
    db_user.username = current_username
    db_user.hashed_password = current_password
    
    db.commit()
    db.refresh(db_user)
    
    return {"message": "Credentials fixed successfully"}

if __name__ == "__main__":
    def find_free_port(start_port=8000, max_port=8999):
        for port in range(start_port, max_port + 1):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('', port))
                    return port
            except OSError:
                continue
        return None

    port = find_free_port()
    if port is None:
        print("No free ports available")
        exit(1)
        
    print(f"Starting server on port {port}")
    uvicorn.run(app, host=config.SERVER_IP, port=port) 