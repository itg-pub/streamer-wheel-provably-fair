import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-16 w-full rounded-md border px-3 py-2 text-base transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
