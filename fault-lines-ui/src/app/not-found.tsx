import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl">Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm text-balance">
        There is no program at this address. Every program lives on the
        console.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Back to the console</Link>
      </Button>
    </div>
  );
}
