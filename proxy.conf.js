const target = process.env.BACKEND_ORIGIN ?? 'http://localhost:8080';

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

