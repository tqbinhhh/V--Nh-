import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        server: {
            proxy: {
                '/api': {
                    target: 'http://localhost:3000',
                    changeOrigin: true
                }
            }
        },
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
            'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY),
            'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(process.cwd(), 'index.html'),
                    homepage: resolve(process.cwd(), 'src/pages/homepage.html'),
                    login: resolve(process.cwd(), 'src/pages/login-register.html'),
                    dashboard: resolve(process.cwd(), 'src/pages/dashboard.html'),
                    jars: resolve(process.cwd(), 'src/pages/multi_jar_budget_system.html'),
                    reports: resolve(process.cwd(), 'src/pages/reports_and_analytics.html'),
                    settings: resolve(process.cwd(), 'src/pages/setting.html'),
                    admin: resolve(process.cwd(), 'src/pages/admin.html')
                }
            }
        }
    };
});
