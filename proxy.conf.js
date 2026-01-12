const target = 'https://backend-white-star-5153.fly.dev';

const baseProxy = {
  target,
  secure: false,
  changeOrigin: true,
  logLevel: 'info',
  ws: true
};

module.exports = {
  '/auth': { ...baseProxy },
  '/wallet': { ...baseProxy },
  '/payments': { ...baseProxy },
  '/account': { ...baseProxy },
  '/health': { ...baseProxy },
  '/ws': { ...baseProxy }
};

