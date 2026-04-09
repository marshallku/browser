export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

export const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
};

export const cleanHtml = (html: string): string =>
  html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/\sdata-[\w-]+=(["']).*?\1/gi, "");

export const htmlToText = (html: string): string =>
  decodeEntities(
    cleanHtml(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );

export const parseSetCookie = (
  url: string,
  header: string
): CookieEntry | null => {
  const normalized = new URL(url);
  const parts = header.split(";").map((part) => part.trim());
  const [nameValue, ...attrs] = parts;
  const eq = nameValue.indexOf("=");
  if (eq <= 0) {
    return null;
  }

  const cookie: CookieEntry = {
    name: nameValue.slice(0, eq),
    value: nameValue.slice(eq + 1),
    domain: normalized.hostname,
    path: "/",
    secure: false,
    httpOnly: false,
  };

  for (const attr of attrs) {
    const [rawKey, ...rawValue] = attr.split("=");
    const key = rawKey.toLowerCase();
    const value = rawValue.join("=");

    if (key === "domain" && value) {
      cookie.domain = value.replace(/^\./, "");
      continue;
    }

    if (key === "path" && value) {
      cookie.path = value;
      continue;
    }

    if (key === "secure") {
      cookie.secure = true;
      continue;
    }

    if (key === "httponly") {
      cookie.httpOnly = true;
      continue;
    }

    if (key === "expires" && value) {
      const ts = Date.parse(value);
      if (!Number.isNaN(ts)) {
        cookie.expirationDate = ts / 1000;
      }
      continue;
    }

    if (key === "max-age" && value) {
      const seconds = Number(value);
      if (!Number.isNaN(seconds)) {
        cookie.expirationDate = Date.now() / 1000 + seconds;
      }
    }
  }

  return cookie;
};

export const domainMatches = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

export const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
