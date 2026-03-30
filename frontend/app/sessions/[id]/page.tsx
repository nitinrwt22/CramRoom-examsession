'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal } from '@/components/file-upload-modal'
import { KnowledgeUploadModal, KnowledgeContentType } from '@/components/session/KnowledgeUploadModal'
import { KnowledgeFileList } from '@/components/session/KnowledgeFileList'
import { InvitePeerModal } from '@/components/session/InvitePeerModal'
import { KnowledgeFile } from '@/components/session/KnowledgeFileItem'
import { 
    Download, Trash2, Plus, FileText, Loader2, LogOut, Send, Sparkles, 
    TrendingDown, TrendingUp, Minus, Upload, RefreshCw, AlertTriangle, 
    Zap, Link2, BookOpen, BarChart2, Folder, MessageSquare, Settings, 
    UserPlus, Users, ChevronRight, CornerDownRight 
} from 'lucide-react'
import ExamCountdown from '@/components/session/ExamCountdown'
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
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const [activeView, setActiveView] = useState<'assistant' | 'expected' | 'topics' | 'progress' | 'files' | 'chat'>('assistant')

    // Knowledge files state
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([])
    const [knowledgeLoading, setKnowledgeLoading] = useState(true)
    const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false)
    const [knowledgeModalDefaultType, setKnowledgeModalDefaultType] = useState<KnowledgeContentType>('notes')

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

    // Expected Questions State
    const [expectedQuestions, setExpectedQuestions] = useState<any[]>([])
    const [expectedLoading, setExpectedLoading] = useState(true)
    const [pyqAnswers, setPyqAnswers] = useState<Record<string, {loading: boolean, answer: string | null}>>({})

    const handleGeneratePyqAnswer = async (q: any) => {
        if (pyqAnswers[q.id]?.answer || pyqAnswers[q.id]?.loading) return; 
        
        setPyqAnswers(prev => ({ ...prev, [q.id]: { loading: true, answer: null } }));
        
        try {
            const payload = {
                intent: 'pyq_answer_generation',
                question: JSON.stringify({ questionText: q.question_text, marks: q.marks })
            };
            const response = await api.post(`/api/sessions/${params.id}/ai/query`, payload);
            setPyqAnswers(prev => ({ ...prev, [q.id]: { loading: false, answer: response.data.answer } }));
        } catch (err) {
            console.error(err);
            setPyqAnswers(prev => ({ ...prev, [q.id]: { loading: false, answer: 'Failed to generate answer. Please try again.' } }));
        }
    }

    // Ref for auto-scrolling
    const historyEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
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

    const fetchKnowledgeFiles = async () => {
        setKnowledgeLoading(true)
        try {
            const res = await api.get(`/session/${params.id}/knowledge`)
            setKnowledgeFiles(res.data)
        } catch (err) {
            console.error('Error fetching knowledge files:', err)
        } finally {
            setKnowledgeLoading(false)
        }
    }

    const fetchAIHistory = async () => {
        try {
            const response = await api.get(`/api/sessions/${params.id}/ai/history`)
            setAiHistory(response.data)
        } catch (err) {
            console.error('Error fetching AI history:', err)
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

    const fetchExpectedQuestions = async () => {
        setExpectedLoading(true)
        try {
            const response = await api.get(`/api/sessions/${params.id}/ai/expected-questions`)
            setExpectedQuestions(response.data.expectedQuestions || [])
        } catch (err) {
            console.error('Error fetching expected questions:', err)
        } finally {
            setExpectedLoading(false)
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (!params.id || isNaN(parseInt(params.id))) {
                    setError('Invalid session ID')
                    return
                }

                const sessionResponse = await api.get(`/session/${params.id}`)
                setSession(sessionResponse.data)

                await fetchFiles()
                await fetchAIHistory()
                await fetchWeakTopics()
                await fetchProgress()
                await fetchKnowledgeFiles()
                await fetchExpectedQuestions()
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
                headers: { 'Content-Type': 'multipart/form-data' },
            })
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

    const handleKnowledgeUpload = async (file: File, contentType: KnowledgeContentType) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('contentType', contentType)
        try {
            await api.post(`/session/${params.id}/knowledge`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            await fetchKnowledgeFiles()
            
            if (contentType === 'pyqs') {
                await fetchExpectedQuestions()
            }
        } catch (error) {
            console.error('Error uploading knowledge file:', error)
            alert('Failed to upload knowledge file. Please try again.')
        }
    }

    const handleKnowledgeDelete = async (fileId: number) => {
        if (!confirm('Remove this knowledge file from the session?')) return
        try {
            await api.delete(`/session/${params.id}/knowledge/${fileId}`)
            setKnowledgeFiles(prev => prev.filter(f => f.id !== fileId))
        } catch (err) {
            console.error('Error deleting knowledge file:', err)
            alert('Failed to delete. Please try again.')
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
    }

    const handleLogout = () => {
        localStorage.removeItem("token");
        router.push("/");
    };

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

    // Helper to calculate days left
    const getDaysLeft = (dateString: string) => {
        const examTime = new Date(dateString).getTime()
        const now = new Date().getTime()
        const diffDays = Math.ceil((examTime - now) / (1000 * 60 * 60 * 24))
        if (diffDays < 0) return 'Passed'
        if (diffDays === 0) return 'Today'
        return `${diffDays} days left`
    }

    const renderTrendIcon = (trend: string) => {
        switch (trend) {
            case 'improving': return <TrendingUp className="w-3 h-3 text-green-500" />
            case 'worsening': return <TrendingDown className="w-3 h-3 text-red-500" />
            default: return <Minus className="w-3 h-3 text-gray-400" />
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#111111] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-500" />
            </div>
        )
    }

    if (error || !session) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#111111] flex items-center justify-center text-gray-900 dark:text-white">
                <Card className="w-full max-w-md mx-4 bg-white/80 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl shadow-lg">
                    <CardContent className="pt-6 text-center space-y-4">
                        <div className="text-red-500 font-medium">
                            {error || "Session not found"}
                        </div>
                        <Button onClick={() => router.push('/sessions')} variant="secondary" className="bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-900 dark:text-white border-none">
                            Back to Sessions
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const mainTopics = progress.slice(0, 4)

    return (
        <div className="h-screen overflow-hidden bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100 flex flex-col font-sans transition-colors duration-300">
            {/* TOP NAVBAR */}
            <header className="h-[80px] border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-6 bg-white/80 dark:bg-black/50 backdrop-blur-md shrink-0 z-20">
                <div className="flex items-center gap-8">
                    <h1 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <span className="font-extrabold tracking-tight">CramRoom</span> Workspace
                    </h1>
                    <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-500 dark:text-gray-400">
                        <span className="hover:text-amber-600 dark:hover:text-blue-400 cursor-pointer">DASHBOARD</span>
                        <span className="text-amber-700 dark:text-blue-500 border-b-2 border-amber-600 dark:border-blue-500 pb-[21px] mt-px">LIBRARY</span>
                        <span className="hover:text-amber-600 dark:hover:text-blue-400 cursor-pointer">SCHEDULE</span>
                    </nav>
                </div>

                <div className="flex items-center gap-6">
                    {/* Exam countdown */}
                    {session.exam_date && (
                        <div className="hidden sm:flex mr-6">
                            <ExamCountdown targetDate={session.exam_date} />
                        </div>
                    )}
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleLeaveSession}
                        disabled={leaving}
                        className="bg-red-600 hover:bg-red-700 text-white border-transparent font-medium rounded-md px-4"
                    >
                        {leaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Leave Session
                    </Button>
                    <Settings className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer" />
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <div className="flex flex-1 overflow-hidden h-[calc(100vh-80px)]">
                
                {/* LEFT SIDEBAR */}
                <aside className="w-64 border-r border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#161618] shrink-0 hidden lg:flex flex-col justify-between p-4 z-10">
                    <div className="space-y-6">
                        {/* Active Session Info */}
                        <div className="flex items-start gap-3 mb-8 px-2 mt-2">
                            <div className="bg-blue-600 p-2 rounded-lg text-white">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold truncate text-gray-900 dark:text-white">{session.subject}</h3>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Active Session</span>
                                </div>
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="space-y-1">
                            {([
                                { id: 'assistant', label: 'Assistant', icon: <Sparkles className="w-4 h-4" /> },
                                { id: 'expected',  label: 'PYQ Predictions', icon: <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" /> },
                                { id: 'topics',    label: 'Topics',    icon: <BarChart2 className="w-4 h-4" /> },
                                { id: 'progress',  label: 'Progress',  icon: <TrendingUp className="w-4 h-4" /> },
                                { id: 'files',     label: 'Files',     icon: <Folder className="w-4 h-4" /> },
                                { id: 'chat',      label: 'Live Chat', icon: <MessageSquare className="w-4 h-4" /> },
                            ] as const).map(({ id, label, icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveView(id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                        activeView === id
                                            ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <span className={activeView === id ? 'text-blue-600 dark:text-blue-400' : ''}>{icon}</span>
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="space-y-2 mb-2">
                        <button
                            onClick={() => setIsInviteModalOpen(true)}
                            className="w-full bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-gray-200 font-semibold text-xs h-10 rounded-lg tracking-wider flex items-center justify-center gap-2 transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            INVITE PEER
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors">
                            <Settings className="w-4 h-4" />
                            Settings
                        </button>
                        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500/80 hover:text-red-600 dark:hover:text-red-400 text-sm transition-colors opacity-80 hover:opacity-100">
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </aside>

                {/* MIDDLE: MAIN PANEL */}
                <main className="flex-1 flex flex-col bg-white dark:bg-[#141416] min-h-0">

                    {/* ── ASSISTANT VIEW ── */}
                    {activeView === 'assistant' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8 scroll-smooth pb-6">
                                {historyLoading ? (
                                    <div className="flex justify-center items-center h-full text-gray-400">
                                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                        Loading history...
                                    </div>
                                ) : aiHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 opacity-60 mt-20">
                                        <Sparkles className="w-12 h-12 mb-4 text-blue-500" />
                                        <p>No questions yet.</p>
                                        <p className="text-sm">Start the conversation by asking about the session.</p>
                                    </div>
                                ) : (
                                    aiHistory.map((msg, idx) => (
                                        <div key={idx} className="flex flex-col space-y-6 max-w-3xl mx-auto w-full">
                                            <div className="flex flex-col items-end pl-12">
                                                <div className="bg-blue-600 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-md text-[15px] leading-relaxed relative self-end max-w-[85%]">
                                                    {msg.question}
                                                </div>
                                                <span className="text-[10px] text-gray-400 mt-1.5 mr-1 font-medium">{formatTime(msg.createdAt)}</span>
                                            </div>
                                            <div className="flex flex-col items-start pr-12">
                                                <div className="flex items-center gap-3 mb-2 ml-1">
                                                    <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white p-1.5 shrink-0 shadow-sm">
                                                        <Sparkles className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">CramRoom AI</span>
                                                        <span className="text-[10px] text-gray-500 ml-2 font-medium">{formatTime(msg.createdAt)}</span>
                                                    </div>
                                                </div>
                                                <div className="bg-gray-100 dark:bg-[#202022] border border-gray-200/50 dark:border-white/5 text-gray-800 dark:text-gray-200 px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap ml-11 max-w-[90%]">
                                                    {msg.answer}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {aiLoading && (
                                    <div className="flex flex-col items-start max-w-3xl mx-auto w-full pr-12 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center gap-3 mb-2 ml-1">
                                            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white p-1.5 shrink-0 shadow-sm">
                                                <Sparkles className="w-4 h-4" />
                                            </div>
                                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">CramRoom AI</span>
                                        </div>
                                        <div className="bg-gray-100 dark:bg-[#202022] border border-gray-200/50 dark:border-white/5 text-gray-500 dark:text-gray-400 px-5 py-3.5 rounded-2xl rounded-tl-sm ml-11 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                            <span className="text-sm italic">Thinking...</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={historyEndRef} className="h-12" />
                            </div>
                            {/* Chat Input */}
                            <div className="shrink-0 p-4 sm:p-6 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#141416]">
                                <div className="max-w-3xl mx-auto">
                                    <div className="relative bg-white dark:bg-[#1A1A1C] border border-gray-300 dark:border-gray-700/50 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/5">
                                        <textarea
                                            className="w-full min-h-[56px] max-h-[160px] p-4 pr-16 bg-transparent text-gray-900 dark:text-white text-[15px] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none resize-y rounded-xl"
                                            placeholder={`Ask anything about ${session.subject}...`}
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
                                        <div className="absolute right-2.5 bottom-2.5">
                                            <Button
                                                size="icon"
                                                onClick={handleAskAI}
                                                disabled={!question.trim() || aiLoading}
                                                className="h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-transform active:scale-95 disabled:opacity-50"
                                            >
                                                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    {aiError && (
                                        <p className="text-xs text-red-500 mt-2 ml-2 font-medium flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> {aiError}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-4 mt-3 ml-2 text-xs text-gray-500 dark:text-gray-500 font-medium">
                                        <button className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                                            <Link2 className="w-3.5 h-3.5" /> Attach Note
                                        </button>
                                        <button className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                                            <Zap className="w-3.5 h-3.5" /> Voice Query
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── EXPECTED QUESTIONS VIEW ── */}
                    {activeView === 'expected' && (
                        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                            <div className="max-w-4xl mx-auto">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                                            <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Predicted Questions</h2>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">AI suggestions based on PYQ frequency & weak areas</p>
                                        </div>
                                    </div>
                                    <button onClick={fetchExpectedQuestions} disabled={expectedLoading} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#202022] transition-colors shadow-sm disabled:opacity-50">
                                        <RefreshCw className={`w-3.5 h-3.5 ${expectedLoading ? 'animate-spin' : ''}`} /> 
                                        {expectedLoading ? 'Analyzing...' : 'Refresh'}
                                    </button>
                                </div>

                                {expectedLoading && expectedQuestions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-amber-500" />
                                        <p className="font-medium text-lg text-gray-600 dark:text-gray-300">Analyzing Past Papers...</p>
                                        <p className="text-sm mt-2">Cross-referencing your weak topics with historical frequency.</p>
                                    </div>
                                ) : expectedQuestions.length === 0 ? (
                                    <div className="text-center py-24 bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-zinc-800/80 rounded-2xl shadow-sm">
                                        <BookOpen className="w-10 h-10 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No PYQs uploaded</h3>
                                        <p className="text-sm text-gray-500 mt-1.5 max-w-xs mx-auto">Upload Previous Year Question papers to generate exam predictions.</p>
                                        <button onClick={() => { setKnowledgeModalDefaultType('pyqs'); setIsKnowledgeModalOpen(true); }} className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">Upload PYQ Document</button>
                                    </div>
                                ) : (
                                    <div className="space-y-10">
                                        {['Highly Expected', 'Medium Probability', 'Low Probability'].map(probLabel => {
                                            const questions = expectedQuestions.filter(q => q.probability === probLabel);
                                            if (questions.length === 0) return null;
                                            
                                            const isHigh = probLabel === 'Highly Expected';
                                            const isMed = probLabel === 'Medium Probability';
                                            
                                            return (
                                                <div key={probLabel} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-5 w-1.5 rounded-full ${isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                                                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{probLabel}</h3>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 ml-1">{questions.length}</span>
                                                    </div>
                                                    
                                                    <div className="grid gap-3">
                                                        {questions.map((q, idx) => {
                                                            const ansState = pyqAnswers[q.id];
                                                            const isExpanded = !!ansState;
                                                            return (
                                                                <div key={q.id} className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm hover:border-gray-300 dark:hover:border-zinc-600 transition-colors group">
                                                                    <div 
                                                                        onClick={() => handleGeneratePyqAnswer(q)}
                                                                        className="p-4 sm:p-5 cursor-pointer flex gap-3 items-start"
                                                                    >
                                                                        <div className="flex-1 mt-0.5">
                                                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-md">{q.topic}</span>
                                                                                {q.year && <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md">{q.year}</span>}
                                                                                {q.marks && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-md">{q.marks} Marks</span>}
                                                                                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-md ml-auto flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Repeated {q.frequency}x</span>
                                                                            </div>
                                                                            <p className="text-[15px] font-medium text-gray-800 dark:text-gray-200 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-8">
                                                                                {q.question_text}
                                                                            </p>
                                                                            {!isExpanded && (
                                                                                <div className="mt-4">
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); handleGeneratePyqAnswer(q); }}
                                                                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                                                                    >
                                                                                        <Sparkles className="w-3.5 h-3.5" />
                                                                                        Generate AI Answer
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="shrink-0 pt-1">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600'}`}>
                                                                                {ansState?.loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {isExpanded && (
                                                                        <div className="border-t border-gray-100 dark:border-zinc-800/60 bg-gray-50/50 dark:bg-[#141416]/50 p-5 animate-in slide-in-from-top-2 fade-in">
                                                                            {ansState.loading ? (
                                                                                <div className="flex items-center gap-3 text-gray-500">
                                                                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                                                    <span className="text-[13px] font-medium">Drafting structured {q.marks ? `${q.marks}-mark` : ''} answer...</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                                                    {ansState.answer}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── TOPICS VIEW ── */}
                    {activeView === 'topics' && (
                        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                            <div className="max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-500" />
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Weak Topics</h2>
                                    </div>
                                    <button onClick={fetchWeakTopics} disabled={weakTopicsLoading} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                                        <RefreshCw className={`w-4 h-4 ${weakTopicsLoading ? 'animate-spin' : ''}`} /> Refresh
                                    </button>
                                </div>
                                {weakTopicsLoading ? (
                                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                                ) : weakTopics.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                        <p className="font-medium">No weak topics detected yet.</p>
                                        <p className="text-sm mt-1">Ask more questions to get personalised insights.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {weakTopics.map((topic, index) => {
                                            const isHigh = index < 2;
                                            return (
                                                <div key={index} className={`flex items-center justify-between p-4 rounded-xl border ${
                                                    isHigh
                                                        ? 'bg-red-50 dark:bg-[#2A171C] border-red-200 dark:border-red-900/40'
                                                        : 'bg-white dark:bg-[#1A1A1C] border-gray-200 dark:border-white/5'
                                                }`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${isHigh ? 'bg-red-500' : 'bg-gray-400'}`} />
                                                        <span className={`font-semibold text-sm ${isHigh ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                                            {topic.topic}
                                                        </span>
                                                    </div>
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                                        isHigh
                                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
                                                    }`}>
                                                        {topic.frequency}x
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── PROGRESS VIEW ── */}
                    {activeView === 'progress' && (
                        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                            <div className="max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-blue-500" />
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Concept Mastery</h2>
                                    </div>
                                    <button onClick={fetchProgress} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                                        <RefreshCw className="w-4 h-4" /> Refresh
                                    </button>
                                </div>
                                {progressLoading ? (
                                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                                ) : progress.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                        <p className="font-medium">No progress tracked yet.</p>
                                        <p className="text-sm mt-1">Start asking questions to track your mastery.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {progress.map((item, idx) => (
                                            <div key={idx} className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
                                                <div className="flex items-center justify-between mb-3">
                                                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{item.topic}</p>
                                                    <div className="flex items-center gap-1.5 font-bold text-sm">
                                                        {item.currentScore}% {renderTrendIcon(item.trend)}
                                                    </div>
                                                </div>
                                                <div className="h-2 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            item.trend === 'improving' ? 'bg-green-500' :
                                                            item.trend === 'worsening' ? 'bg-red-500' : 'bg-blue-500'
                                                        }`}
                                                        style={{ width: `${item.currentScore}%` }}
                                                    />
                                                </div>
                                                {item.previousScore !== undefined && (
                                                    <p className="text-xs text-gray-400 mt-2">
                                                        Previous: {item.previousScore}% &rarr; Now: {item.currentScore}%
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── FILES VIEW ── */}
                    {activeView === 'files' && (
                        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                            <div className="max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <Folder className="w-5 h-5 text-teal-500" />
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Shared Resources</h2>
                                    </div>
                                    <button
                                        onClick={() => setIsUploadModalOpen(true)}
                                        className="flex items-center gap-1.5 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" /> Upload File
                                    </button>
                                </div>
                                {files.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                        <p className="font-medium">No files uploaded yet.</p>
                                        <p className="text-sm mt-1">Upload study materials to share with your session.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map(file => (
                                            <div key={file.id} className="flex items-center justify-between p-4 bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                                        <FileText className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{file.size} · {formatDate(file.uploadDate)}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadFile(file.id, file.name)}
                                                    className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-900 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-4"
                                                >
                                                    <Download className="w-4 h-4" /> Download
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ── KNOWLEDGE BASE ── */}
                                <KnowledgeFileList
                                    files={knowledgeFiles}
                                    loading={knowledgeLoading}
                                    onAddClick={() => setIsKnowledgeModalOpen(true)}
                                    onDelete={handleKnowledgeDelete}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── LIVE CHAT VIEW ── */}
                    {activeView === 'chat' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-8">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-5">
                                <MessageSquare className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">Live Chat</h3>
                            <p className="text-sm max-w-xs">Real-time peer chat is coming soon. Collaborate with your study group in the session.</p>
                            <span className="mt-5 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-[11px] font-bold uppercase tracking-wider rounded-full">
                                Coming Soon
                            </span>
                        </div>
                    )}

                </main>

                {/* RIGHT SIDEBAR */}
                <aside className="w-80 lg:w-[360px] border-l border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#161618] shrink-0 overflow-y-auto p-5 xl:p-6 space-y-6 z-10 hidden md:block">
                    
                    {/* Weak Topics */}
                    <Card className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                <CardTitle className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Weak Topics</CardTitle>
                            </div>
                            <button onClick={fetchWeakTopics} disabled={weakTopicsLoading} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                <RefreshCw className={`w-3.5 h-3.5 ${weakTopicsLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </CardHeader>
                        <CardContent className="px-4 pb-5 pt-0">
                            {weakTopicsLoading ? (
                                <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                            ) : weakTopics.length === 0 ? (
                                <p className="text-sm text-gray-500">No weak topics detected.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {weakTopics.map((topic, index) => {
                                        // Alternate style to match the screenshot (some red, some grey)
                                        const isRed = index < 2; 
                                        return (
                                        <div
                                            key={index}
                                            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${
                                                isRed 
                                                ? 'bg-red-50 dark:bg-[#2A171C] text-red-700 dark:text-[#D45B5B] border-red-200 dark:border-transparent' 
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-400 border-gray-200 dark:border-transparent'
                                            }`}
                                        >
                                            {topic.topic}
                                        </div>
                                    )})}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Concept Mastery (Progress) */}
                    <div>
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Concept Mastery</h3>
                            <button onClick={fetchProgress} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                                Live Updates
                            </button>
                        </div>
                        {progressLoading ? (
                            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                        ) : mainTopics.length === 0 ? (
                            <div className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 p-4 rounded-xl text-center text-sm text-gray-500">
                                No progress tracked yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {mainTopics.map((item, idx) => (
                                    <div key={idx} className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-xl p-3.5 shadow-sm flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                                                {idx % 2 === 0 ? <BarChart2 className="w-4 h-4 text-blue-500" /> : <Zap className="w-4 h-4 text-amber-500" />}
                                            </div>
                                            <div className="flex items-center gap-1 font-bold text-sm text-gray-900 dark:text-gray-100">
                                                {item.currentScore}% {renderTrendIcon(item.trend)}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate mb-2" title={item.topic}>{item.topic}</p>
                                            <div className="h-1 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${idx % 2 === 0 ? 'bg-blue-500' : 'bg-amber-500'}`} 
                                                    style={{ width: `${item.currentScore}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Shared Resources */}
                    <Card className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Shared Resources</CardTitle>
                            <button onClick={() => setIsUploadModalOpen(true)} className="w-7 h-7 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-500 rounded flex items-center justify-center hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors">
                                <Upload className="w-3.5 h-3.5" />
                            </button>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                            {files.length === 0 ? (
                                <div className="text-center py-6 text-sm text-gray-500">No resources shared yet.</div>
                            ) : (
                                <div className="space-y-1">
                                    {files.map(file => (
                                        <div key={file.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                                    <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">Uploaded • {file.size}</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleDownloadFile(file.id, file.name)}
                                                className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Team Collaboration Placeholder */}
                    <div className="bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4 text-gray-500 dark:text-gray-400">
                            <Users className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-[15px] mb-2">Team Collaboration</h4>
                        <p className="text-xs text-gray-500 mb-5 leading-relaxed">Collaborate with teammates in real-time. (Coming Soon)</p>
                        <span className="px-3 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                            Early Access
                        </span>
                    </div>

                </aside>
            </div>

            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleUploadFile}
            />
            <InvitePeerModal
                isOpen={isInviteModalOpen}
                onClose={() => setIsInviteModalOpen(false)}
                sessionId={params.id}
                subject={session.subject}
            />
            <KnowledgeUploadModal
                isOpen={isKnowledgeModalOpen}
                onClose={() => setIsKnowledgeModalOpen(false)}
                onUpload={handleKnowledgeUpload}
                defaultContentType={knowledgeModalDefaultType}
            />
        </div>
    )
}
