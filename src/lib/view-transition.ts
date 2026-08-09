export async function runViewTransition(update: () => void | Promise<void>) {
  if (
    typeof document === 'undefined' ||
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await update()
    return
  }
  const transition = document.startViewTransition(update)
  await transition.updateCallbackDone
}
