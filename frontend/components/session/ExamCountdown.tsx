'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExamCountdownProps {
    targetDate: string;
}

const SkullIcon = () => (
    <div className="relative flex items-center justify-center shrink-0">
        {/* Yellow Warning Triangle with thick black border */}
        <svg
            viewBox="0 0 24 24"
            className="w-7 h-7 fill-yellow-400 stroke-black stroke-[2.5]"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
        
        {/* Aggressive Skull & Crossbones inside */}
        <div className="absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-black fill-current"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Skull head */}
                <path d="M12 2a4.5 4.5 0 0 0-4.5 4.5v2.5c0 1 .5 2 1.5 2.5v1.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5v-1.5c1-.5 1.5-1.5 1.5-2.5v-2.5A4.5 4.5 0 0 0 12 2z" />
                {/* Eye sockets */}
                <circle cx="9.5" cy="8" r="1.2" fill="white" />
                <circle cx="14.5" cy="8" r="1.2" fill="white" />
                {/* Nose hole */}
                <path d="M12 10.5l-0.8 1.2h1.6z" fill="white" />
                {/* Teeth/Jaw lines */}
                <rect x="10" y="13.5" width="1" height="1.5" rx="0.2" fill="white" />
                <rect x="11.5" y="13.5" width="1" height="1.5" rx="0.2" fill="white" />
                <rect x="13" y="13.5" width="1" height="1.5" rx="0.2" fill="white" />
                {/* Minimal crossbones below */}
                <path d="M7 16l10 4M17 16l-10 4" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        </div>
    </div>
)

export default function ExamCountdown({ targetDate }: ExamCountdownProps) {
    const [timeLeft, setTimeLeft] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        isOver: boolean;
    }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false })

    useEffect(() => {
        const calculateTimeLeft = () => {
            const difference = +new Date(targetDate) - +new Date()
            
            if (difference <= 0) {
                return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true }
            }

            return {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
                isOver: false
            }
        }

        setTimeLeft(calculateTimeLeft())
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft())
        }, 1000)

        return () => clearInterval(timer)
    }, [targetDate])

    const formatNum = (num: number) => num.toString().padStart(2, '0')

    const isLowTime = !timeLeft.isOver && timeLeft.days === 0 && timeLeft.hours < 24
    const isCritical = !timeLeft.isOver && timeLeft.days === 0 && timeLeft.hours < 3

    return (
        <div className={cn(
            "flex items-center gap-3 px-3 h-10 rounded-lg transition-all duration-300 border shadow-sm",
            timeLeft.isOver ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40" :
            isLowTime ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/40" :
            "bg-blue-50/50 dark:bg-white/5 border-gray-200 dark:border-white/10"
        )}>
            {/* Pulsing Warning Icon */}
            <div className={cn(
                "transition-transform duration-500",
                (isLowTime || timeLeft.isOver) && "animate-pulse"
            )}>
                <SkullIcon />
            </div>

            {/* Countdown Text */}
            <div className="flex flex-col justify-center">
                <span className="text-[8px] uppercase font-black text-gray-500 dark:text-gray-400 tracking-wider leading-none mb-0.5">
                    {timeLeft.isOver ? "Time Elapsed" : "Exam Countdown"}
                </span>
                
                <div className={cn(
                    "font-mono text-[15px] font-black tracking-widest transition-colors duration-300 leading-none",
                    timeLeft.isOver ? "text-red-600 dark:text-red-500 animate-pulse" : 
                    isCritical ? "text-red-500 dark:text-red-400" :
                    isLowTime ? "text-orange-500 dark:text-orange-400" :
                    "text-blue-600 dark:text-blue-400"
                )}>
                    {timeLeft.isOver ? (
                        <span className="text-[14px]">TIME OVER</span>
                    ) : (
                        <div className="flex items-center gap-1">
                            <span>{formatNum(timeLeft.days)}</span>
                            <span className="text-[10px] opacity-40 font-normal">:</span>
                            <span>{formatNum(timeLeft.hours)}</span>
                            <span className="text-[10px] opacity-40 font-normal">:</span>
                            <span>{formatNum(timeLeft.minutes)}</span>
                            <span className="text-[10px] opacity-40 font-normal">:</span>
                            <span>{formatNum(timeLeft.seconds)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
