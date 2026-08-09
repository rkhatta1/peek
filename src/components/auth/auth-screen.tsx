import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'

import { authClient } from '#/lib/auth-client'
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

type AuthMode = 'sign-in' | 'sign-up'

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Something went wrong. Please try again.'
}

export function AuthScreen({
  onAuthenticated,
  onBack,
}: {
  onAuthenticated: () => Promise<void>
  onBack: () => Promise<void>
}) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const name = String(data.get('name') ?? '').trim()

    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password })

      if (result.error) throw result.error
      await onAuthenticated()
    } catch (caught) {
      setError(errorMessage(caught))
      setPending(false)
    }
  }

  function changeMode(next: AuthMode) {
    setMode(next)
    setError(null)
  }

  return (
    <main
      id="main-content"
      className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_30rem]"
    >
      <section className="hidden border-r bg-[#0a0a0a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="grid size-6 place-items-center rounded-md bg-white text-xs font-bold text-black">
            P
          </span>
          Peek
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-white/50">
            External infrastructure monitoring
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em]">
            Quiet when systems are healthy. Precise when they are not.
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-sm leading-6 text-white/55">
            A focused operational view of Neon Postgres and Upstash Redis for
            client systems.
          </p>
        </div>
        <p className="text-xs text-white/35">Built for MRM consultancy</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <Card className="w-full max-w-sm border-0 shadow-none">
          <CardHeader className="px-0">
            <div className="mb-7 flex items-center gap-2 text-sm font-medium lg:hidden">
              <span className="grid size-6 place-items-center rounded-md bg-foreground text-xs font-bold text-background">
                P
              </span>
              Peek
            </div>
            <CardTitle className="text-2xl tracking-[-0.03em]">
              {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
            </CardTitle>
            <CardDescription>
              {mode === 'sign-in'
                ? 'Sign in to inspect your client infrastructure.'
                : 'Start monitoring Neon and Upstash from one place.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <form className="space-y-4" onSubmit={submit}>
              {mode === 'sign-up' ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Raaj Khattar"
                    required
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      mode === 'sign-in' ? 'current-password' : 'new-password'
                    }
                    minLength={8}
                    className="pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 text-muted-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {mode === 'sign-up' ? (
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters.
                  </p>
                ) : null}
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button className="w-full" disabled={pending} type="submit">
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'sign-in' ? 'New to Peek?' : 'Already have an account?'}{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-foreground"
                onClick={() =>
                  changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                }
              >
                {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
              </Button>
            </p>
            <Button
              type="button"
              variant="link"
              className="mt-2 h-auto w-full p-0 text-xs text-muted-foreground"
              onClick={() => void onBack()}
            >
              Back to access code
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
