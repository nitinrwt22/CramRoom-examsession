'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal } from '@/components/file-upload-modal'
import { Download, Trash2, Plus, FileText, Loader2, LogOut, Send, Sparkles, Bot, User } from 'lucide-react'
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

interface AIQueryResponse {
    answer: string
    confidence: number
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

    // Ref for auto-scrolling
    const historyEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [aiHistory])

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
        } catch (err: any) {
            console.error('Error asking AI:', err)
            setAiError(err.response?.data?.message || 'Failed to get AI response')
        } finally {
            setAiLoading(false)
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

                {/* AI Assistant Section */}
                <Card className="border border-border shadow-sm flex flex-col h-[600px]">
                    <CardHeader className="border-b border-border bg-muted/20">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <CardTitle className="text-lg">AI Session Assistant</CardTitle>
                        </div>
                        <CardDescription>
                            Ask questions about shared materials or concepts.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                        {/* Chat History Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-secondary/5">
                            {historyLoading ? (
                                <div className="flex justify-center items-center h-full text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                    Loading history...
                                </div>
                            ) : aiHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-60">
                                    <Bot className="w-12 h-12 mb-4" />
                                    <p>No questions yet.</p>
                                    <p className="text-sm">Start the conversation by asking about the session.</p>
                                </div>
                            ) : (
                                aiHistory.map((msg, idx) => (
                                    <div key={idx} className="space-y-4">
                                        {/* User Question */}
                                        <div className="flex justify-end">
                                            <div className="max-w-[85%] md:max-w-[75%] space-y-1">
                                                <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm relative group">
                                                    <p className="text-sm leading-relaxed">{msg.question}</p>
                                                </div>
                                                <div className="flex justify-end items-center gap-2 mr-1">
                                                    <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ml-2 flex-shrink-0">
                                                <User className="w-4 h-4 text-primary" />
                                            </div>
                                        </div>

                                        {/* AI Answer */}
                                        <div className="flex justify-start">
                                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center mr-2 flex-shrink-0 border border-border">
                                                <Bot className="w-4 h-4 text-foreground" />
                                            </div>
                                            <div className="max-w-[85%] md:max-w-[75%] space-y-1">
                                                <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                                                    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                                                        {msg.answer}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 ml-1">
                                                    <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                                                    {msg.confidence !== undefined && (
                                                        <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground border border-border">
                                                            {Math.round(msg.confidence * 100)}% confidence
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={historyEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-background border-t border-border">
                            <div className="relative">
                                <textarea
                                    className="w-full min-h-[50px] max-h-[150px] p-3 pr-12 rounded-lg border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                    placeholder="Ask a question..."
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    // Submit on Enter (without shift)
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAskAI();
                                        }
                                    }}
                                    disabled={aiLoading}
                                />
                                <Button
                                    size="icon"
                                    className="absolute right-2 bottom-2 h-8 w-8"
                                    onClick={handleAskAI}
                                    disabled={!question.trim() || aiLoading}
                                >
                                    {aiLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </Button>
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

            {/* File Upload Modal */}
            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleUploadFile}
            />
        </div>
    )
}
