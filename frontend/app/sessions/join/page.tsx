"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function JoinSessionPage() {
    const router = useRouter();
    const [sessionId, setSessionId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (!sessionId) {
            setError("Session ID is required.");
            setLoading(false);
            return;
        }

        // Ensure session ID is a number
        const parsedSessionId = parseInt(sessionId);
        if (isNaN(parsedSessionId)) {
            setError("Session ID must be a number.");
            setLoading(false);
            return;
        }

        try {
            const response = await api.post("/session/join", {
                sessionId: parsedSessionId
            });

            const result = response.data;
            if (result && result.sessionId) {
                router.push(`/sessions/${result.sessionId}`);
            } else {
                // Fallback if backend response format changes, though currently returns { sessionId, ... }
                // If we joined successfully but didn't get ID back (unlikely based on contract), 
                // we might try redirecting to the one we entered.
                router.push(`/sessions/${parsedSessionId}`);
            }
        } catch (err: any) {
            // If user is already a member (409), just redirect them to the session
            // We handle this silently without logging an error
            if (err.response && err.response.status === 409) {
                router.push(`/sessions/${parsedSessionId}`);
                return;
            }

            if (err.response && err.response.status >= 400 && err.response.status < 500) {
                // It's an expected client error (like 404 Not Found), don't trigger Next.js error overlay
                console.warn("Join session failed:", err.response.data?.error || err.message);
            } else {
                console.error("Join session error:", err);
            }

            const errorMessage = err.response?.data?.error || "Failed to join session. Please check the ID and try again.";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Join Session</CardTitle>
                    <CardDescription>Enter a Session ID to join an exam.</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit} noValidate>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="sessionId" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Session ID</label>
                            <Input
                                id="sessionId"
                                placeholder="e.g. 123"
                                value={sessionId}
                                onChange={(e) => setSessionId(e.target.value)}
                                disabled={loading}
                                type="number"
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Joining..." : "Join Session"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
