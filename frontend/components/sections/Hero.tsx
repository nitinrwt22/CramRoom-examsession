import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
    return (
        <header className="relative overflow-hidden pt-24 pb-32 md:pt-32 md:pb-48">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(99,102,241,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1)_0%,transparent_70%)] pointer-events-none"></div>

            <div className="max-w-7xl mx-auto px-6 relative text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 mb-8">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                    <span className="text-xs font-bold text-primary tracking-wider uppercase">Beta v2.0 is now live</span>
                </div>

                <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight max-w-4xl mx-auto mb-8 leading-[1.1]">
                    Your AI Brain, <br />
                    <span className="text-primary italic">Organized</span> by Sessions
                </h1>

                <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-12 leading-relaxed">
                    CramRoom turns chaotic AI chats into structured workspaces with persistent memory and automated insights. Work faster, remember more.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button size="lg" className="w-full sm:w-auto px-8 py-6 rounded-xl text-md font-bold hover:scale-105 transition-all shadow-xl shadow-indigo-500/20" asChild>
                        <Link href="/register">
                            Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 py-6 rounded-xl text-md font-bold" asChild>
                        <Link href="#workflow">
                            Learn More
                        </Link>
                    </Button>
                </div>

                <div className="mt-20 relative max-w-5xl mx-auto">
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            alt="Code and terminal interface"
                            className="w-full grayscale dark:grayscale-0 opacity-80 dark:opacity-60 object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9PY2IUU5skV15x8t9icdN4gUC8iOqfX9bbItnxVhd9JolNgEd6Ce58Yqj01xtg1SA2kwc3H5sHQMoVnLL_etnRwqDs-twDBeX8t4UkUfsJzAYieS9AxjQtbyy6uMGjFNu5GwmqiC-sRDI8e5prP_JEw27fU1rsuWMEFXTPE5vJLphSSAMSsZlOexS07J1e_w8voRwHg_gDpIT3LfPwA3x3tVup1hvYuM6IdWZa2baoE_fbnbKTRWtojA7RtmpOjb8mcDQNKjeGtQf"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background dark:from-background via-transparent to-transparent"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-white/10 dark:bg-black/40 backdrop-blur-md p-8 rounded-full border border-white/20 hover:scale-110 transition-transform cursor-pointer">
                                <PlayCircle className="w-16 h-16 text-primary" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
