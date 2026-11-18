// Run with a recent Chrome or Brave (CHROME_BIN) and playwright-core on NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
process.env.PW_CHROMIUM_ATTACH_TO_OTHER = "1"; // Include Chrome's action popup.
const { chromium } = require("playwright-core");

const fixtures = {
  "chatgpt.com": '<article data-testid="conversation-turn-0"><div data-message-author-role="user">Literal &lt;prompt&gt;</div></article>' +
    '<article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><div class="markdown">CONTENT</div></div></article>',
  "claude.ai": '<div class="font-claude-response"><div><div class="grid-cols-1">CONTENT</div></div></div>',
  "copilot.microsoft.com": '<div class="group/ai-message"><div class="group/ai-message-item">CONTENT</div></div>',
  "gemini.google.com": '<model-response><message-content>CONTENT</message-content></model-response>',
  "grok.com": '<div id="response-1"><div class="response-content-markdown">CONTENT</div></div>'
};

const sample = '<p>Literal &lt;sample&gt; and [brackets].</p>' +
  '<p><a href="/help">Documentation</a> <a href="about:blank">Unavailable</a></p>' +
  '<p><img alt="Diagram" src="/diagram.png"></p>' +
  '<pre><code class="language-text">Outer sample\n```\nEnd sample</code></pre>';
const expectedCode = '````text\nOuter sample\n```\nEnd sample\n````';

test("unpacked extension security boundaries", { timeout: 90000 }, async (t) => {
  const context = await chromium.launchPersistentContext("", {
    executablePath: process.env.CHROME_BIN,
    channel: "chromium",
    headless: true,
    chromiumSandbox: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"]
  });
  try {
    const browser = await context.browser().newBrowserCDPSession();
    const { id } = await browser.send("Extensions.loadUnpacked", { path: path.resolve(__dirname, "..") });
    const fixture = await context.newPage();
    let fixtureHtml;
    await fixture.route("**/*", route => {
      if (route.request().resourceType() !== "document") return route.abort();
      return route.fulfill({ contentType: "text/html", body: fixtureHtml });
    });

    async function openAction(url, body = "") {
      fixtureHtml = '<!doctype html><title>Sample {date} #false</title><main>' + body + '</main>';
      await fixture.goto(url);
      await fixture.bringToFront();
      const { targetInfos } = await browser.send("Target.getTargets", { filter: [{ type: "tab" }] });
      const tab = targetInfos.find(target => target.url === fixture.url());
      const opened = context.waitForEvent("page");
      await browser.send("Extensions.triggerAction", { id, targetId: tab.targetId });
      const popup = await opened;
      await popup.locator("#status-card:not(.loading)").waitFor();
      return popup;
    }

    for (const host of Object.keys(fixtures)) {
      await t.test(host + " exports Markdown and JSON", async () => {
        const url = 'https://' + host + '/c/sample?private=test#section';
        const popup = await openAction(url, fixtures[host].replace("CONTENT", sample));
        try {
          assert.match(await popup.locator("#status-card").getAttribute("class"), /active-platform/);
          await popup.locator("summary").click();
          await popup.locator("#input-filename-format").fill("a".repeat(150));
          await popup.locator("#btn-add-custom-frontmatter").click();
          const row = popup.locator(".frontmatter-row.custom").last();
          await row.locator(".frontmatter-name-input").fill("sample");
          await row.locator(".frontmatter-value-input").fill("{title}\u0085section");
          for (const [button, suffix] of [["md", "md"], ["json", "json"]]) {
            const [file] = await Promise.all([
              fixture.waitForEvent("download", {timeout: 4500}),
              popup.locator("#btn-export-" + button).click()
            ]);
            assert.equal(file.suggestedFilename(), "a".repeat(119 - suffix.length) + "." + suffix);
            const contents = await fs.readFile(await file.path(), "utf8");
            const body = button === "md" ? contents : JSON.parse(contents).messages.find(message => message.author === "ai").content;
            assert.ok(body.includes("Literal &lt;sample&gt; and \\[brackets\\]"));
            assert.ok(body.includes(expectedCode));
            assert.ok(body.includes("[Documentation](<https://" + host + "/help>)"));
            assert.ok(body.includes("[Diagram](<https://" + host + "/diagram.png>)"));
            assert.doesNotMatch(body, /!\[Diagram|<img|about:blank/);
            assert.doesNotMatch(contents, /private=test|#section/);
            if (host === "chatgpt.com") {
              if (button === "md") assert.ok(contents.includes("> Literal &lt;prompt&gt;"));
              else assert.equal(JSON.parse(contents).messages[0].content, "Literal <prompt>");
            }
            if (button === "md") {
              assert.match(contents, /^sample: "Sample \{date\}\\u0085section"$/m);
              assert.match(contents, /^tags: \["false"\]$/m);
            }
          }
          await popup.locator("#btn-reset-settings").click();
        } finally {
          await popup.close();
        }
      });
    }

    for (const url of ["https://assets.grok.com/", "https://grok.com:8443/"]) {
      await t.test("rejects " + url, async () => {
        const popup = await openAction(url);
        try {
          assert.equal(await popup.locator("#btn-export-md").isDisabled(), true);
          assert.equal(await popup.locator("#btn-export-json").isDisabled(), true);
        } finally {
          await popup.close();
        }
      });
    }

    await t.test("origin policy rejects HTTP and credential-bearing URLs before injection", async () => {
      const popup = await openAction("https://grok.com/c/sample");
      try {
        // Inspect parsed input directly because browsers can upgrade HTTP before the popup sees it.
        const rejected = await popup.evaluate(() =>
          ["http://grok.com/", "https://user@grok.com/"].every(url => !getPlatform(url)));
        assert.equal(rejected, true);
      } finally {
        await popup.close();
      }
    });

    await t.test("refuses a different page selected after the popup opened", async () => {
      const popup = await openAction("https://grok.com/c/first", fixtures["grok.com"]);
      try {
        await fixture.evaluate(() => history.replaceState(null, "", "/c/second"));
        await popup.locator("#btn-export-json").click();
        await popup.locator("#feedback-message.error").waitFor();
        assert.match(await popup.locator("#feedback-message").textContent(), /active page changed/i);
      } finally {
        await popup.close();
      }
    });

    await t.test("aborts when the conversation changes while scrolling", async () => {
      const chat = fixtures["chatgpt.com"].replace("CONTENT", sample);
      const popup = await openAction("https://chatgpt.com/c/original", '<div style="height:3000px">' + chat + '</div>');
      let downloads = 0;
      fixture.on("download", () => downloads++);
      await fixture.evaluate(() => window.addEventListener("scroll", () => {
        history.replaceState(null, "", "/c/another-conversation");
      }, {once: true}));
      await popup.locator("#btn-export-md").click();
      await popup.locator("#feedback-message.error").waitFor();
      assert.match(await popup.locator("#feedback-message").textContent(), /conversation changed/i);
      assert.equal(downloads, 0);
      await popup.close();
    });
  } finally {
    await context.close();
  }
});
