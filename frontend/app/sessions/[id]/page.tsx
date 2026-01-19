'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadModal } from '@/components/file-upload-modal'
import { Download, Trash2, Plus, FileText } from 'lucide-react'

interface SessionFile {
    id: string
    name: string
    uploadDate: string
    size: string
    uploadedBy: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SessionDetailPage({ params: _params }: { params: { id: string } }) {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [files, setFiles] = useState<SessionFile[]>([
        {
            id: '1',
            name: 'Calculus_Chapter5_Notes.pdf',
            uploadDate: '2024-02-14',
            size: '2.4 MB',
            uploadedBy: 'Alice Johnson',
        },
        {
            id: '2',
            name: 'Practice_Problems_Solution.docx',
            uploadDate: '2024-02-13',
            size: '1.1 MB',
            uploadedBy: 'Bob Smith',
        },
        {
            id: '3',
            name: 'Study_Guide_Midterm.xlsx',
            uploadDate: '2024-02-12',
            size: '0.8 MB',
            uploadedBy: 'Carol Davis',
        },
        {
            id: '4',
            name: 'Formula_Sheet_Reference.pdf',
            uploadDate: '2024-02-11',
            size: '0.5 MB',
            uploadedBy: 'David Wilson',
        },
    ])

    const handleUploadFile = (file: File) => {
        const newFile: SessionFile = {
            id: String(files.length + 1),
            name: file.name,
            uploadDate: new Date().toISOString().split('T')[0],
            size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
            uploadedBy: 'You',
        }
        setFiles([newFile, ...files])
    }

    const handleDeleteFile = (fileId: string) => {
        setFiles(files.filter((f) => f.id !== fileId))
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Calculus II Midterm</h1>
                            <p className="text-sm text-muted-foreground mt-1">Study session • Exam: Feb 15, 2024</p>
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
                                                    <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
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
