import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/safety/frontend/',
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://172.18.42.19:8000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
})
