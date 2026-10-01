import { useNavigation } from 'react-router';
import { Spinner } from '@/components/ui/spinner';

/**
 * Cold-start fallback while the first route's code downloads (before any
 * layout exists). Later navigations keep the current page and show
 * `RouteProgress` instead.
 */
export function RouteLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

/**
 * Slim bar at the top of the window while the router loads the next page's
 * code. The current page stays visible and usable. The bar fades in only
 * after a short delay (`animate-delayed-show`), so fast navigations don't
 * flicker; under reduced motion it is static.
 */
export function RouteProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;

  return (
    <div className="fixed inset-x-0 top-0 z-60 h-0.5 animate-delayed-show overflow-hidden bg-primary/20 opacity-0">
      <progress className="sr-only" aria-label="Loading page" />
      <div
        aria-hidden="true"
        className="h-full w-1/3 animate-route-progress rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none"
      />
    </div>
  );
}
