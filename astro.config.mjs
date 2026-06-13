import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import vue from '@astrojs/vue';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    mode: 'directory'
  }),
  integrations: [
    vue(),
    tailwind()
  ],
  security: {
    checkOrigin: true
  },
  vite: {
    define: {
      __FEATURE_ADMIN_V2__: JSON.stringify(process.env.FEATURE_ADMIN_V2 === 'true'),
      __FEATURE_RATE_LIMIT_V2__: JSON.stringify(process.env.FEATURE_RATE_LIMIT_V2 === 'true')
    }
  }
});
