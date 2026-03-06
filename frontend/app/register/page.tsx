"use client";

import Link from "next/link";
import RegisterForm from "@/components/auth/RegisterForm";
import { Logo } from "@/components/ui/Logo";

export default function RegisterPage() {
    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-sans antialiased text-slate-900 overflow-hidden relative">
            {/* Background aesthetics */}
            <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTM5IDQtMS0xdjJMMzkgMTUyeiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDk5LCAxMDIsIDI0MSwgMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] pointer-events-none -z-10"></div>
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1)_0%,transparent_70%)] pointer-events-none -z-10"></div>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-6 sm:p-12 z-10 w-full min-h-screen">
                <div className="w-full max-w-[480px] bg-white dark:bg-accent-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 relative">

                    {/* Header Section */}
                    <div className="text-center mb-8">
                        <Link href="/" className="inline-block hover:opacity-80 transition-opacity"><Logo className="w-12 h-12 mb-6" iconSize={28} /></Link>
                        <h1 className="text-slate-900 dark:text-slate-100 text-3xl font-bold mb-2 font-display">
                            Create your account
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 text-base">
                            Join CramRoom to start managing your sessions
                        </p>
                    </div>

                    <RegisterForm />

                    {/* Divider */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white dark:bg-accent-dark text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
                                Or continue with
                            </span>
                        </div>
                    </div>

                    {/* Social Logins */}
                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"></path>
                            </svg>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Google</span>
                        </button>
                        <button className="flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <svg className="w-5 h-5 fill-slate-900 dark:fill-slate-100" viewBox="0 0 24 24">
                                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
                            </svg>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">GitHub</span>
                        </button>
                    </div>

                    <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        <span>Already have an account?</span>
                        <Link href="/login" className="ml-1 text-primary font-semibold hover:underline">
                            Login
                        </Link>
                    </div>

                </div>
            </main>
        </div>
    );
}
