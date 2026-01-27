"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CreateSessionPage() {
    const router = useRouter();
    const [subject, setSubject] = useState("");
    const [examDate, setExamDate] = useState("");
    const [expiryTime, setExpiryTime] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (!subject) {
            setError("Subject is required.");
            setLoading(false);
            return;
        }
        if (!examDate) {
            setError("Exam Date is required. Please ensure both date and time are selected.");
            setLoading(false);
            return;
        }
        if (!expiryTime) {
            setError("Expiry Time is required. Please ensure both date and time are selected.");
            setLoading(false);
            return;
        }

        // Basic client-side validation for dates
        if (new Date(expiryTime) <= new Date(examDate)) {
            setError("Expiry time must be after the exam date.");
            setLoading(false);
            return;
        }

        try {
            const response = await api.post("/session/create", {
                subject,
                examDate: new Date(examDate).toISOString(),
                expiryTime: new Date(expiryTime).toISOString(),
            });

            const newSession = response.data;
            if (newSession && newSession.id) {
                router.push(`/sessions/${newSession.id}`);
            } else {
                setError("Failed to create session: Invalid response from server.");
            }
        } catch (err: any) {
            console.error("Create session error:", err);
            const errorMessage = err.response?.data?.error || "An unexpected error occurred.";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Create New Session</CardTitle>
                    <CardDescription>Start a new exam session</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit} noValidate>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="subject" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Subject</label>
                            <Input
                                id="subject"
                                placeholder="e.g. Mathematics Final"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="examDate" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Exam Date</label>
                            <Input
                                id="examDate"
                                type="datetime-local"
                                value={examDate}
                                onChange={(e) => setExamDate(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="expiryTime" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Expiry Time</label>
                            <Input
                                id="expiryTime"
                                type="datetime-local"
                                value={expiryTime}
                                onChange={(e) => setExpiryTime(e.target.value)}
                                min={examDate} // HTML5 min attribute as a hint
                                disabled={loading}
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                The session will automatically close at this time.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Creating..." : "Create Session"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
