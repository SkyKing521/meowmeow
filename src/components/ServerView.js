import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Typography,
    TextField,
    Button,
    IconButton,
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Divider,
    Tooltip,
    Avatar,
    Badge,
    Paper,
    Grid,
    Chip,
    Slider
} from '@mui/material';
import {
    Add as AddIcon,
    MoreVert as MoreVertIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    VolumeUp,
    Chat as ChatIcon,
    Category as CategoryIcon,
    EmojiEmotions as EmojiIcon,
    AttachFile as AttachFileIcon,
    Send as SendIcon,
    Settings as SettingsIcon,
    Security as SecurityIcon,
    History as HistoryIcon,
    MusicNote,
    Games,
    Image,
    VideoLibrary,
    AudioFile,
    PlayArrow,
    Pause,
    SkipNext,
    SkipPrevious,
    ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import config from '../config';
import VoiceChannel from './VoiceChannel';

const ServerView = () => {
    const { serverId } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [server, setServer] = useState(null);
    const [channels, setChannels] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [newChannelName, setNewChannelName] = useState('');
    const [showNewChannelInput, setShowNewChannelInput] = useState(false);
    const [channelType, setChannelType] = useState('text');
    const [anchorEl, setAnchorEl] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editName, setEditName] = useState('');
    const [showAuditLogs, setShowAuditLogs] = useState(false);
    const [auditLogs, setAuditLogs] = useState([]);
    const [showRoles, setShowRoles] = useState(false);
    const [roles, setRoles] = useState([]);
    const [showNewRoleDialog, setShowNewRoleDialog] = useState(false);
    const [newRole, setNewRole] = useState({ name: '', color: '#000000', permissions: {} });
    const messagesEndRef = useRef(null);
    const [showMediaUpload, setShowMediaUpload] = useState(false);
    const [showGameDialog, setShowGameDialog] = useState(false);
    const [showMusicPlayer, setShowMusicPlayer] = useState(false);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [currentGame, setCurrentGame] = useState(null);
    const [musicQueue, setMusicQueue] = useState([]);
    const [currentMusic, setCurrentMusic] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(100);
    const [inviteLink, setInviteLink] = useState('');
    const [showInviteCopied, setShowInviteCopied] = useState(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const fetchServerData = async () => {
            try {
                const [serverRes, channelsRes] = await Promise.all([
                    axios.get(`${config.API_BASE_URL}/servers/${serverId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    axios.get(`${config.API_BASE_URL}/servers/${serverId}/channels`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                ]);
                setServer(serverRes.data);
                setChannels(channelsRes.data);
                if (channelsRes.data.length > 0) {
                    setSelectedChannel(channelsRes.data[0]);
                }
            } catch (error) {
                console.error('Error fetching server data:', error);
            }
        };

        fetchServerData();
    }, [serverId, token]);

    useEffect(() => {
        if (selectedChannel) {
            fetchMessages();
        }
    }, [selectedChannel]);

    const fetchMessages = async () => {
        try {
            const response = await axios.get(
                `${config.API_BASE_URL}/channels/${selectedChannel.id}/messages`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            setMessages(response.data);
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const handleSendMessage = async (e) => {
        if (e) {
            e.preventDefault();
        }
        if (!newMessage.trim()) return;

        try {
            const response = await axios.post(
                `${config.API_BASE_URL}/channels/${selectedChannel.id}/messages`,
                { content: newMessage },
                {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            const newMessageData = {
                ...response.data,
                author: response.data.author || { username: 'You' },
                created_at: response.data.created_at || new Date().toISOString()
            };
            
            setMessages([...messages, newMessageData]);
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    };

    const handleCreateChannel = async () => {
        if (!newChannelName.trim()) return;

        try {
            const response = await axios.post(
                `${config.API_BASE_URL}/servers/${serverId}/channels/`,
                {
                    name: newChannelName,
                    type: channelType
                },
                {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            setChannels([...channels, response.data]);
            setNewChannelName('');
            setShowNewChannelInput(false);
        } catch (error) {
            console.error('Error creating channel:', error);
            alert('Failed to create channel. Please try again.');
        }
    };

    const handleMenuClick = (event, item) => {
        setAnchorEl(event.currentTarget);
        setSelectedItem(item);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedItem(null);
    };

    const handleEdit = () => {
        setEditName(selectedItem.name);
        setShowEditDialog(true);
        handleMenuClose();
    };

    const handleDelete = async () => {
        try {
            if (selectedItem.type === 'channel') {
                await axios.delete(
                    `${config.API_BASE_URL}/channels/${selectedItem.id}`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                setChannels(channels.filter(c => c.id !== selectedItem.id));
            }
            handleMenuClose();
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    };

    const handleSaveEdit = async () => {
        try {
            if (selectedItem.type === 'channel') {
                const response = await axios.put(
                    `${config.API_BASE_URL}/channels/${selectedItem.id}`,
                    { name: editName },
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                setChannels(channels.map(c => c.id === selectedItem.id ? response.data : c));
            }
            setShowEditDialog(false);
        } catch (error) {
            console.error('Error updating item:', error);
        }
    };

    const handleViewAuditLogs = async () => {
        try {
            const response = await axios.get(
                `${config.API_BASE_URL}/servers/${serverId}/audit-logs`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            setAuditLogs(response.data);
            setShowAuditLogs(true);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        }
    };

    const handleViewRoles = async () => {
        try {
            const response = await axios.get(
                `${config.API_BASE_URL}/servers/${serverId}/roles`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            setRoles(response.data);
            setShowRoles(true);
        } catch (error) {
            console.error('Error fetching roles:', error);
        }
    };

    const handleCreateRole = async () => {
        try {
            const response = await axios.post(
                `${config.API_BASE_URL}/servers/${serverId}/roles`,
                newRole,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            setRoles([...roles, response.data]);
            setShowNewRoleDialog(false);
            setNewRole({ name: '', color: '#000000', permissions: {} });
        } catch (error) {
            console.error('Error creating role:', error);
        }
    };

    const handleAddReaction = async (messageId, emoji) => {
        try {
            await axios.post(
                `${config.API_BASE_URL}/messages/${messageId}/reactions/${emoji}`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            fetchMessages();
        } catch (error) {
            console.error('Error adding reaction:', error);
        }
    };

    const handleMediaUpload = async (event) => {
        const files = Array.from(event.target.files);
        const formData = new FormData();
        
        for (const file of files) {
            formData.append('file', file);
            try {
                const response = await fetch(`/api/channels/${selectedChannel}/media/`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (response.ok) {
                    const media = await response.json();
                    setMediaFiles(prev => [...prev, media]);
                }
            } catch (error) {
                console.error('Error uploading media:', error);
            }
        }
    };

    const handleCreateGame = async (gameType) => {
        try {
            const response = await fetch(`/api/channels/${selectedChannel}/games/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ game_type: gameType })
            });
            if (response.ok) {
                const game = await response.json();
                setCurrentGame(game);
                setShowGameDialog(false);
            }
        } catch (error) {
            console.error('Error creating game:', error);
        }
    };

    const handleJoinGame = async (gameId) => {
        try {
            const response = await fetch(`/api/games/${gameId}/players/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (response.ok) {
                const player = await response.json();
                setCurrentGame(prev => ({
                    ...prev,
                    players: [...prev.players, player]
                }));
            }
        } catch (error) {
            console.error('Error joining game:', error);
        }
    };

    const handleAddToMusicQueue = async (musicUrl) => {
        try {
            const response = await fetch(`/api/channels/${selectedChannel}/music/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    url: musicUrl,
                    title: 'Music Title', // В реальном приложении нужно получать метаданные
                    artist: 'Artist',
                    duration: 180 // В реальном приложении нужно получать длительность
                })
            });
            if (response.ok) {
                const music = await response.json();
                setMusicQueue(prev => [...prev, music]);
            }
        } catch (error) {
            console.error('Error adding to music queue:', error);
        }
    };

    const handlePlayMusic = async (musicId) => {
        try {
            const response = await fetch(`/api/music/${musicId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ status: 'playing' })
            });
            if (response.ok) {
                const music = await response.json();
                setCurrentMusic(music);
                setIsPlaying(true);
            }
        } catch (error) {
            console.error('Error playing music:', error);
        }
    };

    const handlePauseMusic = async () => {
        if (currentMusic) {
            try {
                const response = await fetch(`/api/music/${currentMusic.id}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ status: 'paused' })
                });
                if (response.ok) {
                    setIsPlaying(false);
                }
            } catch (error) {
                console.error('Error pausing music:', error);
            }
        }
    };

    const generateInviteLink = async () => {
        try {
            const response = await axios.post(
                `${config.API_BASE_URL}/servers/${serverId}/invite`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            const inviteCode = response.data.code;
            const inviteUrl = `${window.location.origin}/join/${inviteCode}`;
            setInviteLink(inviteUrl);
            
            // Copy to clipboard
            await navigator.clipboard.writeText(inviteUrl);
            setShowInviteCopied(true);
            setTimeout(() => setShowInviteCopied(false), 2000);
        } catch (error) {
            console.error('Error generating invite link:', error);
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Server Header */}
            <Box sx={{ 
                p: 2, 
                borderBottom: 1, 
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <Typography variant="h6">{server?.name}</Typography>
                <Tooltip title={showInviteCopied ? "Copied!" : "Copy Invite Link"}>
                    <IconButton onClick={generateInviteLink}>
                        <ContentCopyIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Боковая панель с каналами */}
            <Drawer
                variant="permanent"
                sx={{
                    width: 240,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 240,
                        boxSizing: 'border-box',
                        backgroundColor: '#2f3136',
                        color: 'white'
                    }
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ color: 'white' }}>
                        {server?.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <Tooltip title="Настройки сервера">
                            <IconButton size="small" onClick={() => navigate(`/servers/${serverId}/settings`)}>
                                <SettingsIcon sx={{ color: 'white' }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Журнал аудита">
                            <IconButton size="small" onClick={handleViewAuditLogs}>
                                <HistoryIcon sx={{ color: 'white' }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Управление ролями">
                            <IconButton size="small" onClick={handleViewRoles}>
                                <SecurityIcon sx={{ color: 'white' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                <Divider sx={{ backgroundColor: '#40444b' }} />
                <List>
                    {channels.map((channel) => (
                        <ListItem
                            key={channel.id}
                            button
                            selected={selectedChannel?.id === channel.id}
                            onClick={() => setSelectedChannel(channel)}
                            sx={{
                                '&.Mui-selected': {
                                    backgroundColor: '#40444b'
                                }
                            }}
                        >
                            <ListItemIcon>
                                {channel.type === 'text' ? (
                                    <ChatIcon sx={{ color: 'white' }} />
                                ) : channel.type === 'voice' ? (
                                    <VolumeUp />
                                ) : (
                                    <CategoryIcon sx={{ color: 'white' }} />
                                )}
                            </ListItemIcon>
                            <ListItemText primary={channel.name} />
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleMenuClick(e, { ...channel, type: 'channel' });
                                }}
                            >
                                <MoreVertIcon sx={{ color: 'white' }} />
                            </IconButton>
                        </ListItem>
                    ))}
                    <ListItem button onClick={() => setShowNewChannelInput(true)}>
                        <ListItemIcon>
                            <AddIcon sx={{ color: 'white' }} />
                        </ListItemIcon>
                        <ListItemText primary="Создать канал" />
                    </ListItem>
                </List>
            </Drawer>

            {/* Основная область с сообщениями */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {selectedChannel ? (
                    <>
                        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant="h6">
                                {selectedChannel.type === 'text' ? '#' : '🔊'} {selectedChannel.name}
                            </Typography>
                        </Box>
                        
                        {selectedChannel.type === 'voice' ? (
                            <VoiceChannel channelId={selectedChannel.id} />
                        ) : (
                            <>
                                <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                                    {messages.map((message) => (
                                        <Box key={message.id} sx={{ mb: 2 }}>
                                            <Grid container spacing={1}>
                                                <Grid item>
                                                    <Avatar>
                                                        {message.author?.username?.[0] || '?'}
                                                    </Avatar>
                                                </Grid>
                                                <Grid item xs>
                                                    <Box>
                                                        <Typography variant="subtitle2" component="span">
                                                            {message.author?.username || 'Unknown User'}
                                                        </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            sx={{ ml: 1 }}
                                                        >
                                                            {new Date(message.created_at).toLocaleString()}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body1">{message.content}</Typography>
                                                    {message.attachments?.length > 0 && (
                                                        <Box sx={{ mt: 1 }}>
                                                            {message.attachments.map((attachment, index) => (
                                                                <Paper
                                                                    key={index}
                                                                    sx={{
                                                                        p: 1,
                                                                        mt: 1,
                                                                        backgroundColor: '#2f3136',
                                                                        color: 'white'
                                                                    }}
                                                                >
                                                                    <Typography variant="body2">
                                                                        {attachment.name}
                                                                    </Typography>
                                                                </Paper>
                                                            ))}
                                                        </Box>
                                                    )}
                                                    <Box sx={{ mt: 1 }}>
                                                        {message.reactions?.map((reaction, index) => (
                                                            <Chip
                                                                key={index}
                                                                label={reaction.emoji}
                                                                size="small"
                                                                onClick={() => handleAddReaction(message.id, reaction.emoji)}
                                                                sx={{ mr: 0.5 }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Grid>
                                            </Grid>
                                        </Box>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </Box>
                                
                                <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                                    <Grid container spacing={2}>
                                        <Grid item>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*,video/*,audio/*"
                                                style={{ display: 'none' }}
                                                id="media-upload"
                                                onChange={handleMediaUpload}
                                            />
                                            <label htmlFor="media-upload">
                                                <IconButton component="span">
                                                    <Image />
                                                </IconButton>
                                            </label>
                                        </Grid>
                                        <Grid item>
                                            <IconButton onClick={() => setShowGameDialog(true)}>
                                                <Games />
                                            </IconButton>
                                        </Grid>
                                        <Grid item>
                                            <IconButton onClick={() => setShowMusicPlayer(true)}>
                                                <MusicNote />
                                            </IconButton>
                                        </Grid>
                                        <Grid item xs>
                                            <TextField
                                                fullWidth
                                                variant="outlined"
                                                placeholder="Type a message..."
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage();
                                                    }
                                                }}
                                            />
                                        </Grid>
                                    </Grid>
                                </Box>
                            </>
                        )}
                    </>
                ) : (
                    <Box sx={{ p: 2 }}>
                        <Typography>Выберите канал</Typography>
                    </Box>
                )}
            </Box>

            {/* Диалог создания нового канала */}
            <Dialog open={showNewChannelInput} onClose={() => setShowNewChannelInput(false)}>
                <DialogTitle>Создать новый канал</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Название канала"
                        fullWidth
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                    />
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2">Тип канала</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                            <Button
                                variant={channelType === 'text' ? 'contained' : 'outlined'}
                                onClick={() => setChannelType('text')}
                            >
                                Текстовый
                            </Button>
                            <Button
                                variant={channelType === 'voice' ? 'contained' : 'outlined'}
                                onClick={() => setChannelType('voice')}
                            >
                                Голосовой
                            </Button>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowNewChannelInput(false)}>Отмена</Button>
                    <Button onClick={handleCreateChannel} variant="contained">
                        Создать
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Меню действий */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
            >
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Редактировать</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Удалить</ListItemText>
                </MenuItem>
            </Menu>

            {/* Диалог редактирования */}
            <Dialog open={showEditDialog} onClose={() => setShowEditDialog(false)}>
                <DialogTitle>Редактировать</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Название"
                        fullWidth
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowEditDialog(false)}>Отмена</Button>
                    <Button onClick={handleSaveEdit} variant="contained">
                        Сохранить
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Диалог журнала аудита */}
            <Dialog
                open={showAuditLogs}
                onClose={() => setShowAuditLogs(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Журнал аудита</DialogTitle>
                <DialogContent>
                    <List>
                        {auditLogs.map((log) => (
                            <ListItem key={log.id}>
                                <ListItemText
                                    primary={`${log.action} - ${log.target_type}`}
                                    secondary={
                                        <>
                                            <Typography component="span" variant="body2">
                                                {new Date(log.created_at).toLocaleString()}
                                            </Typography>
                                            <br />
                                            <Typography component="span" variant="body2">
                                                Изменения: {JSON.stringify(log.changes)}
                                            </Typography>
                                        </>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowAuditLogs(false)}>Закрыть</Button>
                </DialogActions>
            </Dialog>

            {/* Диалог управления ролями */}
            <Dialog
                open={showRoles}
                onClose={() => setShowRoles(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Управление ролями</DialogTitle>
                <DialogContent>
                    <Box sx={{ mb: 2 }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setShowNewRoleDialog(true)}
                        >
                            Создать роль
                        </Button>
                    </Box>
                    <List>
                        {roles.map((role) => (
                            <ListItem key={role.id}>
                                <ListItemText
                                    primary={role.name}
                                    secondary={
                                        <>
                                            <Typography component="span" variant="body2">
                                                Цвет: {role.color}
                                            </Typography>
                                            <br />
                                            <Typography component="span" variant="body2">
                                                Права: {JSON.stringify(role.permissions)}
                                            </Typography>
                                        </>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowRoles(false)}>Закрыть</Button>
                </DialogActions>
            </Dialog>

            {/* Диалог создания новой роли */}
            <Dialog open={showNewRoleDialog} onClose={() => setShowNewRoleDialog(false)}>
                <DialogTitle>Создать новую роль</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Название роли"
                        fullWidth
                        value={newRole.name}
                        onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    />
                    <TextField
                        margin="dense"
                        label="Цвет"
                        type="color"
                        fullWidth
                        value={newRole.color}
                        onChange={(e) => setNewRole({ ...newRole, color: e.target.value })}
                    />
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2">Права</Typography>
                        {/* Здесь можно добавить чекбоксы для различных прав */}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowNewRoleDialog(false)}>Отмена</Button>
                    <Button onClick={handleCreateRole} variant="contained">
                        Создать
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Game Dialog */}
            <Dialog open={showGameDialog} onClose={() => setShowGameDialog(false)}>
                <DialogTitle>Select Game</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem button onClick={() => handleCreateGame('CHESS')}>
                            <ListItemText primary="Chess" />
                        </ListItem>
                        <ListItem button onClick={() => handleCreateGame('TIC_TAC_TOE')}>
                            <ListItemText primary="Tic Tac Toe" />
                        </ListItem>
                        <ListItem button onClick={() => handleCreateGame('HANGMAN')}>
                            <ListItemText primary="Hangman" />
                        </ListItem>
                        <ListItem button onClick={() => handleCreateGame('QUIZ')}>
                            <ListItemText primary="Quiz" />
                        </ListItem>
                    </List>
                </DialogContent>
            </Dialog>

            {/* Music Player */}
            <Dialog 
                open={showMusicPlayer} 
                onClose={() => setShowMusicPlayer(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Music Player</DialogTitle>
                <DialogContent>
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="h6">
                            {currentMusic ? currentMusic.title : 'No music playing'}
                        </Typography>
                        <Typography variant="subtitle1">
                            {currentMusic ? currentMusic.artist : ''}
                        </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <IconButton>
                            <SkipPrevious />
                        </IconButton>
                        <IconButton onClick={isPlaying ? handlePauseMusic : () => handlePlayMusic(currentMusic?.id)}>
                            {isPlaying ? <Pause /> : <PlayArrow />}
                        </IconButton>
                        <IconButton>
                            <SkipNext />
                        </IconButton>
                        <Box sx={{ ml: 2, display: 'flex', alignItems: 'center' }}>
                            <VolumeUp />
                            <Slider
                                value={volume}
                                onChange={(e, newValue) => setVolume(newValue)}
                                sx={{ width: 100, ml: 1 }}
                            />
                        </Box>
                    </Box>

                    <Typography variant="h6" sx={{ mb: 1 }}>Queue</Typography>
                    <List>
                        {musicQueue.map((music) => (
                            <ListItem key={music.id}>
                                <ListItemText
                                    primary={music.title}
                                    secondary={music.artist}
                                />
                                <IconButton onClick={() => handlePlayMusic(music.id)}>
                                    <PlayArrow />
                                </IconButton>
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default ServerView; 