import {
  resolveSharedHostRoute,
  type FieldgridSharedHostRouteOwner,
} from "@workspace/website-core/shared-host-routing";

export function requestHost(request: Request): string {
  return request.headers.get("host") ?? "";
}

export function requestPathOwner(
  host: string,
  pathname: string,
): FieldgridSharedHostRouteOwner {
  return resolveSharedHostRoute({
    host,
    pathname,
    verifiedCustomDomains: [host],
  }).owner;
}
