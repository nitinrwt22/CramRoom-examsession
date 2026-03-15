import { Star } from 'lucide-react';
export function Reviews() {
    const reviews = [
        {
            quote: "CramRoom changed how I prepared for my GATE exam. The AI spots exactly where I'm weak and gives me a targeted revision list. I went from 60% to 89% in mock tests.",
            name: "Arjun Mehta",
            title: "GATE CS Aspirant, IIT Delhi",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBHp3qy_2X7w2FMet2F-GSkbqwD7m_uw3JO1pJ5plHUES59HOTcdnjvXwECtEFaerXr2hCS6TIe68nHaRGWtN-D2PY3A2fb25djLcaO2YXa7Amsyobko46tj_FzkNTMfjakQcsxwbeYAaHc_o2T6-YnEN420gquPKSKVjc-bPwXgvJUL83RVXxLdj7n2momergMgwMlF_8j9kKl8XN_2rEN-lTvRCTu4Kx3-qyUnaP1Jy6t4O2lLhTi3klKG_UZocoMtkAkcazJFLQj"
        },
        {
            quote: "I host group study sessions on CramRoom for my entire batch. Everyone asks the AI questions live and the whole session transcript becomes our revision notes. Genius.",
            name: "Priya Sharma",
            title: "3rd Year B.Tech, NIT Trichy",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDWDOpHYrvcOwJc4SdSk14hA2R4aZCG44BOTe4J8j7gQx2Zzs-MtTikU0lvCNMB2wpJ_h2WgEJcQK05Q4mxU6M6tiy7MejtePOGgX_mJCKez9l8DAmG4jpxcKcpNV2WTB7GgOe1jstHLiu0XbVePkBE3RfFPmE4ptMwOtS5gN6LnZeKcuePuGqrNK7Zy0zBlQ5gdO7YpbVklcvjrQJe6F6kG5mQptK3u1EKgCNzx6rB5HBlKAvWLXfdKMUCgwub_Rh9oMZhZA_8rFXJ"
        },
        {
            quote: "The weak topic tracker is the feature I didn't know I needed. After every session it tells me exactly which chapters to hit next. My exam prep has never felt this structured.",
            name: "Rohan Varma",
            title: "UPSC Aspirant | Delhi",
            avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBGXfwVy3wM65oloWmydruyLVOLAiRhSUPExOxP88KsZCchlFsyje3e5lNnV61PBwvaYZJCCDLfySVoEWGPnG8E2TUD36XM6AAAsxJNWN3lvQD6jZ1o1Dgz56_Ldc37pW276j_dlglG2n3hvyqPQkZHrnQCxMveu49iqnyfS7dXkJbSnZnSYdsYRJ9Cf0a_KZ-7L0brunQDQ408T_0q1JWN7XGbcHAC4_M5PWLn8asXuLVTVdqaGjnETKfh3duAQvwZVXHaEbPwrfnD"
        }
    ];

    const badges = ['Student Report', 'Top Score', 'Field Notes'];
    const rotations = ['rotate-1', '-rotate-2', 'rotate-2'];

    return (
        <>
        <hr className="rough-divider mx-auto max-w-7xl" />
        <section className="py-24 px-6 overflow-hidden" id="reviews" data-purpose="social-proof">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-display font-black mb-4 italic">&quot;Trusted by top scorers...&quot;</h2>
                    <div className="flex justify-center gap-1 text-primary mt-4">
                        {[...Array(5)].map((_, i) => (
                            <Star key={i} className="fill-primary text-primary w-6 h-6" />
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {reviews.map((review, index) => (
                        <div key={index} className={`tilted-notecard p-6 ${rotations[index % rotations.length]} hover:rotate-0 flex flex-col justify-between`}>
                            <div>
                                <div className="mb-4">
                                    <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-bold tracking-widest uppercase">{badges[index]}</span>
                                </div>
                                <p className="font-mono text-sm italic mb-8 opacity-90 text-foreground">&quot;{review.quote}&quot;</p>
                            </div>
                            <div className="flex items-center gap-4 border-t border-border/20 pt-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={review.avatar} alt={review.name} className="w-10 h-10 rounded-full grayscale opacity-80 object-cover border border-border" />
                                <div>
                                    <p className="text-xs font-bold uppercase text-foreground">{review.name}</p>
                                    <p className="text-[10px] text-foreground opacity-60 uppercase tracking-tight">{review.title}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
        </>
    );
}
