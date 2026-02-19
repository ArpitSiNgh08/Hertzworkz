'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, Search, MessageSquare } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

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
    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);

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
            // Only update if the message is from the selected user OR we are the ones who sent it (to avoid double updates if handled locally)
            // Actually, handleSendMessage already updates local state, so we check if the sender is the selectedUser
            if (selectedUser && data.sender === selectedUser._id) {
                setMessages(prev => [...prev, data]);
            }
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [currentUser, selectedUser]); // Re-run if user changes to rejoin room or update receiver check

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
        // Scroll to bottom when messages change
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

                // Emit via socket for real-time delivery
                socketRef.current?.emit('send_message', savedMsg);

                setMessages(prev => [...prev, savedMsg]);
                setNewMessage('');
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
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
                    {filteredUsers.length > 0 ? (
                        filteredUsers.map(user => (
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
                        ))
                    ) : (
                        <div className="p-8 text-center text-muted-foreground">
                            <p className="text-sm">No users found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {!currentUser && (
                    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card border border-border p-6 rounded-xl shadow-lg max-w-sm text-center">
                            <h3 className="text-lg font-bold mb-2">Authentication Required</h3>
                            <p className="text-sm text-muted-foreground mb-4">We couldn't find your user profile. Please try logging out and logging back in again.</p>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="w-full py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
                            >
                                Go to Login
                            </button>
                        </div>
                    </div>
                )}
                {selectedUser ? (
                    <>
                        <div className="p-4 border-b border-border flex items-center gap-3 bg-background/30">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
                                <UserIcon size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{selectedUser.email.split('@')[0]}</h3>
                                <p className="text-xs text-green-500">Online</p>
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/10">
                            {messages.length > 0 ? (
                                messages.map((msg) => {
                                    const isMe = msg.sender === currentUser?.id;
                                    return (
                                        <div key={msg._id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] p-3 rounded-2xl ${isMe
                                                ? 'bg-rose-600 text-white rounded-tr-none'
                                                : 'bg-secondary text-foreground rounded-tl-none border border-border'
                                                }`}>
                                                <p className="text-sm">{msg.text}</p>
                                                <p className={`text-[10px] mt-1 ${isMe ? 'text-rose-100' : 'text-muted-foreground'}`}>
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <p className="text-sm bg-secondary px-4 py-1 rounded-full border border-border">No messages yet. Say hi!</p>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-background/30">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    className="p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
                            <MessageSquare size={40} className="text-rose-500/50" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">Select a user</h3>
                        <p className="text-center max-w-xs">Pick someone from the list on the left to start a conversation.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
