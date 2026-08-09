import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export function AccessGate({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const code = String(new FormData(event.currentTarget).get('code') ?? '')
    try {
      const response = await fetch('/api/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'That access code is not valid.'
            : 'Unable to verify the access code.',
        )
        return
      }
      await onSuccess()
    } catch {
      setError('Unable to verify the access code.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main
      id="main-content"
      className="grid min-h-svh place-items-center bg-background p-5 sm:p-10"
    >
      <Card className="w-full max-w-sm border-0 shadow-none">
        <CardHeader className="px-0 text-center">
          <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-muted">
            <KeyRound aria-hidden="true" className="size-4" />
          </div>
          <CardTitle className="text-2xl tracking-[-0.03em]">
            Enter access code
          </CardTitle>
          <CardDescription>This Peek workspace is private.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="access-code">Access code</Label>
              <Input
                id="access-code"
                name="code"
                type="password"
                autoComplete="off"
                maxLength={200}
                required
                autoFocus
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
