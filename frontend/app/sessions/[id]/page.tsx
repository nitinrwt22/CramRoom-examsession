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
        // Wait for DOM to finish rendering messages before scrolling
        setTimeout(() => {
            historyEndRef.current?.scrollIntoView({ behavior: 'auto' })
        }, 100)
    }

    useEffect(() => {
        if (aiHistory.length > 0) {
            scrollToBottom()
        }
    }, [aiHistory.length, aiLoading])

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
                return <span className="text-green-400 flex items-center gap-1 text-xs"><TrendingDown className="w-3 h-3" /> Improving</span>
            case 'worsening':
                return <span className="text-red-400 flex items-center gap-1 text-xs"><TrendingUp className="w-3 h-3" /> Worsening</span>
            case 'stable':
                return <span className="text-yellow-400 flex items-center gap-1 text-xs"><Minus className="w-3 h-3" /> Stable</span>
            case 'insufficient_data':
            default:
                return <span className="text-gray-400 text-xs">Insufficient Data</span>
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
        )
    }

    if (error || !session) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-center justify-center text-white">
                <Card className="w-full max-w-md mx-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
                    <CardContent className="pt-6 text-center space-y-4">
                        <div className="text-red-400 font-medium">
                            {error || "Session not found"}
                        </div>
                        <Button onClick={() => router.push('/sessions')} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-none">
                            Back to Sessions
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 py-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold truncate max-w-[200px] md:max-w-md">{session.subject}</h1>
                    <p className="text-sm text-gray-400 mt-1">
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
            </header>

            {/* Main Content */}
            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-[1600px] mx-auto w-full flex-1">
                {/* Left Section: AI Chat */}
                <div className="lg:col-span-2">
                    {/* AI Assistant Section */}
                    <Card className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg flex flex-col h-[calc(100vh-250px)] lg:h-[800px] overflow-hidden">
                        <CardHeader className="border-b border-white/10 pb-3 bg-white/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles className="w-5 h-5 text-blue-400" />
                                        <CardTitle className="text-lg text-white">AI Session Assistant</CardTitle>
                                    </div>
                                    <CardDescription className="text-gray-400">
                                        Ask questions about shared materials or concepts.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSessionSummary}
                                        disabled={aiLoading}
                                        className="w-full sm:w-auto border-white/10 hover:bg-white/10 bg-transparent text-white"
                                    >
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Generate Session Summary
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRevisionPlan}
                                        disabled={aiLoading}
                                        className="w-full sm:w-auto border-white/10 hover:bg-white/10 bg-transparent text-white"
                                    >
                                        <FileText className="w-4 h-4 mr-2" />
                                        Get Revision Plan
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
                            {/* Chat History Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
                                {historyLoading ? (
                                    <div className="flex justify-center items-center h-48 text-gray-400">
                                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                        Loading history...
                                    </div>
                                ) : aiHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400 opacity-60">
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
                                                    <span className="text-[10px] text-gray-400 opacity-70">{formatTime(msg.createdAt)}</span>
                                                    <span className="text-xs text-gray-400 font-medium">You</span>
                                                </div>
                                                <div className="bg-blue-600/20 border border-blue-500/30 px-4 py-3 rounded-2xl rounded-tr-none text-white shadow-sm">
                                                    <p className="text-sm leading-relaxed">{msg.question}</p>
                                                </div>
                                            </div>

                                            {/* AI Answer */}
                                            <div className="flex flex-col items-start pr-12">
                                                <div className="flex items-center gap-2 mb-1 ml-1">
                                                    <span className="text-xs text-gray-400 font-medium">CramRoom AI</span>
                                                    <span className="text-[10px] text-gray-400 opacity-70">{formatTime(msg.createdAt)}</span>
                                                </div>
                                                <div className="bg-white/10 border border-white/10 text-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.answer}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* Loading State Bubble */}
                                {aiLoading && (
                                    <div className="flex flex-col items-start pr-12 animate-in fade-in slide-in-from-bottom-2">
                                        <span className="text-xs text-gray-400 mb-1 ml-1">CramRoom AI</span>
                                        <div className="bg-white/10 border border-white/10 text-white px-4 py-3 rounded-2xl rounded-tl-none inline-block">
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
                            <div className="p-4 bg-white/5 border-t border-white/10 mt-auto">
                                <div className="relative">
                                    <textarea
                                        className="w-full min-h-[50px] max-h-[150px] p-3 pr-24 rounded-lg border border-white/20 bg-black/20 text-white text-sm ring-offset-background placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-y"
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
                                            className="h-8 bg-blue-600 hover:bg-blue-700 text-white border-transparent"
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
                                    <p className="text-xs text-red-500 mt-2 ml-1">{aiError}</p>
                                )}
                                <p className="text-[10px] text-gray-500 mt-2 text-center">
                                    AI responses are generated based on uploaded session materials.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Section: Panels */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    {/* Weak Topics Section */}
                    <Card className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
                        <CardHeader className="pb-4 border-b border-white/10 bg-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg text-white">Weak Topics Detected</CardTitle>
                                    <CardDescription className="text-gray-400">Areas that may need more review</CardDescription>
                                </div>
                                <Button
                                    onClick={fetchWeakTopics}
                                    variant="outline"
                                    size="sm"
                                    disabled={weakTopicsLoading}
                                    className="gap-2 border-white/10 hover:bg-white/10 bg-transparent text-white"
                                >
                                    <Loader2 className={`w-4 h-4 ${weakTopicsLoading ? 'animate-spin' : ''}`} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {weakTopicsLoading ? (
                                <div className="flex justify-center items-center h-24 text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            ) : weakTopics.length === 0 ? (
                                <div className="text-center py-6 bg-white/5 rounded-lg border border-dashed border-white/20">
                                    <p className="text-sm text-gray-400">No significant weak topics detected yet.</p>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {weakTopics.map((topic, index) => (
                                        <div
                                            key={index}
                                            className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
                                        >
                                            <span>{topic.topic}</span>
                                            <span className="opacity-70 text-xs bg-red-500/20 px-1.5 py-0.5 rounded-md">{topic.frequency}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Topic Progress Section */}
                    <Card className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
                        <CardHeader className="pb-4 border-b border-white/10 bg-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg text-white">Topic Progress</CardTitle>
                                    <CardDescription className="text-gray-400">Track your weak area improvements</CardDescription>
                                </div>
                                <Button
                                    onClick={fetchProgress}
                                    variant="outline"
                                    size="sm"
                                    disabled={progressLoading}
                                    className="gap-2 border-white/10 hover:bg-white/10 bg-transparent text-white"
                                >
                                    <Loader2 className={`w-4 h-4 ${progressLoading ? 'animate-spin' : ''}`} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {progressLoading ? (
                                <div className="flex justify-center items-center h-24 text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            ) : progress.length === 0 ? (
                                <div className="text-center py-6 bg-white/5 rounded-lg border border-dashed border-white/20">
                                    <p className="text-sm text-gray-400">No progress data available yet.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {progress.map((item, index) => (
                                        <div
                                            key={index}
                                            className="bg-white/5 border border-white/10 p-4 rounded-lg flex flex-col gap-2"
                                        >
                                            <div className="flex items-start justify-between">
                                                <span className="font-medium text-white">{item.topic}</span>
                                                {renderTrend(item.trend)}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm mt-1">
                                                <div>
                                                    <span className="text-gray-400 text-xs block mb-0.5">Current</span>
                                                    <span className="font-bold text-white">{item.currentScore}</span>
                                                </div>
                                                {item.previousScore !== undefined && item.previousScore !== null && (
                                                    <div>
                                                        <span className="text-gray-400 text-xs block mb-0.5">Previous</span>
                                                        <span className="text-gray-400">{item.previousScore}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Shared Files Section */}
                    <Card className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
                        <CardHeader className="pb-4 border-b border-white/10 bg-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg text-white">Shared Files</CardTitle>
                                    <CardDescription className="text-gray-400">All study materials</CardDescription>
                                </div>
                                <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white border-transparent" size="sm">
                                    <Plus className="w-4 h-4" />
                                    Upload
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {files.length === 0 ? (
                                <div className="text-center py-8 bg-white/5 rounded-lg border border-dashed border-white/20">
                                    <FileText className="w-8 h-8 mx-auto text-gray-500 mb-3" />
                                    <p className="text-sm text-gray-400">No files uploaded yet</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 overflow-y-auto max-h-[300px] pr-2">
                                    {files.map((file) => (
                                        <div key={file.id} className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-blue-500/20 rounded text-blue-400 mt-1">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                                                    <p className="text-xs text-gray-400 mt-1">By {file.uploadedBy}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-white/10">
                                                <span className="text-xs text-gray-400">
                                                    {formatDate(file.uploadDate)} • {file.size}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDownloadFile(file.id, file.name)}
                                                        className="h-7 w-7 text-gray-400 hover:text-white"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteFile(file.id)}
                                                        className="h-7 w-7 text-gray-400 hover:text-red-400"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

            {/* Bottom Content: Live Chat Placeholder */}
            <div className="px-6 pb-6 max-w-[1600px] mx-auto w-full">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center text-gray-400 shadow-lg">
                    💬 Live Session Chat (Coming Soon)
                </div>
            </div>

            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleUploadFile}
            />
        </div>
    )
}
