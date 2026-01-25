'use client'

import React from "react"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!email || !password) {
            setError('Please fill in all fields')
            return
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Please enter a valid email address')
            return
        }

        try {
            const { data } = await api.post('/auth/login', { email, password })
            localStorage.setItem('token', data.token)
            router.push('/dashboard')
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
            <div className="w-full max-w-md">
                <Card className="border-0 shadow-lg">
                    <CardHeader className="space-y-3 text-center pb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary mb-2 mx-auto">
                            <span className="text-lg font-bold text-primary-foreground">📚</span>
                        </div>
                        <CardTitle className="text-3xl font-bold tracking-tight">CramRoom</CardTitle>
                        <CardDescription className="text-sm">
                            Sign in to your study sessions
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium text-foreground">
                                    Email Address
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-10"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium text-foreground">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-10"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                    <p className="text-sm text-destructive font-medium">{error}</p>
                                </div>
                            )}

                            <Button type="submit" className="w-full h-10 font-medium">
                                Sign In
                            </Button>
                        </form>

                        <div className="mt-6 pt-4 border-t border-border text-center">
                            <p className="text-sm text-muted-foreground">
                                Don&apos;t have an account?{' '}
                                <Link href="/register" className="font-semibold text-primary hover:underline">
                                    Register
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-muted-foreground mt-4">
                    Time-bound collaborative exam preparation
                </p>
            </div>
        </div>
    )
}
