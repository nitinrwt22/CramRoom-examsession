"use client";

import Link from 'next/link';
import { Brain, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function Navbar() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <nav className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-black/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <Brain className="text-white w-5 h-5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">CramRoom</span>
                </div>
                <div className="hidden md:flex items-center space-x-8">
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="#features">Features</Link>
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="#workflow">Workflow</Link>
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href="#reviews">Reviews</Link>
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
                    <Button variant="ghost" asChild className="hidden sm:inline-flex">
                        <Link href="/login">Login</Link>
                    </Button>
                    <Button className="rounded-full px-6" asChild>
                        <Link href="/register">Register</Link>
                    </Button>
                </div>
            </div>
        </nav>
    );
}
