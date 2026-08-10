import type { CodeAttribution } from './monitoring-context'
import { formatDateTime } from './monitoring-data'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'

export function CodeAttributionPanel({
  attribution,
  error,
  loading,
}: {
  attribution: CodeAttribution | null
  error: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }
  if (error) return <p className="mt-2 text-sm text-destructive">{error}</p>
  if (!attribution?.github && !attribution?.vercel) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Connect GitHub or Vercel to resolve code state for this event.
      </p>
    )
  }

  return (
    <div className="mt-2 grid gap-3 md:grid-cols-2">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">GitHub</CardTitle>
          <CardDescription className="text-xs">
            Latest selected-branch commit at observation time
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t px-4 py-3">
          {attribution.github?.data ? (
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <a
                  className="font-medium underline-offset-4 hover:underline"
                  href={attribution.github.data.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {shortSha(attribution.github.data.sha)} ·{' '}
                  {attribution.github.data.message}
                </a>
                <p className="mt-1 text-muted-foreground">
                  {attribution.github.data.authorLogin
                    ? `@${attribution.github.data.authorLogin} · `
                    : ''}
                  {formatDateTime(attribution.github.data.committedAt)}
                </p>
              </div>
              {attribution.github.data.pullRequests.length ? (
                <div className="flex flex-col gap-1">
                  {attribution.github.data.pullRequests.map((pullRequest) => (
                    <a
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      href={pullRequest.url}
                      key={pullRequest.number}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PR #{pullRequest.number} · {pullRequest.title}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No associated pull request.
                </p>
              )}
            </div>
          ) : (
            <AttributionUnavailable
              connected={Boolean(attribution.github)}
              errorCode={attribution.github?.errorCode ?? null}
            />
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Vercel</CardTitle>
          <CardDescription className="text-xs">
            Latest ready production deployment from main
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t px-4 py-3">
          {attribution.vercel?.data ? (
            <div className="flex flex-col gap-2 text-xs">
              <a
                className="font-medium underline-offset-4 hover:underline"
                href={attribution.vercel.data.url}
                rel="noreferrer"
                target="_blank"
              >
                {attribution.vercel.data.name} ·{' '}
                {attribution.vercel.data.deploymentId}
              </a>
              <p className="text-muted-foreground">
                Ready {formatDateTime(attribution.vercel.data.readyAt)}
              </p>
              {attribution.vercel.data.commitSha ? (
                <p className="tabular-nums text-muted-foreground">
                  Commit {shortSha(attribution.vercel.data.commitSha)}
                </p>
              ) : null}
            </div>
          ) : (
            <AttributionUnavailable
              connected={Boolean(attribution.vercel)}
              errorCode={attribution.vercel?.errorCode ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AttributionUnavailable({
  connected,
  errorCode,
}: {
  connected: boolean
  errorCode: string | null
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {connected
        ? attributionErrorMessage(errorCode)
        : 'Not connected for this project.'}
    </p>
  )
}

function attributionErrorMessage(errorCode: string | null) {
  if (!errorCode) return 'No matching code state before this event.'
  if (errorCode === 'CREDENTIAL_NOT_CONFIGURED') {
    return 'Update this connection to add its provider token.'
  }
  if (errorCode === 'CREDENTIAL_REJECTED') return 'Provider rejected the token.'
  if (errorCode.startsWith('CREDENTIAL_')) {
    return 'Stored credentials could not be used. Update this connection.'
  }
  if (errorCode === 'RESOURCE_NOT_FOUND') {
    return 'Connected resource was not found.'
  }
  return 'Provider attribution is temporarily unavailable.'
}

function shortSha(sha: string) {
  return sha.slice(0, 7)
}
