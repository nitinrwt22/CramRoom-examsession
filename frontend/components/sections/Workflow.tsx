import { Zap, MessageSquare, Network, LineChart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function Workflow() {
    const steps = [
        {
            id: '01',
            title: 'Start Session',
            description: 'Initialize a new context-aware session dedicated to a specific project or topic.',
            icon: Zap
        },
        {
            id: '02',
            title: 'Chat with AI',
            description: 'Interact with high-performance LLMs that have full access to your session\'s memory.',
            icon: MessageSquare
        },
        {
            id: '03',
            title: 'Auto-Organize',
            description: 'CramRoom automatically tags and categorizes key insights and files as you go.',
            icon: Network
        },
        {
            id: '04',
            title: 'Get Insights',
            description: 'Review structured summaries and visual maps of your entire thought process.',
            icon: LineChart
        }
    ];

    return (
        <section className="py-24 bg-slate-50 dark:bg-zinc-950/50" id="workflow">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">How it works</h2>
                    <p className="text-slate-600 dark:text-slate-400">Streamline your cognitive workflow in four simple steps.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {steps.map((step) => (
                        <Card key={step.id} className="group border-slate-200 dark:border-slate-800 hover:border-primary/50 transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
                            <CardContent className="p-8">
                                <div className="mb-6 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step {step.id}</span>
                                        <div className="bg-primary/10 p-2 rounded-lg text-primary">
                                            <step.icon className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold">{step.title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
