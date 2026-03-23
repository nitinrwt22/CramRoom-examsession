'use client'

import { BookOpen, FileText, ClipboardList, Link, FileCode, Trash2, Layers } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KnowledgeContentType =
    | 'notes'
    | 'pyqs'
    | 'assignments'
    | 'references'
    | 'cheatsheets'

export interface KnowledgeFile {
    id: number
    title: string
    topic: string
    content_type: KnowledgeContentType
    chunk_count: number
    created_at: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const TYPE_CONFIG: Record<KnowledgeContentType, {
    label: string
    icon: React.ReactNode
    badgeClass: string
}> = {
    notes:       { label: 'Notes',       icon: <BookOpen   className="w-3.5 h-3.5" />, badgeClass: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20' },
    pyqs:        { label: 'PYQs',        icon: <FileText   className="w-3.5 h-3.5" />, badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
    assignments: { label: 'Assignment',  icon: <ClipboardList className="w-3.5 h-3.5" />, badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
    references:  { label: 'Reference',  icon: <Link       className="w-3.5 h-3.5" />, badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    cheatsheets: { label: 'Cheatsheet', icon: <FileCode   className="w-3.5 h-3.5" />, badgeClass: 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20' },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface KnowledgeFileItemProps {
    file: KnowledgeFile
    onDelete: (id: number) => void
}

export function KnowledgeFileItem({ file, onDelete }: KnowledgeFileItemProps) {
    const config = TYPE_CONFIG[file.content_type] ?? TYPE_CONFIG['notes']

    const formattedDate = new Date(file.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })

    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#1E1E20] border border-gray-200 dark:border-white/6 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
            {/* Left — Icon + Info */}
            <div className="flex items-center gap-3 overflow-hidden">
                {/* Type icon pill */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${config.badgeClass}`}>
                    {config.icon}
                </div>

                <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{file.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${config.badgeClass}`}>
                            {config.label}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" />
                            {file.chunk_count} chunks · {formattedDate}
                        </span>
                    </div>
                </div>
            </div>

            {/* Right — Delete */}
            <button
                onClick={() => onDelete(file.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-3"
                title="Remove from session"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
