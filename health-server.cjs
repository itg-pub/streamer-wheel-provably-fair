const http = require("http");

const port = Number(process.env.HEALTH_PORT || 8080);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.statusCode = 404;
  res.end();
});

server.listen(port, "0.0.0.0");
