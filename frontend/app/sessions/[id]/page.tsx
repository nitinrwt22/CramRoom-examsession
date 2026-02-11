'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal } from '@/components/file-upload-modal'
import { Download, Trash2, Plus, FileText, Loader2, LogOut, Send, Sparkles, Bot } from 'lucide-react'
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
    const [question, setQuestion] = useState('')
    const [aiResponse, setAiResponse] = useState<AIQueryResponse | null>(null)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

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
        setAiResponse(null)

        try {
            const response = await api.post(`/api/sessions/${params.id}/ai/query`, {
                intent: 'concept_clarification',
                question: question
            })

            setAiResponse({
                answer: response.data.answer,
                confidence: response.data.confidence || 0
            })
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
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{session.subject}</h1>
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
                                {leaving ? 'Leaving...' : 'Leave Session'}
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Shared Files Section */}
                <Card className="border border-border">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Shared Files</CardTitle>
                                <CardDescription>All study materials for this session</CardDescription>
                            </div>
                            <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2">
                                <Plus className="w-4 h-4" />
                                Upload File
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {files.length === 0 ? (
                            <div className="text-center py-12">
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
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                                                    File Name
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                                                    Uploaded By
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                                                    Date
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                                                    Size
                                                </th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {files.map((file) => (
                                                <tr key={file.id} className="hover:bg-secondary/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                            <span className="text-sm font-medium text-foreground truncate">
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
                                                        <span className="text-sm text-muted-foreground">{file.size}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => handleDownloadFile(file.id, file.name)}
                                                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                                                aria-label="Download"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteFile(file.id)}
                                                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                                aria-label="Delete"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Card View */}
                                <div className="md:hidden divide-y divide-border">
                                    {files.map((file) => (
                                        <div key={file.id} className="p-4 space-y-3 hover:bg-secondary/30 transition-colors">
                                            <div className="flex items-start gap-2">
                                                <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">By {file.uploadedBy}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(file.uploadDate)} • {file.size}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleDownloadFile(file.id, file.name)}
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteFile(file.id)}
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
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
                <Card className="mt-8 border border-border">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <CardTitle className="text-lg">AI Session Assistant</CardTitle>
                        </div>
                        <CardDescription>
                            Ask questions about the session content or get clarification on concepts.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <textarea
                                className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="What would you like to know about this session?"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={aiLoading}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleAskAI}
                                disabled={!question.trim() || aiLoading}
                                className="gap-2"
                            >
                                {aiLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Thinking...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Ask AI
                                    </>
                                )}
                            </Button>
                        </div>

                        {aiError && (
                            <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                                {aiError}
                            </div>
                        )}

                        {aiResponse && (
                            <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                                <div className="flex items-start gap-3">
                                    <Bot className="w-5 h-5 text-primary mt-1" />
                                    <div className="space-y-1">
                                        <h4 className="font-medium text-sm">AI Response</h4>
                                        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                            {aiResponse.answer}
                                        </div>
                                    </div>
                                </div>
                                {aiResponse.confidence !== undefined && (
                                    <div className="flex items-center gap-2 ml-8">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                            {Math.round(aiResponse.confidence * 100)}% Confidence
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
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
