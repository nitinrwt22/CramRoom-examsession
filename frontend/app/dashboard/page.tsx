"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

export default function DashboardPage() {
    const router = useRouter();

    const handleLogout = () => {
        localStorage.removeItem("token");
        router.push("/");
    };

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white p-8">
                <div className="max-w-4xl mx-auto">
                    <header className="flex justify-between items-center mb-12">
                        <div className="flex items-center gap-2">
                            <Logo className="w-10 h-10" iconSize={24} />
                            <span className="text-2xl font-bold tracking-tight">CramRoom</span>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                        >
                            Logout
                        </button>
                    </header>

                    <main>
                        <h1 className="text-4xl font-display font-bold mb-4">Dashboard</h1>
                        <p className="text-slate-500 dark:text-slate-400 mb-8">
                            Welcome to your protected workspace.
                        </p>

                        <div className="bg-white dark:bg-accent-dark rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                            <h2 className="text-xl font-semibold mb-2">You are authenticated!</h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                This page is protected by the ProtectedRoute component which verifies the presence of a JWT token in localStorage.
                            </p>
                        </div>
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
