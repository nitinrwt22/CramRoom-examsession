"use client";

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { Logo } from "@/components/ui/Logo";
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function Navbar() {
    const { theme, setTheme } = useTheme();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Simple JWT check on mount
        const token = localStorage.getItem("token");
        setIsAuthenticated(!!token);

        // Optional: listen to custom event if other components trigger auth changes
        const handleStorageChange = () => {
            setIsAuthenticated(!!localStorage.getItem("token"));
        };
        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
        router.push("/");
    };

    return (
        <nav className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-black/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Logo className="w-8 h-8" iconSize={20} />
                    <span className="text-xl font-bold tracking-tight">CramRoom</span>
                </div>
                <div className="hidden md:flex items-center space-x-8">
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="/#features">Features</Link>
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="/#workflow">Workflow</Link>
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="/#reviews">Reviews</Link>
                </div>
                <div className="flex items-center gap-4">
                    {mounted && (
                        <button
                            aria-label="Toggle dark mode"
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    )}
                    
                    {mounted && (
                        isAuthenticated ? (
                            <>
                                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                                    <Link href="/dashboard">Dashboard</Link>
                                </Button>
                                <Button className="rounded-full px-6" onClick={handleLogout}>
                                    Logout
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                                    <Link href="/login">Login</Link>
                                </Button>
                                <Button className="rounded-full px-6" asChild>
                                    <Link href="/register">Register</Link>
                                </Button>
                            </>
                        )
                    )}
                </div>
            </div>
        </nav>
    );
}
