export interface IWorkspaceLink {
  name: string;
  href: string;
}

export const workspaceTableRoute = (pathname: string) => {
  const match =
    /^\/base\/(bse[A-Za-z0-9]{16})\/table\/(tbl[A-Za-z0-9]{16})\/(viw[A-Za-z0-9]{16})\/?$/.exec(
      pathname.split(/[?#]/, 1)[0]
    );
  return match ? { baseId: match[1], tableId: match[2], viewId: match[3] } : undefined;
};

export const workspaceRelativeLink = (href: string, origin?: string) => {
  try {
    const base = origin || 'https://workspace.invalid';
    const url = new URL(href, base);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined;
  } catch {
    return undefined;
  }
};

export const workspaceChatLink = (pathname: string) => {
  const context = workspaceTableRoute(pathname);
  return context ? `/chat/?${new URLSearchParams(context)}` : '/chat/';
};

export const isWorkspaceLinkActive = (current: string, target: string) => {
  const from = workspaceTableRoute(current);
  const to = workspaceTableRoute(target);
  return from && to
    ? from.baseId === to.baseId && from.tableId === to.tableId
    : current.split(/[?#]/, 1)[0] === target.split(/[?#]/, 1)[0];
};
