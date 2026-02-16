let serverModulePromise = null
let runtimeContext = null

const loadServerModule = async () => {
  if (!serverModulePromise) {
    serverModulePromise = import('../../../server/index.js')
  }
  return serverModulePromise
}

export const startIntegrationServer = async () => {
  if (runtimeContext) return runtimeContext
  const { startServer } = await loadServerModule()
  runtimeContext = await startServer({ port: 0, runBackgroundJobs: false })
  return runtimeContext
}

export const getIntegrationPool = async () => {
  const { getDbPool } = await loadServerModule()
  return getDbPool()
}

export const stopIntegrationServer = async (options = {}) => {
  if (!runtimeContext) return
  const current = runtimeContext
  runtimeContext = null
  if (typeof current.stop === 'function') {
    await current.stop({ closeDb: options.closeDb !== false })
  }
}
