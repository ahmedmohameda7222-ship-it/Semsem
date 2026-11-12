import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'version-offline-shell',
      async writeBundle(_options, bundle) {
        const hash = createHash('sha256')
          .update(Object.keys(bundle).sort().join('\n'))
          .digest('hex')
          .slice(0, 16)
        const path = 'dist/sw.js'
        const worker = await readFile(path, 'utf8')
        await writeFile(
          path,
          worker.replace('our-space-shell-v1', 'our-space-shell-' + hash),
        )
      },
    },
  ],
})
