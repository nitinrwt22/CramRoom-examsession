'use client'

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal, FileContentType } from '@/components/session/FileUploadModal'
import { InvitePeerModal } from '@/components/session/InvitePeerModal'
import { SettingsModal } from '@/components/session/SettingsModal'
import { 
    Download, Trash2, Plus, FileText, Loader2, LogOut, Send, Sparkles, 
    TrendingDown, TrendingUp, Minus, Upload, RefreshCw, AlertTriangle, 
    Zap, Link2, BookOpen, BarChart2, Folder, MessageSquare, Settings, 
    UserPlus, Users, ChevronRight, CornerDownRight, Smile 
} from 'lucide-react'
import EmojiPicker, { Theme } from 'emoji-picker-react'
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
    participants?: {
        user_id: number;
        name: string;
        role: 'host' | 'participant';
    }[]
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

interface TypingUser {
    user_id: number;
    name: string;
}

interface ChatMessage {
    id?: number
    room_id: number
    user_id: number
    username: string
    message_text: string
    timestamp?: string
    tags?: string[]
}

export default function SessionDetailPage() {
    const decodeJwt = (token: string) => {
        try {
            const base64Url = token.split('.')[1]
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            }).join(''))
            return JSON.parse(jsonPayload)
        } catch (e) {
            return null
        }
    }
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const [session, setSession] = useState<Session | null>(null)
    const [files, setFiles] = useState<SessionFile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [activeView, setActiveView] = useState<'assistant' | 'expected' | 'topics' | 'progress' | 'files' | 'chat'>('assistant')

    // Live Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [tagFilter, setTagFilter] = useState<string | null>(null)
    const [showTagSuggestions, setShowTagSuggestions] = useState(false)
    const [tagSearchTerm, setTagSearchTerm] = useState('')
    const COMMON_TAGS = ['DSA', 'DBMS', 'OS', 'CN', 'OOPS', 'JAVA', 'PYTHON', 'AI']
    const socketRef = useRef<Socket | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const [currentUser, setCurrentUser] = useState<{ id: number, name: string } | null>(null)
    const [activeUserIds, setActiveUserIds] = useState<number[]>([])
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Knowledge files state
    const [knowledgeFiles, setKnowledgeFiles] = useState<any[]>([])
    const [knowledgeLoading, setKnowledgeLoading] = useState(true)

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

                const token = localStorage.getItem('token')
                if (token) {
                    const decoded = decodeJwt(token)
                    if (decoded) {
                        setCurrentUser({ id: decoded.id, name: decoded.name || decoded.email })
                    }
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

    useEffect(() => {
        if (activeView === 'chat' && session && currentUser) {
            let activeSocket: Socket;
            
            const initChat = async () => {
                setChatLoading(true)
                try {
                    const res = await api.get(`/rooms/${params.id}/messages`)
                    setChatMessages(res.data)
                } catch (err) {
                    console.error('Failed to load chat history:', err)
                } finally {
                    setChatLoading(false)
                }

                activeSocket = io('http://localhost:5001')
                socketRef.current = activeSocket

                activeSocket.emit('join_room', {
                    room_id: parseInt(params.id),
                    user_id: currentUser.id,
                    username: currentUser.name
                })

                activeSocket.on('receive_message', (msg: ChatMessage) => {
                    setChatMessages(prev => [...prev, msg])
                })

                activeSocket.on('active_users', (userIds: number[]) => {
                    setActiveUserIds(userIds)
                })

                activeSocket.on('typing_start', (data: { room_id: number, user_id: number, username: string }) => {
                    setTypingUsers(prev => {
                        if (!prev.find(u => u.user_id === data.user_id)) {
                            return [...prev, { user_id: data.user_id, name: data.username }];
                        }
                        return prev;
                    });
                })

                activeSocket.on('typing_stop', (data: { room_id: number, user_id: number }) => {
                    setTypingUsers(prev => prev.filter(u => u.user_id !== data.user_id));
                })
            }

            initChat()

            return () => {
                activeSocket?.disconnect()
                socketRef.current = null
            }
        }
    }, [activeView, session, currentUser, params.id])

    useEffect(() => {
        if (activeView === 'chat') {
            setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
        }
    }, [chatMessages.length, activeView])

    const handleSendChatMessage = (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!chatInput.trim() || !socketRef.current || !currentUser) return

        socketRef.current.emit('send_message', {
            room_id: parseInt(params.id),
            user_id: currentUser.id,
            username: currentUser.name,
            message_text: chatInput,
            timestamp: new Date().toISOString()
        })
        setChatInput('')
        setShowTagSuggestions(false)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        socketRef.current.emit('typing_stop', { room_id: parseInt(params.id), user_id: currentUser.id })
    }

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

    const handleKnowledgeUpload = async (file: File, contentType: FileContentType) => {
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

    const handleUnifiedUpload = async (file: File, contentType: FileContentType) => {
        if (contentType === 'general') {
            await handleUploadFile(file);
        } else {
            await handleKnowledgeUpload(file, contentType);
        }
    }

    const handleUnifiedDelete = async (id: number | string, type: string) => {
        if (!confirm('Remove this file from the session?')) return
        try {
            if (type === 'general') {
                // Not perfectly implemented but keeping local arrays clean
                handleDeleteFile(id as string)
            } else {
                await api.delete(`/session/${params.id}/knowledge/${id}`)
                setKnowledgeFiles(prev => prev.filter(f => f.id !== id))
            }
        } catch (err) {
            console.error('Error deleting file:', err)
            alert('Failed to delete. Please try again.')
        }
    }

    const handleUnifiedDownload = async (id: number | string, type: string, fileName: string) => {
        try {
            let response;
            if (type === 'general') {
                response = await api.get(`/session/files/${id}/download`, { responseType: 'blob' })
            } else {
                response = await api.get(`/session/${params.id}/knowledge/${id}/download`, { responseType: 'blob' })
            }
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
            alert('Failed to download file. It might not be available on disk.')
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
                    <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <Settings className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-white" />
                    </button>
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
                        <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors">
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
                                        <button onClick={() => { setIsUploadModalOpen(true); }} className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">Upload PYQ Document</button>
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
                            <div className="max-w-3xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <Folder className="w-5 h-5 text-blue-500" />
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Session Files</h2>
                                    </div>
                                    <button
                                        onClick={() => setIsUploadModalOpen(true)}
                                        className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" /> Add File
                                    </button>
                                </div>
                                {files.length === 0 && knowledgeFiles.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl">
                                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                        <p className="font-medium text-gray-600 dark:text-gray-300">No files uploaded yet.</p>
                                        <p className="text-sm mt-1 opacity-60">Upload study materials to share with peers or for the AI to process.</p>
                                        <button onClick={() => setIsUploadModalOpen(true)} className="mt-4 px-4 py-2 border border-blue-500/30 text-blue-500 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-500/5 transition">
                                            Upload First File
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {[
                                            ...files.map(f => ({
                                                id: `general-${f.id}`,
                                                dbId: f.id,
                                                type: 'general',
                                                title: f.name,
                                                created_at: f.uploadDate,
                                                meta: f.size
                                            })),
                                            ...knowledgeFiles.map(f => ({
                                                id: `ai-${f.id}`,
                                                dbId: f.id,
                                                type: f.content_type,
                                                title: f.title,
                                                created_at: f.created_at,
                                                meta: `${f.chunk_count} chunks`
                                            }))
                                        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                        .map(file => (
                                            <div key={file.id} className="flex items-center justify-between p-4 bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${file.type === 'general' ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'}`}>
                                                        {file.type === 'general' ? <Folder className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{file.title}</p>
                                                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 opacity-80 border border-gray-200 dark:border-white/10">
                                                                {file.type}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">{file.meta} · {formatDate(file.created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-4 gap-2">
                                                    <button
                                                        onClick={() => handleUnifiedDownload(file.dbId, file.type, file.title)}
                                                        className="flex flex-col items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                                        title="Download"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUnifiedDelete(file.dbId, file.type)}
                                                        className="flex flex-col items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── LIVE CHAT VIEW ── */}
                    {activeView === 'chat' && (() => {
                        const availableTags = Array.from(new Set(chatMessages.flatMap(m => m.tags || [])));
                        const filteredMessages = tagFilter 
                            ? chatMessages.filter(m => m.tags?.includes(tagFilter) || m.message_text.includes(`#${tagFilter}`)) 
                            : chatMessages;
                        
                        const renderMessageText = (text: string, isMe: boolean) => {
                            const parts = text.split(/(#\w+)/g);
                            return parts.map((part, i) => {
                                if (part.startsWith('#')) {
                                    const tag = part.substring(1);
                                    return <button key={i} onClick={() => setTagFilter(tag)} className={`inline-block font-semibold text-xs px-1.5 py-0.5 rounded ml-1 mr-1 transition-colors ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60'}`}>{part}</button>;
                                }
                                return <span key={i}>{part}</span>;
                            });
                        }

                        return (
                            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#141416]">
                                <div className="border-b border-gray-100 dark:border-white/5 px-6 py-3 shrink-0 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs">
                                        <span>Rooms</span>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                        <span className="text-blue-600 dark:text-blue-500 font-bold border-b-2 border-blue-600 pb-1 -mb-[13px]">{session?.subject || 'Session'} Live Chat</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-900/20 rounded-full text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-widest">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                            Connected
                                        </span>
                                    </div>
                                </div>

                                {availableTags.length > 0 && (
                                    <div className="px-6 py-2.5 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-[#1A1A1C]/50 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Filter:</span>
                                        {availableTags.map(tag => (
                                            <button 
                                                key={tag} 
                                                onClick={() => setTagFilter(tag === tagFilter ? null : tag)} 
                                                className={`text-[11px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${tag === tagFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-700'}`}
                                            >
                                                #{tag}
                                            </button>
                                        ))}
                                        {tagFilter && (
                                            <button onClick={() => setTagFilter(null)} className="text-[11px] font-bold text-red-500 hover:text-red-600 ml-2 whitespace-nowrap">
                                                Clear Filter
                                            </button>
                                        )}
                                    </div>
                                )}

                                <section className="flex-1 flex flex-col overflow-hidden relative">
                                    <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 scroll-smooth pb-32">
                                    {chatLoading ? (
                                        <div className="flex justify-center items-center h-full text-gray-400">
                                            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading chat...
                                        </div>
                                    ) : filteredMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-60">
                                            <MessageSquare className="w-10 h-10 mb-3" />
                                            <p className="font-medium text-sm">No messages yet.</p>
                                        </div>
                                    ) : (
                                        filteredMessages.map((msg, idx) => {
                                            const isMe = msg.user_id === currentUser?.id;
                                            return (
                                                <div key={msg.id || idx} className={`flex flex-col gap-1.5 ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <div className={`flex items-end gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : ''}`}>
                                                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'}`}>
                                                            {msg.username.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                                            <div className={`text-[11px] font-semibold text-gray-500 flex items-center gap-2 ${isMe ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
                                                                <span>{isMe ? 'You' : msg.username}</span>
                                                                <span className="font-normal opacity-60">{formatTime(msg.timestamp || new Date().toISOString())}</span>
                                                            </div>
                                                            <div className={`p-3.5 sm:p-4 text-[14px] leading-relaxed shadow-sm ${
                                                                isMe 
                                                                ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' 
                                                                : 'bg-gray-100 dark:bg-[#1A1A1C] border border-gray-200/50 dark:border-white/5 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-sm'
                                                            }`}>
                                                                {renderMessageText(msg.message_text, isMe)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                    <div ref={chatEndRef} className="h-4" />
                                </div>

                                {/* Sticky Message Input */}
                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-[#141416] dark:via-[#141416] z-10 w-full pointer-events-none">
                                    {typingUsers.length > 0 && (
                                        <div className="max-w-4xl mx-auto pl-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <p className="text-[11px] text-gray-500 italic font-medium">
                                                {typingUsers.length === 1 ? `${typingUsers[0].name} is typing...` : 
                                                 typingUsers.length === 2 ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...` : 
                                                 'Multiple members are typing...'}
                                            </p>
                                        </div>
                                    )}
                                    <div className="max-w-4xl mx-auto relative group pointer-events-auto">
                                        <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-xl transition-all group-focus-within:bg-blue-500/10 dark:group-focus-within:bg-blue-500/20"></div>
                                        
                                        {showTagSuggestions && (
                                            <div className="absolute bottom-full left-12 mb-4 z-50 shadow-2xl rounded-xl bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-zinc-800 w-48 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
                                                <div className="px-3 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Suggested Tags</span>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto">
                                                    {COMMON_TAGS.filter(t => t.includes(tagSearchTerm)).length === 0 && (
                                                        <div className="px-4 py-3 text-xs text-gray-500 text-center">No matching tags</div>
                                                    )}
                                                    {COMMON_TAGS.filter(t => t.includes(tagSearchTerm)).map(tag => (
                                                        <button
                                                            key={tag}
                                                            className="w-full text-left px-4 py-2 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                                                            onClick={() => {
                                                                const words = chatInput.split(' ');
                                                                words.pop();
                                                                setChatInput([...words, `#${tag} `].join(' '));
                                                                setShowTagSuggestions(false);
                                                            }}
                                                        >
                                                            <span className="text-blue-500 font-bold mr-1">#</span>{tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {showEmojiPicker && (
                                            <div className="absolute bottom-full left-4 mb-4 z-50 shadow-2xl rounded-2xl animate-in slide-in-from-bottom-5 fade-in duration-200">
                                                <EmojiPicker 
                                                    onEmojiClick={(emojiData) => {
                                                        setChatInput(prev => prev + emojiData.emoji)
                                                        setShowEmojiPicker(false)
                                                    }}
                                                    theme={Theme.AUTO}
                                                />
                                            </div>
                                        )}
                                        <div className="relative bg-white dark:bg-[#1A1A1C] border border-gray-300 dark:border-gray-700/50 rounded-full p-2 flex items-center gap-2 lg:gap-3 shadow-lg ring-1 ring-black/5 dark:ring-white/5 group-focus-within:ring-blue-500/40 transition-all">
                                            <button className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors shrink-0 hidden sm:flex">
                                                <Plus className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${showEmojiPicker ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40' : 'text-gray-400 hover:text-blue-600'}`}
                                            >
                                                <Smile className="w-5 h-5" />
                                            </button>
                                            <input 
                                                className="flex-1 bg-transparent border-none focus:ring-0 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 px-2 py-2 outline-none" 
                                                placeholder="Type your message..." 
                                                type="text"
                                                value={chatInput}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setChatInput(val);
                                                    
                                                    // Typing Indicator logic
                                                    if (socketRef.current && currentUser && params.id) {
                                                        socketRef.current.emit('typing_start', {
                                                            room_id: parseInt(params.id),
                                                            user_id: currentUser.id,
                                                            username: currentUser.name
                                                        });
                                                        if (typingTimeoutRef.current) {
                                                            clearTimeout(typingTimeoutRef.current);
                                                        }
                                                        typingTimeoutRef.current = setTimeout(() => {
                                                            socketRef.current?.emit('typing_stop', {
                                                                room_id: parseInt(params.id),
                                                                user_id: currentUser.id
                                                            });
                                                        }, 1500);
                                                    }

                                                    // Tag Suggestion logic
                                                    const words = val.split(' ');
                                                    const lastWord = words[words.length - 1] || '';
                                                    if (lastWord.startsWith('#')) {
                                                        setTagSearchTerm(lastWord.substring(1).toUpperCase());
                                                        setShowTagSuggestions(true);
                                                    } else {
                                                        setShowTagSuggestions(false);
                                                    }
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSendChatMessage()
                                                }}
                                            />
                                            <div className="flex items-center gap-2 pr-1 shrink-0">
                                                <button 
                                                    onClick={handleSendChatMessage}
                                                    disabled={!chatInput.trim()}
                                                    className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:active:scale-100"
                                                >
                                                    <Send className="w-4 h-4 ml-0.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-center text-gray-400 mt-2 font-medium pointer-events-auto">Session Chat is real-time • Please be respectful</p>
                                </div>
                            </section>
                        </div>
                    )})()}

                </main>

                {/* RIGHT SIDEBAR */}
                <aside className="w-80 lg:w-[360px] border-l border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#161618] shrink-0 overflow-y-auto p-5 xl:p-6 space-y-6 z-10 hidden md:block">
                    {activeView === 'chat' ? (
                        <div className="flex flex-col h-full font-sans -m-5 xl:-m-6">
                            <div className="p-6 pb-2">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Room Members</h3>
                                    <span className="text-[10px] bg-white dark:bg-[#1A1A1C] border border-gray-200 dark:border-white/5 px-2 py-0.5 rounded-full font-bold shadow-sm">{session?.participants?.length || 0}</span>
                                </div>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar px-4 pb-4 flex-1">
                                {(() => {
                                    const allParticipants = session?.participants || [];
                                    const onlineParticipants = allParticipants.filter(p => activeUserIds.includes(p.user_id));
                                    const offlineParticipants = allParticipants.filter(p => !activeUserIds.includes(p.user_id));

                                    const renderUser = (user: typeof allParticipants[0], isOnline: boolean) => {
                                        const isMe = currentUser?.id === user.user_id;
                                        const initials = user.name.substring(0, 2).toUpperCase();
                                        return (
                                            <div key={user.user_id} className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer group shadow-sm border border-transparent ${isOnline ? 'hover:bg-white dark:hover:bg-[#1A1A1C] hover:border-gray-200 dark:hover:border-white/5 opacity-100' : 'opacity-60 grayscale-[50%]'}`}>
                                                <div className="relative">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ring-1 ring-black/5 dark:ring-white/5 ${isOnline ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-200 dark:bg-zinc-800 text-gray-500'}`}>
                                                        {initials}
                                                    </div>
                                                    {isOnline && (
                                                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-50 dark:border-[#161618] rounded-full"></span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                                        {isMe ? 'You' : user.name}
                                                    </p>
                                                    {user.role === 'host' ? (
                                                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tighter">Moderator</p>
                                                    ) : (
                                                        <p className={`text-[10px] font-medium ${isOnline ? 'text-green-600 dark:text-green-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                                            {isOnline ? 'Online' : 'Offline'}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    };

                                    return (
                                        <div className="space-y-6">
                                            {onlineParticipants.length > 0 && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-3 mb-2">Online — {onlineParticipants.length}</p>
                                                    {onlineParticipants.map(u => renderUser(u, true))}
                                                </div>
                                            )}
                                            {offlineParticipants.length > 0 && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-3 mb-2">Offline — {offlineParticipants.length}</p>
                                                    {offlineParticipants.map(u => renderUser(u, false))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}

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
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                subject={session.subject}
                onLeaveSession={handleLeaveSession}
                onLogout={handleLogout}
            />
        </div>
    )
}
