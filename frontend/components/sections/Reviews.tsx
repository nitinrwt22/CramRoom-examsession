import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function Reviews() {
    const reviews = [
        {
            quote: "The first AI tool that actually remembers what I need across different projects. It's like having a second brain that never forgets.",
            name: "Sarah Jenkins",
            title: "Product Designer @ Linear",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBHp3qy_2X7w2FMet2F-GSkbqwD7m_uw3JO1pJ5plHUES59HOTcdnjvXwECtEFaerXr2hCS6TIe68nHaRGWtN-D2PY3A2fb25djLcaO2YXa7Amsyobko46tj_FzkNTMfjakQcsxwbeYAaHc_o2T6-YnEN420gquPKSKVjc-bPwXgvJUL83RVXxLdj7n2momergMgwMlF_8j9kKl8XN_2rEN-lTvRCTu4Kx3-qyUnaP1Jy6t4O2lLhTi3klKG_UZocoMtkAkcazJFLQj"
        },
        {
            quote: "CramRoom has completely changed how I research. The auto-organize feature is magic—I don't have to worry about folders anymore.",
            name: "Marcus Chen",
            title: "Software Engineer @ Vercel",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDWDOpHYrvcOwJc4SdSk14hA2R4aZCG44BOTe4J8j7gQx2Zzs-MtTikU0lvCNMB2wpJ_h2WgEJcQK05Q4mxU6M6tiy7MejtePOGgX_mJCKez9l8DAmG4jpxcKcpNV2WTB7GgOe1jstHLiu0XbVePkBE3RfFPmE4ptMwOtS5gN6LnZeKcuePuGqrNK7Zy0zBlQ5gdO7YpbVklcvjrQJe6F6kG5mQptK3u1EKgCNzx6rB5HBlKAvWLXfdKMUCgwub_Rh9oMZhZA_8rFXJ"
        },
        {
            quote: "The UI is incredibly clean and focused. It feels like a high-end studio for my thoughts rather than just another chat interface.",
            name: "Elena Rodriguez",
            title: "Freelance Consultant",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBGXfwVy3wM65oloWmydruyLVOLAiRhSUPExOxP88KsZCchlFsyje3e5lNnV61PBwvaYZJCCDLfySVoEWGPnG8E2TUD36XM6AAAsxJNWN3lvQD6jZ1o1Dgz56_Ldc37pW276j_dlglG2n3hvyqPQkZHrnQCxMveu49iqnyfS7dXkJbSnZnSYdsYRJ9Cf0a_KZ-7L0brunQDQ408T_0q1JWN7XGbcHAC4_M5PWLn8asXuLVTVdqaGjnETKfh3duAQvwZVXHaEbPwrfnD"
        }
    ];

    return (
        <section className="py-24" id="reviews">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Trusted by modern teams</h2>
                    <div className="flex justify-center gap-1 text-amber-400">
                        {[...Array(5)].map((_, i) => (
                            <Star key={i} className="fill-amber-400 text-amber-400 w-6 h-6" />
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {reviews.map((review, index) => (
                        <Card key={index} className="bg-slate-50 dark:bg-zinc-900 border-slate-100 dark:border-zinc-800">
                            <CardContent className="p-8 h-full flex flex-col justify-between">
                                <p className="mb-8 text-lg leading-relaxed italic text-muted-foreground">"{review.quote}"</p>
                                <div className="flex items-center gap-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={review.avatar} alt={review.name} className="w-12 h-12 rounded-full ring-2 ring-primary/20 object-cover" />
                                    <div>
                                        <p className="font-bold text-foreground">{review.name}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-tight">{review.title}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
