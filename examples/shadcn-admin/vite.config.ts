import path from 'path'
import { defineConfig } from 'vite'
import { variantPlugin } from '@variiant-ui/react-vite'

const noopPlugin = (name: string) => () => ({ name })

const { default: react } = await import('@vitejs/plugin-react-swc').catch(() =>
  import('@vitejs/plugin-react')
)
const { default: tailwindcss } = await import('@tailwindcss/vite').catch(() => ({
  default: noopPlugin('tailwindcss-noop'),
}))
const { tanstackRouter } = await import('@tanstack/router-plugin/vite').catch(
  () => ({
    tanstackRouter: noopPlugin('tanstack-router-noop'),
  })
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    variantPlugin(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
