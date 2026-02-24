'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, Search, MessageSquare, Phone, PhoneOff } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { IncomingCallToast } from './IncomingCallToast';
import { MediasoupClient } from '../lib/mediasoup';

interface User {
    _id: string;
    email: string;
}

interface Message {
    _id?: string;
    sender: string;
    receiver: string;
    text: string;
    timestamp: string;
}

export function Chat() {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerEmail: string } | null>(null);
    const [isCalling, setIsCalling] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState<{ socketId: string, stream: MediaStream }[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const msClientRef = useRef<MediasoupClient | null>(null);
    const recvTransportRef = useRef<any>(null);

    useEffect(() => {
        // Load current user from localStorage
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setCurrentUser(JSON.parse(userStr));
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
        // Connect to Socket.io
        socketRef.current = io('http://localhost:5000');

        socketRef.current.on('connect', () => {
            console.log('Connected to socket server');
            if (currentUser) {
                socketRef.current?.emit('join', currentUser.id);
            }
        });

        socketRef.current.on('receive_message', (data: Message) => {
            if (selectedUser && data.sender === selectedUser._id) {
                setMessages(prev => [...prev, data]);
            }
        });

        socketRef.current.on('incoming_call', (data: { callerId: string, callerEmail: string }) => {
            setIncomingCall(data);
        });

        socketRef.current.on('call_accepted', (data: { receiverId: string }) => {
            setIsCalling(false);
            alert('Call accepted!');
        });

        socketRef.current.on('call_declined', (data: { receiverId: string }) => {
            setIsCalling(false);
            alert('Call declined');
        });

        socketRef.current.on('new_producer', async (data: { producerId: string, socketId: string }) => {
            if (!msClientRef.current || !socketRef.current) return;
            try {
                if (!recvTransportRef.current) {
                    recvTransportRef.current = await msClientRef.current.createRecvTransport();
                }
                const consumer = await msClientRef.current.consume(recvTransportRef.current, data.producerId);
                const newStream = new MediaStream([consumer.track]);
                setRemoteStreams(prev => [
                    ...prev.filter(s => s.socketId !== data.socketId),
                    { socketId: data.socketId, stream: newStream }
                ]);
            } catch (error) {
                console.error('Error consuming new producer:', error);
            }
        });

        socketRef.current.on('participant_left', (data: { socketId: string }) => {
            console.log('Participant left:', data.socketId);
            setRemoteStreams(prev => prev.filter(s => s.socketId !== data.socketId));
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [currentUser, selectedUser]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (selectedUser && currentUser) {
                try {
                    const response = await fetch(`http://localhost:5000/api/chat/messages/${currentUser.id}/${selectedUser._id}`);
                    const data = await response.json();
                    setMessages(data);
                } catch (error) {
                    console.error('Error fetching messages:', error);
                }
            }
        };

        if (selectedUser && currentUser) {
            fetchMessages();
        }
    }, [selectedUser, currentUser]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUser || !currentUser) return;

        const msgData = {
            sender: currentUser.id,
            receiver: selectedUser._id,
            text: newMessage.trim()
        };

        try {
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

    const handleInitiateCall = () => {
        if (!selectedUser || !currentUser) return;
        setIsCalling(true);
        socketRef.current?.emit('initiate_call', {
            callerId: currentUser.id,
            callerEmail: currentUser.email,
            receiverId: selectedUser._id
        });
    };

    const handleAcceptCall = async () => {
        if (!incomingCall || !currentUser || !socketRef.current) return;

        socketRef.current.emit('accept_call', {
            callerId: incomingCall.callerId,
            receiverId: currentUser.id
        });

        const roomId = incomingCall.callerId;
        msClientRef.current = new MediasoupClient(socketRef.current, roomId);

        const initialized = await msClientRef.current.init();
        if (initialized) {
            console.log("SFU is ready!");
        }
    };

    const handleDeclineCall = () => {
        if (!incomingCall || !currentUser) return;
        socketRef.current?.emit('decline_call', {
            callerId: incomingCall.callerId,
            receiverId: currentUser.id
        });
        setIncomingCall(null);
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) &&
        u._id !== currentUser?.id
    );

    return (
        <div className="flex h-full w-full bg-card overflow-hidden">
            {/* User List */}
            <div className="w-80 border-r border-border flex flex-col bg-background/50">
                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            placeholder="Search users..."
                            className="w-full bg-secondary/50 border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredUsers.map(user => (
                        <div
                            key={user._id}
                            onClick={() => setSelectedUser(user)}
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
                    ))}
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

                {selectedUser ? (
                    <>
                        <div className="p-4 border-b border-border flex items-center justify-between bg-background/30 px-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
                                    <UserIcon size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{selectedUser.email.split('@')[0]}</h3>
                                    <p className="text-xs text-green-500">Online</p>
                                </div>
                            </div>
                            <button onClick={handleInitiateCall} disabled={isCalling} className="p-2.5 rounded-full bg-rose-600 text-white hover:bg-rose-700">
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
                                const isMe = msg.sender === currentUser?.id;
                                return (
                                    <div key={msg._id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
                        <MessageSquare size={40} className="text-rose-500/50 mb-4" />
                        <h3 className="text-xl font-bold text-foreground">Select a user</h3>
                    </div>
                )}
            </div>

            {incomingCall && (
                <IncomingCallToast
                    callerEmail={incomingCall.callerEmail}
                    onJoin={handleAcceptCall}
                    onDecline={handleDeclineCall}
                />
            )}

            {isCalling && (
                <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex flex-col items-center justify-center p-6">
                    <div className="w-24 h-24 rounded-full bg-rose-600 flex items-center justify-center text-white mb-6 animate-pulse">
                        <Phone size={40} className="animate-bounce" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Calling...</h2>
                    <button onClick={() => setIsCalling(false)} className="px-8 py-3 bg-red-600 text-white rounded-full">End Call</button>
                </div>
            )}
        </div>
    );
}
