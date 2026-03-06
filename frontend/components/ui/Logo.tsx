import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
    className?: string;
    iconSize?: number;
}

export function Logo({ className, iconSize = 24 }: LogoProps) {
    return (
        <div
            className={cn(
                "bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20",
                className
            )}
        >
            <Brain className="text-white" size={iconSize} />
        </div>
    );
}
