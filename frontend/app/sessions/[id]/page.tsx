'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal } from '@/components/file-upload-modal'
import { Download, Trash2, Plus, FileText, Loader2, LogOut, Send, Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import api from '@/lib/axios'

interface SessionFile {
    id: string
    name: string
    uploadDate: string
    size: string
    uploadedBy: string
}

interface BackendFile {
    id: string
    original_name: string
    created_at: string
    uploaded_by: string
    size: string
}

interface Session {
    id: string
    subject: string
    status: 'active' | 'expired'
    exam_date: string
    expiry_time: string
    role: 'host' | 'participant'
}

interface AIMessage {
    id?: number
    question: string
    answer: string
    createdAt: string
    confidence?: number
}


interface ProgressItem {
    topic: string
    currentScore: number
    previousScore?: number
    trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data'
}

export default function SessionDetailPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const [session, setSession] = useState<Session | null>(null)
    const [files, setFiles] = useState<SessionFile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [leaving, setLeaving] = useState(false)

    // AI State
    const [question, setQuestion] = useState('')
    const [aiHistory, setAiHistory] = useState<AIMessage[]>([])
    const [historyLoading, setHistoryLoading] = useState(true)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    // Weak Topics State
    const [weakTopics, setWeakTopics] = useState<{ topic: string; frequency: number }[]>([])
    const [weakTopicsLoading, setWeakTopicsLoading] = useState(true)

    // Topic Progress State
    const [progress, setProgress] = useState<ProgressItem[]>([])
    const [progressLoading, setProgressLoading] = useState(true)

    // Ref for auto-scrolling
    const historyEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [aiHistory, aiLoading])

    const fetchFiles = async () => {
        try {
            const filesResponse = await api.get(`/session/${params.id}/files`)
            const mappedFiles: SessionFile[] = filesResponse.data.map((file: BackendFile) => ({
                id: file.id,
                name: file.original_name,
                uploadDate: file.created_at,
                size: (parseInt(file.size) / 1024 / 1024).toFixed(1) + ' MB',
                uploadedBy: 'User ' + file.uploaded_by,
            }))
            setFiles(mappedFiles)
        } catch (fileErr) {
            console.error('Error fetching files:', fileErr)
        }
    }

    const fetchAIHistory = async () => {
        try {
            const response = await api.get(`/api/sessions/${params.id}/ai/history`)
            setAiHistory(response.data)
        } catch (err) {
            console.error('Error fetching AI history:', err)
            // Don't show critical error for this, just log it
        } finally {
            setHistoryLoading(false)
        }
    }

    const fetchWeakTopics = async () => {
        setWeakTopicsLoading(true)
        try {
            const response = await api.get(`/api/sessions/${params.id}/ai/weak-topics`)
            setWeakTopics(response.data.weakTopics || [])
        } catch (err) {
            console.error('Error fetching weak topics:', err)
        } finally {
            setWeakTopicsLoading(false)
        }
    }

    const fetchProgress = async () => {
        setProgressLoading(true)
        try {
            const response = await api.get(`/api/sessions/${params.id}/ai/progress`)
            const data = response.data
            setProgress(Array.isArray(data) ? data : (data?.progress || []))
        } catch (err) {
            console.error('Error fetching progress:', err)
        } finally {
            setProgressLoading(false)
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Validate ID format before making request
                if (!params.id || isNaN(parseInt(params.id))) {
                    setError('Invalid session ID')
                    return
                }

                // Fetch session details
                const sessionResponse = await api.get(`/session/${params.id}`)
                setSession(sessionResponse.data)

                // Fetch session files
                await fetchFiles()

                // Fetch AI history
                await fetchAIHistory()

                // Fetch weak topics
                await fetchWeakTopics()

                // Fetch progress
                await fetchProgress()
            } catch (err) {
                console.error('Error fetching session:', err)
                setError('Failed to load session details')
                router.push('/sessions')
            } finally {
                setLoading(false)
            }
        }

        if (params.id) {
            fetchData()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id, router])

    const handleUploadFile = async (file: File) => {
        if (!session || session.status === 'expired') return

        const formData = new FormData()
        formData.append('file', file)

        try {
            await api.post(`/session/${params.id}/files`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
            // Refresh file list
            await fetchFiles()
            setIsUploadModalOpen(false)
        } catch (error) {
            console.error('Error uploading file:', error)
            alert('Failed to upload file. Please try again.')
        }
    }

    const handleDownloadFile = async (fileId: string, fileName: string) => {
        try {
            const response = await api.get(`/session/files/${fileId}/download`, {
                responseType: 'blob',
            })

            const url = window.URL.createObjectURL(new Blob([response.data]))
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', fileName)
            document.body.appendChild(link)
            link.click()

            link.parentNode?.removeChild(link)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error downloading file:', error)
            alert('Failed to download file. Please try again.')
        }
    }

    const handleDeleteFile = (fileId: string) => {
        setFiles(files.filter((f) => f.id !== fileId))
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    const handleLeaveSession = async () => {
        if (!confirm("Are you sure you want to leave this session?")) return;

        setLeaving(true);
        try {
            await api.post('/session/leave', { sessionId: parseInt(params.id) });
            router.push('/sessions');
        } catch (error) {
            console.error('Error leaving session:', error);
            alert('Failed to leave session. Please try again.');
            setLeaving(false);
        }
    };

    const handleRevisionPlan = async () => {
        if (aiLoading) return

        setAiLoading(true)
        setAiError(null)

        try {
            const response = await api.post(`/api/sessions/${params.id}/ai/query`, {
                intent: 'revision_guidance',
                question: 'Generate Revision Plan' // Backend requires a non-empty question
            })

            const newMessage: AIMessage = {
                question: "Get Revision Plan",
                answer: response.data.answer,
                confidence: response.data.confidence,
                createdAt: new Date().toISOString()
            }

            setAiHistory(prev => [...prev, newMessage])
        } catch (err) {
            console.error('Error getting revision plan:', err)
            const axiosErr = err as { response?: { data?: { message?: string } } }
            setAiError(axiosErr.response?.data?.message || 'Failed to get revision plan')
        } finally {
            setAiLoading(false)
        }
    }

    const handleSessionSummary = async () => {
        if (aiLoading) return

        setAiLoading(true)
        setAiError(null)

        try {
            const response = await api.post(`/api/sessions/${params.id}/ai/query`, {
                intent: 'session_summary',
                question: '' // Backend intent handles generic summary
            })

            const newMessage: AIMessage = {
                question: "Generate Session Summary",
                answer: response.data.answer,
                confidence: response.data.confidence,
                createdAt: new Date().toISOString()
            }

            setAiHistory(prev => [...prev, newMessage])
        } catch (err) {
            console.error('Error generating session summary:', err)
            const axiosErr = err as { response?: { data?: { message?: string } } }
            setAiError(axiosErr.response?.data?.message || 'Failed to generate session summary')
        } finally {
            setAiLoading(false)
        }
    }

    const handleAskAI = async () => {
        if (!question.trim()) return

        setAiLoading(true)
        setAiError(null)

        try {
            const response = await api.post(`/api/sessions/${params.id}/ai/query`, {
                intent: 'concept_clarification',
                question: question
            })

            const newMessage: AIMessage = {
                question: question,
                answer: response.data.answer,
                confidence: response.data.confidence,
                createdAt: new Date().toISOString()
            }

            setAiHistory(prev => [...prev, newMessage])
            setQuestion('')
        } catch (err) {
            console.error('Error asking AI:', err)
            const axiosErr = err as { response?: { data?: { message?: string } } }
            setAiError(axiosErr.response?.data?.message || 'Failed to get AI response')
        } finally {
            setAiLoading(false)
        }
    }

    const renderTrend = (trend: string) => {
        switch (trend) {
            case 'improving':
                return <span className="text-green-500 flex items-center gap-1 text-xs"><TrendingDown className="w-3 h-3" /> Improving</span>
            case 'worsening':
                return <span className="text-red-500 flex items-center gap-1 text-xs"><TrendingUp className="w-3 h-3" /> Worsening</span>
            case 'stable':
                return <span className="text-yellow-500 flex items-center gap-1 text-xs"><Minus className="w-3 h-3" /> Stable</span>
            case 'insufficient_data':
            default:
                return <span className="text-muted-foreground text-xs">Insufficient Data</span>
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || !session) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Card className="w-full max-w-md mx-4">
                    <CardContent className="pt-6 text-center space-y-4">
                        <div className="text-red-500 font-medium">
                            {error || "Session not found"}
                        </div>
                        <Button onClick={() => router.push('/sessions')} variant="secondary">
                            Back to Sessions
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card sticky top-0 z-10 transition-shadow shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate max-w-[200px] md:max-w-md">{session.subject}</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Study session • Exam: {session.exam_date ? formatDate(session.exam_date) : 'TBD'}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleLeaveSession}
                                disabled={leaving}
                                className="gap-2"
                            >
                                {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                                <span className="hidden sm:inline">{leaving ? 'Leaving...' : 'Leave Session'}</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                {/* Shared Files Section */}
                <Card className="border border-border shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Shared Files</CardTitle>
                                <CardDescription>All study materials for this session</CardDescription>
                            </div>
                            <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2" size="sm">
                                <Plus className="w-4 h-4" />
                                Upload File
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {files.length === 0 ? (
                            <div className="text-center py-12 bg-secondary/10 rounded-lg border border-dashed border-border">
                                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                                <p className="text-sm text-muted-foreground">No files uploaded yet</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-border">
                                {/* Desktop Table View */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-secondary/50 border-b border-border">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    File Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Uploaded By
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Date
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Size
                                                </th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border bg-card">
                                            {files.map((file) => (
                                                <tr key={file.id} className="hover:bg-secondary/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-primary/10 rounded text-primary">
                                                                <FileText className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                                                                {file.name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-muted-foreground">{file.uploadedBy}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-muted-foreground">{formatDate(file.uploadDate)}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-muted-foreground font-mono">{file.size}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDownloadFile(file.id, file.name)}
                                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteFile(file.id)}
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Card View */}
                                <div className="md:hidden divide-y divide-border bg-card">
                                    {files.map((file) => (
                                        <div key={file.id} className="p-4 space-y-3 hover:bg-secondary/30 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-primary/10 rounded text-primary mt-1">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">By {file.uploadedBy}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(file.uploadDate)} • {file.size}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDownloadFile(file.id, file.name)}
                                                        className="h-8 w-8"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteFile(file.id)}
                                                        className="h-8 w-8 text-destructive"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Weak Topics Section */}
                <Card className="border border-border shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Weak Topics Detected</CardTitle>
                                <CardDescription>Areas that may need more review</CardDescription>
                            </div>
                            <Button
                                onClick={fetchWeakTopics}
                                variant="outline"
                                size="sm"
                                disabled={weakTopicsLoading}
                                className="gap-2"
                            >
                                <Loader2 className={`w-4 h-4 ${weakTopicsLoading ? 'animate-spin' : ''}`} />
                                Refresh Analysis
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {weakTopicsLoading ? (
                            <div className="flex justify-center items-center h-24 text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : weakTopics.length === 0 ? (
                            <div className="text-center py-6 bg-secondary/10 rounded-lg border border-dashed border-border">
                                <p className="text-sm text-muted-foreground">No significant weak topics detected yet.</p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-3">
                                {weakTopics.map((topic, index) => (
                                    <div
                                        key={index}
                                        className="bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                                    >
                                        <span>{topic.topic}</span>
                                        <span className="opacity-70 text-xs">({topic.frequency} mentions)</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Topic Progress Section */}
                <Card className="border border-border shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Topic Progress</CardTitle>
                                <CardDescription>Track your weak area improvements</CardDescription>
                            </div>
                            <Button
                                onClick={fetchProgress}
                                variant="outline"
                                size="sm"
                                disabled={progressLoading}
                                className="gap-2"
                            >
                                <Loader2 className={`w-4 h-4 ${progressLoading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {progressLoading ? (
                            <div className="flex justify-center items-center h-24 text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : progress.length === 0 ? (
                            <div className="text-center py-6 bg-secondary/10 rounded-lg border border-dashed border-border">
                                <p className="text-sm text-muted-foreground">No progress data available yet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {progress.map((item, index) => (
                                    <div
                                        key={index}
                                        className="bg-card border border-border p-4 rounded-lg shadow-sm flex flex-col gap-2"
                                    >
                                        <div className="flex items-start justify-between">
                                            <span className="font-medium text-foreground">{item.topic}</span>
                                            {renderTrend(item.trend)}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm mt-1">
                                            <div>
                                                <span className="text-muted-foreground text-xs block mb-0.5">Current</span>
                                                <span className="font-bold">{item.currentScore}</span>
                                            </div>
                                            {item.previousScore !== undefined && item.previousScore !== null && (
                                                <div>
                                                    <span className="text-muted-foreground text-xs block mb-0.5">Previous</span>
                                                    <span className="text-muted-foreground">{item.previousScore}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* AI Assistant Section */}
                <Card className="border border-border shadow-sm flex flex-col">
                    <CardHeader className="border-b border-border bg-muted/20 pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                    <CardTitle className="text-lg">AI Session Assistant</CardTitle>
                                </div>
                                <CardDescription>
                                    Ask questions about shared materials or concepts.
                                </CardDescription>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSessionSummary}
                                    disabled={aiLoading}
                                    className="w-full sm:w-auto"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Generate Session Summary
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRevisionPlan}
                                    disabled={aiLoading}
                                    className="w-full sm:w-auto"
                                >
                                    <FileText className="w-4 h-4 mr-2" />
                                    Get Revision Plan
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        {/* Chat History Area */}
                        <div className="max-h-96 overflow-y-auto p-4 space-y-6 scroll-smooth bg-background">
                            {historyLoading ? (
                                <div className="flex justify-center items-center h-48 text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                    Loading history...
                                </div>
                            ) : aiHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground opacity-60">
                                    <Sparkles className="w-12 h-12 mb-4" />
                                    <p>No questions yet.</p>
                                    <p className="text-sm">Start the conversation by asking about the session.</p>
                                </div>
                            ) : (
                                aiHistory.map((msg, idx) => (
                                    <div key={idx} className="flex flex-col space-y-4">
                                        {/* User Question */}
                                        <div className="flex flex-col items-end pl-12">
                                            <div className="flex items-center gap-2 mb-1 mr-1">
                                                <span className="text-[10px] text-muted-foreground opacity-70">{formatTime(msg.createdAt)}</span>
                                                <span className="text-xs text-muted-foreground font-medium">You</span>
                                            </div>
                                            <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-2xl rounded-tr-none text-foreground shadow-sm">
                                                <p className="text-sm leading-relaxed">{msg.question}</p>
                                            </div>
                                        </div>

                                        {/* AI Answer */}
                                        <div className="flex flex-col items-start pr-12">
                                            <div className="flex items-center gap-2 mb-1 ml-1">
                                                <span className="text-xs text-muted-foreground font-medium">CramRoom AI</span>
                                                <span className="text-[10px] text-muted-foreground opacity-70">{formatTime(msg.createdAt)}</span>
                                            </div>
                                            <div className="bg-gray-800 text-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.answer}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Loading State Bubble */}
                            {aiLoading && (
                                <div className="flex flex-col items-start pr-12 animate-in fade-in slide-in-from-bottom-2">
                                    <span className="text-xs text-muted-foreground mb-1 ml-1">CramRoom AI</span>
                                    <div className="bg-gray-800 text-white px-4 py-3 rounded-2xl rounded-tl-none inline-block">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="text-sm">Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={historyEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-background border-t border-border">
                            <div className="relative">
                                <textarea
                                    className="w-full min-h-[50px] max-h-[150px] p-3 pr-24 rounded-lg border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                    placeholder="Ask a question..."
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAskAI();
                                        }
                                    }}
                                    disabled={aiLoading}
                                />
                                <div className="absolute right-2 bottom-2">
                                    <Button
                                        size="sm"
                                        onClick={handleAskAI}
                                        disabled={!question.trim() || aiLoading}
                                        className="h-8"
                                    >
                                        {aiLoading ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin mr-2" />
                                                Thinking...
                                            </>
                                        ) : (
                                            <>
                                                Ask AI <Send className="w-3 h-3 ml-2" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            {aiError && (
                                <p className="text-xs text-destructive mt-2 ml-1">{aiError}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-2 text-center">
                                AI responses are generated based on uploaded session materials.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </main>

            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleUploadFile}
            />
        </div>
    )
}
