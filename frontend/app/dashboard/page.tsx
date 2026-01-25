'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'
import api from '@/lib/axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Clock, FileUp } from 'lucide-react'

interface DashboardStats {
    participantActive: number;
    participantExpired: number;
    hostedSessions: number;
    uploadedFiles: number;
}

export default function DashboardPage() {
    const router = useRouter()
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isLoggedIn()) {
            router.push('/login')
            return
        }

        const fetchDashboardData = async () => {
            try {
                setLoading(true)
                const response = await api.get('/dashboard')
                setStats(response.data)
                setError(null)
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err)
                setError("Failed to load dashboard data. Please try again later.")
            } finally {
                setLoading(false)
            }
        }

        fetchDashboardData()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground">Loading dashboard...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center p-6 max-w-sm mx-auto">
                    <p className="text-red-500 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    const sessionsJoined = (stats?.participantActive || 0) + (stats?.participantExpired || 0);
    const totalSessions = sessionsJoined + (stats?.hostedSessions || 0);

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                            <p className="text-sm text-muted-foreground mt-1">Welcome back to your study hub</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Summary Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Active Sessions Card */}
                    <Card className="border border-border hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Active Sessions</CardTitle>
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Clock className="w-5 h-5 text-primary" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-foreground">{stats?.participantActive ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-2">Study sessions in progress</p>
                        </CardContent>
                    </Card>

                    {/* Expired Sessions Card */}
                    <Card className="border border-border hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Expired Sessions</CardTitle>
                                <div className="p-2 rounded-lg bg-accent/10">
                                    <BookOpen className="w-5 h-5 text-accent" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-foreground">{stats?.participantExpired ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-2">Completed study sessions</p>
                        </CardContent>
                    </Card>

                    {/* Files Uploaded Card */}
                    <Card className="border border-border hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Files Uploaded</CardTitle>
                                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                                    <FileUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-foreground">{stats?.uploadedFiles ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-2">Study materials shared</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Activity Section */}
                <div className="mt-8">
                    <Card className="border border-border">
                        <CardHeader>
                            <CardTitle className="text-lg">Quick Stats</CardTitle>
                            <CardDescription>Your studying overview</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-foreground">Total Sessions</span>
                                    <span className="font-semibold text-primary">{totalSessions}</span>
                                </div>
                                <div className="h-px bg-border"></div>
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-foreground">Sessions Hosted</span>
                                    <span className="font-semibold text-primary">{stats?.hostedSessions ?? 0}</span>
                                </div>
                                <div className="h-px bg-border"></div>
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-foreground">Sessions Joined</span>
                                    <span className="font-semibold text-primary">{sessionsJoined}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
