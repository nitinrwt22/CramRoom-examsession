'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'
import api from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Clock, CheckCircle2, ArrowRight } from 'lucide-react'

interface Session {
    id: string
    subject: string
    status: 'active' | 'expired'
    examDate: string
    participants: number
}

export default function SessionsPage() {
    const router = useRouter()
    const [sessions, setSessions] = useState<Session[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isLoggedIn()) {
            router.push('/login')
            return
        }

        const fetchSessions = async () => {
            try {
                setLoading(true)
                const response = await api.get('/session/my')
                // Map backend response components to frontend Session interface if needed
                // Backend returns: id, subject, status, exam_date, participants, role
                const mappedSessions = response.data.map((s: any) => ({
                    id: s.id.toString(),
                    subject: s.subject,
                    status: s.status,
                    examDate: s.exam_date,
                    participants: s.participants || 0
                }))
                setSessions(mappedSessions)
                setError(null)
            } catch (err) {
                console.error("Failed to fetch sessions:", err)
                setError("Failed to load sessions")
            } finally {
                setLoading(false)
            }
        }

        fetchSessions()
    }, [router])

    const activeSessions = sessions.filter(s => s.status === 'active')
    const expiredSessions = sessions.filter(s => s.status === 'expired')

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const SessionCard = ({ session }: { session: Session }) => (
        <Card className="border border-border hover:shadow-md transition-shadow group">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-foreground text-pretty">{session.subject}</h3>
                            <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${session.status === 'active'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                    }`}
                            >
                                {session.status === 'active' ? (
                                    <>
                                        <Clock className="w-3 h-3 mr-1" />
                                        Active
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Expired
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>📅 {formatDate(session.examDate)}</span>
                            <span>👥 {session.participants} studying</span>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground">Loading sessions...</p>
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

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">My Sessions</h1>
                            <p className="text-sm text-muted-foreground mt-1">Manage your study groups</p>
                        </div>
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            New Session
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Active Sessions Section */}
                <section className="mb-10">
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-foreground">Active Sessions</h2>
                        <p className="text-sm text-muted-foreground">Ongoing study sessions</p>
                    </div>
                    {activeSessions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeSessions.map((session) => (
                                <SessionCard key={session.id} session={session} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                            <p>No active sessions found.</p>
                        </div>
                    )}
                </section>

                {/* Expired Sessions Section */}
                <section>
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-foreground">Expired Sessions</h2>
                        <p className="text-sm text-muted-foreground">Completed study sessions</p>
                    </div>
                    {expiredSessions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {expiredSessions.map((session) => (
                                <SessionCard key={session.id} session={session} />
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                            <p>No expired sessions yet.</p>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
