'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, User, Settings, LayoutDashboard, Bell } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function DashboardPage() {
    const router = useRouter();
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/');
        } else {
            // Decode token or just simulate user info for now
            // In a real app, you'd fetch user details from backend using the token
            setUserEmail('User');
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300 flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col p-6 transition-colors duration-300">
                <div className="flex items-center gap-2 mb-10">
                    <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white font-bold">H</div>
                    <span className="font-bold text-xl tracking-tight">HertzWorkz</span>
                </div>

                <nav className="space-y-1 flex-1">
                    <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active />
                    <NavItem icon={<User size={20} />} label="Profile" />
                    <NavItem icon={<Settings size={20} />} label="Settings" />
                </nav>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-rose-600 transition-colors mt-auto font-medium"
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome back!</h1>
                        <p className="text-muted-foreground">Here is what is happening today.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                            <Bell size={20} />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border">
                            <User size={20} />
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard title="Total Sessions" value="24" change="+12.5%" />
                    <StatCard title="Active Projects" value="8" change="+2" />
                    <StatCard title="Completed Tasks" value="142" change="+18%" />
                </div>

                <div className="mt-8 p-6 bg-card rounded-xl border border-border shadow-sm transition-colors duration-300">
                    <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 italic font-medium">L</div>
                                    <div>
                                        <p className="font-medium text-foreground">User Logged In</p>
                                        <p className="text-xs text-muted-foreground font-normal italic">Today at 10:4{i} AM</p>
                                    </div>
                                </div>
                                <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">Success</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium ${active ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            {icon}
            <span>{label}</span>
        </div>
    );
}

function StatCard({ title, value, change }: { title: string, value: string, change: string }) {
    return (
        <div className="p-6 bg-card rounded-xl border border-border shadow-sm transition-colors duration-300">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <div className="flex items-end justify-between mt-2">
                <h3 className="text-2xl font-bold text-foreground">{value}</h3>
                <span className="text-xs font-medium text-green-600">{change}</span>
            </div>
        </div>
    );
}
