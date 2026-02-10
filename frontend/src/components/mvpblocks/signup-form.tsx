'use client';
import { Github, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupForm() {
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            return setMessage({ type: 'error', text: 'Passwords do not match' });
        }

        setIsLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const response = await fetch('http://localhost:5000/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: 'Registration successful! Redirecting to login...' });
                setTimeout(() => {
                    router.push('/');
                }, 2000);
            } else {
                setMessage({ type: 'error', text: data.message || 'Registration failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Could not connect to server' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="bg-background flex min-h-screen w-full flex-col items-center justify-center sm:px-4">
            <div className="w-full space-y-4 sm:max-w-md">
                <div className="text-center">
                    <img
                        src="https://i.postimg.cc/j5dW4vFd/Mvpblocks.webp"
                        alt="MVPBlocks Logo"
                        width={80}
                        className="mx-auto"
                    />
                    <div className="mt-5 space-y-2">
                        <h3 className="text-2xl font-bold sm:text-3xl text-foreground">
                            Create an account
                        </h3>
                        <p className="text-muted-foreground">
                            Already have an account?{' '}
                            <a
                                href="/"
                                className="font-medium text-rose-600 hover:text-rose-500 cursor-pointer"
                            >
                                Log in
                            </a>
                        </p>
                    </div>
                </div>
                <div className="bg-card space-y-6 p-4 py-6 border border-border sm:rounded-lg sm:p-6 transition-colors duration-300">
                    {message.text && (
                        <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="font-medium text-foreground">Email</label>
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-foreground shadow-sm outline-none focus:border-rose-600 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <label className="font-medium text-foreground">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-foreground shadow-sm outline-none focus:border-rose-600 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 mt-2 mr-3 flex items-center text-muted-foreground"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="font-medium text-foreground">Confirm Password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-foreground shadow-sm outline-none focus:border-rose-600 transition-colors"
                            />
                        </div>
                        <button
                            disabled={isLoading}
                            className="w-full flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 font-medium text-white duration-150 hover:bg-rose-500 active:bg-rose-600 disabled:opacity-50"
                        >
                            {isLoading && <Loader2 className="animate-spin mr-2" size={20} />}
                            {isLoading ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
