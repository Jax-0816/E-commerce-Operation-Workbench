import { createContext, useContext, useEffect, useState } from 'react';

export interface ConnectivitySource {
  isOnline(): boolean;
  subscribe(listener: () => void): () => void;
}

const browserSource: ConnectivitySource = {
  isOnline: () => navigator.onLine,
  subscribe(listener) {
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    };
  },
};

const ConnectivityContext = createContext({ online: true });

export function ConnectivityProvider({
  children,
  source = browserSource,
}: {
  readonly children: React.ReactNode;
  readonly source?: ConnectivitySource;
}): React.JSX.Element {
  const [online, setOnline] = useState(() => source.isOnline());
  useEffect(() => source.subscribe(() => setOnline(source.isOnline())), [source]);
  return (
    <ConnectivityContext value={{ online }}>
      {!online ? (
        <div aria-live="polite" className="offline-banner" role="status">
          当前离线：联网 AI 操作已暂停，本地数据与财务功能仍可使用。
        </div>
      ) : null}
      {children}
    </ConnectivityContext>
  );
}

export function useConnectivity(): { readonly online: boolean } {
  return useContext(ConnectivityContext);
}
