import Link from 'next/link';
import { Brain, Twitter, Github } from 'lucide-react';

export function Footer() {
    return (
        <footer className="py-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="flex flex-col items-center md:items-start">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                                <Brain className="text-white w-4 h-4" />
                            </div>
                            <span className="text-lg font-bold tracking-tight">CramRoom</span>
                        </div>
                        <p className="text-slate-500 text-sm">Building the future of structured intelligence.</p>
                    </div>
                    <div className="flex gap-12 text-sm">
                        <div className="flex flex-col gap-3">
                            <p className="font-bold mb-1">Product</p>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Features</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Workflow</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Pricing</Link>
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="font-bold mb-1">Company</p>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">About</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Blog</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Careers</Link>
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="font-bold mb-1">Legal</p>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Privacy</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Terms</Link>
                            <Link className="text-slate-500 hover:text-primary transition-colors" href="#">Docs</Link>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link className="text-slate-400 hover:text-primary transition-colors" href="#">
                            <Twitter className="w-5 h-5" />
                        </Link>
                        <Link className="text-slate-400 hover:text-primary transition-colors" href="#">
                            <Github className="w-5 h-5" />
                        </Link>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t border-slate-100 dark:border-zinc-900 text-center text-xs text-slate-400">
                    © {new Date().getFullYear()} CramRoom Technologies Inc. All rights reserved.
                </div>
            </div>
        </footer>
    );
}
