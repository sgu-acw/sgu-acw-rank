// @ts-nocheck
import base from '../../astro.config.mjs'
export default {
  ...base,
  vite: {
    ...base.vite,
    plugins: [...(base.vite?.plugins || []), {
      name: 'learning-loopback-host',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.headers.host === '127.0.0.1:4324') return next()
          response.statusCode = 307
          response.setHeader('Location', 'http://127.0.0.1:4324' + request.url)
          response.end()
        })
      },
    }],
    server: { ...base.vite?.server, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8094', changeOrigin: false } } },
  },
}
