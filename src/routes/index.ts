import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { StatusCode } from 'hono/utils/http-status'
import { HTTPException } from 'hono/http-exception'
import { Bindings } from '../types'
import { fetchWithStatusCheck, md5, parseNodeUrls, randomPick } from '@/utils/helper'
import logger from '@/middlewares/logger'

const app = new Hono<{ Bindings: Bindings }>()

app.get('*', async (c) => {
    const { RSSHUB_NODE_URLS, AUTH_KEY, MODE = 'loadbalance' } = env(c)
    const MAX_NODE_NUM = Math.max(parseInt(env(c).MAX_NODE_NUM) || 6, 1) // 最大节点数
    const path = c.req.path
    const query = c.req.query()
    const { authKey, authCode, ...otherQuery } = query
    if (AUTH_KEY) {
        if (authKey && authKey !== AUTH_KEY) { // 支持通过 authKey 验证
            throw new HTTPException(403, { message: 'Auth key is invalid' })
        }
        const code = md5(path + AUTH_KEY)
        if (authCode && authCode !== code) { // 支持通过 authCode 验证
            throw new HTTPException(403, { message: 'Auth code is invalid' })
        }
    }
    const allNodeUrls = parseNodeUrls(RSSHUB_NODE_URLS)
    // 由于 Cloudflare Workers 的限制，fetch 一次最多并发 6 个，所以最多随机选择 5 个节点。
    // 添加默认节点，官方实例默认为第一个。然后随机选择5个节点（不包括默认节点）。
    const nodeUrls = ['https://rsshub.app', ...randomPick(allNodeUrls, MAX_NODE_NUM - 1)].map((url) => {
        const _url = new URL(url)
        _url.pathname = path
        _url.search = new URLSearchParams(otherQuery).toString()
        return _url.toString()
    })
    if (MODE === 'loadbalance') {
        // 负载均衡模式，随机选择一个节点
        const nodeUrl = randomPick(nodeUrls, 1)[0]
        const res = await fetchWithStatusCheck(nodeUrl)
        const data = await res.text()
        const contentType = res.headers.get('Content-Type') || 'application/xml'
        c.header('Content-Type', contentType)
        c.status(res.status as StatusCode)
        return c.body(data)
    }
    if (MODE === 'failover') {
        // 自动容灾：自动容灾模式下，会随机选择一个 RSSHub 实例进行请求。如果请求成功，则返回给客户端。如果请求失败，则会选择下一个实例进行请求。如果所有实例都失败，则返回给客户端错误。
        while (nodeUrls.length > 0) {
            // 随机选择一个节点
            const nodeUrl = randomPick(nodeUrls, 1)[0]
            // 移除这个节点
            nodeUrls.splice(nodeUrls.indexOf(nodeUrl), 1)

            try {
                const res = await fetchWithStatusCheck(nodeUrl)
                const data = await res.text()
                const contentType = res.headers.get('Content-Type') || 'application/xml'
                // 判断 contentType 类型，除了首页之外，其他页面返回 HTML 的话判断为错误
                if (path !== '/' && contentType.includes('text/html')) {
                    throw new HTTPException(500, { message: 'RSSHub node is failed' })
                }
                c.header('Content-Type', contentType)
                c.status(res.status as StatusCode)
                return c.body(data)
            } catch (error) {
                logger.error(error)
                // 忽略错误，继续请求下一个节点
                continue
            }
        }
        // 所有节点都失败
        throw new HTTPException(500, { message: 'All RSSHub nodes are failed' })
    }

    if (MODE === 'quickresponse') {
        // 快速响应：会随机选择多个 RSSHub 实例进行请求。并返回最快的成功响应。如果全部失败，则则返回给客户端错误。
        // 并发请求，有一个成功就返回值
        const res = await Promise.any(nodeUrls.map(async (url) => {
            const resp = await fetchWithStatusCheck(url)
            const contentType = resp.headers.get('Content-Type') || 'application/xml'
            // 判断 contentType 类型，除了首页之外，其他页面返回 HTML 的话判断为错误
            if (path !== '/' && contentType.includes('text/html')) {
                throw new HTTPException(500, { message: 'RSSHub node is failed' })
            }
            return resp
        }))
        const data = await res.text()
        const contentType = res.headers.get('Content-Type') || 'application/xml'
        c.header('Content-Type', contentType)
        c.status(res.status as StatusCode)

        return c.body(data)
    }
    // 未指定模式
    throw new HTTPException(500, { message: 'Invalid mode' })
})

export default app
