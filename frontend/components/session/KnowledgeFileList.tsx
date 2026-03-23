'use client'

import { Loader2, BrainCircuit, Plus } from 'lucide-react'
import { KnowledgeFileItem, KnowledgeFile } from './KnowledgeFileItem'

interface KnowledgeFileListProps {
    files: KnowledgeFile[]
    loading: boolean
    onAddClick: () => void
    onDelete: (id: number) => void
}

export function KnowledgeFileList({ files, loading, onAddClick, onDelete }: KnowledgeFileListProps) {
    return (
        <div className="mt-8">
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Knowledge Base</h3>
                    {files.length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">
                            {files.length} file{files.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <button
                    onClick={onAddClick}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add File
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400 border-2 border-dashed border-gray-100 dark:border-white/8 rounded-xl">
                    <BrainCircuit className="w-8 h-8 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No knowledge files yet</p>
                    <p className="text-xs mt-1 opacity-60">Upload .md files so AI can reference them</p>
                    <button
                        onClick={onAddClick}
                        className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add your first file
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {files.map((file) => (
                        <KnowledgeFileItem key={file.id} file={file} onDelete={onDelete} />
                    ))}
                </div>
            )}

            {/* Info pill */}
            {files.length > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1">
                    <BrainCircuit className="w-3 h-3" />
                    AI reads these files as context when you ask questions.
                </p>
            )}
        </div>
    )
}
