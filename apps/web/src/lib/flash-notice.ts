import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * A one-time message passed through navigation state (`navigate(to, { state:
 * { notice } })`), e.g. after saving. It is shown once and removed from the
 * history entry, so a reload doesn't repeat it. Never persisted.
 */
export function useFlashNotice(): [string | null, (notice: string | null) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  // Read once when the page mounts (pages are entered through navigation).
  const [notice, setNotice] = useState(() => readNotice(location.state));

  useEffect(() => {
    if (readNotice(location.state)) {
      void navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  return [notice, setNotice];
}

function readNotice(state: unknown): string | null {
  if (state && typeof state === 'object' && 'notice' in state) {
    const { notice } = state as { notice: unknown };
    return typeof notice === 'string' ? notice : null;
  }
  return null;
}
