function sendJson(res, statusCode, payload, requestId) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-request-id', requestId);
  res.end(JSON.stringify(payload));
}

function sendNoContent(res, requestId) {
  res.statusCode = 204;
  res.setHeader('x-request-id', requestId);
  res.end();
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 1024 * 1024) {
        reject(new Error('Body too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) {
      return acc;
    }

    acc[key] = rest.join('=');
    return acc;
  }, {});
}

module.exports = {
  parseCookies,
  parseJsonBody,
  sendJson,
  sendNoContent,
};
