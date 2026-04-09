'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, Search, MessageSquare, Phone, PhoneOff, Info, X } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { MediasoupClient } from '../lib/mediasoup';
import { CallInterface, CallStatus } from './CallInterface';

interface User {
    _id: string;
    email: string;
}

interface Group {
    _id: string;
    name: string;
    members: (string | User)[];
    createdBy: string;
}

interface Message {
    _id?: string;
    sender: string | any;
    receiver?: string;
    groupId?: string;
    text: string;
    timestamp: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface ChatProps {
    initialMeetingId?: string;
    onLeave?: () => void;
    mode?: 'chat' | 'meeting';
}

export function Chat({ initialMeetingId, onLeave, mode = 'chat' }: ChatProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const selectedUserRef = useRef<User | null>(null);
    const selectedGroupRef = useRef<Group | null>(null);

    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);

    useEffect(() => {
        selectedGroupRef.current = selectedGroup;
    }, [selectedGroup]);

    const [activeTab, setActiveTab] = useState<'people' | 'groups'>('people');
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerEmail: string } | null>(null);
    const [incomingGroupCall, setIncomingGroupCall] = useState<{ callerId: string, callerEmail: string, groupId: string, groupName: string } | null>(null);
    const [callStatus, setCallStatus] = useState<CallStatus | 'idle'>('idle');
    const [callRemoteEmail, setCallRemoteEmail] = useState('');
    const [callRemoteSocketId, setCallRemoteSocketId] = useState<string | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<{ socketId: string, email: string, stream: MediaStream }[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isVideoOff, setIsVideoOff] = useState(true);
    const [callParticipants, setCallParticipants] = useState<{ socketId: string, email: string }[]>([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [showGroupDetails, setShowGroupDetails] = useState(false);
    const [activePrivateSession, setActivePrivateSession] = useState<{ socketId: string, email: string } | null>(null);
    const [pendingPrivateRequest, setPendingPrivateRequest] = useState<{ requesterSocketId: string, requesterEmail: string } | null>(null);
    const [privateSendTransport, setPrivateSendTransport] = useState<any>(null);
    const [privateRecvTransport, setPrivateRecvTransport] = useState<any>(null);
    const privateSendTransportRef = useRef<any>(null);
    const privateRecvTransportRef = useRef<any>(null);
    const [remotePrivateStream, setRemotePrivateStream] = useState<MediaStream | null>(null);
    const privateAudioStreamRef = useRef<MediaStream | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const msClientRef = useRef<MediasoupClient | null>(null);
    const recvTransportRef = useRef<any>(null);
    const sendTransportRef = useRef<any>(null);
    const videoProducerRef = useRef<any>(null);
    const audioProducerRef = useRef<any>(null);
    const sfuReadyRef = useRef<boolean>(false);
    const creatingRecvTransportRef = useRef<Promise<any> | null>(null);

    const getOrCreateRecvTransport = async (client: MediasoupClient) => {
        if (recvTransportRef.current) return recvTransportRef.current;
        if (creatingRecvTransportRef.current) return await creatingRecvTransportRef.current;

        creatingRecvTransportRef.current = client.createRecvTransport();
        const transport = await creatingRecvTransportRef.current;
        recvTransportRef.current = transport;
        creatingRecvTransportRef.current = null;
        return transport;
    };

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            setCurrentUser({ id: user.id || user._id, email: user.email });
        }

        const token = localStorage.getItem('token');
        socketRef.current = io(BACKEND_URL, {
            auth: { token }
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to socket server');
            if (currentUser) {
                 socketRef.current?.emit('join', { userId: currentUser.id, email: currentUser.email });
            }
        });

        socketRef.current.on('receive_message', (data: Message) => {
            const currentSelectedUser = selectedUserRef.current;
            const currentSelectedGroup = selectedGroupRef.current;
            if (currentSelectedUser && (data.sender === currentSelectedUser._id || (typeof data.sender === 'object' && data.sender._id === currentSelectedUser._id)) && !data.groupId) {
                setMessages(prev => [...prev, data]);
            } else if (currentSelectedGroup && data.groupId === currentSelectedGroup._id) {
                setMessages(prev => [...prev, data]);
            }
        });

        socketRef.current.on('incoming_call', (data) => {
            setIncomingCall({ callerId: data.callerId, callerEmail: data.callerEmail });
            setCallStatus('ringing');
            setCallRemoteEmail(data.callerEmail);
        });

        socketRef.current.on('incoming_group_call', (data) => {
            setIncomingGroupCall(data);
            setCallStatus('ringing');
            setCallRemoteEmail(data.groupName || data.groupId);
        });

        socketRef.current.on('call_accepted', (data) => {
            setCallStatus('connected');
            setCallRemoteSocketId(data.receiverSocketId);
            startSfuSession(data.roomId);
        });

        socketRef.current.on('producer_closed', (data) => {
            if (!msClientRef.current) return;
            setRemoteStreams(prev => {
                return prev.map(s => {
                    if (s.socketId === data.socketId) {
                        const tracks = s.stream.getTracks().filter(t => t.kind !== data.kind);
                        return { ...s, stream: new MediaStream(tracks) };
                    }
                    return s;
                });
            });
        });

        socketRef.current.on('participant_joined', (data) => {
            setCallParticipants(prev => {
                if (!prev.find(p => p.socketId === data.socketId)) {
                    return [...prev, { socketId: data.socketId, email: data.email }];
                }
                return prev;
            });
        });

        socketRef.current.on('call_ended', () => {
            handleEndCall();
        });

        socketRef.current.on('new_producer', async (data) => {
            // Check msClientRef to ensure we are in a call, bypassing stale React closure
            if (msClientRef.current) {
                // Wait for SFU init if concurrent (avoids Device Not Initialized drops)
                let waitStats = 0;
                while (!sfuReadyRef.current && waitStats < 50) {
                    await new Promise(r => setTimeout(r, 100));
                    waitStats++;
                }
                if (!sfuReadyRef.current) return;

                setCallParticipants(prev => {
                    if (!prev.find(p => p.socketId === data.socketId)) {
                        return [...prev, { socketId: data.socketId, email: data.email }];
                    }
                    return prev;
                });
                const recvTransport = await getOrCreateRecvTransport(msClientRef.current!);
                try {
                    const consumer = await msClientRef.current!.consume(recvTransport, data.producerId);
                    const handleClose = () => {
                        setRemoteStreams(prev => {
                            const existing = prev.find(s => s.socketId === data.socketId);
                            if (!existing) return prev;
                            existing.stream.removeTrack(consumer.track);
                            const rem = existing.stream.getTracks();
                            if (rem.length === 0) return prev.filter(s => s.socketId !== data.socketId);
                            return prev.map(s => s.socketId === data.socketId ? { ...s, stream: new MediaStream(rem) } : s);
                        });
                        consumer.close();
                    };
                    consumer.on('producerclose', handleClose);
                    consumer.on('transportclose', handleClose);
                    setRemoteStreams(prev => {
                        const existing = prev.find(s => s.socketId === data.socketId);
                        if (existing) {
                            const hasTrack = existing.stream.getTracks().find(t => t.id === consumer.track.id);
                            if (!hasTrack) return prev.map(s => s.socketId === data.socketId ? { ...s, stream: new MediaStream([...existing.stream.getTracks(), consumer.track]) } : s);
                            return prev;
                        }
                        return [...prev, { socketId: data.socketId, email: data.email, stream: new MediaStream([consumer.track]) }];
                    });
                } catch (e) { console.error(e); }
            }
        });

        socketRef.current.on('participant_left', (data) => {
            if (!msClientRef.current) return;
            setRemoteStreams(prev => prev.filter(s => s.socketId !== data.socketId));
            setCallParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
        });

        socketRef.current.on('participants_update', (data) => {
            setCallParticipants(data.participants);
        });

        if (initialMeetingId) {
            setCallStatus('connected');
            startSfuSession(initialMeetingId);
        }

        return () => {
            socketRef.current?.disconnect();
            if (msClientRef.current) msClientRef.current.close();
        };
    }, []);

    useEffect(() => {
        if (currentUser && socketRef.current) {
            socketRef.current.emit('join', { userId: currentUser.id, email: currentUser.email });
        }
    }, [currentUser]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (currentUser) {
                try {
                    let url = '';
                    if (selectedUser) {
                        url = `${BACKEND_URL}/api/chat/messages/${currentUser.id}/${selectedUser._id}`;
                    } else if (selectedGroup) {
                        url = `${BACKEND_URL}/api/groups/${selectedGroup._id}/messages`;
                    } else return;
                    const res = await fetch(url);
                    const data = await res.json();
                    setMessages(data);
                } catch (e) { console.error(e); }
            }
        };
        fetchMessages();
    }, [selectedUser, selectedGroup, currentUser]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const uRes = await fetch(`${BACKEND_URL}/api/auth/users`);
                const uData = await uRes.json();
                setUsers(uData);
                if (currentUser) {
                    const gRes = await fetch(`${BACKEND_URL}/api/groups/user/${currentUser.id}`);
                    const gData = await gRes.json();
                    setGroups(gData);
                }
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, [currentUser]);

    const startSfuSession = async (roomId: string) => {
        if (!socketRef.current) return;
        
        // Clear previous state refs to prevent polluted states across multiple calls
        recvTransportRef.current = null;
        sendTransportRef.current = null;
        videoProducerRef.current = null;
        audioProducerRef.current = null;
        creatingRecvTransportRef.current = null;

        // Force the socket to join the room on the backend so it receives signaling broadcasts
        socketRef.current.emit('join_group', roomId);

        msClientRef.current = new MediasoupClient(socketRef.current, roomId);
        sfuReadyRef.current = false;
        const initialized = await msClientRef.current.init();
        if (initialized) {
            sfuReadyRef.current = true;
            try {
                const sendTransport = await msClientRef.current.createSendTransport();
                sendTransportRef.current = sendTransport;
                const stream = new MediaStream();
                setLocalStream(stream);
                if (!isVideoOff) {
                    try {
                        const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        stream.addTrack(vStream.getVideoTracks()[0]);
                        videoProducerRef.current = await msClientRef.current.produceVideo(sendTransport, vStream);
                    } catch (e) { console.error(e); setIsVideoOff(true); }
                }
                if (!isMuted) {
                    try {
                        const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        stream.addTrack(aStream.getAudioTracks()[0]);
                        audioProducerRef.current = await msClientRef.current.produceAudio(sendTransport, aStream);
                    } catch (e) { console.error(e); setIsMuted(true); }
                }
                socketRef.current.emit('get_call_participants', { roomId }, (res: any) => {
                    setCallParticipants(res || []);
                });
                const producers = await msClientRef.current.getProducers();
                const recvTransport = await getOrCreateRecvTransport(msClientRef.current);
                for (const p of producers) {
                    if (p.socketId === socketRef.current.id) continue;
                    try {
                        const consumer = await msClientRef.current.consume(recvTransport, p.producerId);
                        const handleClose = () => {
                            setRemoteStreams(prev => {
                                const ex = prev.find(s => s.socketId === p.socketId);
                                if (!ex) return prev;
                                ex.stream.removeTrack(consumer.track);
                                const rem = ex.stream.getTracks();
                                if (rem.length === 0) return prev.filter(s => s.socketId !== p.socketId);
                                return prev.map(s => s.socketId === p.socketId ? { ...s, stream: new MediaStream(rem) } : s);
                            });
                            consumer.close();
                        };
                        consumer.on('producerclose', handleClose);
                        consumer.on('transportclose', handleClose);
                        setRemoteStreams(prev => {
                            const ex = prev.find(s => s.socketId === p.socketId);
                            if (ex) return prev.map(s => s.socketId === p.socketId ? { ...s, stream: new MediaStream([...ex.stream.getTracks(), consumer.track]) } : s);
                            return [...prev, { socketId: p.socketId, email: p.email, stream: new MediaStream([consumer.track]) }];
                        });
                    } catch (e) { console.error(e); }
                }
            } catch (e) { console.error(e); }
        }
    };

    const handleAcceptCall = () => {
        if (incomingCall) {
            setCallStatus('connected');
            socketRef.current?.emit('accept_call', { callerId: incomingCall.callerId, receiverId: currentUser?.id });
            startSfuSession(incomingCall.callerId);
            setIncomingCall(null);
        } else if (incomingGroupCall) {
            setCallStatus('connected');
            socketRef.current?.emit('accept_group_call', { userId: currentUser?.id, groupId: incomingGroupCall.groupId });
            startSfuSession(incomingGroupCall.groupId);
            setIncomingGroupCall(null);
        }
    };

    const handleDeclineCall = () => {
        setIncomingCall(null);
        setIncomingGroupCall(null);
        setCallStatus('idle');
    };

    const handleEndCall = () => {
        if (socketRef.current && currentUser) {
            socketRef.current.emit('end_call', { 
                toId: incomingCall?.callerId || selectedUser?._id, 
                fromId: currentUser.id,
                groupId: selectedGroup?._id || initialMeetingId
            });
        }
        setCallStatus('idle');
        setRemoteStreams([]);
        setCallParticipants([]);
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
        if (msClientRef.current) msClientRef.current.close();
        msClientRef.current = null;

        recvTransportRef.current = null;
        sendTransportRef.current = null;
        videoProducerRef.current = null;
        audioProducerRef.current = null;
        creatingRecvTransportRef.current = null;
        sfuReadyRef.current = false;

        if (onLeave) onLeave();
    };

    const toggleMute = async () => {
        const newState = !isMuted;
        setIsMuted(newState);
        if (!msClientRef.current || !sendTransportRef.current) return;
        if (newState) {
            if (audioProducerRef.current) {
                await socketRef.current?.emit('close_producer', { producerId: audioProducerRef.current.id, roomId: msClientRef.current.roomId });
                audioProducerRef.current.close();
                audioProducerRef.current = null;
                if (localStream) {
                    const audioTracks = localStream.getAudioTracks();
                    audioTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
                    setLocalStream(new MediaStream(localStream.getTracks()));
                }
            }
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioProducerRef.current = await msClientRef.current.produceAudio(sendTransportRef.current, stream);
            if (localStream) {
                const audioTracks = localStream.getAudioTracks();
                audioTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
                setLocalStream(new MediaStream([...localStream.getTracks(), stream.getAudioTracks()[0]]));
            } else {
                setLocalStream(stream);
            }
        }
    };

    const toggleVideo = async () => {
        const newState = !isVideoOff;
        setIsVideoOff(newState);
        if (!msClientRef.current || !sendTransportRef.current) return;
        if (newState) {
            if (videoProducerRef.current) {
                await socketRef.current?.emit('close_producer', { producerId: videoProducerRef.current.id, roomId: msClientRef.current.roomId });
                videoProducerRef.current.close();
                videoProducerRef.current = null;
                if (localStream) {
                    const videoTracks = localStream.getVideoTracks();
                    videoTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
                    setLocalStream(new MediaStream(localStream.getTracks()));
                }
            }
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoProducerRef.current = await msClientRef.current.produceVideo(sendTransportRef.current, stream);
            if (localStream) {
                const videoTracks = localStream.getVideoTracks();
                videoTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
                setLocalStream(new MediaStream([...localStream.getTracks(), stream.getVideoTracks()[0]]));
            } else {
                setLocalStream(stream);
            }
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || (!selectedUser && !selectedGroup)) return;
        const msgData: any = {
            sender: currentUser.id,
            text: newMessage.trim(),
            timestamp: new Date().toISOString()
        };
        if (selectedUser) msgData.receiver = selectedUser._id;
        else msgData.groupId = selectedGroup?._id;
        try {
            const res = await fetch(`${BACKEND_URL}/api/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msgData)
            });
            if (res.ok) {
                const savedMsg = await res.json();
                socketRef.current?.emit('send_message', savedMsg);
                setMessages(prev => [...prev, savedMsg]);
                setNewMessage('');
            }
        } catch (e) { console.error(e); }
    };

    const handleCallInitiate = () => {
        if (selectedGroup) {
            socketRef.current?.emit('initiate_group_call', {
                callerId: currentUser?.id,
                callerEmail: currentUser?.email,
                groupId: selectedGroup._id,
                groupName: selectedGroup.name
            });
            setCallStatus('connected');
            startSfuSession(selectedGroup._id);
        } else if (selectedUser) {
            socketRef.current?.emit('initiate_call', {
                callerId: currentUser?.id,
                callerEmail: currentUser?.email,
                receiverId: selectedUser._id
            });
            setCallStatus('ringing');
            setCallRemoteEmail(selectedUser.email);
        }
    };

    if (mode === 'meeting' && callStatus === 'connected') {
        return (
            <div className="h-screen w-screen bg-zinc-950 flex flex-col">
                <CallInterface
                    meetingCode={initialMeetingId}
                    status="connected"
                    remoteUserEmail={callRemoteEmail}
                    remoteStreams={remoteStreams}
                    localStream={localStream}
                    onAccept={() => {}}
                    onDecline={handleEndCall}
                    onEnd={handleEndCall}
                    isMuted={isMuted}
                    isVideoOff={isVideoOff}
                    onToggleMute={toggleMute}
                    onToggleVideo={toggleVideo}
                    isHost={true}
                    isGroupCall={true}
                    onMuteParticipant={(id) => socketRef.current?.emit('mute_participant', { targetSocketId: id, roomId: initialMeetingId })}
                    onMuteAll={() => socketRef.current?.emit('mute_all', { roomId: initialMeetingId })}
                    participants={[
                        ...(currentUser ? [{ socketId: socketRef.current?.id || 'me', email: currentUser.email }] : []),
                        ...callParticipants.filter(p => p.socketId !== (socketRef.current?.id || 'me'))
                    ]}
                    hostSocketId=""
                    mySocketId={socketRef.current?.id || ''}
                    activePrivateSession={activePrivateSession}
                    onRequestPrivateAudio={() => {}}
                    onEndPrivateAudio={() => {}}
                    pendingPrivateRequest={null}
                    onAcceptPrivateAudio={() => {}}
                    onDeclinePrivateAudio={() => {}}
                    remotePrivateStream={null}
                />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-white dark:bg-zinc-950 transition-colors font-sans overflow-hidden">
            {callStatus !== 'idle' && (
                <CallInterface
                    meetingCode={initialMeetingId}
                    status={callStatus as any}
                    remoteUserEmail={callRemoteEmail}
                    remoteStreams={remoteStreams}
                    localStream={localStream}
                    onAccept={handleAcceptCall}
                    onDecline={handleDeclineCall}
                    onEnd={handleEndCall}
                    isMuted={isMuted}
                    isVideoOff={isVideoOff}
                    onToggleMute={toggleMute}
                    onToggleVideo={toggleVideo}
                    isHost={true}
                    isGroupCall={true}
                    onMuteParticipant={(id) => socketRef.current?.emit('mute_participant', { targetSocketId: id, roomId: initialMeetingId })}
                    onMuteAll={() => socketRef.current?.emit('mute_all', { roomId: initialMeetingId })}
                    participants={[
                        ...(currentUser ? [{ socketId: socketRef.current?.id || 'me', email: currentUser.email }] : []),
                        ...callParticipants
                    ]}
                    hostSocketId=""
                    mySocketId={socketRef.current?.id || ''}
                    activePrivateSession={activePrivateSession}
                    onRequestPrivateAudio={() => {}}
                    onEndPrivateAudio={() => {}}
                    pendingPrivateRequest={null}
                    onAcceptPrivateAudio={() => {}}
                    onDeclinePrivateAudio={() => {}}
                    remotePrivateStream={null}
                />
            )}

            <div className="w-80 border-r border-border flex flex-col bg-background shrink-0">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-foreground">Hertzworkz</h2>
                    <button onClick={() => setShowCreateGroup(true)} className="p-2 border border-border rounded-lg hover:bg-secondary"><X size={18} /></button>
                </div>
                <div className="flex border-b border-border">
                    <button onClick={() => setActiveTab('people')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'people' ? 'text-rose-500 border-b-2 border-rose-500' : 'text-muted-foreground'}`}>PEOPLE</button>
                    <button onClick={() => setActiveTab('groups')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'groups' ? 'text-rose-500 border-b-2 border-rose-500' : 'text-muted-foreground'}`}>GROUPS</button>
                </div>
                <div className="p-4 relative">
                    <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <input type="text" placeholder="Search..." className="w-full bg-secondary border-none rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto px-2 space-y-1">
                    {activeTab === 'people' ? users.filter(u => u._id !== currentUser?.id).map((u) => (
                        <div key={u._id} onClick={() => { setSelectedUser(u); setSelectedGroup(null); }} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedUser?._id === u._id ? 'bg-secondary' : 'hover:bg-secondary/50'}`}>
                            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 font-bold">{u.email[0].toUpperCase()}</div>
                            <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate text-foreground">{u.email.split('@')[0]}</p></div>
                        </div>
                    )) : groups.map(g => (
                        <div key={g._id} onClick={() => { setSelectedGroup(g); setSelectedUser(null); }} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedGroup?._id === g._id ? 'bg-secondary' : 'hover:bg-secondary/50'}`}>
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold">{g.name[0].toUpperCase()}</div>
                            <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate text-foreground">{g.name}</p></div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-background/50">
                {(selectedUser || selectedGroup) ? (
                    <>
                        <header className="p-4 border-b border-border flex justify-between items-center bg-background/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white font-bold">{(selectedUser?.email || selectedGroup?.name || '')[0].toUpperCase()}</div>
                                <h3 className="font-bold text-foreground">{(selectedUser?.email || selectedGroup?.name || '').split('@')[0]}</h3>
                            </div>
                            <button onClick={handleCallInitiate} className="p-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20"><Phone size={20} /></button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                            {messages.map((m, i) => {
                                const senderId = typeof m.sender === 'object' ? m.sender._id : m.sender;
                                const isMe = senderId === currentUser?.id;
                                return (
                                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl ${isMe ? 'bg-rose-500 text-white rounded-tr-none' : 'bg-secondary text-foreground rounded-tl-none'}`}>
                                            <p className="text-sm">{m.text}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 bg-background/50 border-t border-border flex gap-2">
                            <input type="text" placeholder="Type a message..." className="flex-1 bg-secondary border-none rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
                            <button type="submit" className="p-3 bg-rose-500 text-white rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-500/20"><Send size={20} /></button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground p-8 text-center flex-col">
                        <MessageSquare size={64} className="text-rose-500 mb-4 opacity-20" />
                        <h3 className="text-2xl font-bold text-foreground">Select a contact to chat</h3>
                    </div>
                )}
            </div>
        </div>
    );
}
