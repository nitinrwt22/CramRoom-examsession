'use client'

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
    const activeSessions: Session[] = [
        {
            id: '1',
            subject: 'Calculus II Midterm',
            status: 'active',
            examDate: '2024-02-15',
            participants: 5,
        },
        {
            id: '2',
            subject: 'Biology Final Prep',
            status: 'active',
            examDate: '2024-02-20',
            participants: 8,
        },
        {
            id: '3',
            subject: 'European History',
            status: 'active',
            examDate: '2024-02-18',
            participants: 3,
        },
        {
            id: '4',
            subject: 'Chemistry Problem Sets',
            status: 'active',
            examDate: '2024-02-16',
            participants: 6,
        },
    ]

    const expiredSessions: Session[] = [
        {
            id: '5',
            subject: 'Organic Chemistry Exam',
            status: 'expired',
            examDate: '2024-01-20',
            participants: 7,
        },
        {
            id: '6',
            subject: 'Linear Algebra',
            status: 'expired',
            examDate: '2024-01-15',
            participants: 4,
        },
        {
            id: '7',
            subject: 'Physics Mechanics',
            status: 'expired',
            examDate: '2024-01-10',
            participants: 5,
        },
    ]

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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeSessions.map((session) => (
                            <SessionCard key={session.id} session={session} />
                        ))}
                    </div>
                </section>

                {/* Expired Sessions Section */}
                <section>
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-foreground">Expired Sessions</h2>
                        <p className="text-sm text-muted-foreground">Completed study sessions</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {expiredSessions.map((session) => (
                            <SessionCard key={session.id} session={session} />
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}
