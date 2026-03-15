import { BookOpen, Brain, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function Workflow() {
    const steps = [
        {
            id: '01',
            title: 'Open a Session',
            description: 'Create or join a focused exam prep session for any subject — from CS fundamentals to UPSC strategy.',
            icon: BookOpen
        },
        {
            id: '02',
            title: 'Study with AI',
            description: 'Get real-time AI hints, explanations, and topic deep-dives, all scoped to your current session context.',
            icon: Brain
        },
        {
            id: '03',
            title: 'Collaborate',
            description: 'Study with peers in shared sessions. The host controls the flow; everyone benefits from the AI.',
            icon: Users
        },
        {
            id: '04',
            title: 'Track Progress',
            description: 'AI identifies your weakest topics from every session and builds a personalized revision plan automatically.',
            icon: TrendingUp
        }
    ];

    return (
        <>
        <hr className="rough-divider mx-auto max-w-7xl" />
        <section className="py-20 px-6 bg-foreground/5" id="workflow" data-purpose="features">
            <div className="max-w-7xl mx-auto">
                <h2 className="font-display text-4xl md:text-5xl font-black mb-16 text-center underline decoration-primary decoration-4 underline-offset-8 uppercase">
                    How CramRoom Works
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                    {steps.map((step) => (
                        <Card key={step.id} className="group border-none shadow-none bg-transparent hover:bg-transparent text-center transition-all duration-300">
                            <CardContent className="p-0">
                                <div className="mb-6 inline-block transform transition-transform group-hover:scale-110">
                                    <step.icon className="w-16 h-16 stroke-1 text-foreground" />
                                </div>
                                <h4 className="font-display text-xl font-bold mb-3 uppercase">{step.title}</h4>
                                <p className="text-sm font-mono leading-relaxed opacity-80">
                                    {step.description}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
        </>
    );
}
