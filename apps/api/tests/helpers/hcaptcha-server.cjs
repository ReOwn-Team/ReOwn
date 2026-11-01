const { createServer } = require("node:http");
module.exports = async function () {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = new URLSearchParams(body);
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        success:
          data.get("response") === "10000000-aaaa-bbbb-cccc-000000000001" &&
          data.get("secret") === "fixture-secret",
        hostname: "localhost",
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    env: {
      HCAPTCHA_SITEKEY: "10000000-ffff-ffff-ffff-000000000001",
      HCAPTCHA_SECRET: "fixture-secret",
      HCAPTCHA_TEST_ENDPOINT: `http://127.0.0.1:${server.address().port}/siteverify`,
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
