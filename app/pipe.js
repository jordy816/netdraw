// Local channel between a running NetDraw window and the MCP server: a named pipe (Windows) or a Unix socket,
// private to the current user. Messages are newline-delimited JSON: {id, method, params} -> {id, result|error}.
const os = require('os');
const path = require('path');

function pipePath() {
  const user = (os.userInfo().username || 'user').replace(/[^A-Za-z0-9_.-]/g, '_');
  return process.platform === 'win32' ? `\\\\.\\pipe\\netdraw-${user}` : path.join(os.tmpdir(), `netdraw-${user}.sock`);
}

// Read newline-delimited JSON from a socket.
function onLines(sock, cb) {
  let buf = '';
  sock.setEncoding('utf8');
  sock.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) cb(line);
    }
  });
}

module.exports = { pipePath, onLines };
