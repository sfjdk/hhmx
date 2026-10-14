// ===================== 登录/注册速率限制 =====================
const _authRateMap = {}; // { ip: { count, resetTime } }
const AUTH_RATE_MAX = 10;       // 每 IP 每分钟最多 10 次尝试
const AUTH_RATE_WINDOW = 60000; // 1 分钟窗口

function checkAuthRate(ip) {
  const now = Date.now();
  const entry = _authRateMap[ip];
  if (!entry || now > entry.resetTime) {
    _authRateMap[ip] = { count: 1, resetTime: now + AUTH_RATE_WINDOW };
    return { allowed: true, remaining: AUTH_RATE_MAX - 1 };
  }
  if (entry.count >= AUTH_RATE_MAX) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: AUTH_RATE_MAX - entry.count };
}

// ===================== Token 中间件 =====================
const { loadUser } = require('./data');
const { isValidToken, userExists } = require('./data');

function authMiddleware(req, res, next) {
  // 仅接受 Authorization 请求头传递 token，不再接受 URL 查询参数（防止 token 泄露到日志/历史/Referrer）
  const token = req.headers.authorization;
  if (!token || !isValidToken(token) || !userExists(token)) return res.status(401).json({ error: '未登录或 token 无效' });
  req.userToken = token;
  req.user = loadUser(token);
  if (!req.user) return res.status(404).json({ error: '用户数据丢失' });
  next();
}

function sanitizeUser(u) {
  const { password, _token, avatar_img, email_code, ...rest } = u;
  rest.has_avatar_img = !!avatar_img;
  return rest;
}

module.exports = { checkAuthRate, authMiddleware, sanitizeUser };
