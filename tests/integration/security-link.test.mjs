import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import dotenv from 'dotenv'
import supertest from 'supertest'
import { WebSocket } from 'ws'

dotenv.config()

const hasDbConfig = Boolean(
  (process.env.DATABASE_URL ?? '').trim() ||
    (((process.env.DB_NAME ?? '').trim() && (process.env.DB_USER ?? '').trim()) ? '1' : '')
)

if (!hasDbConfig) {
  test.skip('integration: пропуск — не настроено подключение к БД', () => {})
} else {
  process.env.NODE_ENV = 'test'
  process.env.SKIP_API_AUTOSTART = '1'
  process.env.AUTH_STRICT = '1'
  process.env.AUTH_LOG_ONLY = '0'
  process.env.ALLOW_LOCAL_DEV_SESSION = '0'
  process.env.BOT_TOKEN = (process.env.BOT_TOKEN ?? '').trim() || 'test-bot-token'
  process.env.VK_APP_SECRET = (process.env.VK_APP_SECRET ?? '').trim() || 'test-vk-secret'

  const { startServer, getDbPool } = await import('../../server/index.js')

  const telegramBotToken = process.env.BOT_TOKEN
  const vkAppSecret = process.env.VK_APP_SECRET

  let runtime = null
  let api = null
  let pool = null
  let runtimeInitError = null

  const uniqueId = (prefix) =>
    `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`

  const toBase64Url = (value) =>
    value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

  const buildTelegramInitData = (telegramUserId) => {
    const authDate = String(Math.floor(Date.now() / 1000))
    const user = JSON.stringify({
      id: Number(telegramUserId),
      first_name: 'Test',
      username: `u${telegramUserId}`,
    })
    const params = [
      ['auth_date', authDate],
      ['query_id', `q_${telegramUserId}`],
      ['user', user],
    ]
    const dataCheckString = params
      .map(([key, value]) => `${key}=${value}`)
      .sort((left, right) => left.localeCompare(right))
      .join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(telegramBotToken).digest()
    const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
    const search = new URLSearchParams(params)
    search.set('hash', hash)
    return search.toString()
  }

  const buildVkAuthPayload = (vkUserId) => {
    const launchParams = {
      vk_app_id: '54453024',
      vk_platform: 'mobile_web',
      vk_ts: String(Math.floor(Date.now() / 1000)),
      vk_user_id: String(vkUserId),
    }
    const canonical = Object.entries(launchParams)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value).trim()}`)
      .join('&')
    const sign = toBase64Url(createHmac('sha256', vkAppSecret).update(canonical).digest('base64'))
    return {
      type: 'vk',
      sign,
      launchParams: {
        ...launchParams,
        vk_sign: sign,
      },
    }
  }

  const bootstrap = async ({ host, platformUserId }) => {
    const platformAuth =
      host === 'telegram'
        ? {
            type: 'telegram',
            initData: buildTelegramInitData(platformUserId),
          }
        : buildVkAuthPayload(platformUserId)
    const response = await api.post('/api/session/bootstrap').send({
      host,
      platformUserId: String(platformUserId),
      firstName: 'Test',
      lastName: 'User',
      username: `u${platformUserId}`,
      languageCode: 'ru',
      platformAuth,
    })
    assert.equal(response.status, 200, `bootstrap ${host} failed: ${JSON.stringify(response.body)}`)
    assert.equal(response.body.userId.length > 0, true)
    assert.equal(typeof response.body.sessionToken, 'string')
    return {
      userId: String(response.body.userId),
      sessionToken: String(response.body.sessionToken),
      platformAuth,
      platformUserId: String(platformUserId),
    }
  }

  const authHeader = (sessionToken) => ({
    Authorization: `Bearer ${sessionToken}`,
  })

  const ensureRuntime = async () => {
    if (runtime || runtimeInitError) return
    try {
      runtime = await startServer({ port: 0, runBackgroundJobs: false })
      api = supertest(runtime.server)
      pool = getDbPool()
    } catch (error) {
      runtimeInitError = error
    }
  }

  const skipIfRuntimeUnavailable = async (context) => {
    await ensureRuntime()
    if (!runtimeInitError) return false
    context.skip(`integration environment unavailable: ${runtimeInitError.message}`)
    return true
  }

  after(async () => {
    if (runtime?.stop) {
      await runtime.stop({ closeDb: true })
    }
  })

  test('strict: host=web без platformUserId отклоняется', async (context) => {
    if (await skipIfRuntimeUnavailable(context)) return
    const response = await api.post('/api/session/bootstrap').send({
      host: 'web',
      firstName: 'Web',
      platformAuth: null,
    })
    assert.equal(response.status, 400)
    assert.equal(response.body?.error, 'platform_user_id_required')
  })

  test('strict: mutation с чужим userId отклоняется (403)', async (context) => {
    if (await skipIfRuntimeUnavailable(context)) return
    const userA = await bootstrap({
      host: 'telegram',
      platformUserId: uniqueId('5510'),
    })
    const userB = await bootstrap({
      host: 'telegram',
      platformUserId: uniqueId('5511'),
    })
    const response = await api
      .patch('/api/user/role')
      .set(authHeader(userA.sessionToken))
      .send({
        userId: userB.userId,
        role: 'client',
      })
    assert.equal(response.status, 403)
    assert.equal(response.body?.error, 'forbidden')
  })

  test('strict: WS без sessionToken отклоняется 1008 unauthorized', async (context) => {
    if (await skipIfRuntimeUnavailable(context)) return
    const wsUrl = `ws://127.0.0.1:${runtime.port}/api/chats/stream`
    const code = await new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('WS close timeout'))
      }, 8000)
      socket.on('close', (closeCode) => {
        clearTimeout(timer)
        resolve(closeCode)
      })
      socket.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    assert.equal(code, 1008)
  })

  test('link: двойной link/complete по одному токену дает один успех и один token_invalid_or_used', async (context) => {
    if (await skipIfRuntimeUnavailable(context)) return
    const tg = await bootstrap({
      host: 'telegram',
      platformUserId: uniqueId('6610'),
    })
    const vk = await bootstrap({
      host: 'vk',
      platformUserId: uniqueId('7710'),
    })

    const startResponse = await api
      .post('/api/account/link/start')
      .set(authHeader(tg.sessionToken))
      .send({
        userId: tg.userId,
        sourcePlatform: 'telegram',
        targetPlatform: 'vk',
        host: 'telegram',
        platformUserId: tg.platformUserId,
        platformAuth: tg.platformAuth,
      })
    assert.equal(startResponse.status, 200, JSON.stringify(startResponse.body))
    const token = String(startResponse.body?.token ?? '')
    assert.equal(token.length > 0, true)

    const payload = {
      userId: vk.userId,
      token,
      host: 'vk',
      platformUserId: vk.platformUserId,
      platformAuth: vk.platformAuth,
      firstName: 'Merge',
      lastName: 'Test',
      username: 'merge_test',
      languageCode: 'ru',
    }

    const [first, second] = await Promise.all([
      api
        .post('/api/account/link/complete')
        .set(authHeader(vk.sessionToken))
        .send(payload),
      api
        .post('/api/account/link/complete')
        .set(authHeader(vk.sessionToken))
        .send(payload),
    ])

    const responses = [first, second]
    const successCount = responses.filter((item) => item.status === 200 && item.body?.ok === true).length
    const conflictCount = responses.filter(
      (item) => item.status === 409 && item.body?.error === 'token_invalid_or_used'
    ).length

    assert.equal(successCount, 1, JSON.stringify(responses.map((item) => item.body)))
    assert.equal(conflictCount, 1, JSON.stringify(responses.map((item) => item.body)))
  })

  test('link: TG↔VK после успешной привязки имеют одинаковый internal_user_id', async (context) => {
    if (await skipIfRuntimeUnavailable(context)) return
    const tgExt = uniqueId('8810')
    const vkExt = uniqueId('9910')
    const tg = await bootstrap({ host: 'telegram', platformUserId: tgExt })
    const vk = await bootstrap({ host: 'vk', platformUserId: vkExt })

    const startResponse = await api
      .post('/api/account/link/start')
      .set(authHeader(tg.sessionToken))
      .send({
        userId: tg.userId,
        sourcePlatform: 'telegram',
        targetPlatform: 'vk',
        host: 'telegram',
        platformUserId: tg.platformUserId,
        platformAuth: tg.platformAuth,
      })
    assert.equal(startResponse.status, 200, JSON.stringify(startResponse.body))
    const token = String(startResponse.body?.token ?? '')
    assert.equal(token.length > 0, true)

    const completeResponse = await api
      .post('/api/account/link/complete')
      .set(authHeader(vk.sessionToken))
      .send({
        userId: vk.userId,
        token,
        host: 'vk',
        platformUserId: vk.platformUserId,
        platformAuth: vk.platformAuth,
      })
    assert.equal(completeResponse.status, 200, JSON.stringify(completeResponse.body))
    assert.equal(completeResponse.body?.ok, true)

    const identityRows = await pool.query(
      `
        SELECT platform, external_user_id AS "externalUserId", internal_user_id AS "internalUserId"
        FROM user_identities
        WHERE (platform = 'telegram' AND external_user_id = $1)
           OR (platform = 'vk' AND external_user_id = $2)
        ORDER BY platform ASC
      `,
      [tgExt, vkExt]
    )
    assert.equal(identityRows.rows.length, 2)
    const [left, right] = identityRows.rows
    assert.equal(left.internalUserId, right.internalUserId)

    const tgRebootstrap = await api.post('/api/session/bootstrap').send({
      host: 'telegram',
      platformUserId: tgExt,
      firstName: 'Test',
      platformAuth: tg.platformAuth,
    })
    const vkRebootstrap = await api.post('/api/session/bootstrap').send({
      host: 'vk',
      platformUserId: vkExt,
      firstName: 'Test',
      platformAuth: vk.platformAuth,
    })
    assert.equal(tgRebootstrap.status, 200)
    assert.equal(vkRebootstrap.status, 200)
    assert.equal(tgRebootstrap.body?.userId, vkRebootstrap.body?.userId)
  })
}
