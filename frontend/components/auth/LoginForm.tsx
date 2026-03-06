"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";

export default function LoginForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const res = await api.post("/auth/login", { email, password });
            const data = res.data;

            // Store JWT token
            if (data.token) {
                localStorage.setItem("token", data.token);
                // Axios interceptor sets the header automatically on next requests
                router.push("/dashboard");
            } else {
                throw new Error("Token missing from server response.");
            }
        } catch (err: any) {
            let errorMsg = "Failed to login. Please try again.";
            if (err.response?.data?.error) {
                errorMsg = err.response.data.error;
            } else if (err.message) {
                errorMsg = err.message;
            }
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                    {error}
                </div>
            )}

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="email">
                    Email address
                </label>
                <input
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-accent-dark border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white text-slate-900 placeholder:text-slate-400"
                    id="email"
                    placeholder="name@company.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>

            <div className="space-y-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                        Password
                    </label>
                    <a className="text-xs font-medium text-primary hover:underline" href="#">
                        Forgot password?
                    </a>
                </div>
                <div className="relative group">
                    <input
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-accent-dark border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white text-slate-900 placeholder:text-slate-400"
                        id="password"
                        placeholder="••••••••"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-indigo-600 text-white font-bold py-3 rounded-full transition-all hover:scale-[1.02] shadow-xl shadow-indigo-500/25 mt-4 disabled:opacity-70 disabled:hover:scale-100"
            >
                {isLoading ? "Signing in..." : "Sign in"}
            </button>
        </form>
    );
}
