'use client'

import { useState, useRef } from 'react'
import { X, Upload, CheckCircle, Loader2, FileText, BookOpen, ClipboardList, Link, FileCode } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KnowledgeContentType =
    | 'notes'
    | 'pyqs'
    | 'assignments'
    | 'references'
    | 'cheatsheets'

const CONTENT_TYPES: {
    value: KnowledgeContentType
    label: string
    desc: string
    icon: React.ReactNode
    color: string
}[] = [
    {
        value: 'notes',
        label: 'Notes',
        desc: 'Concept notes, theory, summaries',
        icon: <BookOpen className="w-4 h-4" />,
        color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    {
        value: 'pyqs',
        label: 'PYQs',
        desc: 'Previous year questions, practice papers',
        icon: <FileText className="w-4 h-4" />,
        color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    },
    {
        value: 'assignments',
        label: 'Assignments',
        desc: 'Lab tasks, problem sets',
        icon: <ClipboardList className="w-4 h-4" />,
        color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    {
        value: 'references',
        label: 'References',
        desc: 'Book excerpts, articles, links',
        icon: <Link className="w-4 h-4" />,
        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    {
        value: 'cheatsheets',
        label: 'Cheatsheet',
        desc: 'Formulas, syntax quick-refs',
        icon: <FileCode className="w-4 h-4" />,
        color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface KnowledgeUploadModalProps {
    isOpen: boolean
    onClose: () => void
    onUpload: (file: File, contentType: KnowledgeContentType) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KnowledgeUploadModal({ isOpen, onClose, onUpload }: KnowledgeUploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [contentType, setContentType] = useState<KnowledgeContentType>('notes')
    const [isDragging, setIsDragging] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    if (!isOpen) return null

    const handleFile = (file: File) => {
        if (!file.name.endsWith('.md')) {
            setError('Only .md (Markdown) files are supported.')
            return
        }
        setError(null)
        setSelectedFile(file)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }

    const handleUpload = async () => {
        if (!selectedFile) return
        setUploading(true)
        setError(null)
        try {
            await onUpload(selectedFile, contentType)
            handleClose()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } }; message?: string }
            setError(e?.response?.data?.error || e?.message || 'Upload failed')
        } finally {
            setUploading(false)
        }
    }

    const handleClose = () => {
        setSelectedFile(null)
        setError(null)
        setUploading(false)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/8">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 dark:text-white">Add Knowledge File</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upload a .md file — AI will use it as context</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/8 text-gray-500 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Step 1: File type selector */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                            1 — What type of file is this?
                        </p>
                        <div className="grid grid-cols-5 gap-2">
                            {CONTENT_TYPES.map((ct) => (
                                <button
                                    key={ct.value}
                                    onClick={() => setContentType(ct.value)}
                                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all ${
                                        contentType === ct.value
                                            ? ct.color + ' border-current ring-1 ring-current/30'
                                            : 'border-gray-200 dark:border-white/8 text-gray-500 dark:text-gray-500 hover:border-gray-300 dark:hover:border-white/15'
                                    }`}
                                >
                                    <span className="opacity-80">{ct.icon}</span>
                                    <span className="text-[10px] font-bold leading-tight">{ct.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 ml-0.5">
                            {CONTENT_TYPES.find(ct => ct.value === contentType)?.desc}
                        </p>
                    </div>

                    {/* Step 2: File drop zone */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                            2 — Upload your .md file
                        </p>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => inputRef.current?.click()}
                            className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none ${
                                isDragging
                                    ? 'border-blue-500 bg-blue-500/5'
                                    : selectedFile
                                    ? 'border-emerald-500/50 bg-emerald-500/5'
                                    : 'border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20 bg-gray-50/50 dark:bg-white/3'
                            }`}
                        >
                            {selectedFile ? (
                                <>
                                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{selectedFile.name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB · Click to change</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/8 flex items-center justify-center">
                                        <Upload className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Drop your .md file here</p>
                                        <p className="text-xs text-gray-400 mt-0.5">or click to browse</p>
                                    </div>
                                </>
                            )}
                        </div>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".md"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.currentTarget.files?.[0]
                                if (f) handleFile(f)
                            }}
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                            {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={handleClose}
                            disabled={uploading}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Uploading…
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Upload & Parse
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
