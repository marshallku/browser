import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanHtml,
  domainMatches,
  extractTitle,
  htmlToText,
  parseSetCookie,
} from "../utils/fetchContent.js";

test("cleanHtml should remove scripts styles svg and data attributes", () => {
  const html =
    '<div data-secret="1"><style>.x{}</style><script>alert(1)</script><svg></svg>Hello</div>';

  assert.equal(cleanHtml(html), "<div>Hello</div>");
});

test("htmlToText should normalize markup and decode entities", () => {
  const html =
    "<main><h1>Hello&nbsp;&amp;&nbsp;Bye</h1><p>Line<br>Two</p></main>";

  assert.equal(htmlToText(html), "Hello & Bye\nLine\nTwo");
});

test("extractTitle should decode entities", () => {
  assert.equal(
    extractTitle("<title>AI&nbsp;&amp;&nbsp;Browser</title>"),
    "AI & Browser"
  );
});

test("parseSetCookie should parse cookie attributes", () => {
  const cookie = parseSetCookie(
    "https://example.com/login",
    "sid=abc; Domain=.example.com; Path=/app; HttpOnly; Secure; Max-Age=60"
  );

  assert.deepEqual(cookie, {
    name: "sid",
    value: "abc",
    domain: "example.com",
    path: "/app",
    secure: true,
    httpOnly: true,
    expirationDate: cookie?.expirationDate,
  });
  assert.ok(cookie?.expirationDate);
});

test("domainMatches should accept exact and subdomain matches", () => {
  assert.equal(domainMatches("example.com", "example.com"), true);
  assert.equal(domainMatches("app.example.com", "example.com"), true);
  assert.equal(domainMatches("example.org", "example.com"), false);
});
