'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User } from 'lucide-react';

export type CallStatus = 'dialing' | 'ringing' | 'connected' | 'ended' | 'declined';

interface CallInterfaceProps {
    status: CallStatus;
    remoteUserEmail: string;
    remoteStreams: { socketId: string, stream: MediaStream }[];
    onAccept: () => void;
    onDecline: () => void;
    onEnd: () => void;
}

export function CallInterface({
    status,
    remoteUserEmail,
    remoteStreams,
    onAccept,
    onDecline,
    onEnd
}: CallInterfaceProps) {
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        if (status === 'connected' || status === 'dialing') {
            const startLocalStream = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    setLocalStream(stream);
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing media devices:", err);
                }
            };
            startLocalStream();
        }

        return () => {
            localStream?.getTracks().forEach(track => track.stop());
        };
    }, [status]);

    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
        }
    }, [isMuted, localStream]);

    useEffect(() => {
        if (localStream) {
            localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
        }
    }, [isVideoOff, localStream]);

    if (status === 'ended' || status === 'declined') return null;

    const displayName = remoteUserEmail.split('@')[0];

    return (
        <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center overflow-hidden font-sans">
            {/* Background blur/gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-rose-900/20 via-zinc-950 to-zinc-950" />

            {/* Remote Video / Primary Display */}
            <div className="relative w-full h-full flex items-center justify-center p-4">
                {status === 'connected' && remoteStreams.length > 0 ? (
                    <div className={`grid gap-4 w-full h-full max-w-7xl mx-auto transition-all duration-500 ${remoteStreams.length === 1 ? 'grid-cols-1' :
                            remoteStreams.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                                remoteStreams.length <= 4 ? 'grid-cols-2' :
                                    'grid-cols-2 lg:grid-cols-3'
                        }`}>
                        {remoteStreams.map((item) => (
                            <div key={item.socketId} className="relative w-full h-full min-h-[200px] bg-zinc-900 rounded-3xl overflow-hidden border border-white/5 shadow-2xl group transition-all hover:scale-[1.02]">
                                <video
                                    ref={(el) => { if (el) el.srcObject = item.stream; }}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                                    <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md text-white rounded-xl flex items-center gap-2 border border-white/10">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-xs font-semibold">Remote Participant</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
                        <div className="relative">
                            <div className={`w-32 h-32 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border-2 border-rose-500/20 shadow-2xl shadow-rose-500/10 ${status === 'ringing' || status === 'dialing' ? 'animate-pulse' : ''}`}>
                                <User size={64} />
                            </div>
                            {(status === 'ringing' || status === 'dialing') && (
                                <>
                                    <div className="absolute -inset-4 border-2 border-rose-500/20 rounded-full animate-ping [animation-duration:3s]" />
                                    <div className="absolute -inset-8 border-2 border-rose-500/10 rounded-full animate-ping [animation-duration:4s]" />
                                </>
                            )}
                        </div>
                        <div className="text-center z-10">
                            <h2 className="text-4xl font-bold text-white tracking-tight mb-2 capitalize">{displayName}</h2>
                            <p className="text-rose-400 text-lg font-medium tracking-wide">
                                {status === 'dialing' ? 'Calling...' : status === 'ringing' ? 'Incoming Call' : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Local Preview (Picture-in-Picture) */}
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
                            You
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-12 z-50 flex items-center gap-6 px-8 py-4 bg-zinc-900/40 backdrop-blur-2xl rounded-3xl border border-white/5 shadow-2xl animate-in slide-in-from-bottom-12 duration-700">
                {status === 'ringing' ? (
                    <>
                        <button
                            onClick={onDecline}
                            className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-rose-500/20"
                        >
                            <PhoneOff size={28} />
                        </button>
                        <button
                            onClick={onAccept}
                            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-emerald-500/20"
                        >
                            <Phone size={28} />
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${isMuted ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'}`}
                        >
                            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                        </button>

                        <button
                            onClick={onEnd}
                            className="w-14 h-14 rounded-2xl bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-rose-500/20"
                        >
                            <PhoneOff size={24} />
                        </button>

                        <button
                            onClick={() => setIsVideoOff(!isVideoOff)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${isVideoOff ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'}`}
                        >
                            {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
