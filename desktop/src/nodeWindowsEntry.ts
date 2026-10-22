import { main } from './cli.js'

// Node SEA retains process.execPath and argv[2..], so the tray, daemon and
// native updater use the same executable path as the existing distribution.
main()
  .then(code => process.exit(code ?? 0))
  .catch(error => {
    process.stderr.write(`hermes-relay: ${error instanceof Error ? error.message : String(error)}\n`)
    if (process.env.HERMES_DEBUG) console.error(error)
    process.exit(1)
  })
