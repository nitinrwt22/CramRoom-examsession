'use client'

import { X, Bell, Moon, LogOut, Settings, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    subject: string
    onLeaveSession: () => void
    onLogout: () => void
}

export function SettingsModal({ isOpen, onClose, subject, onLeaveSession, onLogout }: SettingsModalProps) {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full z-50 w-[320px] bg-white dark:bg-[#1A1A1C] border-l border-gray-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right-5 fade-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Settings</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">

                    {/* Session Info */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Session</p>
                        <div className="bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-white/5 rounded-xl p-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Current Subject</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{subject}</p>
                        </div>
                    </div>

                    {/* Preferences */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Preferences</p>
                        <div className="space-y-1">
                            {/* Notifications toggle (UI only for now) */}
                            <SettingRow
                                icon={<Bell className="w-4 h-4 text-blue-500" />}
                                label="Notifications"
                                description="Coming soon"
                                disabled
                            />
                            {/* Appearance toggle */}
                            <SettingRow
                                icon={theme === 'dark' ? <Moon className="w-4 h-4 text-purple-500" /> : <Sun className="w-4 h-4 text-orange-500" />}
                                label="Appearance"
                                description={`${theme === 'dark' ? 'Dark' : 'Light'} Mode`}
                                isActive={theme === 'dark'}
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            />
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Session Actions</p>
                        <div className="space-y-2">
                            <button
                                onClick={() => { onLeaveSession(); onClose(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm font-semibold"
                            >
                                <LogOut className="w-4 h-4" />
                                Leave Session
                            </button>
                            <button
                                onClick={() => { onLogout(); onClose(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-sm font-medium"
                            >
                                <LogOut className="w-4 h-4 rotate-180" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 dark:border-white/5 shrink-0">
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
                        More settings coming soon
                    </p>
                </div>
            </div>
        </>
    )
}

function SettingRow({
    icon,
    label,
    description,
    disabled = false,
    isActive = false,
    onClick,
}: {
    icon: React.ReactNode
    label: string
    description?: string
    disabled?: boolean
    isActive?: boolean
    onClick?: () => void
}) {
    return (
        <div 
            onClick={!disabled ? onClick : undefined}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
            disabled
                ? 'bg-gray-50/50 dark:bg-[#111113]/50 border-gray-100 dark:border-white/5 opacity-60 cursor-not-allowed'
                : 'bg-white dark:bg-[#111113] border-gray-200 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer'
        }`}>
            <div className="flex items-center gap-3">
                {icon}
                <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                    {description && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            {!disabled && (
                <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex ${isActive ? 'bg-purple-500 justify-end' : 'bg-gray-200 dark:bg-zinc-700 justify-start'}`}>
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
            )}
        </div>
    )
}
