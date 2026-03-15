"use client";

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { Logo } from "@/components/ui/Logo";
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
        <nav className="sticky top-0 z-50 border-b border-border/20 bg-background/95 backdrop-blur-md px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Logo className="w-8 h-8" iconSize={20} />
                    <span className="text-3xl font-display font-black tracking-tighter uppercase italic">CramRoom</span>
                </div>
                <div className="hidden md:flex gap-8 text-sm font-bold uppercase tracking-widest items-center">
                    <Link className="hover:text-primary transition-colors underline decoration-primary/30 underline-offset-4" href="/#workflow">How It Works</Link>
                    <Link className="hover:text-primary transition-colors underline decoration-primary/30 underline-offset-4" href="/#reviews">Reviews</Link>
                    <Link className="hover:text-primary transition-colors underline decoration-primary/30 underline-offset-4" href="/login">Study Sessions</Link>
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
                                <Link className="text-sm font-bold uppercase tracking-widest hover:text-primary hidden sm:inline-flex" href="/dashboard">Dashboard</Link>
                                <button className="ink-stamp-border text-primary font-display font-bold text-lg px-4 py-1 hover:bg-primary hover:text-primary-foreground transition-all transform hover:-rotate-1 ml-4" onClick={handleLogout}>
                                    LOGOUT
                                </button>
                            </>
                        ) : (
                            <>
                                <Link className="text-sm font-bold uppercase tracking-widest hover:text-primary hidden sm:inline-flex" href="/login">Login</Link>
                                <Link className="ink-stamp-border text-primary font-display font-bold text-lg px-4 py-1 hover:bg-primary hover:text-primary-foreground transition-all transform hover:-rotate-1 ml-4" href="/register">
                                    REGISTER
                                </Link>
                            </>
                        )
                    )}
                </div>
            </div>
        </nav>
    );
}
