'use client';

import { Phone, X, Check } from 'lucide-react';

interface IncomingCallToastProps {
    callerEmail: string;
    onJoin: () => void;
    onDecline: () => void;
}

export function IncomingCallToast({ callerEmail, onJoin, onDecline }: IncomingCallToastProps) {
    return (
        <div className="fixed top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-5 w-80 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 animate-pulse">
                        <Phone size={24} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-foreground">Incoming Call</h4>
                        <p className="text-sm text-muted-foreground truncate">{callerEmail.split('@')[0]}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onDecline}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all font-medium text-sm"
                    >
                        <X size={18} />
                        Decline
                    </button>
                    <button
                        onClick={onJoin}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all font-medium text-sm shadow-lg shadow-rose-600/20"
                    >
                        <Check size={18} />
                        Join
                    </button>
                </div>
            </div>
        </div>
    );
}
