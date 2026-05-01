'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User, Users, Lock, X } from 'lucide-react';

export type CallStatus = 'dialing' | 'ringing' | 'connected' | 'ended' | 'declined';

interface CallInterfaceProps {
    meetingCode?: string;
    status: CallStatus;
    remoteUserEmail: string;
    remoteStreams: { socketId: string, email: string, stream: MediaStream }[];
    localStream: MediaStream | null;
    onAccept: () => void;
    onDecline: () => void;
    onEnd: () => void;
    isMuted: boolean;
    isVideoOff: boolean;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    isHost: boolean;
    isGroupCall: boolean;
    onMuteParticipant: (socketId: string) => void;
    onMuteAll: () => void;
    participants: { socketId: string, email: string }[];
    hostSocketId: string;
    mySocketId: string;
    activePrivateSession: { socketId: string, email: string } | null;
    onRequestPrivateAudio: (targetSocketId: string, targetEmail: string) => void;
    onEndPrivateAudio: () => void;
    pendingPrivateRequest: { requesterSocketId: string, requesterEmail: string } | null;
    onAcceptPrivateAudio: (requesterSocketId: string) => void;
    onDeclinePrivateAudio: (requesterSocketId: string) => void;
    remotePrivateStream: MediaStream | null;
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    participants: { socketId: string, email: string }[];
    mySocketId: string;
    hostSocketId: string;
    isHost: boolean;
    activePrivateSession: { socketId: string, email: string } | null;
    onRequestPrivateAudio: (socketId: string, email: string) => void;
}

function ParticipantsSidebar({
    isOpen,
    onClose,
    participants,
    mySocketId,
    hostSocketId,
    isHost,
    activePrivateSession,
    onRequestPrivateAudio
}: SidebarProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-80 z-[250] bg-zinc-900 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white font-bold flex items-center gap-2">
                    <Users size={18} /> Participants
                </h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {participants.map((p) => {
                    const isMe = p.socketId === mySocketId;
                    const isGroupAdmin = p.socketId === hostSocketId;
                    const isActivePrivate = activePrivateSession?.socketId === p.socketId;
                    const canRequestPrivate = !isMe && !activePrivateSession && (isHost || p.socketId === hostSocketId);

                    return (
                        <div key={p.socketId} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isActivePrivate ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-transparent'}`}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                                    <User size={16} />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white truncate max-w-[120px]">
                                        {p.email.split('@')[0]} {isMe ? '(You)' : ''}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {isGroupAdmin && (
                                            <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20">Host</span>
                                        )}
                                        {isActivePrivate && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                Private
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {!isMe && (
                                <button
                                    onClick={() => onRequestPrivateAudio(p.socketId, p.email)}
                                    disabled={!canRequestPrivate}
                                    className={`p-2 rounded-lg transition-all ${canRequestPrivate ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                                    title={activePrivateSession ? "Private session active" : "Request Private Audio"}
                                >
                                    <Lock size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RemoteVideo({ stream, socketId, email, hasVideo, isGroupCall, isHost, onMuteParticipant }: { 
    stream: MediaStream | undefined, 
    socketId: string, 
    email: string, 
    hasVideo: boolean,
    isGroupCall: boolean,
    isHost: boolean,
    onMuteParticipant: (id: string) => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        } else if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    return (
        <div className="relative w-full h-full min-h-[200px] bg-zinc-900 rounded-3xl overflow-hidden border border-white/5 shadow-2xl group transition-all hover:scale-[1.02]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`absolute inset-0 w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
            />
            {!hasVideo && (
                <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shadow-xl shadow-rose-500/5">
                        <User size={32} />
                    </div>
                    <p className="text-zinc-500 text-sm font-medium">Participant hasn&apos;t turned on video</p>
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md text-white rounded-xl flex items-center gap-2 border border-white/10">
                    <div className={`w-2 h-2 rounded-full ${stream ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                    <span className="text-xs font-semibold">{email?.split('@')[0] || 'Remote'}</span>
                </div>
                {isGroupCall && isHost && (
                    <button
                        onClick={() => onMuteParticipant(socketId)}
                        className="p-2 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl backdrop-blur-md transition-all transform hover:scale-110"
                        title="Mute Participant"
                    >
                        <MicOff size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function CallInterface({
    meetingCode,
    status,
    remoteUserEmail,
    remoteStreams,
    localStream,
    onAccept,
    onDecline,
    onEnd,
    isMuted,
    isVideoOff,
    onToggleMute,
    onToggleVideo,
    isHost,
    isGroupCall,
    onMuteParticipant,
    onMuteAll,
    participants,
    hostSocketId,
    mySocketId,
    activePrivateSession,
    onRequestPrivateAudio,
    onEndPrivateAudio,
    pendingPrivateRequest,
    onAcceptPrivateAudio,
    onDeclinePrivateAudio,
    remotePrivateStream
}: CallInterfaceProps) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const privateAudioRef = useRef<HTMLAudioElement>(null);
    const [mounted, setMounted] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);

    useEffect(() => {
        if (privateAudioRef.current && remotePrivateStream) {
            privateAudioRef.current.srcObject = remotePrivateStream;
        }
    }, [remotePrivateStream]);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync stream to video element whenever stream or video ref becomes available
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, status]);

    if (status === 'ended' || status === 'declined') return null;
    if (!mounted) return null;

    const displayName = remoteUserEmail.split('@')[0];

    // For incoming calls, show a small toast-style popup
    if (status === 'ringing') {
        return createPortal((
            <div className="fixed top-6 right-6 z-[300] w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 animate-in slide-in-from-right-12 duration-500 font-sans">
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <User size={24} />
                        <div className="absolute -inset-1 border-2 border-rose-500/20 rounded-full animate-ping" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold capitalize truncate max-w-[180px]">{displayName}</h3>
                        <p className="text-rose-400 text-sm animate-pulse">Incoming Call...</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-2">
                    <button
                        onClick={onDecline}
                        className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-medium text-sm transition-all"
                    >
                        Decline
                    </button>
                    <button
                        onClick={onAccept}
                        className="px-4 py-2 rounded-xl flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <Phone size={14} /> Accept
                    </button>
                </div>
            </div>
        ), document.body);
    }

    return createPortal((
        <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center overflow-hidden font-sans">
            <div className="absolute inset-0 bg-gradient-to-b from-rose-900/20 via-zinc-950 to-zinc-950" />

            {meetingCode && status === 'connected' && (
                <div className="absolute top-6 left-6 z-[250] flex items-center gap-3 px-4 py-2 bg-zinc-900/80 border border-white/10 rounded-xl backdrop-blur-md shadow-xl animate-in fade-in duration-500">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Meeting Code</span>
                        <span className="text-sm font-mono font-medium text-white">{meetingCode}</span>
                    </div>
                    <button 
                        onClick={() => navigator.clipboard.writeText(meetingCode)}
                        className="ml-2 p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                        title="Copy meeting code"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                </div>
            )}

            {pendingPrivateRequest && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[350] w-96 bg-zinc-900 border border-emerald-500/30 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 animate-in slide-in-from-top duration-500">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Lock size={20} />
                        </div>
                        <div>
                            <p className="text-white font-semibold text-sm">Private Audio Request</p>
                            <p className="text-zinc-400 text-xs">{pendingPrivateRequest.requesterEmail.split('@')[0]} wants a private audio session</p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => onDeclinePrivateAudio(pendingPrivateRequest.requesterSocketId)} className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-sm font-medium transition-all">Decline</button>
                        <button onClick={() => onAcceptPrivateAudio(pendingPrivateRequest.requesterSocketId)} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-all">Accept</button>
                    </div>
                </div>
            )}

            {activePrivateSession && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-3 px-5 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl backdrop-blur-md animate-in slide-in-from-top duration-500">
                    <Lock size={18} className="text-emerald-400" />
                    <span className="text-emerald-400 text-sm font-semibold">
                        Private audio session active with {activePrivateSession.email.split('@')[0]}
                    </span>
                    <button onClick={onEndPrivateAudio} className="ml-2 px-3 py-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-medium transition-all">
                        End Session
                    </button>
                </div>
            )}

            <div className="relative w-full h-full flex items-center justify-center p-4">
                {status === 'connected' ? (
                    <div className={`grid gap-4 w-full h-full max-w-7xl mx-auto transition-all duration-500 auto-rows-fr ${
                        participants.filter(p => p.socketId !== mySocketId).length <= 1 ? 'grid-cols-1' :
                        participants.filter(p => p.socketId !== mySocketId).length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                        participants.filter(p => p.socketId !== mySocketId).length <= 4 ? 'grid-cols-2' :
                        'grid-cols-2 lg:grid-cols-3'
                    }`}>
                        {participants.filter(p => p.socketId !== mySocketId).map((p) => {
                            const remoteItem = remoteStreams.find(s => s.socketId === p.socketId);
                            const hasVideo = !!(remoteItem && remoteItem.stream.getVideoTracks().length > 0);

                            return (
                                <RemoteVideo 
                                    key={p.socketId}
                                    stream={remoteItem?.stream}
                                    socketId={p.socketId}
                                    email={p.email}
                                    hasVideo={hasVideo}
                                    isGroupCall={isGroupCall}
                                    isHost={isHost}
                                    onMuteParticipant={onMuteParticipant}
                                />
                            );
                        })}
                        {isGroupCall && participants.filter(p => p.socketId !== mySocketId).length === 0 && (
                            <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
                                <div className="w-24 h-24 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 shadow-2xl">
                                    <Users size={40} />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-white font-bold text-xl mb-1">Waiting for others to join...</h3>
                                    <p className="text-zinc-500 text-sm">You are the only one in the call right now</p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
                        <div className="relative">
                            <div className={`w-32 h-32 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border-2 border-rose-500/20 shadow-2xl shadow-rose-500/10 ${status === 'dialing' ? 'animate-pulse' : ''}`}>
                                <User size={64} />
                            </div>
                            {status === 'dialing' && (
                                <>
                                    <div className="absolute -inset-4 border-2 border-rose-500/20 rounded-full animate-ping [animation-duration:3s]" />
                                    <div className="absolute -inset-8 border-2 border-rose-500/10 rounded-full animate-ping [animation-duration:4s]" />
                                </>
                            )}
                        </div>
                        <div className="text-center z-10">
                            <h2 className="text-4xl font-bold text-white tracking-tight mb-2 capitalize">{displayName}</h2>
                            <p className="text-rose-400 text-lg font-medium tracking-wide">
                                {status === 'dialing' ? 'Calling...' : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                )}

                {(status === 'connected' || status === 'dialing') && (
                    <div className="absolute top-6 right-6 w-48 aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-50 transform transition-all hover:scale-105">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover -scale-x-100"
                        />
                        {isVideoOff && (
                            <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center text-zinc-500">
                                <VideoOff size={24} />
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-[10px] rounded-md border border-white/10">
                            You {isGroupCall && isHost ? '(Host)' : ''}
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute bottom-6 md:bottom-12 z-50 flex flex-wrap justify-center items-center gap-3 md:gap-6 px-4 md:px-8 py-3 md:py-4 max-w-[calc(100vw-2rem)] bg-zinc-900/40 backdrop-blur-2xl rounded-3xl border border-white/5 shadow-2xl animate-in slide-in-from-bottom-12 duration-700">
                {status === 'dialing' || status === 'connected' ? (
                    <>
                        <button
                            onClick={onToggleMute}
                            className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${isMuted ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'}`}
                        >
                            {isMuted ? <MicOff size={20} className="sm:w-6 sm:h-6" /> : <Mic size={20} className="sm:w-6 sm:h-6" />}
                        </button>

                        <button
                            onClick={onEnd}
                            className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl shrink-0 bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-rose-500/20"
                        >
                            <PhoneOff size={20} className="sm:w-6 sm:h-6" />
                        </button>

                        <button
                            onClick={onToggleVideo}
                            className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${isVideoOff ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'}`}
                        >
                            {isVideoOff ? <VideoOff size={20} className="sm:w-6 sm:h-6" /> : <Video size={20} className="sm:w-6 sm:h-6" />}
                        </button>

                        {isGroupCall && isHost && status === 'connected' && (
                            <div className="w-px h-6 md:h-8 bg-white/10 mx-1 md:mx-2 hidden sm:block" />
                        )}

                        {isGroupCall && isHost && status === 'connected' && (
                            <button
                                onClick={onMuteAll}
                                className="px-4 py-2.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs md:text-sm transition-all border border-white/10 flex items-center gap-2 hover:scale-105 active:scale-95 shrink-0"
                            >
                                <MicOff size={16} className="sm:w-[18px] sm:h-[18px]" />
                                <span className="hidden sm:inline">Mute Everyone</span>
                                <span className="sm:hidden">Mute All</span>
                            </button>
                        )}

                        {isGroupCall && status === 'connected' && (
                            <>
                                <div className="w-px h-6 md:h-8 bg-white/10 mx-1 md:mx-2 hidden sm:block" />
                                <button
                                    onClick={() => setShowParticipants(prev => !prev)}
                                    className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${showParticipants ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'}`}
                                    title="Participants"
                                >
                                    <Users size={20} className="sm:w-6 sm:h-6" />
                                </button>
                            </>
                        )}
                    </>
                ) : null}
            </div>

            <ParticipantsSidebar
                isOpen={showParticipants}
                onClose={() => setShowParticipants(false)}
                participants={participants}
                mySocketId={mySocketId}
                hostSocketId={hostSocketId}
                isHost={isHost}
                activePrivateSession={activePrivateSession}
                onRequestPrivateAudio={onRequestPrivateAudio}
            />

            {activePrivateSession && (
                <audio
                    ref={privateAudioRef}
                    autoPlay
                    playsInline
                    className="hidden"
                />
            )}
        </div>
    ), document.body);
}
