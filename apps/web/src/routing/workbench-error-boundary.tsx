import { Component, type ReactNode } from 'react';

export class WorkbenchErrorBoundary extends Component<
  { readonly children: ReactNode; readonly onReload?: () => void },
  { readonly failed: boolean }
> {
  public state = { failed: false };

  public static getDerivedStateFromError(): { readonly failed: true } {
    return { failed: true };
  }

  public componentDidCatch(): void {
    // The UI deliberately does not render exception details or retry automatically.
  }

  public render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="workbench-error-fallback">
        <section aria-labelledby="workbench-error-title" role="alert">
          <p className="eyebrow">本地工作台</p>
          <h1 id="workbench-error-title">页面暂时无法显示</h1>
          <p>当前页面遇到异常。已保存到本地的数据不会因此被删除。</p>
          <button
            aria-label="重新加载工作台"
            onClick={() => (this.props.onReload ?? reloadPage)()}
            type="button"
          >
            重新加载工作台
          </button>
        </section>
      </main>
    );
  }
}

function reloadPage(): void {
  window.location.reload();
}
