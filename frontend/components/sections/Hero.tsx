import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Hero() {
    return (
        <header className="relative pt-16 pb-24 px-6" data-purpose="hero-section">
            <div className="max-w-5xl mx-auto text-center relative z-10">
                <h1 className="font-display text-6xl md:text-8xl font-black mb-6 leading-none tracking-tight">
                    Crack Your Exams <br />
                    <span className="brushstroke-text italic">Intelligently</span>
                </h1>

                <p className="max-w-2xl mx-auto text-xl font-mono mb-12 leading-relaxed opacity-90">
                    CramRoom is the AI study partner built for serious students. Join live exam sessions, get real-time hints, track your weak topics, and walk into every exam ready.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4 mb-20">
                    <Button className="bg-primary text-primary-foreground font-display text-2xl h-auto px-10 py-4 rounded-none transform -rotate-1 shadow-[4px_4px_0px_0px_rgba(26,26,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all" asChild>
                        <Link href="/register">
                            START STUDYING
                        </Link>
                    </Button>
                    <Button variant="outline" className="border-2 border-border text-foreground font-display text-2xl h-auto px-10 py-4 rounded-none transform rotate-1 hover:bg-foreground hover:text-background transition-all" asChild>
                        <Link href="#workflow">
                            SEE HOW IT WORKS
                        </Link>
                    </Button>
                </div>

                <div className="relative max-w-4xl mx-auto mt-12" data-purpose="hero-demo">
                    <div className="torn-notebook p-8 text-left min-h-[400px] border border-border/10">
                        <div className="flex justify-between items-start mb-8 border-b border-dashed border-border/20 pb-4">
                            <div>
                                <h3 className="font-display text-2xl uppercase font-black">Active Session: CS-301 Final Prep</h3>
                                <p className="text-xs font-mono opacity-60 italic">Session ID: #4421 | Host: Nitin R. | {new Date().toLocaleDateString()} | Status: Live</p>
                            </div>
                            <div className="bg-primary/10 text-primary px-3 py-1 font-mono text-xs font-bold border border-primary/40 rotate-2">
                                LIVE
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 border-2 border-primary bg-primary/20"></div>
                                    <span className="font-bold underline decoration-primary">Revise: Dijkstra&apos;s Algorithm</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 border border-border"></div>
                                    <span>Practice: Dynamic Programming patterns</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 border border-border"></div>
                                    <span className="line-through opacity-50">Mock Test: Data Structures MCQs</span>
                                </div>
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/20">
                                    <span className="text-xs font-mono opacity-60">AI Insight:</span>
                                    <span className="text-xs font-mono text-primary font-bold">Weak on graph traversal — review BFS/DFS</span>
                                </div>
                            </div>
                            
                            <div className="bg-background p-4 border border-border/5 transform rotate-1 shadow-sm">
                                <p className="text-sm italic leading-relaxed">
                                    &quot;Session analysis complete. You answered 7/10 on Sorting correctly. AI recommends 20 min on Heap Sort before tomorrow&apos;s paper.&quot;
                                </p>
                                <p className="text-right mt-2 font-bold">— CramRoom AI</p>
                            </div>
                        </div>
                    </div>

                    <div className="absolute -bottom-10 -right-6 transform rotate-12 opacity-80 pointer-events-none">
                        <svg height="120" viewBox="0 0 100 100" width="120">
                            <circle cx="50" cy="50" fill="none" r="45" stroke="var(--color-pulp-red)" strokeDasharray="2,2" strokeWidth="2"></circle>
                            <text fill="var(--color-pulp-red)" fontFamily="Playfair Display" fontSize="12" fontWeight="bold" textAnchor="middle" x="50" y="45">EXAM READY</text>
                            <text fill="var(--color-pulp-red)" fontFamily="Courier Prime" fontSize="8" textAnchor="middle" x="50" y="65">CRAMROOM AI™</text>
                        </svg>
                    </div>
                </div>
            </div>
        </header>
    );
}
