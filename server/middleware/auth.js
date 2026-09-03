const jwt = require('jsonwebtoken');

module.exports = function createAuthenticateToken(JWT_SECRET) {
  return function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Authentication required' });
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid authorization header' });
    try {
      req.user = jwt.verify(parts[1], JWT_SECRET);
      next();
    } catch (error) {
      if (error && error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please sign in again.' });
      }
      return res.status(403).json({ message: 'Invalid token' });
    }
  };
};
