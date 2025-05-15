import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Button,
    Typography,
    IconButton,
    Paper,
    Avatar,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Slider,
    Tooltip,
    Badge,
    Divider,
    Alert
} from '@mui/material';
import {
    Mic as MicIcon,
    MicOff as MicOffIcon,
    VolumeUp as VolumeUpIcon,
    VolumeOff as VolumeOffIcon,
    Headset as HeadsetIcon,
    HeadsetOff as HeadsetOffIcon,
    Settings as SettingsIcon,
    ScreenShare as ScreenShareIcon,
    Videocam as VideoIcon,
    VideocamOff as VideoOffIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import config from '../config';
import axios from 'axios';

const VoiceChannel = ({ channelId }) => {
    const { token, setToken } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [volume, setVolume] = useState(100);
    const [showSettings, setShowSettings] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected'
    const [error, setError] = useState('');
    const [isEchoMode, setIsEchoMode] = useState(false);
    
    // Add new state variables for audio handling
    const [audioStream, setAudioStream] = useState(null);
    const [audioContext, setAudioContext] = useState(null);
    const [audioProcessor, setAudioProcessor] = useState(null);
    
    const wsRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const audioContextRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const videoStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const videoContainerRef = useRef(null);
    const localVideoRef = useRef(null);

    // Initialize participants list
    useEffect(() => {
        setParticipants([]);
    }, [channelId]);

    useEffect(() => {
        connect();
        return () => {
            disconnect();
        };
    }, [channelId, token]); // Add token as dependency

    const connect = async () => {
        try {
            setConnectionStatus('connecting');
            setError('');

            // Try to refresh token before connecting
            try {
                const response = await axios.post('/token/refresh', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.ok) {
                    const newToken = response.data.access_token;
                    localStorage.setItem('token', newToken);
                    setToken(newToken);
                    console.log('Token refreshed successfully');
                }
            } catch (error) {
                console.error('Error refreshing token:', error);
                setError('Authentication failed. Please log in again.');
                return;
            }

            // Get the WebSocket protocol based on the current protocol
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${config.SERVER_IP}:${config.SERVER_PORT}/ws/voice/${channelId}?token=${encodeURIComponent(token)}`;
            
            console.log('Connecting to WebSocket:', wsUrl);
            
            // Close existing connection if any
            if (wsRef.current) {
                wsRef.current.close();
            }
            
            wsRef.current = new WebSocket(wsUrl);

            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) {
                    console.error('WebSocket connection timeout');
                    setError('Connection timeout. Please try again.');
                    wsRef.current?.close();
                }
            }, 5000);

            // Set up ping interval to keep connection alive
            const pingInterval = setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    try {
                        wsRef.current.send(JSON.stringify({ type: 'ping' }));
                        console.log('Sent ping message');
                    } catch (error) {
                        console.error('Error sending ping:', error);
                    }
                }
            }, 15000);

            // Set up connection health check
            const healthCheckInterval = setInterval(() => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) {
                    console.log('Connection health check failed, attempting to reconnect...');
                    reconnect();
                }
            }, 30000);

            wsRef.current.onopen = async () => {
                console.log('WebSocket connected successfully');
                clearTimeout(connectionTimeout);
                setConnectionStatus('connected');
                setIsConnected(true);
                
                // Send join message to server
                try {
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: 'join'
                        }));
                        console.log('Sent join message');
                        
                        // Start audio stream after successful connection
                        await startAudioStream();
                    }
                } catch (error) {
                    console.error('Error sending join message:', error);
                    setError('Failed to join voice channel. Please try again.');
                    disconnect();
                }
            };

            wsRef.current.onclose = async (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                clearTimeout(connectionTimeout);
                clearInterval(pingInterval);
                clearInterval(healthCheckInterval);
                setConnectionStatus('disconnected');
                setIsConnected(false);
                stopAudioStream();
                stopVideoStream();
                stopScreenShare();
                
                // Handle specific error codes
                switch (event.code) {
                    case 4000:
                        setError('Authentication failed. Please log in again.');
                        break;
                    case 4001:
                        setError('Invalid voice channel.');
                        break;
                    case 4002:
                        setError('You are not a member of this server.');
                        break;
                    case 4003:
                        setError('User not found. Please log in again.');
                        break;
                    case 1006:
                        setError('Connection lost. Attempting to reconnect...');
                        reconnect();
                        break;
                    default:
                        setError(`Connection closed: ${event.reason || 'Unknown error'}`);
                        // Try to reconnect if the connection was lost
                        if (event.code !== 1000) {
                            reconnect();
                        }
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Don't clear intervals or disconnect on error
                // Let the onclose handler handle the cleanup
            };

            wsRef.current.onmessage = async (event) => {
                if (event.data instanceof Blob) {
                    try {
                        console.log('Received audio data blob, size:', event.data.size);
                        await playAudio(event.data);
                    } catch (error) {
                        console.error('Error processing audio data:', error);
                    }
                } else {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('Received WebSocket message:', data);
                        
                        if (data.type === 'token_refresh') {
                            // Update token in localStorage and component
                            localStorage.setItem('token', data.token);
                            setToken(data.token);
                            console.log('Token refreshed successfully');
                            return;
                        }
                        
                        if (data.type === 'ping') {
                            try {
                                wsRef.current.send(JSON.stringify({ type: 'pong' }));
                                console.log('Sent pong response');
                            } catch (error) {
                                console.error('Error sending pong:', error);
                            }
                            return;
                        }
                        
                        handleWebSocketMessage(data);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                }
            };
        } catch (error) {
            console.error('Error connecting to voice channel:', error);
            setError('Failed to connect to voice channel. Please try again later.');
            setConnectionStatus('disconnected');
        }
    };

    const handleWebSocketMessage = (data) => {
        console.log('Handling WebSocket message:', data);
        switch (data.type) {
            case 'participants':
                if (Array.isArray(data.participants)) {
                    setParticipants(data.participants);
                    setIsEchoMode(data.isEchoMode);
                }
                break;
            case 'participant_joined':
                if (data.participant) {
                    setParticipants(prev => [...prev, data.participant]);
                    setIsEchoMode(data.isEchoMode);
                }
                break;
            case 'participant_left':
                if (data.userId) {
                    setParticipants(prev => prev.filter(p => p.id !== data.userId));
                    setIsEchoMode(data.isEchoMode);
                }
                break;
            case 'audio':
                if (!isDeafened && data.data) {
                    playAudio(data.data);
                }
                break;
            case 'echo':
                // Handle echo message
                if (data.original_message && data.original_message.type === 'audio') {
                    console.log('Received echo audio data');
                    if (!isDeafened && data.original_message.data) {
                        playAudio(data.original_message.data);
                    }
                }
                break;
            case 'connection_status':
                console.log('Connection status:', data.status);
                if (data.status === 'connected') {
                    setConnectionStatus('connected');
                    setIsConnected(true);
                }
                break;
            case 'pong':
                console.log('Received pong response');
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    };

    const reconnect = () => {
        console.log('Attempting to reconnect...');
        setTimeout(() => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) {
                connect();
            }
        }, 3000);
    };

    const disconnect = () => {
        if (wsRef.current) {
            // Send leave message before closing
            if (wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    wsRef.current.send(JSON.stringify({
                        type: 'leave'
                    }));
                } catch (error) {
                    console.error('Error sending leave message:', error);
                }
            }
            wsRef.current.close();
            wsRef.current = null;
        }
        stopAudioStream();
        stopVideoStream();
        stopScreenShare();
        setIsConnected(false);
    };

    const startAudioStream = async () => {
        try {
            console.log('Starting audio stream...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 2,
                    latency: 0
                }
            });
            console.log('Got media stream:', stream.getAudioTracks()[0].label);

            mediaStreamRef.current = stream;
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000,
                latencyHint: 'interactive'
            });
            audioContextRef.current = audioContext;
            
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(1024, 1, 2);
            setAudioProcessor(processor);

            // Минимальная цепочка обработки звука
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;

            // Подключаем цепочку
            source.connect(gainNode);
            gainNode.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                if (!isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // Конвертируем в Int16Array
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32767)));
                    }
                    
                    // Отправляем данные
                    const buffer = new ArrayBuffer(pcmData.length * 2);
                    const view = new DataView(buffer);
                    for (let i = 0; i < pcmData.length; i++) {
                        view.setInt16(i * 2, pcmData[i], true);
                    }
                    
                    const base64Data = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
                    
                    try {
                        wsRef.current.send(JSON.stringify({
                            type: 'audio',
                            data: base64Data,
                            timestamp: Date.now()
                        }));
                    } catch (error) {
                        console.error('Error sending audio data:', error);
                    }
                }
            };

            setAudioStream(stream);
            setAudioContext(audioContext);
        } catch (error) {
            console.error('Error starting audio stream:', error);
            setError('Failed to access microphone. Please make sure you have granted microphone permissions.');
        }
    };

    const stopAudioStream = () => {
        if (audioProcessor) {
            audioProcessor.disconnect();
            setAudioProcessor(null);
        }
        if (audioContext) {
            audioContext.close();
            setAudioContext(null);
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
    };

    const startVideoStream = async () => {
        try {
            // Request both video and audio to ensure we have the right permissions
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: true 
            });
            
            console.log('Video stream started:', stream.getVideoTracks()[0].label);
            videoStreamRef.current = stream;
            setIsVideoEnabled(true);
            
            // Send video stream to other participants
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'video_start',
                    userId: localStorage.getItem('userId')
                }));
            }

            // Set the stream to the video element
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            setError('Failed to access camera. Please make sure you have granted camera permissions.');
            setIsVideoEnabled(false);
        }
    };

    const stopVideoStream = () => {
        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(track => track.stop());
            videoStreamRef.current = null;
            setIsVideoEnabled(false);
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'video_stop',
                    userId: localStorage.getItem('userId')
                }));
            }

            // Clear the video stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }
        }
    };

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            screenStreamRef.current = stream;
            setIsScreenSharing(true);
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'screen_share_start',
                    userId: localStorage.getItem('userId')
                }));
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
        }
    };

    const stopScreenShare = () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
            setIsScreenSharing(false);
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'screen_share_stop',
                    userId: localStorage.getItem('userId')
                }));
            }
        }
    };

    const playAudio = async (audioData) => {
        try {
            // Конвертируем base64 обратно в Int16Array
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const int16Data = new Int16Array(bytes.buffer);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32767.0;
            }
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000,
                latencyHint: 'interactive'
            });
            
            const audioBuffer = audioContext.createBuffer(1, float32Data.length, 16000);
            audioBuffer.getChannelData(0).set(float32Data);
            
            // Минимальная цепочка воспроизведения
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            gainNode.gain.value = volume / 100;
            
            // Подключаем цепочку
            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
                audioContext.close();
            };
            
            source.start(0);
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    };

    const sendWebSocketMessage = (message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
            } catch (error) {
                console.error('Error sending WebSocket message:', error);
            }
        } else {
            console.warn('WebSocket is not in OPEN state. Current state:', wsRef.current?.readyState);
        }
    };

    const toggleMute = () => {
        if (mediaStreamRef.current) {
            const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!isMuted);
            sendWebSocketMessage({
                type: 'mute_state',
                isMuted: !audioTrack.enabled
            });
        }
    };

    const toggleDeafen = () => {
        setIsDeafened(!isDeafened);
        if (audioContextRef.current) {
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = isDeafened ? volume / 100 : 0;
        }
        sendWebSocketMessage({
            type: 'deafen_state',
            isDeafened: !isDeafened
        });
    };

    const toggleVideo = () => {
        if (isVideoEnabled) {
            stopVideoStream();
        } else {
            startVideoStream();
        }
        sendWebSocketMessage({
            type: 'video_state',
            isEnabled: !isVideoEnabled
        });
    };

    const toggleScreenShare = () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
        sendWebSocketMessage({
            type: 'screen_share_state',
            isEnabled: !isScreenSharing
        });
    };

    const handleVolumeChange = (event, newValue) => {
        setVolume(newValue);
        if (audioContextRef.current && !isDeafened) {
            audioContextRef.current.destination.volume = newValue / 100;
        }
    };

    return (
        <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            height: '100%',
            bgcolor: 'background.paper'
        }}>
            {/* Connection Status */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}
            
            {connectionStatus === 'connecting' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Connecting to voice channel...
                </Alert>
            )}

            {isEchoMode && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Echo Mode Active - You are the only participant in this voice channel
                </Alert>
            )}

            {/* Video Container */}
            <Box 
                ref={videoContainerRef}
                sx={{ 
                    p: 2, 
                    display: 'flex', 
                    justifyContent: 'center',
                    bgcolor: 'background.default'
                }}
            >
                {isVideoEnabled ? (
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{
                            width: '100%',
                            maxHeight: '200px',
                            objectFit: 'cover',
                            borderRadius: '8px'
                        }}
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Camera is disabled
                    </Typography>
                )}
            </Box>

            {/* Participants List */}
            <List sx={{ flex: 1, overflow: 'auto' }}>
                {Array.isArray(participants) && participants.map((participant) => (
                    <ListItem key={participant.id}>
                        <ListItemAvatar>
                            <Badge
                                overlap="circular"
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                badgeContent={
                                    <Box sx={{ 
                                        width: 12, 
                                        height: 12, 
                                        borderRadius: '50%',
                                        bgcolor: participant.isMuted ? 'error.main' : 'success.main',
                                        border: '2px solid',
                                        borderColor: 'background.paper'
                                    }} />
                                }
                            >
                                <Avatar>{participant.username?.[0] || '?'}</Avatar>
                            </Badge>
                        </ListItemAvatar>
                        <ListItemText 
                            primary={participant.username || 'Unknown User'}
                            secondary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {participant.isMuted && <MicOffIcon fontSize="small" />}
                                    {participant.isDeafened && <HeadsetOffIcon fontSize="small" />}
                                    {participant.isVideoEnabled && <VideoIcon fontSize="small" />}
                                    {participant.isScreenSharing && <ScreenShareIcon fontSize="small" />}
                                </Box>
                            }
                        />
                    </ListItem>
                ))}
            </List>

            {/* Controls */}
            <Box sx={{ 
                p: 2, 
                borderTop: 1, 
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title={isMuted ? "Unmute" : "Mute"}>
                        <IconButton onClick={toggleMute} color={isMuted ? "error" : "default"}>
                            {isMuted ? <MicOffIcon /> : <MicIcon />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={isDeafened ? "Undeafen" : "Deafen"}>
                        <IconButton onClick={toggleDeafen} color={isDeafened ? "error" : "default"}>
                            {isDeafened ? <HeadsetOffIcon /> : <HeadsetIcon />}
                        </IconButton>
                    </Tooltip>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title={isVideoEnabled ? "Disable Video" : "Enable Video"}>
                        <IconButton onClick={toggleVideo} color={isVideoEnabled ? "primary" : "default"}>
                            {isVideoEnabled ? <VideoIcon /> : <VideoOffIcon />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
                        <IconButton onClick={toggleScreenShare} color={isScreenSharing ? "primary" : "default"}>
                            <ScreenShareIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                    <VolumeUpIcon />
                    <Slider
                        value={volume}
                        onChange={handleVolumeChange}
                        aria-labelledby="volume-slider"
                        min={0}
                        max={100}
                    />
                </Box>
            </Box>
        </Box>
    );
};

export default VoiceChannel; 