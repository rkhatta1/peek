const AUTH_TRANSITION_ATTRIBUTE = 'data-peek-auth-transition'
let activeAuthTransition = 0

export async function runAuthViewTransition(
  update: () => void | Promise<void>,
) {
  if (
    typeof document === 'undefined' ||
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await update()
    return
  }

  const transitionId = ++activeAuthTransition
  const root = document.documentElement
  root.setAttribute(AUTH_TRANSITION_ATTRIBUTE, '')
  const transition = document.startViewTransition(update)
  const clearTransitionScope = () => {
    if (activeAuthTransition === transitionId) {
      root.removeAttribute(AUTH_TRANSITION_ATTRIBUTE)
    }
  }
  void transition.finished.then(clearTransitionScope, clearTransitionScope)
  await transition.updateCallbackDone
}
