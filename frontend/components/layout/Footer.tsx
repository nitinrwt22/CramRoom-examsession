import Link from 'next/link';
import { Brain, Twitter, Github } from 'lucide-react';

export function Footer() {
    return (
        <footer className="pt-20 pb-10 px-6 border-t-4 border-foreground bg-background" data-purpose="footer">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    <div className="col-span-1 md:col-span-1">
                        <div className="flex items-center gap-2 mb-6">
                            <Brain className="text-foreground w-8 h-8" />
                            <h3 className="font-display text-3xl font-black uppercase italic tracking-tighter">CRAMROOM</h3>
                        </div>
                        <p className="text-xs font-mono leading-relaxed opacity-70">
                            AI-powered collaborative exam prep. <br/>
                            Study smarter. Score higher. <br/>
                            Built {new Date().getFullYear()}.
                        </p>
                    </div>
                    <div className="border-l-0 md:border-l border-border/20 pl-0 md:pl-8">
                        <h4 className="font-bold text-xs uppercase tracking-widest mb-4">Product</h4>
                        <div className="flex flex-col gap-3 font-mono text-xs opacity-80">
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/#workflow">How It Works</Link>
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/#reviews">Reviews</Link>
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/register">Sign Up Free</Link>
                        </div>
                    </div>
                    <div className="border-l-0 md:border-l border-border/20 pl-0 md:pl-8">
                        <h4 className="font-bold text-xs uppercase tracking-widest mb-4">Study</h4>
                        <div className="flex flex-col gap-3 font-mono text-xs opacity-80">
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/login">Join a Session</Link>
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/register">Create Account</Link>
                            <Link className="hover:text-primary underline decoration-foreground/10 transition-colors" href="/dashboard">Dashboard</Link>
                        </div>
                    </div>
                    <div className="border-l-0 md:border-l border-border/20 pl-0 md:pl-8">
                        <h4 className="font-bold text-xs uppercase tracking-widest mb-4">Stay Updated</h4>
                        <p className="text-xs font-mono mb-4 opacity-80">Get exam tips and product updates.</p>
                        <div className="flex">
                            <input className="bg-transparent border border-border/30 p-2 text-xs font-mono focus:outline-none focus:border-primary w-full" placeholder="student@college.edu" type="email" />
                            <button className="bg-foreground text-background px-4 text-xs font-bold uppercase tracking-tighter hover:bg-primary transition-colors">Send</button>
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-border/10 text-[10px] font-mono flex flex-col md:flex-row justify-between items-center gap-4 opacity-50 uppercase tracking-widest">
                    <p>© {new Date().getFullYear()} CramRoom. AI Study Platform. All Rights Reserved.</p>
                    <div className="flex gap-4">
                        <Link className="hover:text-primary transition-colors flex items-center gap-1" href="#"><Twitter className="w-3 h-3"/> Twitter</Link>
                        <span>/</span>
                        <Link className="hover:text-primary transition-colors flex items-center gap-1" href="#"><Github className="w-3 h-3"/> GitHub</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
