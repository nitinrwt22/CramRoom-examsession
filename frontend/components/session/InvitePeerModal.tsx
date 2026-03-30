'use client'

import { useState, useEffect } from 'react'
import { X, UserPlus, Copy, Check, Link2, Share2, Users } from 'lucide-react'

interface InvitePeerModalProps {
    isOpen: boolean
    onClose: () => void
    sessionId: string
    subject: string
}

export function InvitePeerModal({ isOpen, onClose, sessionId, subject }: InvitePeerModalProps) {
    const [copiedId, setCopiedId] = useState(false)
    const [copiedLink, setCopiedLink] = useState(false)
    const [joinLink, setJoinLink] = useState('')

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setJoinLink(`${window.location.origin}/sessions/join?id=${sessionId}`)
        }
    }, [sessionId])

    const handleCopyId = async () => {
        try {
            await navigator.clipboard.writeText(sessionId)
            setCopiedId(true)
            setTimeout(() => setCopiedId(false), 2000)
        } catch {
            // fallback
            const el = document.createElement('textarea')
            el.value = sessionId
            document.body.appendChild(el)
            el.select()
            document.execCommand('copy')
            document.body.removeChild(el)
            setCopiedId(true)
            setTimeout(() => setCopiedId(false), 2000)
        }
    }

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(joinLink)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
        } catch {
            const el = document.createElement('textarea')
            el.value = joinLink
            document.body.appendChild(el)
            el.select()
            document.execCommand('copy')
            document.body.removeChild(el)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header gradient accent */}
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Invite a Peer</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]">{subject}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 pb-6 space-y-4">

                    {/* Instruction */}
                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-xl">
                        <Users className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            Share your <strong>Session ID</strong> or the <strong>invite link</strong> below. Your peer can join from the Sessions page using either.
                        </p>
                    </div>

                    {/* Session ID */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                            Session ID
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-[#2A2A2C] border border-gray-200 dark:border-white/10 rounded-xl">
                                <span className="font-mono text-2xl font-black tracking-widest text-gray-900 dark:text-white">
                                    #{sessionId}
                                </span>
                            </div>
                            <button
                                onClick={handleCopyId}
                                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                                    copiedId
                                        ? 'bg-green-500 border-green-500 text-white'
                                        : 'bg-white dark:bg-[#2A2A2C] border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-white/30'
                                }`}
                                title="Copy Session ID"
                            >
                                {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-100 dark:bg-white/10" />
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">or share link</span>
                        <div className="flex-1 h-px bg-gray-100 dark:bg-white/10" />
                    </div>

                    {/* Join Link */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                            Invite Link
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-[#2A2A2C] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                                <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="text-xs text-gray-600 dark:text-gray-400 truncate font-mono">
                                    {joinLink || `…/sessions/join?id=${sessionId}`}
                                </span>
                            </div>
                            <button
                                onClick={handleCopyLink}
                                className={`h-10 px-3 rounded-xl flex items-center justify-center gap-1.5 shrink-0 border text-xs font-semibold transition-all duration-200 ${
                                    copiedLink
                                        ? 'bg-green-500 border-green-500 text-white'
                                        : 'bg-white dark:bg-[#2A2A2C] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-white/30 hover:text-gray-900 dark:hover:text-white'
                                }`}
                                title="Copy invite link"
                            >
                                {copiedLink
                                    ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                                    : <><Share2 className="w-3.5 h-3.5" /> Copy</>
                                }
                            </button>
                        </div>
                    </div>

                    {/* Footer note */}
                    <p className="text-[11px] text-gray-400 text-center pt-1">
                        This session requires sign-in. New peers must create an account first.
                    </p>
                </div>
            </div>
        </div>
    )
}
