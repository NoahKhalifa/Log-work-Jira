// Unit + integration tests cho app.js.
// Chạy bằng test runner built-in của Node (>=18): `node --test`.
// KHÔNG dùng dependency ngoài — đúng quy ước dự án (mục 4 CLAUDE.md).
//
// Phạm vi:
//  - Helper thuần backend: updateJar, jarToCookieHeader, jiraLookup.
//  - Validation của các route HTTP (chỉ nhánh short-circuit TRƯỚC khi gọi Jira,
//    nên test chạy offline, không cần token/mạng thật).

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../app.js");

// ============================================================
// 1. updateJar — gộp Set-Cookie header vào cookie jar
// ============================================================
test("updateJar: lấy name=value từ cookie, bỏ qua attribute", () => {
  const jar = {};
  app.updateJar(jar, ["JSESSIONID=abc123; Path=/; HttpOnly; Secure"]);
  assert.equal(jar.JSESSIONID, "abc123");
});

test("updateJar: xử lý nhiều cookie trong mảng", () => {
  const jar = {};
  app.updateJar(jar, [
    "JSESSIONID=sess1; Path=/",
    "atlassian.xsrf.token=tok9; Path=/; HttpOnly",
  ]);
  assert.equal(jar.JSESSIONID, "sess1");
  assert.equal(jar["atlassian.xsrf.token"], "tok9");
});

test('updateJar: bỏ qua value rỗng hoặc \'""\'', () => {
  const jar = {};
  app.updateJar(jar, ['atlassian.xsrf.token=""; Path=/', "foo=; Path=/"]);
  assert.equal(jar["atlassian.xsrf.token"], undefined);
  assert.equal(jar.foo, undefined);
});

test("updateJar: cookie không có '=' thì bỏ qua, không crash", () => {
  const jar = {};
  app.updateJar(jar, ["novalue; Path=/"]);
  assert.deepEqual(jar, {});
});

test("updateJar: header undefined/null không throw và giữ nguyên jar", () => {
  const jar = { keep: "1" };
  app.updateJar(jar, undefined);
  app.updateJar(jar, null);
  assert.deepEqual(jar, { keep: "1" });
});

test("updateJar: cookie mới ghi đè cookie cũ cùng tên", () => {
  const jar = {};
  app.updateJar(jar, ["JSESSIONID=old; Path=/"]);
  app.updateJar(jar, ["JSESSIONID=new; Path=/"]);
  assert.equal(jar.JSESSIONID, "new");
});

// ============================================================
// 2. jarToCookieHeader — serialize jar thành Cookie header
// ============================================================
test("jarToCookieHeader: join các entry bằng '; '", () => {
  assert.equal(
    app.jarToCookieHeader({ JSESSIONID: "abc", "atlassian.xsrf.token": "xyz" }),
    "JSESSIONID=abc; atlassian.xsrf.token=xyz"
  );
});

test("jarToCookieHeader: jar rỗng trả về chuỗi rỗng", () => {
  assert.equal(app.jarToCookieHeader({}), "");
});

test("updateJar + jarToCookieHeader: round-trip", () => {
  const jar = {};
  app.updateJar(jar, ["JSESSIONID=s; Path=/", "atlassian.xsrf.token=t; HttpOnly"]);
  assert.equal(app.jarToCookieHeader(jar), "JSESSIONID=s; atlassian.xsrf.token=t");
});

// ============================================================
// 3. jiraLookup — ép JIRA_HOST về JIRA_IP, host khác dùng DNS
// ============================================================
test("jiraLookup: JIRA_HOST trả về JIRA_IP, family 4", (t, done) => {
  app.jiraLookup(app.JIRA_HOST, {}, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, app.JIRA_IP);
    assert.equal(family, 4);
    done();
  });
});

test("jiraLookup: dạng options.all trả về mảng địa chỉ", (t, done) => {
  app.jiraLookup(app.JIRA_HOST, { all: true }, (err, addresses) => {
    assert.equal(err, null);
    assert.deepEqual(addresses, [{ address: app.JIRA_IP, family: 4 }]);
    done();
  });
});

test("jiraLookup: chấp nhận options bị bỏ qua (callback ở vị trí thứ 2)", (t, done) => {
  app.jiraLookup(app.JIRA_HOST, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, app.JIRA_IP);
    assert.equal(family, 4);
    done();
  });
});

test("jiraLookup: host khác KHÔNG bị ép về JIRA_IP (delegate sang dns)", (t, done) => {
  app.jiraLookup("localhost", {}, (err, address) => {
    assert.equal(err, null);
    assert.notEqual(address, app.JIRA_IP);
    // localhost luôn resolve về loopback, offline-safe trên mọi OS.
    assert.ok(address === "127.0.0.1" || address === "::1", `unexpected ${address}`);
    done();
  });
});

// ============================================================
// 3b. fetchSummaries — nhánh rỗng (offline, không gọi Jira)
// ============================================================
test("fetchSummaries: mảng key rỗng trả về {} mà không gọi mạng", async () => {
  assert.deepEqual(await app.fetchSummaries("sess", "tok", []), {});
});

test("fetchSummaries: input không phải mảng trả về {}", async () => {
  assert.deepEqual(await app.fetchSummaries("sess", "tok", undefined), {});
});

// ============================================================
// 4. Integration: validation các route (offline, không gọi Jira)
// ============================================================

// Helper gọi server cục bộ, trả { status, headers, body }.
function request(port, method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj === undefined ? null : JSON.stringify(bodyObj);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        agent: false, // không pool socket -> không giữ event loop sống sau khi test xong
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let port;
before(() => new Promise((resolve) => {
  // Port 0 = OS cấp port trống ngẫu nhiên, không đụng 3005 của instance đang chạy.
  app.server.listen(0, "127.0.0.1", () => {
    port = app.server.address().port;
    // unref(): không để listening socket giữ event loop sống. Nếu thiếu, node:test
    // (Node 18) deadlock — hook after không chạy vì loop chưa drain, mà loop không
    // drain được vì server vẫn listen.
    app.server.unref();
    resolve();
  });
}));
after(() => new Promise((resolve) => app.server.close(resolve)));

test("GET / trả HTML 200 có version badge", async () => {
  const res = await request(port, "GET", "/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.ok(res.body.includes("v" + app.VERSION), "HTML phải nhúng version hiện hành");
  assert.ok(res.body.includes("Jira Log Work Tool"));
});

test("GET route lạ trả 404", async () => {
  const res = await request(port, "GET", "/khong-ton-tai");
  assert.equal(res.status, 404);
});

test("POST /api/login: thiếu credential trả 400 ok:false", async () => {
  const res = await request(port, "POST", "/api/login", { username: "", password: "" });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("POST /api/login: JSON hỏng trả 400", async () => {
  // Gửi body không phải JSON hợp lệ.
  const res = await new Promise((resolve, reject) => {
    const payload = "{not json";
    const req = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/api/login", agent: false,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve({ status: r.statusCode, body: d })); }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).error, "Invalid JSON");
});

test("POST /api/projects: thiếu token trả 400", async () => {
  const res = await request(port, "POST", "/api/projects", {});
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("POST /api/scan-issues: thiếu token/JQL trả 400", async () => {
  const res = await request(port, "POST", "/api/scan-issues", { jsessionid: "x" });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("POST /api/log-work-fields: thiếu issueKey trả 400", async () => {
  const res = await request(port, "POST", "/api/log-work-fields", { jsessionid: "x", xsrftoken: "y" });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("POST /api/issue-detail: thiếu issueKey trả 400", async () => {
  const res = await request(port, "POST", "/api/issue-detail", { jsessionid: "x", xsrftoken: "y" });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).ok, false);
});

test("POST /api/execute: thiếu token + thiếu jql/issueKeys trả 400", async () => {
  const res = await request(port, "POST", "/api/execute", { description: "noop" });
  assert.equal(res.status, 400);
  assert.match(res.body, /Missing or invalid parameters/);
});
