const jwt = require('jsonwebtoken');
const config = require('../config');

const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  });
};

const generateRefreshToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpire,
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
