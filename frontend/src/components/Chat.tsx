'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, Search, MessageSquare, Phone, PhoneOff } from 'lucide-react';
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

export function Chat() {
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
    const [remoteStreams, setRemoteStreams] = useState<{ socketId: string, stream: MediaStream }[]>([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const msClientRef = useRef<MediasoupClient | null>(null);
    const recvTransportRef = useRef<any>(null);

    useEffect(() => {
        // Load current user from localStorage
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            setCurrentUser(user);
        }

        // Fetch users from backend
        const fetchUsers = async () => {
            try {
                const response = await fetch('http://localhost:5000/api/auth/users');
                const data = await response.json();
                setUsers(data);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };

        fetchUsers();
    }, []);

    useEffect(() => {
        const fetchGroups = async () => {
            if (currentUser) {
                try {
                    const response = await fetch(`http://localhost:5000/api/groups/user/${currentUser.id}`);
                    const data = await response.json();
                    setGroups(data);
                } catch (error) {
                    console.error('Error fetching groups:', error);
                }
            }
        };

        if (currentUser) {
            fetchGroups();
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;

        // Connect to Socket.io
        socketRef.current = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000');

        socketRef.current.on('connect', () => {
            console.log('Connected to socket server');
            socketRef.current?.emit('join', currentUser.id);
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

        socketRef.current.on('incoming_call', (data: { callerId: string, callerEmail: string }) => {
            console.log('Global incoming call received:', data);
            setIncomingCall(data);
            setCallStatus('ringing');
            setCallRemoteEmail(data.callerEmail);
        });

        socketRef.current.on('incoming_group_call', (data: { callerId: string, callerEmail: string, groupId: string, groupName: string }) => {
            console.log('Global incoming group call received:', data);
            setIncomingGroupCall(data);
            setCallStatus('ringing');
            setCallRemoteEmail(`${data.groupName} (Group)`);
        });

        socketRef.current.on('call_accepted', async (data: { receiverId: string }) => {
            setCallStatus('connected');

            // The room ID is usually the caller's ID in 1-on-1 calls
            // If we are the caller, we already started the SFU session
            // If we are the receiver and this is triggered, it's usually via accept_call which already calls startSfuSession
        });

        socketRef.current.on('group_participant_joined', (data: { userId: string }) => {
            console.log('Group participant joined call:', data.userId);
            // Mediasoup 'new_producer' will handle the actual stream
        });

        socketRef.current.on('call_declined', (data: { receiverId: string }) => {
            setCallStatus('idle');
            setIncomingCall(null);
        });

        socketRef.current.on('call_ended', (data: { fromId: string, groupId?: string }) => {
            // This event now ONLY means a 1-on-1 call ended
            console.log('Call ended (1-on-1):', data);
            setCallStatus('idle');
            setIncomingCall(null);
            setIncomingGroupCall(null);
            setRemoteStreams([]);
            if (msClientRef.current) {
                msClientRef.current.close();
                msClientRef.current = null;
            }
        });

        socketRef.current.on('participant_left_call', (data: { fromId: string, groupId: string }) => {
            console.log('Participant left group call:', data.fromId);
            // Just remove that participant's stream, don't end the whole call
            setRemoteStreams(prev => prev.filter(s => s.socketId !== data.fromId));
        });

        socketRef.current.on('new_producer', async (data: { producerId: string, socketId: string }) => {
            if (!msClientRef.current || !socketRef.current) return;
            // Ignore ourselves
            if (data.socketId === socketRef.current.id) return;

            try {
                if (!recvTransportRef.current) {
                    recvTransportRef.current = await msClientRef.current.createRecvTransport();
                }
                const consumer = await msClientRef.current.consume(recvTransportRef.current, data.producerId);

                setRemoteStreams(prev => {
                    const existingIndex = prev.findIndex(s => s.socketId === data.socketId);
                    if (existingIndex !== -1) {
                        const updated = [...prev];
                        updated[existingIndex].stream.addTrack(consumer.track);
                        return [...updated];
                    } else {
                        const newStream = new MediaStream([consumer.track]);
                        return [...prev, { socketId: data.socketId, stream: newStream }];
                    }
                });
            } catch (error) {
                console.error('Error consuming new producer:', error);
            }
        });

        socketRef.current.on('participant_left', (data: { socketId: string }) => {
            console.log('Participant left:', data.socketId);
            setRemoteStreams(prev => prev.filter(s => s.socketId !== data.socketId));
        });

        socketRef.current.on('group_created', async (data: { groupId: string }) => {
            console.log('Joined new group room:', data.groupId);
            socketRef.current?.emit('join_group', data.groupId);

            // Re-fetch groups to show the new group in the list
            try {
                const response = await fetch(`http://localhost:5000/api/groups/user/${currentUser.id}`);
                const groupsData = await response.json();
                setGroups(groupsData);
            } catch (error) {
                console.error('Error fetching groups:', error);
            }
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [currentUser]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (currentUser) {
                try {
                    let url = '';
                    if (selectedUser) {
                        url = `http://localhost:5000/api/chat/messages/${currentUser.id}/${selectedUser._id}`;
                    } else if (selectedGroup) {
                        url = `http://localhost:5000/api/groups/${selectedGroup._id}/messages`;
                    } else {
                        return;
                    }

                    const response = await fetch(url);
                    const data = await response.json();
                    setMessages(data);
                } catch (error) {
                    console.error('Error fetching messages:', error);
                }
            }
        };

        fetchMessages();
    }, [selectedUser, selectedGroup, currentUser]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || (!selectedUser && !selectedGroup)) return;

        const msgData: any = {
            sender: currentUser.id,
            text: newMessage.trim()
        };

        if (selectedUser) {
            msgData.receiver = selectedUser._id;
        } else if (selectedGroup) {
            msgData.groupId = selectedGroup._id;
        }

        try {
            const endpoint = selectedUser ? 'http://localhost:5000/api/chat/send' : 'http://localhost:5000/api/chat/send';
            // We'll use the same send endpoint if it supports groupId, or handle it here
            const response = await fetch('http://localhost:5000/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msgData)
            });

            if (response.ok) {
                const savedMsg = await response.json();
                socketRef.current?.emit('send_message', savedMsg);
                setMessages(prev => [...prev, savedMsg]);
                setNewMessage('');
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || selectedMembers.length === 0 || !currentUser) return;

        try {
            const response = await fetch('http://localhost:5000/api/groups/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newGroupName,
                    members: selectedMembers,
                    createdBy: currentUser.id
                })
            });

            if (response.ok) {
                const newGroup = await response.json();
                setGroups(prev => [...prev, newGroup]);
                setShowCreateGroup(false);
                setNewGroupName('');
                setSelectedMembers([]);

                // Notify all members via socket
                socketRef.current?.emit('new_group', {
                    groupId: newGroup._id,
                    members: newGroup.members.map((m: any) => typeof m === 'object' ? m._id : m)
                });

                // Join the room ourselves
                socketRef.current?.emit('join_group', newGroup._id);
            }
        } catch (error) {
            console.error('Error creating group:', error);
        }
    };

    const toggleMemberSelection = (userId: string) => {
        setSelectedMembers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleInitiateCall = () => {
        if (!currentUser) return;

        if (selectedUser) {
            setCallStatus('dialing');
            setCallRemoteEmail(selectedUser.email);
            socketRef.current?.emit('initiate_call', {
                callerId: currentUser.id,
                callerEmail: currentUser.email,
                receiverId: selectedUser._id
            });
        } else if (selectedGroup) {
            setCallStatus('connected');
            setCallRemoteEmail(selectedGroup.name);
            socketRef.current?.emit('initiate_group_call', {
                callerId: currentUser.id,
                callerEmail: currentUser.email,
                groupId: selectedGroup._id,
                groupName: selectedGroup.name
            });
            startSfuSession(selectedGroup._id);
        }
    };

    const startSfuSession = async (roomId: string) => {
        if (!currentUser || !socketRef.current) return;

        // Ensure status reflects connected
        setCallStatus('connected');

        msClientRef.current = new MediasoupClient(socketRef.current, roomId);
        const initialized = await msClientRef.current.init();
        if (initialized) {
            console.log(`SFU is ready for room: ${roomId}`);
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                const sendTransport = await msClientRef.current.createSendTransport();
                await msClientRef.current.produceVideo(sendTransport, stream);
                await msClientRef.current.produceAudio(sendTransport, stream);

                // Now also consume all existing producers in the room
                const producers = await msClientRef.current.getProducers();
                console.log('Existing producers:', producers);

                if (!recvTransportRef.current) {
                    recvTransportRef.current = await msClientRef.current.createRecvTransport();
                }

                for (const p of producers) {
                    // Don't consume ourselves
                    if (p.socketId === socketRef.current.id) continue;

                    try {
                        const consumer = await msClientRef.current.consume(recvTransportRef.current, p.producerId);
                        setRemoteStreams(prev => {
                            const existingIndex = prev.findIndex(s => s.socketId === p.socketId);
                            if (existingIndex !== -1) {
                                const updated = [...prev];
                                updated[existingIndex].stream.addTrack(consumer.track);
                                return [...updated];
                            } else {
                                const newStream = new MediaStream([consumer.track]);
                                return [...prev, { socketId: p.socketId, stream: newStream }];
                            }
                        });
                    } catch (err) {
                        console.error('Error consuming existing producer:', err);
                    }
                }
            } catch (err) {
                console.error("Error starting production:", err);
            }
        }
    };

    const handleAcceptCall = async () => {
        if (!currentUser || !socketRef.current) return;

        if (incomingCall) {
            setCallStatus('connected');
            socketRef.current.emit('accept_call', {
                callerId: incomingCall.callerId,
                receiverId: currentUser.id
            });
            startSfuSession(incomingCall.callerId);
        } else if (incomingGroupCall) {
            setCallStatus('connected');
            socketRef.current.emit('accept_group_call', {
                userId: currentUser.id,
                groupId: incomingGroupCall.groupId
            });
            startSfuSession(incomingGroupCall.groupId);
        }
    };

    const handleDeclineCall = () => {
        if (incomingCall && currentUser) {
            socketRef.current?.emit('decline_call', {
                callerId: incomingCall.callerId,
                receiverId: currentUser.id
            });
        }
        setIncomingCall(null);
        setIncomingGroupCall(null);
        setCallStatus('idle');
    };

    const handleEndCall = () => {
        const toId = incomingCall ? incomingCall.callerId : selectedUser?._id;
        const groupId = incomingGroupCall ? incomingGroupCall.groupId : selectedGroup?._id;

        if (!currentUser) return;

        socketRef.current?.emit('end_call', {
            toId: toId,
            fromId: currentUser.id,
            groupId: groupId
        });
        setCallStatus('idle');
        setIncomingCall(null);
        setIncomingGroupCall(null);
        setRemoteStreams([]);
        if (msClientRef.current) {
            msClientRef.current.close();
            msClientRef.current = null;
        }
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) &&
        u._id !== currentUser?.id
    );

    return (
        <div className="flex h-full w-full bg-card overflow-hidden">
            {/* Group Creation Modal */}
            {showCreateGroup && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border p-6 rounded-2xl shadow-2xl w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-foreground">Create New Group</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-1">Group Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-secondary/50 border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                                    placeholder="Enter group name..."
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground block mb-2">Select Members</label>
                                <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                                    {users.filter(u => u._id !== currentUser?.id).map(user => (
                                        <div
                                            key={user._id}
                                            onClick={() => toggleMemberSelection(user._id)}
                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedMembers.includes(user._id) ? 'bg-rose-500/10 border border-rose-500/50' : 'hover:bg-secondary border border-transparent'}`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
                                                <UserIcon size={14} />
                                            </div>
                                            <p className="text-sm flex-1">{user.email}</p>
                                            <div className={`w-4 h-4 rounded-full border ${selectedMembers.includes(user._id) ? 'bg-rose-600 border-rose-600' : 'border-muted-foreground'}`}>
                                                {selectedMembers.includes(user._id) && (
                                                    <div className="flex items-center justify-center text-white">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowCreateGroup(false)}
                                    className="flex-1 py-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateGroup}
                                    className="flex-1 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors font-medium"
                                >
                                    Create Group
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <div className="w-80 border-r border-border flex flex-col bg-background/50">
                <div className="p-4 border-b border-border space-y-4">
                    <div className="flex bg-secondary/50 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('people')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'people' ? 'bg-background shadow-sm text-rose-600' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            People
                        </button>
                        <button
                            onClick={() => setActiveTab('groups')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'groups' ? 'bg-background shadow-sm text-rose-600' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Groups
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            placeholder={activeTab === 'people' ? "Search users..." : "Search groups..."}
                            className="w-full bg-secondary/50 border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {activeTab === 'groups' && (
                        <button
                            onClick={() => setShowCreateGroup(true)}
                            className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <MessageSquare size={16} />
                            Create New Group
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'people' ? (
                        filteredUsers.map(user => (
                            <div
                                key={user._id}
                                onClick={() => {
                                    setSelectedUser(user);
                                    setSelectedGroup(null);
                                }}
                                className={`flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-secondary/80 ${selectedUser?._id === user._id ? 'bg-secondary' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
                                    <UserIcon size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{user.email.split('@')[0]}</p>
                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                </div>
                            </div>
                        ))
                    ) : (
                        groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())).map(group => (
                            <div
                                key={group._id}
                                onClick={() => {
                                    setSelectedGroup(group);
                                    setSelectedUser(null);
                                }}
                                className={`flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-secondary/80 ${selectedGroup?._id === group._id ? 'bg-secondary' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600">
                                    <MessageSquare size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{group.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{group.members.length} members</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {!currentUser && (
                    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card border border-border p-6 rounded-xl shadow-lg max-w-sm text-center">
                            <h3 className="text-lg font-bold mb-2">Authentication Required</h3>
                            <p className="text-sm text-muted-foreground mb-4">Log back in again.</p>
                            <button onClick={() => window.location.href = '/'} className="w-full py-2 bg-rose-600 text-white rounded-lg">Go to Login</button>
                        </div>
                    </div>
                )}

                {selectedUser || selectedGroup ? (
                    <>
                        <div className="p-4 border-b border-border flex items-center justify-between bg-background/30 px-6">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedUser ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600' : 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600'}`}>
                                    {selectedUser ? <UserIcon size={20} /> : <MessageSquare size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{selectedUser ? selectedUser.email.split('@')[0] : selectedGroup?.name}</h3>
                                    <p className="text-xs text-green-500">{selectedUser ? 'Online' : `${selectedGroup?.members.length} members`}</p>
                                </div>
                            </div>
                            <button onClick={handleInitiateCall} disabled={callStatus !== 'idle'} className="p-2.5 rounded-full bg-rose-600 text-white hover:bg-rose-700">
                                <Phone size={18} />
                            </button>
                        </div>

                        {/* Video Grid */}
                        {remoteStreams.length > 0 && (
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 border-b border-border">
                                {remoteStreams.map((item) => (
                                    <div key={item.socketId} className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-xl border-2 border-rose-500/20">
                                        <video
                                            ref={(el) => { if (el) el.srcObject = item.stream; }}
                                            autoPlay
                                            playsInline
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] rounded backdrop-blur-sm">
                                            Remote User
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/10">
                            {messages.map((msg) => {
                                const senderId = typeof msg.sender === 'object' ? msg.sender._id : msg.sender;
                                const senderEmail = typeof msg.sender === 'object' ? msg.sender.email : null;
                                const isMe = senderId === currentUser?.id;

                                return (
                                    <div key={msg._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        {selectedGroup && !isMe && senderEmail && (
                                            <span className="text-[10px] text-muted-foreground ml-2 mb-1">{senderEmail.split('@')[0]}</span>
                                        )}
                                        <div className={`max-w-[70%] p-3 rounded-2xl ${isMe ? 'bg-rose-600 text-white rounded-tr-none' : 'bg-secondary text-foreground rounded-tl-none border border-border'}`}>
                                            <p className="text-sm">{msg.text}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-background/30">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm focus:outline-none"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                />
                                <button type="submit" className="p-2 bg-rose-600 text-white rounded-lg"><Send size={20} /></button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                        <div className="relative mb-6">
                            <div className="absolute -inset-4 bg-rose-500/20 rounded-full blur-xl animate-pulse"></div>
                            <MessageSquare size={64} className="text-rose-500 relative" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground mb-2">Welcome to Hertzworkz</h3>
                        <p className="text-center max-w-xs">Select a contact or join a group to start collaborating in real-time.</p>
                    </div>
                )}
            </div>

            {callStatus !== 'idle' && (
                <CallInterface
                    status={callStatus}
                    remoteUserEmail={callRemoteEmail}
                    remoteStreams={remoteStreams}
                    onAccept={handleAcceptCall}
                    onDecline={handleDeclineCall}
                    onEnd={handleEndCall}
                />
            )}
        </div>
    );
}
