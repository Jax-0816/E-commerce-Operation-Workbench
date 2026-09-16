import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteFocus({ targetId }: { readonly targetId: string }): null {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (pathname === previousPathname.current) return;
    previousPathname.current = pathname;
    document.getElementById(targetId)?.focus();
  }, [pathname, targetId]);

  return null;
}

export function SkipLink({ targetId }: { readonly targetId: string }): React.JSX.Element {
  return (
    <a
      className="skip-link"
      href={`#${targetId}`}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(targetId)?.focus();
      }}
    >
      跳到主要内容
    </a>
  );
}
