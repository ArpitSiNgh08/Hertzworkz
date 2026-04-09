'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chat } from '@/components/Chat';

export default function MeetingRoom() {
    const params = useParams();
    const router = useRouter();
    const meetingId = params.meetingId as string;
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            // Redirect to login if not authenticated, 
            // but we might want them to join as guest later.
            // For now, let's assume they must be logged in.
            router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        } else {
            setIsAuthenticated(true);
        }
    }, [router]);

    if (!isAuthenticated) return null;

    return (
        <div className="h-screen w-screen bg-black">
            <Chat 
                initialMeetingId={meetingId} 
                onLeave={() => router.push('/dashboard')} 
                mode="meeting"
            />
        </div>
    );
}
