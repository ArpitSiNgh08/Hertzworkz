'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Video, Keyboard, ArrowRight, User, MessageSquare, LayoutDashboard } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Chat } from '@/components/Chat';

export default function DashboardPage() {
    const router = useRouter();
    const [userEmail, setUserEmail] = useState('');
    const [meetingCode, setMeetingCode] = useState('');
    const [activeTab, setActiveTab] = useState<'landing' | 'chat'>('landing');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/');
        }
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUserEmail(JSON.parse(userStr).email);
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/');
    };

    const generateMeetingCode = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const part1 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const part2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const part3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `${part1}-${part2}-${part3}`;
    };

    const handleStartMeeting = () => {
        const code = generateMeetingCode();
        // The user wants http://localhost:3000/[code]
        router.push(`/${code}`);
    };

    const handleJoinMeeting = (e: React.FormEvent) => {
        e.preventDefault();
        if (meetingCode.trim()) {
            router.push(`/${meetingCode.trim()}`);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300 flex overflow-hidden">
            {/* Sidebar with only two items: Home/Meetings and Chat */}
            <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col p-6 transition-colors duration-300 shrink-0 h-screen">
                <div className="flex items-center gap-2 mb-10 shrink-0">
                    <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white font-bold">H</div>
                    <span className="font-bold text-xl tracking-tight">HertzWorkz</span>
                </div>

                <nav className="space-y-1 flex-1 overflow-y-auto">
                    <div 
                        onClick={() => setActiveTab('landing')}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium ${activeTab === 'landing' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <LayoutDashboard size={20} />
                        <span>Meetings</span>
                    </div>

                    <div 
                        onClick={() => setActiveTab('chat')}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium ${activeTab === 'chat' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <MessageSquare size={20} />
                        <span>Chat Room</span>
                    </div>
                </nav>

                <div className="mt-auto space-y-4 shrink-0">
                    <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-medium text-muted-foreground">Appearance</span>
                        <ThemeToggle />
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-rose-600 transition-colors w-full font-medium"
                    >
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                         <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border">
                            <User size={16} />
                        </div>
                        <div className="text-xs truncate">
                            <p className="font-bold">{userEmail.split('@')[0]}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {activeTab === 'landing' ? (
                    <div className="flex-1 flex items-center justify-center p-8 bg-zinc-950/5 relative">
                         {/* High-end Landing content */}
                         <div className="max-w-4xl w-full text-center space-y-12 animate-in fade-in zoom-in duration-700">
                             <div className="space-y-4">
                                 <h1 className="text-5xl md:text-7xl font-black text-foreground leading-tight tracking-tighter">
                                     Instant <span className="text-rose-600 italic">Meetings.</span> <br /> 
                                     Connected <span className="text-rose-600">Reality.</span>
                                 </h1>
                                 <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
                                     HertzWorkz delivers professional-grade video conferencing with ultra-low latency SFU architecture. Secure, encrypted, and state-of-the-art.
                                 </p>
                             </div>

                             <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                                 <button 
                                     onClick={handleStartMeeting}
                                     className="w-full sm:w-auto px-10 py-5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all transform hover:scale-[1.05] active:scale-95 shadow-xl shadow-rose-600/30 text-xl"
                                 >
                                     <Video size={28} /> Start New Meeting
                                 </button>
                                 
                                 <form onSubmit={handleJoinMeeting} className="w-full sm:w-auto relative group">
                                     <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-rose-500 transition-colors">
                                         <Keyboard size={24} />
                                     </div>
                                     <input 
                                         type="text" 
                                         placeholder="Enter meeting code"
                                         value={meetingCode}
                                         onChange={(e) => setMeetingCode(e.target.value)}
                                         className="w-full sm:w-[320px] bg-secondary/50 border-2 border-border focus:border-rose-600/50 focus:bg-background text-foreground pl-14 pr-14 py-5 rounded-2xl outline-none transition-all text-xl font-medium placeholder:text-muted-foreground/50"
                                     />
                                     {meetingCode.trim() && (
                                         <button 
                                             type="submit"
                                             className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-all"
                                         >
                                             <ArrowRight size={24} />
                                         </button>
                                     )}
                                 </form>
                             </div>

                             <div className="pt-12 border-t border-border flex flex-col items-center gap-4">
                                 <div className="flex -space-x-3">
                                     {[1,2,3,4].map(i => (
                                         <div key={i} className="w-12 h-12 rounded-full border-4 border-background bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white/50">User</div>
                                     ))}
                                 </div>
                                 <p className="text-muted-foreground font-medium">Join thousands of professionals on HertzWorkz</p>
                             </div>
                         </div>
                    </div>
                ) : (
                    <div className="flex-1">
                        <Chat />
                    </div>
                )}
            </main>
        </div>
    );
}
